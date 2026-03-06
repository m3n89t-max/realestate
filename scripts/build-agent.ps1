# RealEstate Agent Build Script with Mirror and TLS bypass support
$ErrorActionPreference = "Stop"

echo "=============================================="
echo "RealEstate AI OS - Agent Build Script (TLS Bypass)"
echo "=============================================="

# 1. Set Mirrors and Bypass TLS verification issues
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:NPM_CONFIG_ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

# CRITICAL: Ignore TLS certificate validation for this session
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"

echo "1. Set Electron mirrors and disabled TLS certificate validation."

# 2. Install dependencies
echo "2. Installing dependencies..."
npm install
npx playwright install chromium

# 3. Clean previous build
echo "3. Cleaning previous build..."
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }

# 4. Build Agent
echo "4. Building Agent (this may take a few minutes)..."
# Using npx directly for electron-builder to ensure mirror env vars are respected
npm run agent:build

# 5. Copy to public directory
echo "5. Checking build results..."
$setupFile = Get-ChildItem -Path "dist" -Filter "*Setup*.exe" | Select-Object -First 1

if ($setupFile) {
    Copy-Item -Path $setupFile.FullName -Destination "public\Setup.exe" -Force
    echo "Done! Setup file is now at public\Setup.exe"
    echo "File: $($setupFile.Name)"
}
else {
    echo "Warning: Build finished but could not find Setup.exe in dist folder."
    echo "Attempting to find unpacked executable as fallback..."
    $unpackedFile = Get-ChildItem -Path "dist\win-unpacked" -Filter "RealEstateAgent.exe" | Select-Object -First 1
    if ($unpackedFile) {
        echo "Found unpacked executable: $($unpackedFile.FullName)"
        echo "Note: Setup.exe installer packaging failed, but the app itself was built."
    }
}
echo "=============================================="
