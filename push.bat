@echo off
setlocal
cd /d "%~dp0"

rem Ask for the token interactively so the value never lands in a command line
rem history or a screenshot.
set "GITHUB_TOKEN="
set /p "GITHUB_TOKEN=Paste your GitHub token, then press Enter: "

if "%GITHUB_TOKEN%"=="" goto notoken

echo.
echo [1/2] Pushing files ...
echo.
node "%~dp0tools\push-via-api.mjs"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" goto failed

echo [2/2] Creating the pinned known-issue ...
echo.
node "%~dp0tools\make-issue.mjs"
set "RC2=%ERRORLEVEL%"

set "GITHUB_TOKEN="
echo.
if not "%RC2%"=="0" goto issuefailed

echo ============================================
echo  ALL DONE
echo  https://github.com/wssblllhaha-ctrl/haha-show-feedback
echo ============================================
goto hold

:issuefailed
echo ============================================
echo  Files pushed OK, but creating the issue failed.
echo  You can also create it by hand: copy issues\issue-body.md
echo  into a new issue on GitHub.
echo ============================================
goto hold

:failed
set "GITHUB_TOKEN="
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
