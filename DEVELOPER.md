# 🛠️ Stop Motion Studio — Developer Documentation

This document provides in-depth technical documentation for developers, instructors, and maintainers working with or extending Stop Motion Studio.

---

## 1. System Architecture

Stop Motion Studio is architected as a lightweight, zero-dependency, local web application that runs directly from portable media (such as a USB drive) or a standard desktop workstation.

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│   (HTML5, WebRTC getUserMedia, Canvas API, CSS3 Animations)  │
└──────────────────────────────▲──────────────────────────────┘
                               │ HTTP / REST / Static
┌──────────────────────────────▼──────────────────────────────┐
│                    Python / Flask Backend                   │
│   (Session Auth, Project Store, Frame Renumbering Engine)   │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼───────────────┐
│     Local Storage (USB)     ││        FFmpeg Transcoder     │
│  data/users.json            ││  (Bundled in tools/ or       │
│  data/projects/<user>/<pid>/││   system fallback)           │
└─────────────────────────────┘└──────────────────────────────┘
```

### Key Principles
- **Zero Heavy Dependencies**: The backend requires only Python and `Flask`. No external databases, daemon services, or native compiled C extensions.
- **Portability**: All data (user accounts, session secret, project frames, videos) is stored in `./data/` relative to the application root. Running from a USB drive leaves zero trace on host machines.
- **Hardware Agnostic**: WebRTC standard (`navigator.mediaDevices`) allows capturing from built-in laptop webcams as well as external USB cameras. The last-used camera device ID is stored per project.

---

## 2. Directory Structure

```
Stop Motion Studio/
├── app.py                      # Main Python entry point (auto-launches browser)
├── requirements.txt            # Python dependencies (flask>=2.3.0)
├── start.sh                    # Launcher script for macOS & Linux
├── start.bat                   # Launcher script for Windows
├── README.md                   # User guide & quick start
├── DEVELOPER.md                # Detailed developer documentation (this file)
├── backend/
│   ├── __init__.py             # Python package indicator
│   └── server.py               # Flask application factory, routes, and data logic
├── static/
│   ├── index.html              # Single Page Application (SPA) structure
│   ├── css/
│   │   └── style.css           # Whimsical styling, animations, responsiveness
│   └── js/
│       └── app.js              # Frontend state management, camera, onion skin, API
├── data/                       # Created automatically at runtime
│   ├── secret_key              # Generated 256-bit Flask session key
│   ├── users.json              # Salted SHA-256 user database
│   └── projects/
│       └── <username>/
│           └── <project_id>/
│               ├── project.json   # Metadata (name, fps, last_camera_id, etc.)
│               ├── output.mp4     # Transcoded video
│               └── frames/        # Sequence of captured PNG frames
│                   ├── frame_001.png
│                   ├── frame_002.png
│                   └── ...
└── tools/                      # Portable binaries (optional, for standalone USB)
    ├── ffmpeg-mac/ffmpeg       # Portable macOS FFmpeg binary
    ├── ffmpeg-win/ffmpeg.exe   # Portable Windows FFmpeg binary
    └── python/                 # (Optional) Embedded Windows Python runtime
