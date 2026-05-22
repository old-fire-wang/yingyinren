# 首次推到 GitHub（需先在网页建好空仓库）
# 用法: .\scripts\push-to-github.ps1 -GitHubUser YOUR_USERNAME [-RepoName yingyinren]
param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubUser,
  [string]$RepoName = "yingyinren",
  [switch]$CreateWithGh
)

if ($GitHubUser -eq "YOUR_USERNAME") {
  $GitHubUser = "old-fire-wang"
}

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$remote = "https://github.com/$GitHubUser/$RepoName.git"
Write-Host "Remote: $remote"

if ($CreateWithGh) {
  gh repo create $RepoName --private --source=. --remote=origin --push
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Open: https://github.com/$GitHubUser/$RepoName"
    exit 0
  }
  Write-Warning "gh repo create failed; falling back to git push (repo must exist on GitHub)."
}

git remote remove origin 2>$null
git remote add origin $remote
git branch -M main
# 本机若开了 TUN/代理，github.com 可能解析到假 IP；用 curlResolve 直连
$resolve = "+github.com:443:20.205.243.166"
git -c "http.curloptResolve=$resolve" push -u origin main
Write-Host "Done. Open: https://github.com/$GitHubUser/$RepoName"
