#!/bin/bash

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

# Install and configure zsh
log "Starting dotfiles installation..."
if ! bash "$(dirname "$0")/install_zsh.sh"; then
  log "⚠️  Warning: zsh installation encountered an error, but continuing..."
fi

# Create .zshrc
log "Creating .zshrc..."
cat > "$HOME/.zshrc" << 'EOF'
echo "Hello from zshrc!"
EOF

log "✅ Done! Close and reopen terminal, or run: exec zsh"

