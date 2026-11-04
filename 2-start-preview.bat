@echo off
cd /d "%~dp0"
title AI Running Coach - Start Preview Server

echo ============================================================
echo   Start preview server (Metro)
echo ============================================================
echo.

rem Load Expo access token from token.txt (saved once, no login needed)
if exist "token.txt" (
  set /p EXPO_TOKEN=<token.txt
  echo   Using saved Expo token.
) else (
  echo   [WARN] token.txt not found - the phone may refuse to open the project.
)

echo.
echo   Keep this window OPEN while previewing.
echo   Closing it stops the server.
echo.
echo   If it says port 8081 is in use, a server is already running.
echo   Just close this window.
echo.

call npx expo start --lan

pause
