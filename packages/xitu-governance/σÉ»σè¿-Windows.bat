@echo off
chcp 65001 >nul
title 稀土壁搜索治理平台

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未检测到 Node.js。
  echo 请先安装 Node.js LTS 版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo 正在启动稀土壁搜索治理平台...
echo.
echo 访问地址：http://localhost:5177/?v=share
echo.
echo 请不要关闭这个窗口，关闭后平台会停止运行。
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5177/?v=share'"

node server.js

echo.
echo 服务已停止。
pause

