#!/usr/bin/env bash

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}


# Install zsh and configure auto-exec hooks
bash "$(dirname "$0")/install_zsh.sh"

# Create .zshrc
cp "$(dirname "$0")/.zshrc" "$HOME/.zshrc"

# Ensure non-interactive shells (agents, scripts, `zsh -c`) load exported
# .env vars. ~/.zshenv is the only startup file sourced for every shell type.
# Append idempotently so we don't clobber existing ~/.zshenv content.
ZSHENV="$HOME/.zshenv"
ZSHENV_LINE='source "$HOME/dotfiles/src/exports/dotenv.sh"'
touch "$ZSHENV"
grep -qF "$ZSHENV_LINE" "$ZSHENV" || printf '\n# Load exported dotfiles env (.env) for ALL shells, incl. non-interactive\n%s\n' "$ZSHENV_LINE" >> "$ZSHENV"

# macOS only: install user LaunchAgents kept in src/launchd/. See its README.md.
#   - com.taylor.mcp-tokens: bridge .env tokens into the launchd session at login
#     so GUI apps (Claude desktop, which don't read ~/.zshenv) inherit them.
#   - com.taylor.docker-prune: periodic safe Docker cleanup (no-ops when Docker
#     is down).
# No-op on Linux/devcontainers.
if [[ "$(uname)" == "Darwin" ]]; then
  DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
  UID_NUM=$(id -u)
  mkdir -p "$HOME/Library/LaunchAgents"
  for LA_LABEL in com.taylor.mcp-tokens com.taylor.docker-prune; do
    LA_SRC="$DOTFILES_DIR/src/launchd/$LA_LABEL.plist"
    LA_DEST="$HOME/Library/LaunchAgents/$LA_LABEL.plist"
    ln -sf "$LA_SRC" "$LA_DEST"
    launchctl bootout "gui/$UID_NUM/$LA_LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID_NUM" "$LA_DEST" 2>/dev/null || true
    launchctl kickstart -k "gui/$UID_NUM/$LA_LABEL" 2>/dev/null || true
    log "🔗 Linked + loaded $LA_LABEL LaunchAgent"
  done
fi

# Capture start time from devcontainer onCreateCommand and calculate total setup time
START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
if [[ -f "$START_TIMESTAMP_FILE" ]]; then
  SETUP_START=$(cat "$START_TIMESTAMP_FILE")
  SETUP_END=$(date +%s.%3N)
  TOTAL_DURATION=$(echo "$SETUP_END - $SETUP_START" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}")
  log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s"
  rm -f "$START_TIMESTAMP_FILE" 2>/dev/null
fi

