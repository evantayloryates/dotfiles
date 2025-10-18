#!/bin/bash

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

# Capture start time (either from pre-set timestamp or now)
START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
if [[ -f "$START_TIMESTAMP_FILE" ]]; then
  SETUP_START=$(cat "$START_TIMESTAMP_FILE")
  SETUP_START_SEC=${SETUP_START%.*}
  log "Starting dotfiles installation (container created at $(date -d @$SETUP_START_SEC '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r $SETUP_START_SEC '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $SETUP_START))..."
else
  SETUP_START=$(date +%s.%3N)
  log "Starting dotfiles installation (no pre-timestamp found)..."
fi

# Install ncurses-term and system zsh for terminal definitions (fixes backspace display issues)
APT_START=$(date +%s)
if command -v zsh >/dev/null 2>&1 && dpkg -l ncurses-term >/dev/null 2>&1; then
  log "System zsh and ncurses-term already installed, skipping apt"
else
  log "Installing ncurses-term and system zsh..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq >/dev/null 2>&1 && \
    sudo apt-get install -y ncurses-term zsh >/dev/null 2>&1 && \
      log "✅ ncurses-term and zsh installed" || log "⚠️  Could not install packages"
  fi
fi
APT_END=$(date +%s)
APT_DURATION=$((APT_END - APT_START))
log "apt packages took ${APT_DURATION}s"

# Create .zshrc FIRST (before slow zsh installation)
log "Creating .zshrc..."
cp "$(dirname "$0")/.zshrc" "$HOME/.zshrc"

# Install and configure custom zsh (only if system zsh not available)
if ! command -v zsh >/dev/null 2>&1; then
  log "System zsh not found, installing custom zsh binary..."
  ZSH_START=$(date +%s)
  if ! bash "$(dirname "$0")/install_zsh.sh"; then
    log "⚠️  Warning: zsh installation encountered an error, but continuing..."
  fi
  ZSH_END=$(date +%s)
  ZSH_DURATION=$((ZSH_END - ZSH_START))
  log "Custom zsh installation took ${ZSH_DURATION}s"
else
  log "System zsh detected at $(which zsh), skipping custom zsh installation"
fi

# Calculate total setup time with precision
SETUP_END=$(date +%s.%3N)
TOTAL_DURATION=$(echo "$SETUP_END - $SETUP_START" | bc 2>/dev/null || echo "scale=2; $SETUP_END - $SETUP_START" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}")
log ""
log "===================="
log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s (including repo clone + installation)"
log "===================="
log ""
log "✅ Done! Close and reopen terminal, or run: exec zsh"

# Clean up timestamp file
rm -f "$START_TIMESTAMP_FILE" 2>/dev/null

