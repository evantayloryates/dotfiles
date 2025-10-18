#!/bin/bash

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

log "Starting dotfiles installation..."

# Create .zshrc FIRST (before slow zsh installation)
log "Creating .zshrc..."
cat > "$HOME/.zshrc" << 'EOF'
echo "Hello from zshrc!"
export SHELL=$(which zsh)
EOF

# Install and configure zsh
log "Installing/configuring zsh..."
if ! bash "$(dirname "$0")/install_zsh.sh"; then
  log "⚠️  Warning: zsh installation encountered an error, but continuing..."
fi

log "✅ Done! Close and reopen terminal, or run: exec zsh"

