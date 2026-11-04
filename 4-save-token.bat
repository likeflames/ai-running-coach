@echo off
setlocal
cd /d "%~dp0"
title Save Expo token

echo ============================================
echo  Save Expo access token into token.txt
echo ============================================
echo.
echo 1. Open https://expo.dev/settings/access-tokens
echo 2. Create token named "build", Limit access OFF
echo 3. Click "Generate new token" and copy it
echo.
echo Paste it below and press Enter.
echo (Right-click in this window to paste)
echo.
set "TOK="
set /p "TOK=Token: "

if not defined TOK goto empty
> token.txt echo %TOK%
echo.
echo Saved to token.txt
echo.
echo Now run 3-build-ios.bat
pause
exit /b 0

:empty
echo.
echo [ERROR] Nothing was pasted. Run this file again.
pause
exit /b 1
