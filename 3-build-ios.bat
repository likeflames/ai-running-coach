@echo off
setlocal
cd /d "%~dp0"
title AI Running Coach - iOS Build

echo ============================================
echo  Step 1/2   Check Expo login
echo ============================================
echo.

if not exist token.txt goto no_token
set "EXPO_TOKEN="
for /f "usebackq delims=" %%a in ("token.txt") do set "EXPO_TOKEN=%%a"
if not defined EXPO_TOKEN goto no_token

call npx eas-cli whoami
if errorlevel 1 goto token_bad

echo.
echo ============================================
echo  Step 2/2   Build iOS app in Expo cloud
echo ============================================
echo.
echo  You will be asked to sign in with your Apple ID.
echo  A free Apple ID works. A 6-digit code may be
echo  sent to your iPhone - type it in this window.
echo.
echo  Build takes about 5-15 minutes. Keep it open.
echo.
pause

call npx eas-cli build --platform ios --profile preview
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo [FAILED] exit code %RC%
if "%RC%"=="0" echo [OK] Scan the QR code with your iPhone camera to install.
echo.
pause
exit /b %RC%

:no_token
echo [ERROR] token.txt missing or empty.
echo Open https://expo.dev/settings/access-tokens
echo Create a token named "build" with Limit access OFF,
echo then run 4-save-token.bat to store it.
echo.
pause
exit /b 1

:token_bad
echo.
echo [ERROR] This token cannot access the Expo account.
echo Create a NEW token (Limit access OFF) and save it again.
echo.
pause
exit /b 1
