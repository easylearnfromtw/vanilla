#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec SLIME_INSTALL_ROLE=friend python3 slime_desktop.py "$@"
