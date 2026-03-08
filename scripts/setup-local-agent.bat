@echo off
chcp 65001 > nul
setlocal

echo.
echo =====================================================
echo   부동산 AI OS - 로컬 자동화 에이전트 설치
echo =====================================================
echo.

:: ─── 1. 관리자 권한 확인 ──────────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 관리자 권한으로 실행해 주세요.
    echo     이 파일을 우클릭 ^> "관리자 권한으로 실행"
    pause
    exit /b 1
)

:: ─── 2. Node.js 확인 ──────────────────────────────────
echo [1/5] Node.js 확인 중...
node -v >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js가 설치되지 않았습니다.
    echo     https://nodejs.org 에서 LTS 버전을 설치 후 다시 실행하세요.
    start https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo     Node.js %NODE_VER% 확인 완료

:: ─── 3. 작업 디렉토리 설정 ────────────────────────────
set AGENT_DIR=%APPDATA%\RealEstateAIOS
echo [2/5] 에이전트 디렉토리 생성: %AGENT_DIR%
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"

:: .env 파일 생성 (없는 경우)
if not exist "%AGENT_DIR%\.env" (
    echo # 부동산 AI OS 에이전트 설정 > "%AGENT_DIR%\.env"
    echo SUPABASE_URL= >> "%AGENT_DIR%\.env"
    echo SUPABASE_ANON_KEY= >> "%AGENT_DIR%\.env"
    echo AGENT_KEY= >> "%AGENT_DIR%\.env"
    echo [!] %AGENT_DIR%\.env 파일을 열어 설정값을 입력하세요.
)

:: ─── 4. 의존성 설치 ───────────────────────────────────
echo [3/5] npm 패키지 설치 중...
cd /d "%~dp0.."
call npm install --legacy-peer-deps
if %errorLevel% neq 0 (
    echo [!] npm install 실패
    pause
    exit /b 1
)
echo     패키지 설치 완료

:: ─── 5. Playwright 브라우저 설치 ──────────────────────
echo [4/5] Playwright 브라우저 설치 중... (시간이 걸릴 수 있습니다)
call npx playwright install chromium
if %errorLevel% neq 0 (
    echo [!] Playwright 브라우저 설치 실패
    pause
    exit /b 1
)
echo     Playwright Chromium 설치 완료

:: ─── 6. 바탕화면 단축아이콘 생성 ──────────────────────
echo [5/5] 바탕화면 단축아이콘 생성 중...
set SHORTCUT=%USERPROFILE%\Desktop\부동산AI 에이전트 시작.bat
echo @echo off > "%SHORTCUT%"
echo cd /d "%~dp0.." >> "%SHORTCUT%"
echo start "부동산AI 에이전트" cmd /k "npm run agent:start" >> "%SHORTCUT%"

echo.
echo =====================================================
echo   설치 완료!
echo =====================================================
echo.
echo   시작 방법:
echo   1. 바탕화면의 "부동산AI 에이전트 시작.bat" 실행
echo   2. 또는 이 폴더에서: npm run agent:start
echo.
echo   에이전트가 실행 중이어야 자동화 기능이 동작합니다.
echo.

set /p START_NOW="지금 에이전트를 시작하시겠습니까? (Y/N): "
if /i "%START_NOW%"=="Y" (
    echo 에이전트 시작 중...
    cd /d "%~dp0.."
    npm run agent:start
)

pause
