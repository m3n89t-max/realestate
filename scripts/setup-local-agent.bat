@echo off
setlocal
echo ==================================================
echo   RealEstate AI OS - Local Agent Setup
echo ==================================================
echo.

:: 1. Node.js check
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [Error] Node.js is not installed.
    echo Please install Node.js (v20 or higher) from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Install dependencies
echo [1/2] Installing dependencies...
call npm install --omit=dev --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [Error] Failed to install dependencies.
    pause
    exit /b 1
)

:: 3. Run Agent
echo [2/2] Starting Agent...
echo.
echo * Note: First-time users will see a setup window.
echo * Keep this window open while the agent is running.
echo.
call npm start
pause
