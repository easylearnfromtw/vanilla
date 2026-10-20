#!/usr/bin/env bash
# Explicit operator-controlled Ubuntu 24.04 AppArmor workaround.
# Unlike common "fixes", this NEVER disables kernel AppArmor protection
# globally, changes sysctl, or grants all applications user namespace access.
set -euo pipefail
if [[ "${EUID}" -ne 0 ]]; then echo 'Run as root AFTER reviewing the distro profile.' >&2; exit 1; fi
if [[ ! -f /etc/os-release ]]; then exit 1; fi
. /etc/os-release
if [[ "${ID}" != ubuntu || "${VERSION_ID}" != 24.04 ]]; then
  echo 'Only tested for Ubuntu 24.04; refuse other distributions.' >&2
  exit 1
fi
apt-get update
apt-get install -y --no-install-recommends apparmor apparmor-utils apparmor-profiles
src='/usr/share/apparmor/extra-profiles/bwrap-userns-restrict'
dst='/etc/apparmor.d/bwrap-userns-restrict'
if [[ ! -f "$src" ]]; then
  echo 'No distro-provided scoped bwrap profile. Review vendor updates; do not weaken global userns settings.' >&2
  exit 1
fi
if [[ -e "$dst" ]]; then
  echo "Profile already exists at $dst. Inspect it and merge updates manually." >&2
  exit 1
fi
# Validate the vendor profile before touching the live system.
apparmor_parser -Q "$src"
install -m 0644 -o root -g root "$src" "$dst"
if ! apparmor_parser -r "$dst"; then
  rm -f "$dst"
  echo 'AppArmor load failed; removed newly installed profile.' >&2
  exit 1
fi
echo 'Scoped distro-supplied Bubblewrap AppArmor profile installed.'
echo 'Do not disable kernel.apparmor_restrict_unprivileged_userns globally.'
echo "Rollback: sudo apparmor_parser -R $dst && sudo rm $dst"
