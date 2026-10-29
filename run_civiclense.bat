@echo off
title CivicLense - Starting All Services
color 0A

set "ROOT_DIR=%~dp0"

echo =======================================================
echo          STARTING CIVICLENSE PLATFORM
echo =======================================================
echo.

:: Detect Python executable
py -3.12 --version >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_EXE=py -3.12"
) else (
    set "PYTHON_EXE=python"
)

echo [1/3] Starting AI Model Server (Port 8000)...
echo Using Python: %PYTHON_EXE%
start "CivicLense - AI Model Server (:8000)" cmd /k "cd /d "%ROOT_DIR%model" && %PYTHON_EXE% server.py"

ping 127.0.0.1 -n 3 >nul

echo [2/3] Starting Backend API Server (Port 4000)...
start "CivicLense - Backend API (:4000)" cmd /k "cd /d "%ROOT_DIR%server" && npm run dev"

ping 127.0.0.1 -n 3 >nul

echo [3/3] Starting Frontend Dashboard (Port 5173)...
start "CivicLense - Frontend Dashboard (:5173)" cmd /k "cd /d "%ROOT_DIR%client" && npm run dev"

ping 127.0.0.1 -n 4 >nul

echo.
echo Opening CivicLense Dashboard in browser...
start http://localhost:5173

echo.
echo =======================================================
echo   ALL SERVICES RUNNING:
echo   - AI Model Service : http://127.0.0.1:8000
echo   - Backend Server   : http://localhost:4000
echo   - Frontend App     : http://localhost:5173
echo =======================================================
echo Keep the terminal windows open while using the app.
pause
