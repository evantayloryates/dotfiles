#!/bin/bash

# Install and configure zsh
source "$(dirname "$0")/install_zsh.sh"

# Create .zshrc
cat > "$HOME/.zshrc" << 'EOF'
echo "Hello from zshrc!"
EOF

echo "✅ Done! Close and reopen terminal, or run: exec zsh"

