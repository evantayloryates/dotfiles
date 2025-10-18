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
  log "Starting dotfiles installation (container created at $(date -d @$SETUP_START '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r $SETUP_START '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $SETUP_START))..."
else
  SETUP_START=$(date +%s)
  log "Starting dotfiles installation (no pre-timestamp found)..."
fi

# Create .zshrc FIRST (before slow zsh installation)
log "Creating .zshrc..."
cat > "$HOME/.zshrc" << 'EOF'
echo "Hello from zshrc!"
export SHELL=$(which zsh)
alias log="cat $HOME/log.txt"
EOF

# Install and configure zsh
log "Installing/configuring zsh..."
ZSH_START=$(date +%s)
if ! bash "$(dirname "$0")/install_zsh.sh"; then
  log "⚠️  Warning: zsh installation encountered an error, but continuing..."
fi
ZSH_END=$(date +%s)
ZSH_DURATION=$((ZSH_END - ZSH_START))
log "zsh installation took ${ZSH_DURATION} seconds"

# Calculate total setup time
SETUP_END=$(date +%s)
TOTAL_DURATION=$((SETUP_END - SETUP_START))
log ""
log "===================="
log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION} seconds (including repo clone + installation)"
log "===================="
log ""
log "✅ Done! Close and reopen terminal, or run: exec zsh"

# Clean up timestamp file
rm -f "$START_TIMESTAMP_FILE" 2>/dev/null

