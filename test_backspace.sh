#!/bin/bash
# Test backspace in a clean zsh environment

echo "Testing backspace in zsh..."
echo ""
echo "Starting zsh with minimal config..."
echo "Type some text and try backspace. Type 'exit' when done."
echo ""

# Create a minimal zshrc for testing
cat > /tmp/.zshrc.test << 'EOF'
# Minimal test config
bindkey -e
bindkey "^?" backward-delete-char
bindkey "^H" backward-delete-char
echo "Minimal zsh loaded. Try typing and using backspace:"
PS1="%% "
EOF

# Start zsh with the test config
ZDOTDIR=/tmp HOME=/tmp zsh

echo ""
echo "Test complete. Did backspace work?"

