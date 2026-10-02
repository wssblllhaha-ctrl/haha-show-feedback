@echo off
setlocal
cd /d "%~dp0"

rem Ask for the token interactively so the value never lands in a command line
rem history or a screenshot.
set "GITHUB_TOKEN="
set /p "GITHUB_TOKEN=Paste your GitHub token, then press Enter: "

if "%GITHUB_TOKEN%"=="" goto notoken

echo.
echo Pushing to GitHub ...
echo.

node "%~dp0tools\push-via-api.mjs"
set "RC=%ERRORLEVEL%"
set "GITHUB_TOKEN="

echo.
if not "%RC%"=="0" goto failed
echo ============================================
echo  DONE. Open the repository and refresh:
echo  https://github.com/wssblllhaha-ctrl/haha-show-feedback
echo ============================================
goto hold

:failed
echo ============================================
echo  FAILED (exit code %RC%). Read the message above.
echo  Common causes:
echo    - token expired or wrong scope (needs "repo")
echo    - token was deleted after being leaked
echo ============================================
goto hold

:notoken
echo No token entered.

:hold
echo.
echo Press any key to close this window ...
pause >nul
exit /b 0
