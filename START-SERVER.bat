@echo off
cd /d "%~dp0"

echo.
echo ========================================
echo   Terrarium Plant Index - Web Server
echo ========================================
echo.

REM Check for Python
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python detected
    echo [INFO] Checking for existing servers on port 5000...
    powershell -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    echo [INFO] Starting server on http://localhost:5000
    echo [NOTE] Using port 5000 to avoid conflict with ComfyUI on port 8000
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    powershell -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:5000/index.html'"
    python -m http.server 5000 --bind 127.0.0.1
    echo.
    echo Server stopped.
    pause
    exit /b
)

REM Check for Node.js
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js detected
    echo [INFO] Starting server on http://localhost:8080
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    npx --yes http-server -p 8080 -o -c-1
    echo.
    echo Server stopped.
    pause
    exit /b
)

REM Neither found
echo [ERROR] Python or Node.js not found!
echo.
echo Please install one of the following:
echo   1. Python 3: https://www.python.org/downloads/
echo   2. Node.js: https://nodejs.org/
echo.
pause
