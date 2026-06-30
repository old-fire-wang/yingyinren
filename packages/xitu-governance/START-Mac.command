#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Please install Node.js LTS first: https://nodejs.org/"
  echo
  read -n 1 -s -r -p "Press any key to exit"
  exit 1
fi

echo
echo "Starting C2B Search Refinery..."
echo
echo "URL: http://localhost:5177/?v=share"
echo
echo "Keep this window open while using the platform."
echo

(sleep 2 && open "http://localhost:5177/?v=share") &

node server.js

echo
read -n 1 -s -r -p "Server stopped. Press any key to exit"
