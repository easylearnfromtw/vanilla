#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
export SLIME_INSTALL_ROLE=friend
if [ "$#" -eq 0 ]; then set -- --dashboard; fi
exec python3 slime_desktop.py "$@"
