#!/usr/bin/env python3
"""
🎬 Stop Motion Studio
An educational stop motion animation application.

Run this script to start the application server.
The app will be available at http://localhost:5555
"""
import os
import sys
from pathlib import Path
import webbrowser
import time
import threading

if getattr(sys, "frozen", False):
    BASE = Path(sys.executable).resolve().parent   # folder containing the .exe
else:
    BASE = Path(__file__).resolve().parent         # folder containing the .py

STATIC = BASE / "static"

def main():
    # Determine the base directory
    base_dir = str(BASE)
    
    # Add base_dir to Python path so imports work from USB drive
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)
    
    # Check for Flask dependency
    try:
        import flask
    except ImportError:
        print("=" * 60)
        print("Flask is not installed.")
        print("Install it with: pip install flask")
        print("Or run: pip install -r requirements.txt")
        print("=" * 60)
        sys.exit(1)
    
    from backend.server import create_app
    
    app = create_app(base_dir)
    
    port = 5555
    host = '0.0.0.0'
    
    print()
    print("🎬 ═══════════════════════════════════════════")
    print("   Stop Motion Studio")
    print("   ─────────────────────────────────────────")
    print(f"   Server running at: http://localhost:{port}")
    print("   Press Ctrl+C to stop the server")
    print("═══════════════════════════════════════════ 🎬")
    print()
    
    # Open browser after a short delay
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f'http://localhost:{port}')
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run the Flask server
    try:
        app.run(host=host, port=port, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n👋 Shutting down Stop Motion Studio. Goodbye!")

if __name__ == '__main__':
    main()
