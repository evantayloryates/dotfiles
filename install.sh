#!/bin/bash

# Simple dotfiles installer
echo "🚀 Setting up profile..."

# Create ~/.profile file
PROFILE_FILE="$HOME/.profile"

echo "📝 Creating $PROFILE_FILE..."
cat > "$PROFILE_FILE" << 'EOF'
echo "Hello from profile!"
EOF

echo "✅ Profile created successfully!"
echo ""
echo "To test it, run: source ~/.profile"

