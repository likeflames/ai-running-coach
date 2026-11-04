@echo off
cd /d "%~dp0"
setlocal

echo ============================================
echo  Save Expo access token into token.txt
echo ============================================
echo.
echo 1. Open https://expo.dev/settings/access-tokens
echo 2. Click "Create token", name it "build"
echo    Leave "Limit access" OFF (full access)
echo 3. Click "Generate new token" and copy it
echo.
echo Paste the token below, then press Enter.
echo Right-click in this window to paste.
echo.
set "TOK="
set /p "TOK=Token: "

if "%TOK%"=="" (
  echo [ERROR] Nothing pasted. Run this again.
  pause
  exit /b 1
)

> token.txt echo %TOK%
echo.
echo Saved. Token length check:
for /f "usebackq delims=" %%a in ("token.txt") do call :strlen "%%a"
echo.
echo Next: double-click 3-build-ios.bat
pause
exit /b 0

:strlen
setlocal enabledelayedexpansion
set "s=%~1"
set "n=0"
:loop
if not "!s!"=="" (
  set "s=!s:~1!"
  set /a n+=1
  goto loop
)
echo   length = %n% characters
endlocal
exit /b 0
