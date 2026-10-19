#!/usr/bin/env bash
# Railway mounts persistent volumes after image construction, often root-owned.
# Fix volume permissions as root once, then drop privileges permanently.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "WeiGuo initialization must start as root to set volume permissions" >&2
  exit 1
fi
mkdir -p /data
chown 10001:10001 /data
chmod 0700 /data

# No web server, Chromium process or user scripts may run as root.
exec runuser -u weiguo -- "$@"
