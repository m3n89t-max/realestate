@echo off
echo ==============================================
echo RealEstate AI OS - Local Agent Setup
echo ==============================================
echo 1. Creating necessary local directories...
mkdir "%APPDATA%\RealEstateAIOS" 2>nul

echo 2. Installing dependencies...
npm install

echo 3. Starting Local Agent Worker...
echo (You can close this window to stop the agent)
npm run agent:start
pause
