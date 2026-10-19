#!/usr/bin/env bash
# Bootstrap a reviewed v0.9.0 CLI on a dedicated Ubuntu/Debian x86_64 host.
# Does NOT enable the worker or alter any existing WeiGuo/Railway deployment.
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this provisioning script as root on the dedicated host.' >&2
  exit 1
fi
if [[ "$(uname -m)" != x86_64 ]]; then
  echo 'This pinned release is only for Linux x86_64.' >&2
  exit 1
fi
if [[ ! -f /opt/vanilla/services/pdfcraft-worker/worker_api.py ]]; then
  echo 'First clone the trusted Vanilla source to /opt/vanilla.' >&2
  exit 1
fi

apt-get update
apt-get install -y --no-install-recommends bubblewrap ca-certificates curl python3-venv
tmp="$(mktemp -d -t vanilla-pdfcraft-install.XXXXXXXX)"
trap 'rm -rf "$tmp"' EXIT
curl --fail --location --show-error --silent --retry 3 --connect-timeout 15 --max-time 180 \
  'https://github.com/storytold/pdfcraft/releases/download/v0.9.0/pdfcraft-cli-0.9.0-linux-x86_64.tar.gz' \
  -o "$tmp/pdfcraft.tar.gz"
printf '%s  %s\n' \
  'cdba2bec4d502d016dd78101a402d07845b708c49d77bc85e0ab640aca65372b' "$tmp/pdfcraft.tar.gz" \
  | sha256sum -c -
python3 - "$tmp/pdfcraft.tar.gz" "$tmp/extracted" <<'PY'
from pathlib import Path
import sys
import tarfile
archive, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive, "r:gz") as t:
    members = t.getmembers()
    for m in members:
        name = Path(m.name)
        if (name.is_absolute() or ".." in name.parts or not (m.isfile() or m.isdir())):
            raise SystemExit("Unexpected archive object: " + str(name))
    t.extractall(destination, members=members, filter="data")
PY
release="$tmp/extracted/pdfcraft-cli-0.9.0-linux-x86_64"
printf '%s  %s\n' \
  '073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f' "$release/pdfcraft-cli" \
  | sha256sum -c -
install -m 0755 "$release/pdfcraft-cli" /usr/local/bin/pdfcraft-cli
install -d -m 0755 /usr/local/share/doc/vanilla-pdfcraft
install -m 0644 "$release/LICENSE-MIT" "$release/LICENSE-APACHE" "$release/NOTICE" /usr/local/share/doc/vanilla-pdfcraft/
if ! id -u vanilla-pdfcraft >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin vanilla-pdfcraft
fi
python3 -m venv /opt/vanilla/.venv-pdfcraft
/opt/vanilla/.venv-pdfcraft/bin/pip install --disable-pip-version-check \
  -r /opt/vanilla/services/pdfcraft-worker/requirements.txt
install -d -m 0750 -o root -g vanilla-pdfcraft /etc/vanilla
if [[ ! -e /etc/vanilla/pdfcraft-worker.env ]]; then
  echo '# Set a random 32-byte hex secret and enable only after rootless sandbox probe succeeds.' \
    > /etc/vanilla/pdfcraft-worker.env
  chmod 0640 /etc/vanilla/pdfcraft-worker.env
  chown root:vanilla-pdfcraft /etc/vanilla/pdfcraft-worker.env
fi
install -m 0644 /opt/vanilla/services/pdfcraft-worker/vanilla-pdfcraft-worker.service \
  /etc/systemd/system/vanilla-pdfcraft-worker.service
systemctl daemon-reload
echo 'Installed pinned PdfCraft binary and worker service file; service is NOT started.'
echo 'Set /etc/vanilla/pdfcraft-worker.env and verify unprivileged namespace isolation first.'
