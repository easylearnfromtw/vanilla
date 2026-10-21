#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
export SLIME_INSTALL_ROLE=friend
exec python3 slime_desktop.py "$@"
