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

# Capture start time from devcontainer onCreateCommand and calculate total setup time
START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
if [[ -f "$START_TIMESTAMP_FILE" ]]; then
  SETUP_START=$(cat "$START_TIMESTAMP_FILE")
  SETUP_END=$(date +%s.%3N)
  TOTAL_DURATION=$(echo "$SETUP_END - $SETUP_START" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}")
  log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s"
  rm -f "$START_TIMESTAMP_FILE" 2>/dev/null
fi

