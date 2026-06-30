#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。"
  echo "请先安装 Node.js LTS 版本：https://nodejs.org/"
  echo
  read -n 1 -s -r -p "按任意键退出"
  exit 1
fi

echo
echo "正在启动稀土壁搜索治理平台..."
echo
echo "访问地址：http://localhost:5177/?v=share"
echo
echo "请不要关闭这个窗口，关闭后平台会停止运行。"
echo

(sleep 2 && open "http://localhost:5177/?v=share") &

node server.js

echo
read -n 1 -s -r -p "服务已停止，按任意键退出"
