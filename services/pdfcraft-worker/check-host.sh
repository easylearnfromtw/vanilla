#!/usr/bin/env bash
# Run as operator on the dedicated Ubuntu VPS. No changes to production state.
set -euo pipefail
root='/opt/vanilla'
if ! id vanilla-pdfcraft >/dev/null 2>&1; then
  echo 'Missing worker OS account. Review and run install-linux.sh first.' >&2
  exit 1
fi
if [[ ! -x "$root/.venv-pdfcraft/bin/python" ]]; then
  echo 'Missing worker virtual environment.' >&2
  exit 1
fi
echo 'Kernel and AppArmor diagnostic (no secrets):'
uname -a
for key in kernel.unprivileged_userns_clone user.max_user_namespaces kernel.apparmor_restrict_unprivileged_userns; do
  sysctl "$key" 2>/dev/null || true
done
if command -v aa-status >/dev/null 2>&1; then
  aa-status 2>/dev/null | grep -Ei 'bwrap|apparmor module' || true
fi
echo 'Running real PDF native sandbox acceptance as unprivileged OS user ...'
exec runuser -u vanilla-pdfcraft -- env \
  PYTHONPATH="$root/services/weiguo" \
  "$root/.venv-pdfcraft/bin/python" \
  "$root/services/pdfcraft-worker/preflight.py"
