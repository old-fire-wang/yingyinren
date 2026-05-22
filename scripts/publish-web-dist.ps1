# 将本地 packages/web/dist 同步到 ECS 上的 API 静态目录（覆盖后刷新浏览器即可，一般无需 pm2 restart）
param(
  [string] $Server = "115.190.196.95",
  [string] $RemoteDir = "/opt/yingyinren-api/web/dist",
  [string] $User = "root",
  [string] $IdentityFile = "$env:USERPROFILE\Desktop\knowledge.pem"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $here "packages\web\dist"

if (-not (Test-Path (Join-Path $dist "index.html"))) {
  throw "未找到 $dist\index.html，请先在 packages\web 执行: npm run build"
}

Write-Host "即将上传: $dist -> ${User}@${Server}:$RemoteDir" -ForegroundColor Cyan
if (-not (Test-Path $IdentityFile)) {
  throw "未找到 SSH 密钥: $IdentityFile（默认桌面 knowledge.pem）"
}

Write-Host "密钥: $IdentityFile" -ForegroundColor DarkGray

# OpenSSH（Windows 可选功能）下的 scp
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
  throw "未找到 scp 命令，请安装 OpenSSH 客户端或改用 WinSCP / rsync。"
}

& scp -i $IdentityFile -r "$dist\*" "${User}@${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { throw "scp 失败（检查网络、SSH、路径权限）。" }

Write-Host "完成。浏览器请 Ctrl+F5 强刷避免旧 JS 缓存。" -ForegroundColor Green
