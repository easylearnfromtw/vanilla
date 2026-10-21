#!/usr/bin/env sh
# Explicit opt-in systemd USER service: never enable linger or elevate privileges.
set -eu
role="${1:-owner}"
action="${2:-install}"
case "$role" in owner|friend) ;; *) echo "Role must be owner or friend"; exit 2;; esac
case "$action" in install|remove|status) ;; *) echo "Action must be install, remove or status"; exit 2;; esac
unit="vanilla-slime-$role.service"
unit_file="$HOME/.config/systemd/user/$unit"
target="$HOME/.local/share/vanilla/slime/$role"
if [ "$action" = "status" ]; then systemctl --user status "$unit" --no-pager; exit 0; fi
if [ "$action" = "remove" ]; then
  systemctl --user disable --now "$unit" 2>/dev/null || true
  rm -f "$unit_file"
  systemctl --user daemon-reload
  echo "Startup removed. Your local device credentials can be revoked separately."
  exit 0
fi
[ -f "$HOME/.vanilla/slime/$role.json" ] || { echo "Complete Ceres Telegram pairing first."; exit 1; }
[ ! -f "$unit_file" ] || { echo "Service already installed. Remove it first to update."; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "systemd user session required."; exit 1; }
echo "Opt-in user service, not a hidden or privileged daemon. Outbound HTTPS, no firewall rules."
printf "Type YES to enable: "
IFS= read -r answer
[ "$answer" = "YES" ] || exit 0
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$target" "$HOME/.config/systemd/user"
cp "$source_dir/slime_desktop.py" "$source_dir/slime_runner_agent.py" "$target/"
chmod 700 "$target"
cat > "$unit_file" <<EOF
[Unit]
Description=Vanilla Slime $role (user opt-in)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
Environment=SLIME_INSTALL_ROLE=$role
ExecStart=/usr/bin/env python3 %h/.local/share/vanilla/slime/$role/slime_desktop.py
Restart=on-failure
RestartSec=30
NoNewPrivileges=true
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now "$unit"
echo "Enabled user service. Runs while logged in, including when screen is off."
