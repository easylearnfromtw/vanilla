#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "需先安裝 Python 3.10 或以上，然後重新開啟 Slime。"
  exit 1
fi
SLIME_INSTALL_ROLE=friend python3 slime_desktop.py "$@"
