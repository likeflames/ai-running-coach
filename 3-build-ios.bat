@echo off
cd /d "%~dp0"

if not exist token.txt (
  echo [ERROR] token.txt not found.
  echo Create a full-access token at https://expo.dev/settings/access-tokens
  echo Save it into token.txt, then run this file again.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%a in ("token.txt") do set "EXPO_TOKEN=%%a"

echo ============================================
echo  Step 1/2  Check Expo login
echo ============================================
npx eas-cli whoami
echo.

echo ============================================
echo  Step 2/2  Build iOS app in Expo cloud
echo ============================================
echo.
echo  You will be asked to sign in to your Apple ID.
echo  A free Apple ID works. A 6-digit code may be
echo  sent to your iPhone - type it here.
echo.
echo  Build takes about 5-15 minutes.
echo  Keep this window open.
echo.
pause

npx eas-cli build --platform ios --profile preview

echo.
echo ============================================
echo  If a link / QR code appeared above, open it
echo  on your iPhone to install the app.
echo  If it failed, copy the error text to the chat.
echo ============================================
pause
