#!/bin/sh

set -eu

interval=6h
uninstall=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --interval)
      interval=${2:-}
      shift 2
      ;;
    --uninstall)
      uninstall=true
      shift
      ;;
    --help)
      printf 'Usage: %s [--interval 6h] [--uninstall]\n' "$0"
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

if [ "$(uname -s)" != "Linux" ]; then
  printf '%s\n' 'This installer only supports Linux with systemd.' >&2
  exit 2
fi
if ! printf '%s' "$interval" | grep -Eq '^[1-9][0-9]*(s|min|h|d)$'; then
  printf '%s\n' '--interval must look like 30min, 6h, or 1d.' >&2
  exit 2
fi
if ! command -v systemctl >/dev/null 2>&1; then
  printf '%s\n' 'systemctl is required for the Linux automatic updater.' >&2
  exit 127
fi

data_home=${XDG_DATA_HOME:-$HOME/.local/share}
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
install_root="$data_home/ai-talk"
installed_updater="$install_root/update-ai-talk.sh"
unit_root="$config_home/systemd/user"
service="$unit_root/ai-talk-update.service"
timer="$unit_root/ai-talk-update.timer"

if [ "$uninstall" = true ]; then
  systemctl --user disable --now ai-talk-update.timer 2>/dev/null || true
  rm -f "$service" "$timer" "$installed_updater"
  rmdir "$install_root" 2>/dev/null || true
  systemctl --user daemon-reload
  printf 'Removed AI Talk automatic updates.\n'
  exit 0
fi

script_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
source_updater="$script_dir/update-ai-talk.sh"
if [ ! -f "$source_updater" ]; then
  printf 'Missing updater beside installer: %s\n' "$source_updater" >&2
  exit 1
fi
codex_path=$(command -v codex || true)
if [ -z "$codex_path" ]; then
  printf '%s\n' 'Codex CLI is required before installing automatic updates.' >&2
  exit 127
fi

systemd_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

mkdir -p "$install_root" "$unit_root"
cp "$source_updater" "$installed_updater"
chmod 700 "$installed_updater"
escaped_updater=$(systemd_escape "$installed_updater")
escaped_codex=$(systemd_escape "$codex_path")

cat >"$service" <<EOF
[Unit]
Description=Update AI Talk Codex plugin

[Service]
Type=oneshot
Environment="CODEX_BIN=$escaped_codex"
ExecStart=/bin/sh "$escaped_updater"
EOF

cat >"$timer" <<EOF
[Unit]
Description=Check for AI Talk plugin updates

[Timer]
OnBootSec=5m
OnUnitActiveSec=$interval
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now ai-talk-update.timer
systemctl --user start ai-talk-update.service
printf 'Installed AI Talk automatic updates with interval %s.\n' "$interval"
