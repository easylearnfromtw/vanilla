#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ "$#" -eq 0 ]; then set -- --dashboard; fi
export SLIME_INSTALL_ROLE=friend
exec python3 slime_desktop.py "$@"
