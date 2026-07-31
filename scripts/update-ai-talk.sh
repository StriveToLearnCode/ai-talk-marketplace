#!/bin/sh

set -eu

marketplace_name=${AI_TALK_MARKETPLACE:-ai-talk-marketplace}
plugin_name=${AI_TALK_PLUGIN:-ai-talk}
codex_bin=${CODEX_BIN:-codex}
task_tmp=${TMPDIR:-/tmp}
lock_dir="$task_tmp/ai-talk-auto-update.lock"

if ! command -v "$codex_bin" >/dev/null 2>&1 && [ ! -x "$codex_bin" ]; then
  printf 'Codex CLI was not found: %s\n' "$codex_bin" >&2
  exit 127
fi

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'AI Talk update is already running; skipping.\n'
  exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT HUP INT TERM

printf 'Refreshing marketplace %s...\n' "$marketplace_name"
"$codex_bin" plugin marketplace upgrade "$marketplace_name"

printf 'Installing %s@%s...\n' "$plugin_name" "$marketplace_name"
"$codex_bin" plugin add "$plugin_name@$marketplace_name"

printf 'AI Talk update complete. The new version loads in the next Codex task.\n'
