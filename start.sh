#!/bin/bash
# 🎬 Stop Motion Studio - macOS/Linux Launcher
# This script starts the Stop Motion Studio application.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎬 Stop Motion Studio Launcher"
echo "================================"

# Check for Python 3
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "❌ Python 3 is not installed."
    echo "   Please install Python 3.8 or later from https://python.org"
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Using Python: $($PYTHON --version)"

# Check/install Flask
$PYTHON -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 Installing Flask..."
    $PYTHON -m pip install -r requirements.txt --quiet
fi

# Start the application
echo "🚀 Starting Stop Motion Studio..."
$PYTHON app.py
