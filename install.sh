#!/bin/bash

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

# Capture start time from devcontainer onCreateCommand
START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
if [[ -f "$START_TIMESTAMP_FILE" ]]; then
  SETUP_START=$(cat "$START_TIMESTAMP_FILE")
fi

# Install zsh and configure auto-exec hooks
bash "$(dirname "$0")/install_zsh.sh"

# Create .zshrc
cp "$(dirname "$0")/.zshrc" "$HOME/.zshrc"

# Calculate and log total setup time
if [[ -n "$SETUP_START" ]]; then
  SETUP_END=$(date +%s.%3N)
  TOTAL_DURATION=$(echo "$SETUP_END - $SETUP_START" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}")
  log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s"
fi

# Clean up timestamp file
rm -f "$START_TIMESTAMP_FILE" 2>/dev/null

