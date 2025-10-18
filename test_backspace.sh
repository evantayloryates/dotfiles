#!/bin/bash
# Test backspace in a clean zsh environment

echo "Testing backspace in zsh..."
echo ""
echo "Creating minimal zsh config..."

# Create a minimal zshrc for testing
mkdir -p /tmp/zsh-test
cat > /tmp/zsh-test/.zshrc << 'EOF'
# Minimal test config
bindkey -e
bindkey "^?" backward-delete-char
bindkey "^H" backward-delete-char
echo "=== Minimal zsh loaded ==="
echo "Try typing and using backspace. Type 'exit' when done."
PS1="test%% "
EOF

echo "Starting zsh with minimal config..."
echo ""

# Start zsh with the test config
HOME=/tmp/zsh-test exec zsh
