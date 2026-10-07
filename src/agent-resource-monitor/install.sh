#!/usr/bin/env bash
# Scoped install: only the passive resource watcher. Leave an existing watcher up.
set -euo pipefail
[[ "$(uname)" == Darwin ]] || { echo 'agent-resource-monitor: macOS only'; exit 0; }
MONITOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_REPO="$(cd "$MONITOR_DIR/../.." && pwd)"
MONITOR_DATA="${DOTFILES_DATA_DIR:-$MONITOR_REPO/data}/agent_resource_monitor"
MONITOR_LABEL=com.taylor.agent-resource-monitor
MONITOR_DOMAIN="gui/$(id -u)"
mkdir -p "$MONITOR_DATA" "$HOME/Library/LaunchAgents"
chmod 700 "$MONITOR_DATA"
# This Mac's version-controlled plist uses its established absolute repo path.
[[ "$MONITOR_REPO" == /Users/taylor/src/github/dotfiles ]] || {
  echo 'Update the version-controlled plist paths for this checkout before installing.' >&2; exit 1;
}
MONITOR_TARGET="$HOME/Library/LaunchAgents/$MONITOR_LABEL.plist"
ln -sf "$MONITOR_REPO/src/launchd/$MONITOR_LABEL.plist" "$MONITOR_TARGET"
if ! /bin/launchctl print "$MONITOR_DOMAIN/$MONITOR_LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootstrap "$MONITOR_DOMAIN" "$MONITOR_TARGET"
fi
/usr/bin/python3 "$MONITOR_DIR/watcher.py" status
