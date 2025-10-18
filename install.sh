#!/bin/bash

# Simple dotfiles installer
echo "🚀 Setting up profile..."

# Create ~/.profile file (for login shells)
PROFILE_FILE="$HOME/.profile"

echo "📝 Creating $PROFILE_FILE..."
cat > "$PROFILE_FILE" << 'EOF'
echo "Hello from profile!"
EOF

# Create ~/.bashrc file (for interactive non-login bash/sh shells)
BASHRC_FILE="$HOME/.bashrc"

echo "📝 Creating $BASHRC_FILE..."
cat > "$BASHRC_FILE" << 'EOF'
# Source .profile if it exists
if [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
fi
EOF

echo "✅ Profile and bashrc created successfully!"
echo ""
echo "To test it:"
echo "  - Open a new terminal (will auto-source)"
echo "  - Or run: source ~/.bashrc"

