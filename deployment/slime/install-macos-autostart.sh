#!/bin/sh
# User-approved launchd agent. Requires GUI login; never bypasses Gatekeeper.
set -eu
role="${1:-owner}"
action="${2:-install}"
case "$role" in owner|friend) ;; *) echo "Role must be owner or friend"; exit 2;; esac
case "$action" in install|remove|status) ;; *) echo "Action must be install, remove or status"; exit 2;; esac
label="com.vanilla.slime.$role"
plist="$HOME/Library/LaunchAgents/$label.plist"
target="$HOME/Library/Application Support/Vanilla/Slime/$role"
if [ "$action" = "status" ]; then launchctl print "gui/$(id -u)/$label" || true; exit 0; fi
if [ "$action" = "remove" ]; then
  launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
  rm -f "$plist"
  echo "Stopped and removed startup agent. Paired device can still be explicitly left/revoked."
  exit 0
fi
[ -f "$HOME/.vanilla/slime/$role.json" ] || { echo "First complete Ceres Telegram device pairing."; exit 1; }
[ ! -f "$plist" ] || { echo "Already configured. Remove first to update."; exit 1; }
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
echo "Opt-in login agent, visible in launchctl. Does not change firewall, privacy or power settings."
printf "Type YES to enable: "
IFS= read -r answer
[ "$answer" = "YES" ] || exit 0
mkdir -p "$target" "$HOME/Library/LaunchAgents"
cp "$script_dir/slime_desktop.py" "$script_dir/slime_runner_agent.py" "$target/"
# Fixed user-owned path is XML escaped for plist string attributes.
python_bin=$(command -v python3)
python3 - "$plist" "$target/slime_desktop.py" "$role" "$label" "$python_bin" <<'PY'
import sys,plistlib
path,script,role,label,python_bin=sys.argv[1:]
obj={"Label":label,"ProgramArguments":[python_bin,script],
     "EnvironmentVariables":{"SLIME_INSTALL_ROLE":role},"RunAtLoad":True,
     "KeepAlive":{"SuccessfulExit":False},"ThrottleInterval":30}
with open(path,"wb") as out: plistlib.dump(obj,out)
PY
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "Agent installed; it starts after user sign-in and can run while the display sleeps."
