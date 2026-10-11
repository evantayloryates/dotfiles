#!/bin/bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "$repo" == /Users/taylor/src/github/dotfiles ]]
mkdir -p "$repo/data/agent_resource_monitor/btle" "$HOME/Library/LaunchAgents"
chmod 700 "$repo/data/agent_resource_monitor/btle"
target="$HOME/Library/LaunchAgents/com.taylor.btle-watch.plist"
ln -sf "$repo/src/launchd/com.taylor.btle-watch.plist" "$target"
if ! launchctl print "gui/$(id -u)/com.taylor.btle-watch" >/dev/null 2>&1; then
 launchctl bootstrap "gui/$(id -u)" "$target"
fi
"$repo/bin/btle-watch" status

# Five-minute deterministic event relay, real source stays in dotfiles.
event_target="$HOME/Library/LaunchAgents/com.taylor.btle-events.plist"
ln -sf "$repo/src/launchd/com.taylor.btle-events.plist" "$event_target"
if ! launchctl print "gui/$(id -u)/com.taylor.btle-events" >/dev/null 2>&1; then
 launchctl bootstrap "gui/$(id -u)" "$event_target"
fi
