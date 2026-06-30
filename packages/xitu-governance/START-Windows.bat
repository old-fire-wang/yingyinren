@echo off
chcp 65001 >nul
title C2B Search Refinery

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Please install Node.js LTS first: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo Starting C2B Search Refinery...
echo.
echo URL: http://localhost:5177/?v=share
echo.
echo Keep this window open while using the platform.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5177/?v=share'"

node server.js

echo.
echo Server stopped.
pause

