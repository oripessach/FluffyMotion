"""
Fluffy Motion - Flask Backend Server
"""

import os
import json
import hashlib
import base64
import shutil
import subprocess
import sys
import threading
import platform
from pathlib import Path
from datetime import datetime, timezone

from flask import Flask, request, session, jsonify, send_from_directory, send_file


# ---------------------------------------------------------------------------
# Base Paths (Frozen/Executable vs Python Script)
# ---------------------------------------------------------------------------
if getattr(sys, "frozen", False):
    BASE = Path(sys.executable).resolve().parent   # folder containing the .exe
else:
    BASE = Path(__file__).resolve().parent.parent  # folder containing app.py

STATIC = BASE / "static"


# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
users_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _data_dir(app):
    return app.config["DATA_DIR"]


def _users_file(app):
    return os.path.join(_data_dir(app), "users.json")


def load_users(app):
    """Thread-safe read of users.json."""
    with users_lock:
        path = _users_file(app)
        if not os.path.exists(path):
            return {}
        with open(path, "r") as f:
            return json.load(f)


def save_users(app, data):
    """Thread-safe write of users.json."""
    with users_lock:
        path = _users_file(app)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)


def hash_password(password, salt=None):
    """Hash a password with SHA-256 + salt. Returns (hex_hash, hex_salt)."""
    if salt is None:
        salt = os.urandom(16).hex()
    h = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return h, salt


def verify_password(password, password_hash, salt):
    h, _ = hash_password(password, salt)
    return h == password_hash


def get_project_dir(app, username, project_id):
    return os.path.join(_data_dir(app), "projects", username, project_id)


def load_project(app, username, project_id):
    pdir = get_project_dir(app, username, project_id)
    pfile = os.path.join(pdir, "project.json")
    if not os.path.exists(pfile):
        return None
    with open(pfile, "r") as f:
        return json.load(f)


def save_project(app, username, project_id, data):
    pdir = get_project_dir(app, username, project_id)
    os.makedirs(pdir, exist_ok=True)
    pfile = os.path.join(pdir, "project.json")
    with open(pfile, "w") as f:
        json.dump(data, f, indent=2)


def ensure_data_dirs(base_dir):
    """Create all necessary data directories on startup."""
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(os.path.join(data_dir, "projects"), exist_ok=True)


def _get_logged_in_user(app):
    """Return (username, role) if logged in, else (None, None)."""
    username = session.get("username")
    if not username:
        return None, None
    users = load_users(app)
    if username not in users:
        return None, None
    return username, users[username]["role"]


def _require_login():
    """Check session; return error response or None."""
    username = session.get("username")
    if not username:
        return jsonify({"success": False, "error": "Authentication required"}), 401
    return None


def _require_admin(app):
    """Check session + admin role; return error response or None."""
    err = _require_login()
    if err:
        return err
    username, role = _get_logged_in_user(app)
    if role != "admin":
        return jsonify({"success": False, "error": "Admin access required"}), 403
    return None


# ---------------------------------------------------------------------------
# App Factory
# ---------------------------------------------------------------------------

