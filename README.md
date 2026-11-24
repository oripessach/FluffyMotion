# 🎬 Stop Motion Studio

An educational stop motion animation application that runs in your browser. Perfect for classrooms, workshops, and creative projects!

## ✨ Features

- **Camera Capture**: Use your laptop's built-in camera or any USB webcam
- **Real-Time Playback**: Play your captured animation instantly in the viewer at your chosen FPS with the Play button or <kbd>P</kbd> key
- **Onion Skinning**: Overlay previous frames on the live feed for precise animation
- **Film Strip**: Visual timeline of all captured frames with drag-and-drop reordering
- **MP4 Export**: Download your animation as an MP4 video at your chosen frame rate
- **Multi-User Support**: Admin and student accounts for classroom use
- **Project Management**: Create, manage, and organize multiple animation projects
- **Portable**: Runs from a USB drive without installation (Windows)

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or later
- A modern web browser (Chrome, Firefox, Edge, or Safari)
- A webcam (built-in or USB)
- FFmpeg (for video export - optional, see below)

### Running the Application

**macOS/Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
Double-click `start.bat`

**Or manually:**
```bash
pip install -r requirements.txt
python app.py
```

The application will start and open in your default browser at `http://localhost:5555`.

### Default Accounts

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Administrator |
| student | student | Student |

## 📖 User Guide

### For Administrators

1. Log in with admin credentials
2. **Manage Users**: Create new student or admin accounts, update user passwords, or delete existing accounts
3. **Switch to Projects**: Click "My Animations" to create and manage your own projects

### For Students

1. Log in with your student credentials
2. **Create a Project**: Click "✨ Create Animation" to start a new project
3. **Capture Frames**: 
   - Allow camera access when prompted
   - Position your subject in front of the camera
   - Click the 📸 Capture button (or press Space) to capture a frame
   - Move your subject slightly and capture again
   - Repeat to build your animation!
4. **Use Onion Skinning**: Adjust the slider to overlay the previous frame on the live view — this helps you position objects precisely between frames
6. **Preview Your Animation**: Click the **▶️ Play** button (or press <kbd>P</kbd>) right next to the Capture button to preview your animation looping at your selected frame rate
7. **Review Your Film Strip**: Scroll through captured frames at the bottom of the screen
8. **Delete Mistakes**: Hover over a frame in the film strip and click the trash icon to remove it
9. **Reorder Frames**: Drag and drop frames in the film strip to rearrange them
10. **Set Frame Rate**: Choose how fast your animation plays (more fps = faster)
11. **Export Video**: Click "📥 Download MP4" to save your animation as a video file

### Tips for Great Stop Motion

- 🎯 **Stability**: Keep your camera steady — use a tripod or prop it up
- 🐢 **Small Movements**: Move objects in tiny increments between frames
- 🧅 **Use Onion Skin**: The overlay helps ensure smooth transitions
- 🎞️ **Frame Rate**: 12 fps is a great starting point for smooth animation
- 💡 **Lighting**: Keep lighting consistent across all frames
- 📐 **Plan Ahead**: Sketch out your story before you start shooting

## 🔧 Technical Details

### Architecture

```
Stop Motion Studio
├── app.py              # Application entry point
├── requirements.txt    # Python dependencies (Flask)
├── backend/
│   ├── __init__.py
│   └── server.py       # Flask server with REST API
├── static/
│   ├── index.html      # Single-page application
│   ├── css/
│   │   └── style.css   # Styles and animations
│   └── js/
│       └── app.js      # Frontend application logic
├── data/               # Runtime data (created automatically)
│   ├── users.json      # User accounts
│   └── projects/       # User projects and frames
├── tools/              # Portable tool binaries
│   ├── ffmpeg-mac/     # macOS FFmpeg binary
│   └── ffmpeg-win/     # Windows FFmpeg binary
├── start.sh            # macOS/Linux launcher
├── start.bat           # Windows launcher
└── README.md           # This file
```

### REST API Reference

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Log in with username and password |
| POST | `/api/logout` | Log out current user |
| GET | `/api/session` | Get current session info |

#### User Management (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create a new user |
| DELETE | `/api/users/<username>` | Delete a user |

#### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List current user's projects |
| POST | `/api/projects` | Create a new project |
| PUT | `/api/projects/<id>` | Update project settings |
| DELETE | `/api/projects/<id>` | Delete a project |

#### Frames
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/<id>/frames` | List project frames |
| POST | `/api/projects/<id>/frames` | Add a captured frame |
| DELETE | `/api/projects/<id>/frames/<filename>` | Delete a frame |
| POST | `/api/projects/<id>/frames/reorder` | Reorder frames |
| GET | `/api/projects/<id>/frames/<filename>/image` | Get frame image |

#### Video Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/<id>/export` | Generate MP4 video |
| GET | `/api/projects/<id>/export/download` | Download generated video |

### Technology Stack

- **Backend**: Python 3 with Flask
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Camera**: WebRTC (getUserMedia API)
- **Video Export**: FFmpeg (bundled or system-installed)
- **Data Storage**: JSON files (no database required)
- **Authentication**: Session-based with hashed passwords

### Browser Compatibility

| Browser | Minimum Version | Camera Support |
|---------|----------------|----------------|
| Chrome | 53+ | ✅ Full |
| Firefox | 36+ | ✅ Full |
| Edge | 12+ | ✅ Full |
| Safari | 11+ | ✅ Full |

## 💾 USB Drive Deployment (Windows)

### Setup Steps

1. **Prepare the USB Drive**:
   - Format as NTFS or exFAT
   - Copy the entire Stop Motion Studio folder to the drive

2. **Bundle Python** (optional, for systems without Python):
   - Download [WinPython](https://winpython.github.io/) or [Python Embeddable Package](https://www.python.org/downloads/)
   - Extract to `tools/python/` on the USB drive
   - Install Flask: `tools\python\python.exe -m pip install flask`

3. **Bundle FFmpeg**:
   - Download FFmpeg from https://ffmpeg.org/download.html
   - For Windows: Place `ffmpeg.exe` in `tools/ffmpeg-win/`
   - For macOS: Place `ffmpeg` binary in `tools/ffmpeg-mac/`

4. **Run**:
   - Double-click `start.bat` on Windows
   - Run `./start.sh` on macOS/Linux

### Data Location

All user data, projects, and captured frames are stored in the `data/` directory. This means:
- ✅ All data stays on the USB drive
- ✅ No data is stored on the host computer
- ✅ Easy backup — just copy the `data/` folder

## 🛠️ Development

### Running in Development Mode

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

### Project Data Structure

```
data/
├── users.json              # User credentials and roles
├── secret_key              # Flask session secret
└── projects/
    └── {username}/
        └── {project_id}/
            ├── project.json    # Project metadata
            ├── output.mp4      # Exported video (if generated)
            └── frames/
                ├── frame_001.png
                ├── frame_002.png
                └── ...
```

## 📝 License

This is an educational project.

## 🤝 Credits

Built with ❤️ for creative education.
