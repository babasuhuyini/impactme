@echo off
title ImpactMe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, this only happens once...
  call npm install
)

echo.
echo  ImpactMe is starting at http://localhost:5173
echo  Keep this window open while you use the app. Close it to stop.
echo.
call npm run dev -- --open
echo.
echo  If it says the port is already in use, ImpactMe is already running:
echo  just open http://localhost:5173 in your browser.
pause
