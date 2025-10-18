# #!/bin/bash

# # Log function
# log() {
#   local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
#   echo "$msg" | tee -a "$HOME/log.txt"
# }

# # Capture start time (either from pre-set timestamp or now)
# START_TIMESTAMP_FILE="/tmp/dotfiles-setup-start.timestamp"
# if [[ -f "$START_TIMESTAMP_FILE" ]]; then
#   SETUP_START=$(cat "$START_TIMESTAMP_FILE")
#   SETUP_START_SEC=${SETUP_START%.*}
#   log "Starting dotfiles installation (container created at $(date -d @$SETUP_START_SEC '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -r $SETUP_START_SEC '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo $SETUP_START))..."
# else
#   SETUP_START=$(date +%s.%3N)
#   log "Starting dotfiles installation (no pre-timestamp found)..."
# fi

# # Create .zshrc FIRST (before slow zsh installation)
# log "Creating .zshrc..."
# cp "$(dirname "$0")/.zshrc" "$HOME/.zshrc"

# # Install and configure zsh
# log "Installing/configuring zsh..."
# ZSH_START=$(date +%s)
# if ! bash "$(dirname "$0")/install_zsh.sh"; then
#   log "⚠️  Warning: zsh installation encountered an error, but continuing..."
# fi
# ZSH_END=$(date +%s)
# ZSH_DURATION=$((ZSH_END - ZSH_START))
# log "zsh installation took ${ZSH_DURATION} seconds"

# # Calculate total setup time with precision
# SETUP_END=$(date +%s.%3N)
# TOTAL_DURATION=$(echo "$SETUP_END - $SETUP_START" | bc 2>/dev/null || echo "scale=2; $SETUP_END - $SETUP_START" | bc 2>/dev/null || awk "BEGIN {printf \"%.2f\", $SETUP_END - $SETUP_START}")
# log ""
# log "===================="
# log "📊 TOTAL SETUP TIME: ${TOTAL_DURATION}s (including repo clone + installation)"
# log "===================="
# log ""
# log "✅ Done! Close and reopen terminal, or run: exec zsh"

# # Clean up timestamp file
# rm -f "$START_TIMESTAMP_FILE" 2>/dev/null

