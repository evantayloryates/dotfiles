#!/bin/bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$repo" == /Users/taylor/src/github/dotfiles ]]
root="$repo/data/agent_resource_monitor/focus"
mkdir -p "$root" "$HOME/Library/LaunchAgents"
chmod 700 "$root"
target="$HOME/Library/LaunchAgents/com.taylor.resource-focus.plist"
source="$repo/src/launchd/com.taylor.resource-focus.plist"
if [[ -e "$target" || -L "$target" ]]; then
  [[ -L "$target" && "$(readlink "$target")" == "$source" ]] || {
    echo 'Existing unrelated LaunchAgent target; refusing to replace it.' >&2; exit 1;
  }
else
  ln -s "$source" "$target"
fi
if ! launchctl print "gui/$(id -u)/com.taylor.resource-focus" >/dev/null 2>&1; then
  launchctl bootstrap "gui/$(id -u)" "$target"
fi
echo 'resource-focus LaunchAgent installed; inspect focus-status for actual readiness.'
