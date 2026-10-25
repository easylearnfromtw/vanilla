#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "請先安裝 Python 3.10 以上版本。"
  exit 2
fi
exec python3 slime_desktop.py --tools