def create_app(base_dir=None):
    """Create and configure the Flask application."""

    if base_dir is None:
        base_path = BASE
    else:
        base_path = Path(base_dir).resolve()

    base_dir = str(base_path)
    static_dir = str(base_path / "static")
    data_dir = str(base_path / "data")

    # In frozen exe, verify static_dir exists; fall back to _MEIPASS if bundled internally
    if getattr(sys, "frozen", False) and not os.path.exists(os.path.join(static_dir, "index.html")):
        if hasattr(sys, "_MEIPASS"):
            meipass_static = os.path.join(sys._MEIPASS, "static")
            if os.path.exists(os.path.join(meipass_static, "index.html")):
                static_dir = meipass_static

    app = Flask(__name__, static_folder=static_dir, static_url_path="/static")

    data_dir = os.path.join(base_dir, "data")
    app.config["DATA_DIR"] = data_dir
    app.config["BASE_DIR"] = base_dir

    # --- Ensure directories exist ---
    ensure_data_dirs(base_dir)

    # --- Secret key (persistent across restarts) ---
    secret_key_path = os.path.join(data_dir, "secret_key")
    if os.path.exists(secret_key_path):
        with open(secret_key_path, "r") as f:
            app.secret_key = f.read().strip()
    else:
        app.secret_key = os.urandom(32).hex()
        with open(secret_key_path, "w") as f:
            f.write(app.secret_key)

    # --- Default users ---
    users = load_users(app)
    changed = False
    for uname, pwd, role in [("admin", "admin", "admin"), ("student", "student", "student")]:
        if uname not in users:
            h, s = hash_password(pwd)
            users[uname] = {"password_hash": h, "salt": s, "role": role}
            changed = True
    if changed or not os.path.exists(os.path.join(data_dir, "users.json")):
        print("[INIT] Ensuring default users (admin, student)")
        save_users(app, users)

    # -----------------------------------------------------------------------
    # Static / index
    # -----------------------------------------------------------------------

    @app.route("/")
    def index():
        return send_from_directory(static_dir, "index.html")

    # -----------------------------------------------------------------------
    # Auth routes
    # -----------------------------------------------------------------------

    @app.route("/api/login", methods=["POST"])
    def api_login():
        body = request.get_json(silent=True) or {}
        username = body.get("username", "").strip()
        password = body.get("password", "")

        if not username or not password:
            return jsonify({"success": False, "error": "Username and password required"}), 400

        users = load_users(app)

        # Case-insensitive username match
        matched_user = None
        matched_username = None
        if username in users:
            matched_username = username
            matched_user = users[username]
        else:
            for u, d in users.items():
                if u.lower() == username.lower():
                    matched_username = u
                    matched_user = d
                    break

        if not matched_user or not verify_password(password, matched_user["password_hash"], matched_user["salt"]):
            return jsonify({"success": False, "error": "Invalid username or password"}), 401

        session["username"] = matched_username
        print(f"[AUTH] User '{matched_username}' logged in (role: {matched_user['role']})")
        return jsonify({"success": True, "user": {"username": matched_username, "role": matched_user["role"]}})

    @app.route("/api/logout", methods=["POST"])
    def api_logout():
        uname = session.pop("username", None)
        if uname:
            print(f"[AUTH] User '{uname}' logged out")
        return jsonify({"success": True})

    @app.route("/api/session", methods=["GET"])
    def api_session():
        username = session.get("username")
        if not username:
            return jsonify({"logged_in": False, "user": None})
        users = load_users(app)
        user = users.get(username)
        if not user:
            session.pop("username", None)
            return jsonify({"logged_in": False, "user": None})
        return jsonify({"logged_in": True, "user": {"username": username, "role": user["role"]}})

    # -----------------------------------------------------------------------
    # User management (admin only)
    # -----------------------------------------------------------------------

    @app.route("/api/users", methods=["GET"])
    def api_get_users():
        err = _require_admin(app)
        if err:
            return err
        users = load_users(app)
        result = [{"username": u, "role": d["role"]} for u, d in users.items()]
        return jsonify({"users": result})

    @app.route("/api/users", methods=["POST"])
    def api_create_user():
        err = _require_admin(app)
        if err:
            return err

        body = request.get_json(silent=True) or {}
        username = body.get("username", "").strip()
        password = body.get("password", "")
        role = body.get("role", "")

        if not username or not password:
            return jsonify({"success": False, "error": "Username and password required"}), 400
        if role not in ("admin", "student"):
            return jsonify({"success": False, "error": "Role must be 'admin' or 'student'"}), 400

        users = load_users(app)
        if username in users:
            return jsonify({"success": False, "error": "Username already exists"}), 409

        h, s = hash_password(password)
        users[username] = {"password_hash": h, "salt": s, "role": role}
        save_users(app, users)

        print(f"[USERS] Created user '{username}' with role '{role}'")
        return jsonify({"success": True, "user": {"username": username, "role": role}}), 201

    @app.route("/api/users/<username>", methods=["DELETE"])
    def api_delete_user(username):
        err = _require_admin(app)
        if err:
            return err

        current_user = session.get("username")
        if username == current_user:
            return jsonify({"success": False, "error": "Cannot delete yourself"}), 400

        users = load_users(app)
        if username not in users:
            return jsonify({"success": False, "error": "User not found"}), 404

        del users[username]
        save_users(app, users)

        # Delete user's project data
        user_projects_dir = os.path.join(_data_dir(app), "projects", username)
        if os.path.exists(user_projects_dir):
            shutil.rmtree(user_projects_dir)

        print(f"[USERS] Deleted user '{username}'")
        return jsonify({"success": True})

    @app.route("/api/users/<username>/password", methods=["PUT"])
    def api_change_password(username):
        err = _require_admin(app)
        if err:
            return err

        body = request.get_json(silent=True) or {}
        new_password = body.get("password", "")
        if not new_password:
            return jsonify({"success": False, "error": "New password required"}), 400

        users = load_users(app)

        # Case-insensitive or exact match
        matched_username = None
        if username in users:
            matched_username = username
        else:
            for u in users:
                if u.lower() == username.lower():
                    matched_username = u
                    break

        if not matched_username:
            return jsonify({"success": False, "error": "User not found"}), 404

        h, s = hash_password(new_password)
        users[matched_username]["password_hash"] = h
        users[matched_username]["salt"] = s
        save_users(app, users)

        print(f"[USERS] Password changed for user '{matched_username}'")
        return jsonify({"success": True, "message": "Password updated successfully"})

    # -----------------------------------------------------------------------
    # Projects
    # -----------------------------------------------------------------------

    @app.route("/api/projects", methods=["GET"])
    def api_get_projects():
        err = _require_login()
        if err:
            return err

        username = session["username"]
        user_dir = os.path.join(_data_dir(app), "projects", username)
        projects = []

        if os.path.exists(user_dir):
            for pid in os.listdir(user_dir):
                pdata = load_project(app, username, pid)
                if pdata:
                    projects.append(pdata)

        # Sort by created_at descending
        projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return jsonify({"projects": projects})

    @app.route("/api/projects", methods=["POST"])
    def api_create_project():
        err = _require_login()
        if err:
            return err

        username = session["username"]
        user_dir = os.path.join(_data_dir(app), "projects", username)
        os.makedirs(user_dir, exist_ok=True)

        # Count existing projects to generate ID and name
        existing = []
        if os.path.exists(user_dir):
            existing = [d for d in os.listdir(user_dir) if os.path.isdir(os.path.join(user_dir, d))]

        # Find next project number
        max_num = 0
        for d in existing:
            if d.startswith("proj_"):
                try:
                    num = int(d.split("_")[1])
                    max_num = max(max_num, num)
                except (ValueError, IndexError):
                    pass
        next_num = max_num + 1

        project_id = f"proj_{next_num}"
        project_name = f"Project {len(existing) + 1}"
        now = datetime.now(timezone.utc).isoformat()

        project_data = {
            "id": project_id,
            "name": project_name,
            "created_at": now,
            "frame_count": 0,
            "fps": 12,
            "last_camera_id": None,
        }

        pdir = get_project_dir(app, username, project_id)
        os.makedirs(pdir, exist_ok=True)
        os.makedirs(os.path.join(pdir, "frames"), exist_ok=True)
        save_project(app, username, project_id, project_data)

        print(f"[PROJECTS] User '{username}' created project '{project_id}'")
        return jsonify({"success": True, "project": project_data}), 201

    @app.route("/api/projects/<project_id>", methods=["PUT"])
    def api_update_project(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        body = request.get_json(silent=True) or {}
        if "name" in body:
            pdata["name"] = body["name"]
        if "fps" in body:
            pdata["fps"] = body["fps"]
        if "last_camera_id" in body:
            pdata["last_camera_id"] = body["last_camera_id"]

        save_project(app, username, project_id, pdata)
        print(f"[PROJECTS] User '{username}' updated project '{project_id}'")
        return jsonify({"success": True, "project": pdata})

    @app.route("/api/projects/<project_id>", methods=["DELETE"])
    def api_delete_project(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        pdir = get_project_dir(app, username, project_id)
        if os.path.exists(pdir):
            shutil.rmtree(pdir)

        print(f"[PROJECTS] User '{username}' deleted project '{project_id}'")
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Frames
    # -----------------------------------------------------------------------

    @app.route("/api/projects/<project_id>/frames", methods=["GET"])
    def api_get_frames(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        frames_dir = os.path.join(get_project_dir(app, username, project_id), "frames")
        frames = []

        if os.path.exists(frames_dir):
            filenames = sorted(
                [f for f in os.listdir(frames_dir) if f.endswith(".png") and not f.startswith("_tmp_")],
                key=lambda f: int("".join(filter(str.isdigit, f)) or 0)
            )
            p_ver = pdata.get("version", 1)
            for idx, fname in enumerate(filenames):
                filepath = os.path.join(frames_dir, fname)
                mtime = int(os.path.getmtime(filepath)) if os.path.exists(filepath) else 0
                frames.append({
                    "index": idx,
                    "filename": fname,
                    "url": f"/api/projects/{project_id}/frames/{fname}/image?v={p_ver}_{mtime}",
                })

        return jsonify({"frames": frames})

    @app.route("/api/projects/<project_id>/frames", methods=["POST"])
    def api_add_frame(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        body = request.get_json(silent=True) or {}
        image_data = body.get("image", "")
        if not image_data:
            return jsonify({"success": False, "error": "No image data provided"}), 400

        # Strip data URI prefix
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        try:
            image_bytes = base64.b64decode(image_data)
        except Exception:
            return jsonify({"success": False, "error": "Invalid base64 image data"}), 400

        pdir = get_project_dir(app, username, project_id)
        frames_dir = os.path.join(pdir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        # Determine next frame number
        existing = [f for f in os.listdir(frames_dir) if f.endswith(".png") and not f.startswith("_tmp_")]
        next_num = len(existing) + 1
        filename = f"frame_{next_num:03d}.png"

        filepath = os.path.join(frames_dir, filename)
        with open(filepath, "wb") as f:
            f.write(image_bytes)

        # Update project frame count and version
        pdata["frame_count"] = next_num
        pdata["version"] = pdata.get("version", 0) + 1
        save_project(app, username, project_id, pdata)

        # Invalidate any previously exported video
        out_mp4 = os.path.join(pdir, "output.mp4")
        if os.path.exists(out_mp4):
            try:
                os.remove(out_mp4)
            except OSError:
                pass

        mtime = int(os.path.getmtime(filepath)) if os.path.exists(filepath) else 0
        frame = {
            "index": next_num - 1,
            "filename": filename,
            "url": f"/api/projects/{project_id}/frames/{filename}/image?v={pdata['version']}_{mtime}",
        }

        print(f"[FRAMES] User '{username}' added frame '{filename}' to project '{project_id}'")
        return jsonify({"success": True, "frame": frame}), 201

    @app.route("/api/projects/<project_id>/frames/<filename>", methods=["DELETE"])
    def api_delete_frame(project_id, filename):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        pdir = get_project_dir(app, username, project_id)
        frames_dir = os.path.join(pdir, "frames")
        filepath = os.path.join(frames_dir, filename)
        if not os.path.exists(filepath):
            return jsonify({"success": False, "error": "Frame not found"}), 404

        os.remove(filepath)

        # Renumber remaining frames using collision-safe two-phase rename
        remaining = sorted(
            [f for f in os.listdir(frames_dir) if f.endswith(".png") and not f.startswith("_tmp_")],
            key=lambda f: int("".join(filter(str.isdigit, f)) or 0)
        )
        temp_map = {}
        for idx, old_name in enumerate(remaining):
            temp_name = f"_tmp_del_{idx}.png"
            os.rename(os.path.join(frames_dir, old_name), os.path.join(frames_dir, temp_name))
            temp_map[idx] = temp_name

        for idx in sorted(temp_map.keys()):
            final_name = f"frame_{idx + 1:03d}.png"
            os.rename(os.path.join(frames_dir, temp_map[idx]), os.path.join(frames_dir, final_name))

        # Update frame count & version
        pdata["frame_count"] = len(remaining)
        pdata["version"] = pdata.get("version", 0) + 1
        save_project(app, username, project_id, pdata)

        # Invalidate any previously exported video
        out_mp4 = os.path.join(pdir, "output.mp4")
        if os.path.exists(out_mp4):
            try:
                os.remove(out_mp4)
            except OSError:
                pass

        print(f"[FRAMES] User '{username}' deleted frame '{filename}' from project '{project_id}'")
        return jsonify({"success": True})

    @app.route("/api/projects/<project_id>/frames/<filename>/image", methods=["GET"])
    def api_get_frame_image(project_id, filename):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        frames_dir = os.path.join(get_project_dir(app, username, project_id), "frames")
        filepath = os.path.join(frames_dir, filename)
        if not os.path.exists(filepath):
            return jsonify({"success": False, "error": "Frame not found"}), 404

        resp = send_file(filepath, mimetype="image/png")
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
        return resp

    @app.route("/api/projects/<project_id>/frames/reorder", methods=["POST"])
    def api_reorder_frames(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        body = request.get_json(silent=True) or {}
        order = body.get("order", [])
        if not order:
            return jsonify({"success": False, "error": "No order provided"}), 400

        pdir = get_project_dir(app, username, project_id)
        frames_dir = os.path.join(pdir, "frames")

        # Verify all files exist
        for fname in order:
            if not os.path.exists(os.path.join(frames_dir, fname)):
                return jsonify({"success": False, "error": f"Frame '{fname}' not found"}), 404

        # Move to temp names first to avoid collisions
        temp_map = {}
        for idx, fname in enumerate(order):
            temp_name = f"_tmp_reorder_{idx}.png"
            os.rename(os.path.join(frames_dir, fname), os.path.join(frames_dir, temp_name))
            temp_map[idx] = temp_name

        # Rename to final sequential names
        for idx in sorted(temp_map.keys()):
            final_name = f"frame_{idx + 1:03d}.png"
            os.rename(os.path.join(frames_dir, temp_map[idx]), os.path.join(frames_dir, final_name))

        # Update version & invalidate export
        pdata["version"] = pdata.get("version", 0) + 1
        save_project(app, username, project_id, pdata)

        out_mp4 = os.path.join(pdir, "output.mp4")
        if os.path.exists(out_mp4):
            try:
                os.remove(out_mp4)
            except OSError:
                pass

        print(f"[FRAMES] User '{username}' reordered frames in project '{project_id}'")
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Video Export
    # -----------------------------------------------------------------------

    def _find_ffmpeg():
        """Locate ffmpeg binary."""
        base = app.config["BASE_DIR"]
        system = platform.system()

        if system == "Darwin":  # macOS
            local = os.path.join(base, "tools", "ffmpeg-mac", "ffmpeg")
        elif system == "Windows":
            local = os.path.join(base, "tools", "ffmpeg-win", "ffmpeg.exe")
        else:
            local = None

        if local and os.path.isfile(local) and os.access(local, os.X_OK):
            return local

        # Fall back to system ffmpeg
        return shutil.which("ffmpeg")

    @app.route("/api/projects/<project_id>/export", methods=["POST"])
    def api_export_video(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        body = request.get_json(silent=True) or {}
        fps = body.get("fps", pdata.get("fps", 12))

        ffmpeg_path = _find_ffmpeg()
        if not ffmpeg_path:
            return jsonify({"success": False, "error": "ffmpeg not found. Please install ffmpeg."}), 500

        pdir = get_project_dir(app, username, project_id)
        frames_dir = os.path.join(pdir, "frames")
        output_path = os.path.join(pdir, "output.mp4")

        # Check that there are frames
        frame_files = [f for f in os.listdir(frames_dir) if f.endswith(".png")] if os.path.exists(frames_dir) else []
        if not frame_files:
            return jsonify({"success": False, "error": "No frames to export"}), 400

        cmd = [
            ffmpeg_path,
            "-y",
            "-framerate", str(fps),
            "-i", os.path.join(frames_dir, "frame_%03d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                error_msg = result.stderr.strip() if result.stderr else "ffmpeg failed"
                print(f"[EXPORT] ffmpeg error: {error_msg}")
                return jsonify({"success": False, "error": error_msg}), 500
        except subprocess.TimeoutExpired:
            return jsonify({"success": False, "error": "Export timed out"}), 500
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

        print(f"[EXPORT] User '{username}' exported project '{project_id}'")
        return jsonify({"success": True})

    @app.route("/api/projects/<project_id>/export/download", methods=["GET"])
    def api_download_export(project_id):
        err = _require_login()
        if err:
            return err

        username = session["username"]
        pdata = load_project(app, username, project_id)
        if not pdata:
            return jsonify({"success": False, "error": "Project not found"}), 404

        pdir = get_project_dir(app, username, project_id)
        output_path = os.path.join(pdir, "output.mp4")
        if not os.path.exists(output_path):
            return jsonify({"success": False, "error": "No export available. Run export first."}), 404

        download_name = f"{pdata.get('name', 'export')}.mp4"
        return send_file(output_path, as_attachment=True, download_name=download_name)

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = create_app()
    base = app.config["BASE_DIR"]
    print(f"[SERVER] Starting on http://127.0.0.1:5555")
    print(f"[SERVER] Base directory: {base}")
    app.run(host="127.0.0.1", port=5555, debug=False)
