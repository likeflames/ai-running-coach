@echo off
cd /d "%~dp0"
title Expo Login (no browser)

echo ============================================================
echo   Step 1 : Login to Expo account (password mode)
echo ============================================================
echo.
echo   Username is pre-filled: likeflames
echo   You only need to type the PASSWORD.
echo.
echo   NOTE: the password will NOT show while typing.
echo         That is normal. Just type it and press Enter.
echo.
pause

call npx expo login -u likeflames --no-browser

echo.
if errorlevel 1 (
  echo [FAILED] Login did not complete.
  echo.
  echo Check the password and run this file again.
  echo If your account uses 2FA, it will ask for a one-time code.
  echo.
) else (
  echo [OK] Login success.
  echo.
  echo Now go back to the chat and tell me it is done.
)

echo.
pause
