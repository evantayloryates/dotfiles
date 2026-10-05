#!/usr/bin/env bash
# Build record-screend, link and load its LaunchAgent, and wait until it
# answers on its socket. Idempotent: an engine that is already loaded and up to
# date is left running (so a dotfiles install never cuts a recording short);
# it is restarted only when the build changed.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES="$(cd "$DIR/../.." && pwd)"
LABEL=com.taylor.record-screen
PLIST_SRC="$DOTFILES/src/launchd/$LABEL.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

[[ "$(uname)" == "Darwin" ]] || { echo "record-screen: macOS only, skipping"; exit 0; }

# launchd won't create the log directory named in the plist.
mkdir -p "$HOME/.record-screen/run" "$HOME/.record-screen/logs"
chmod 700 "$HOME/.record-screen"

build_state="$(/usr/bin/python3 "$DIR/build.py" 2>&1 >/dev/null | tail -1)"

mkdir -p "$HOME/Library/LaunchAgents"
linked_before="$(readlink "$PLIST_DEST" 2>/dev/null || true)"
ln -sf "$PLIST_SRC" "$PLIST_DEST"

if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
elif [[ "$linked_before" != "$PLIST_SRC" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
elif [[ "$build_state" == "rebuilt" ]]; then
  launchctl kickstart -k "$DOMAIN/$LABEL"
fi

"$DIR/bin/record-screen" wait 15 >/dev/null
"$DIR/bin/record-screen" status
