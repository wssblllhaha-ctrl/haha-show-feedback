@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not "%~1"=="" goto run

echo.
echo   Usage: push.bat YOUR_TOKEN
echo.
echo   Example:  push.bat ghp_xxxxxxxxxxxx
echo.
echo   Create a classic token at https://github.com/settings/tokens
echo   and check the "repo" scope. The token is used for this run only.
echo.
exit /b 2

:run
set "GITHUB_TOKEN=%~1"
node "%~dp0tools\push-via-api.mjs"
set "RC=%ERRORLEVEL%"
set "GITHUB_TOKEN="
exit /b %RC%
