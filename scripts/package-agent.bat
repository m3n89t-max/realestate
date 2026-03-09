@echo off
chcp 65001 > nul
echo.
echo =====================================================
echo   부동산 AI OS - 에이전트 배포 패키지 생성
echo =====================================================
echo.

set ROOT=%~dp0..
set OUT=%ROOT%\release-agent

:: 1. 출력 폴더 생성
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

:: 2. 컴파일 (TypeScript → JS)
echo [1/3] TypeScript 컴파일 중...
cd /d "%ROOT%"
call npx tsc -p tsconfig.agent.json
if %errorLevel% neq 0 (echo [!] 컴파일 실패 & pause & exit /b 1)

:: 3. 파일 복사
echo [2/3] 파일 복사 중...
xcopy "%ROOT%\dist-agent"     "%OUT%\dist-agent\"     /e /i /q
xcopy "%ROOT%\scripts"        "%OUT%\scripts\"        /e /i /q
copy  "%ROOT%\package.json"   "%OUT%\package.json"

:: 4. 에이전트 전용 package.json 생성 (Next.js 의존성 제거)
echo [3/3] 배포용 package.json 생성 중...
echo { > "%OUT%\package.json"
echo   "name": "realestate-agent", >> "%OUT%\package.json"
echo   "version": "1.0.0", >> "%OUT%\package.json"
echo   "main": "dist-agent/worker.js", >> "%OUT%\package.json"
echo   "scripts": { >> "%OUT%\package.json"
echo     "start": "node dist-agent/worker.js" >> "%OUT%\package.json"
echo   }, >> "%OUT%\package.json"
echo   "dependencies": { >> "%OUT%\package.json"
echo     "@supabase/supabase-js": "^2.45.0", >> "%OUT%\package.json"
echo     "playwright": "^1.45.0", >> "%OUT%\package.json"
echo     "dotenv": "^17.3.1" >> "%OUT%\package.json"
echo   } >> "%OUT%\package.json"
echo } >> "%OUT%\package.json"

echo.
echo =====================================================
echo   완료! 배포 폴더: release-agent\
echo =====================================================
echo   배포 방법:
echo   1. release-agent\ 폴더 ZIP 압축
echo   2. 고객에게 전달
echo   3. 고객은 scripts\setup-local-agent.bat 실행
echo.
pause
