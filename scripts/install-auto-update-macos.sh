#!/bin/sh

set -eu

label="com.strivetolearncode.ai-talk-update"
interval_seconds=21600
uninstall=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --interval-seconds)
      interval_seconds=${2:-}
      shift 2
      ;;
    --uninstall)
      uninstall=true
      shift
      ;;
    --help)
      printf 'Usage: %s [--interval-seconds N] [--uninstall]\n' "$0"
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

case "$interval_seconds" in
  ''|*[!0-9]*)
    printf '%s\n' '--interval-seconds must be a positive integer.' >&2
    exit 2
    ;;
esac
if [ "$interval_seconds" -lt 300 ]; then
  printf '%s\n' '--interval-seconds must be at least 300.' >&2
  exit 2
fi
if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\n' 'This installer only supports macOS.' >&2
  exit 2
fi

uid=$(id -u)
install_root="$HOME/Library/Application Support/AI Talk"
installed_updater="$install_root/update-ai-talk.sh"
plist="$HOME/Library/LaunchAgents/$label.plist"
log_file="$HOME/Library/Logs/ai-talk-update.log"

if [ "$uninstall" = true ]; then
  launchctl bootout "gui/$uid" "$plist" 2>/dev/null || true
  rm -f "$plist" "$installed_updater"
  rmdir "$install_root" 2>/dev/null || true
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

xml_escape() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g'
}

mkdir -p "$install_root" "$(dirname "$plist")" "$(dirname "$log_file")"
cp "$source_updater" "$installed_updater"
chmod 700 "$installed_updater"
escaped_updater=$(xml_escape "$installed_updater")
escaped_codex=$(xml_escape "$codex_path")
escaped_log=$(xml_escape "$log_file")

cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$escaped_updater</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CODEX_BIN</key>
    <string>$escaped_codex</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>$interval_seconds</integer>
  <key>StandardOutPath</key>
  <string>$escaped_log</string>
  <key>StandardErrorPath</key>
  <string>$escaped_log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$uid" "$plist" 2>/dev/null || true
launchctl bootstrap "gui/$uid" "$plist"
printf 'Installed AI Talk automatic updates every %s seconds.\n' "$interval_seconds"
