#!/bin/bash

# Install and configure zsh
if ! source "$(dirname "$0")/install_zsh.sh"; then
  echo "⚠️  Warning: zsh installation encountered an error, but continuing..."
fi

# Create .zshrc
cat > "$HOME/.zshrc" << 'EOF'
echo "Hello from zshrc!"
EOF

echo "✅ Done! Close and reopen terminal, or run: exec zsh"

