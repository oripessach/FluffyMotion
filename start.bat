@echo off
title Stop Motion Studio
echo.
echo   🎬  Stop Motion Studio Launcher
echo   ================================
echo.

cd /d "%~dp0"

REM Check for bundled Python first
if exist "tools\python\python.exe" (
    set PYTHON=tools\python\python.exe
    echo Using bundled Python...
    goto :check_flask
)

REM Check for system Python
where python >nul 2>nul
if %ERRORLEVEL% == 0 (
    set PYTHON=python
    goto :check_python_version
)

where python3 >nul 2>nul
if %ERRORLEVEL% == 0 (
    set PYTHON=python3
    goto :check_python_version
)

echo   ❌  Python 3 is not found.
echo   Please install Python 3.8 or later from https://python.org
echo   Make sure to check "Add Python to PATH" during installation.
echo.
pause
exit /b 1

:check_python_version
for /f "tokens=*" %%i in ('%PYTHON% --version 2^>^&1') do echo   Using: %%i

:check_flask
%PYTHON% -c "import flask" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo   📦  Installing Flask...
    %PYTHON% -m pip install -r requirements.txt --quiet
)

echo   🚀  Starting Stop Motion Studio...
echo.
%PYTHON% app.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   ❌  An error occurred. Please check the output above.
    pause
)
