@echo off
chcp 65001 >nul
title 影印人桥C - 打包到桌面
pushd "%~dp0.."
set "REPO=%CD%"
popd
powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\build-bridge-to-desktop.ps1"
echo.
pause
