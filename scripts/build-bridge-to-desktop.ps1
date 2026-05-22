#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BridgeDir = Join-Path $RepoRoot "packages\bridge"
$ReleaseDir = "D:\AAanzhuangbao"
$BridgeAssets = Join-Path $BridgeDir "assets"
$IconDest = Join-Path $BridgeAssets "icon.png"
$ParentOfRepo = Split-Path -Parent $RepoRoot
$IconSourceNew = Join-Path $ParentOfRepo "assets\c__Users_ZhuanZ______AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_____C-fef627e7-fec1-4c03-ab5c-1f67936fae0d.png"
$IconSourceLegacy = Join-Path $ParentOfRepo "assets\c__Users_ZhuanZ______AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images______-646d470f-e872-4121-b1d2-8391b44bdb4c.png"

function Refresh-PathFromRegistry {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($machinePath -or $userPath) {
    $env:Path = "$machinePath;$userPath"
  }
}

function Ensure-Node {
  Refresh-PathFromRegistry
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host ("node: " + (& node -v)) -ForegroundColor Green
    return
  }
  Write-Host "未在 PATH 中找到 node，尝试用 winget 安装 Node.js LTS..." -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "未找到 node 与 winget。请从 https://nodejs.org/ 安装 LTS（勾选 Add to PATH），关闭并重开终端后再运行本脚本。"
  }
  & winget install OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) {
    throw "winget 安装 Node 失败。请手动安装 https://nodejs.org/ LTS 后重试。"
  }
  Refresh-PathFromRegistry
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node 已安装但当前会话仍找不到。请关闭本窗口，重新双击运行脚本（或注销/重启一次）。"
  }
  Write-Host ("node: " + (& node -v)) -ForegroundColor Green
}

Write-Host "== 影印人桥C：依赖与打包 ==" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BridgeAssets | Out-Null
if (Test-Path -LiteralPath $IconSourceNew) {
  Copy-Item -LiteralPath $IconSourceNew -Destination $IconDest -Force
  Write-Host "已同步图标 -> packages\bridge\assets\icon.png" -ForegroundColor Green
} elseif (Test-Path -LiteralPath $IconSourceLegacy) {
  Copy-Item -LiteralPath $IconSourceLegacy -Destination $IconDest -Force
  Write-Host "已同步图标(旧路径) -> packages\bridge\assets\icon.png" -ForegroundColor Green
} elseif (-not (Test-Path -LiteralPath $IconDest)) {
  Write-Warning "未找到仓库旁 assets 下的源图，且 bridge\assets\icon.png 不存在。请将 PNG 放到 packages\bridge\assets\icon.png"
}

Ensure-Node
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "未找到 npm，请重装 Node.js 并勾选 npm / Add to PATH。"
}

Set-Location -LiteralPath $RepoRoot
Write-Host "npm install（仓库根）..." -ForegroundColor Cyan
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }

Write-Host "npm run bridge:dist（NSIS 安装包）..." -ForegroundColor Cyan
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
& npm run bridge:dist
if ($LASTEXITCODE -ne 0) { throw "bridge:dist 失败" }

$built = Get-ChildItem -LiteralPath $ReleaseDir -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $built) {
  $built = Get-ChildItem -LiteralPath $ReleaseDir -Filter "*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}
if (-not $built) {
  throw "在 $ReleaseDir 未找到安装包 exe，请检查 electron-builder 日志。"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$target = Join-Path $desktop "影印人桥C-安装程序.exe"
Copy-Item -LiteralPath $built.FullName -Destination $target -Force
Write-Host "" 
Write-Host "完成：桌面已放置「影印人桥C-安装程序.exe」，双击按向导安装；安装后快捷方式会使用当前 assets\icon.png。" -ForegroundColor Green
Write-Host "源文件: $($built.FullName)" -ForegroundColor Gray

try {
  & explorer.exe "/select,$target"
} catch {
  # ignore
}
