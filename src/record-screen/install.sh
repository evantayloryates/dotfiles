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

# A normal dotfiles install must not implicitly upgrade/restart a legacy
# recorder. The first upgrade requires the explicit --legacy-idle operator path.
for arg in "$@"; do
  [[ "$arg" == "--legacy-idle" ]] || { echo "record-screen: unsupported installer argument" >&2; exit 2; }
done
mkdir -p "$HOME/Library/LaunchAgents"
linked_before="$(readlink "$PLIST_DEST" 2>/dev/null || true)"
if ! launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  /usr/bin/python3 "$DIR/build.py" "$@" >/dev/null
  ln -sf "$PLIST_SRC" "$PLIST_DEST"
  launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
else
  # Keep the loaded job intact. The guarded CLI uses an idle admission lease
  # and self-restart on a capable engine, or an explicit observed legacy path.
  needs_build="$(/usr/bin/python3 "$DIR/build.py" --check)"
  if [[ "$needs_build" == *'"needs_build": true'* ]]; then
    "$DIR/bin/record-screen" build "$@" >/dev/null
  fi
  ln -sf "$PLIST_SRC" "$PLIST_DEST"
fi

"$DIR/bin/record-screen" wait 15 >/dev/null

# Register the MCP server in Claude Code and Codex (idempotent).
"$DIR/bin/record-screen" install >/dev/null || echo "record-screen: MCP registration failed; run \`record-screen install\`" >&2

"$DIR/bin/record-screen" status