```

---

## 3. Backend Implementation Details (`backend/server.py`)

### 3.1 Authentication & Security Model
- **Password Storage**: Uses standard library `hashlib.sha256` combined with a unique 16-byte cryptographically secure random salt per user (`os.urandom(16).hex()`).
- **Session Handling**: Utilizes signed HTTP-only session cookies. The secret key is generated once and saved to `data/secret_key` so user sessions persist across restarts.
- **Thread Safety**: Access to `users.json` is synchronized using a global `threading.Lock()` to prevent race conditions during concurrent user operations.
- **Role Enforcement**:
  - `admin`: Can access `/api/users` (create/delete users) and manage own projects. Cannot delete own account.
  - `student`: Can manage own projects only. Attempts to access `/api/users` return HTTP 403 Forbidden.

### 3.2 Frame Management & Sequential Invariant
- Frame files are saved sequentially: `frame_001.png`, `frame_002.png`, etc.
- **Deletion**: When a frame is deleted, the backend automatically renames subsequent frames to maintain contiguous sequential numbering (`1..N`).
- **Reordering**: The `/api/projects/<id>/frames/reorder` endpoint accepts an array of filenames in the desired order. It uses a two-phase rename with temporary prefixes (`_tmp_reorder_<i>.png`) to avoid filesystem naming collisions before finalizing to `frame_%03d.png`.

### 3.3 Video Transcoding Engine
The backend locates `ffmpeg` dynamically in the following order:
1. `tools/ffmpeg-mac/ffmpeg` (on macOS) or `tools/ffmpeg-win/ffmpeg.exe` (on Windows).
2. System `PATH` via `shutil.which('ffmpeg')`.

The FFmpeg transcoding command:
```bash
ffmpeg -y -framerate <fps> -i <frames_dir>/frame_%03d.png -c:v libx264 -pix_fmt yuv420p -movflags +faststart <output.mp4>
```
- `-pix_fmt yuv420p`: Ensures compatibility across all modern players (QuickTime, Windows Media Player, Chrome, Safari, iOS, Android).
- `-movflags +faststart`: Moves the `moov` atom to the beginning of the file for immediate web streaming and playback.

---

## 4. Frontend Architecture (`static/js/app.js`)

### 4.1 State Machine
```javascript
const state = {
    currentView: 'login' | 'admin' | 'projects' | 'editor',
    user: { username, role },
    projects: [...],
    currentProject: { id, name, fps, last_camera_id, frame_count },
    frames: [{ index, filename, url }],
    stream: MediaStream,
    cameras: [MediaDeviceInfo],
    selectedCameraId: string,
    onionSkinOpacity: number (0-100),
    fps: number,
    isCapturing: boolean,
    isExporting: boolean
};
```

### 4.2 Camera & WebRTC Pipeline
1. **Enumeration**: `navigator.mediaDevices.enumerateDevices()` queries connected video inputs (`kind === 'videoinput'`).
2. **Stream Initialization**: `navigator.mediaDevices.getUserMedia()` requests 720p/1080p stream with device constraint `{ deviceId: { exact: deviceId } }`. If the specific device is unavailable (e.g. unplugged), it falls back cleanly to the system default video stream.
3. **Capture**: A hidden `<canvas>` matching the live video's intrinsic dimensions (`videoWidth` x `videoHeight`) draws the current video frame via `ctx.drawImage()`, serializes it as `image/png` base64 data, and posts it to the backend.

### 4.3 Onion Skinning
- The live `<video>` feed and the last captured frame (`<img>`) are stacked absolutely in the preview container.
- The slider controls CSS `opacity` on the `<img>` element from `0.0` (100% live feed) to `1.0` (100% overlay).
- Default is `0.5` (50% blend), allowing students to precisely position characters relative to the previous frame.

### 4.4 Film Strip & Drag-and-Drop
- Dragging frames uses HTML5 Drag and Drop API (`dragstart`, `dragover`, `drop`).
- Moving a thumbnail calculates source and target indices, reorders the array locally, and sends the updated filename order to `/api/projects/<id>/frames/reorder`.

---

## 5. REST API Reference

| Endpoint | Method | Auth | Body / Params | Description |
|---|---|---|---|---|
| `/api/login` | POST | Public | `{"username", "password"}` | Authenticates user and sets session cookie |
| `/api/logout` | POST | Public | - | Terminates session |
| `/api/session` | GET | Public | - | Checks current authentication state |
| `/api/users` | GET | Admin | - | Returns all user accounts |
| `/api/users` | POST | Admin | `{"username", "password", "role"}` | Creates a new user |
| `/api/users/<username>/password` | PUT | Admin | `{"password"}` | Updates password for a user |
| `/api/users/<username>` | DELETE | Admin | - | Deletes user and all their projects |
| `/api/projects` | GET | User | - | Lists projects for logged-in user |
| `/api/projects` | POST | User | - | Creates a new project (`Project N`) |
| `/api/projects/<id>` | PUT | User | `{"name", "fps", "last_camera_id"}` | Updates project settings |
| `/api/projects/<id>` | DELETE | User | - | Deletes project and its frames |
| `/api/projects/<id>/frames` | GET | User | - | Lists frames for project |
| `/api/projects/<id>/frames` | POST | User | `{"image": "data:image/png;base64,..."}` | Appends a new frame |
| `/api/projects/<id>/frames/<file>` | DELETE | User | - | Deletes frame & renumbers |
| `/api/projects/<id>/frames/<file>/image` | GET | User | - | Serves PNG image binary |
| `/api/projects/<id>/frames/reorder` | POST | User | `{"order": ["frame_002.png", ...]}` | Reorders frame sequence |
| `/api/projects/<id>/export` | POST | User | `{"fps": 12}` | Triggers FFmpeg MP4 encoding |
| `/api/projects/<id>/export/download` | GET | User | - | Downloads compiled MP4 video |

---

## 6. USB Drive Standalone Deployment Guide

To deploy on a USB drive for classroom use:

1. **Format the USB Drive**: Format with NTFS or exFAT (FAT32 has a 4GB single file limit).
2. **Copy Repository**: Copy the entire `Stop Motion` folder to the root of the USB drive (e.g. `E:\Stop Motion\`).
3. **Bundling Windows Python** (Zero-install on student PCs):
   - Download the official Python Windows embeddable zip (e.g. `python-3.11.x-embed-amd64.zip`).
   - Extract into `tools/python/`.
   - Install Flask into the embedded environment or use `pip install --target tools/python/site-packages flask`.
4. **Bundling FFmpeg**:
   - Download static FFmpeg builds from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (Windows) or [evermeet.cx](https://evermeet.cx/ffmpeg/) (macOS).
   - Place `ffmpeg.exe` in `tools/ffmpeg-win/`.
   - Place `ffmpeg` binary in `tools/ffmpeg-mac/` (make executable with `chmod +x`).
5. **Building a Standalone Windows .exe (PyInstaller)**:
   - When frozen with PyInstaller (`pyinstaller -F app.py`), `sys.frozen` is set to `True`.
   - The application detects this and resolves `BASE` to `Path(sys.executable).resolve().parent` (the folder holding `app.exe`), looking for `static/`, `data/`, and `tools/` right next to the executable.
6. **Execution**:
   - On Windows: double-click `start.bat` or `app.exe`.
   - On macOS: double-click `start.sh` (or run in Terminal `./start.sh`).
