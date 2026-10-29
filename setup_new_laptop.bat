@echo off
title CivicLense - New Laptop Setup
color 0B

echo =======================================================
echo        CIVICLENSE - SETUP FOR NEW LAPTOP
echo =======================================================
echo.

set "ROOT_DIR=%~dp0"

:: 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10, 3.11, or 3.12 from https://www.python.org/downloads/
    echo IMPORTANT: Make sure to check "Add python.exe to PATH" during installation.
    pause
    exit /b 1
)

:: 2. Check Node
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (LTS version) from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Python and Node.js detected.
echo.

echo =======================================================
echo [1/3] Setting up Python AI Model environment...
echo =======================================================
cd /d "%ROOT_DIR%model"
if not exist ".venv" (
    echo Creating virtual environment (.venv)...
    python -m venv .venv
)
echo Installing AI dependencies (TensorFlow, Flask, etc.)...
"%ROOT_DIR%model\.venv\Scripts\python.exe" -m pip install --upgrade pip
"%ROOT_DIR%model\.venv\Scripts\python.exe" -m pip install -r requirements.txt

echo.
echo =======================================================
echo [2/3] Installing Backend dependencies...
echo =======================================================
cd /d "%ROOT_DIR%server"
call npm install

echo.
echo =======================================================
echo [3/3] Installing Frontend dependencies...
echo =======================================================
cd /d "%ROOT_DIR%client"
call npm install

echo.
color 0A
echo =======================================================
echo   SUCCESS! All dependencies are installed.
echo   You can now double-click 'run_all.bat' to start!
echo =======================================================
pause
