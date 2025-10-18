#!/bin/bash

# Simple dotfiles installer
echo "🚀 Setting up dotfiles and shell..."

# Get bash path
BASH_PATH=$(which bash)
echo "📍 bash location: $BASH_PATH"

# Check if we can use sudo
CAN_SUDO=false
if command -v sudo &> /dev/null && sudo -n true 2>/dev/null; then
    CAN_SUDO=true
    echo "✓ Sudo access available"
fi

# Set bash as default shell
echo "🔧 Setting bash as default shell..."
if [ "$SHELL" != "$BASH_PATH" ]; then
    # Add bash to /etc/shells if not already there
    if ! grep -q "^$BASH_PATH$" /etc/shells 2>/dev/null; then
        if [ "$CAN_SUDO" = true ]; then
            echo "  Adding $BASH_PATH to /etc/shells..."
            echo "$BASH_PATH" | sudo tee -a /etc/shells > /dev/null
        fi
    fi
    
    # Change default shell
    if [ "$CAN_SUDO" = true ] && command -v usermod &> /dev/null; then
        echo "  Changing shell with usermod..."
        sudo usermod -s "$BASH_PATH" "$(whoami)" 2>/dev/null && echo "  ✅ Default shell set to bash"
    elif command -v chsh &> /dev/null; then
        echo "  Changing shell with chsh..."
        chsh -s "$BASH_PATH" 2>/dev/null && echo "  ✅ Default shell set to bash"
    fi
else
    echo "✅ bash is already the default shell"
fi

# Set SHELL environment variable for all sessions
if [ "$CAN_SUDO" = true ]; then
    if [ -d /etc/profile.d ]; then
        echo "  Creating /etc/profile.d/bash-default.sh..."
        echo "export SHELL=$BASH_PATH" | sudo tee /etc/profile.d/bash-default.sh > /dev/null
        sudo chmod +x /etc/profile.d/bash-default.sh
    fi
fi

# Configure VS Code/Cursor to use bash
echo "🔧 Configuring IDE terminal settings..."
for SERVER_DIR in "$HOME/.cursor-server" "$HOME/.vscode-server"; do
    if [ -d "$SERVER_DIR" ]; then
        SETTINGS_DIR="$SERVER_DIR/data/Machine"
        mkdir -p "$SETTINGS_DIR"
        SETTINGS_FILE="$SETTINGS_DIR/settings.json"
        
        cat > "$SETTINGS_FILE" << EOF
{
  "terminal.integrated.defaultProfile.linux": "bash",
  "terminal.integrated.profiles.linux": {
    "bash": {
      "path": "$BASH_PATH"
    }
  }
}
EOF
        echo "  ✅ Configured IDE settings at $SERVER_DIR"
    fi
done

# Create ~/.profile file (for login shells)
PROFILE_FILE="$HOME/.profile"
echo "📝 Creating $PROFILE_FILE..."
cat > "$PROFILE_FILE" << 'EOF'
echo "Hello from profile!"
EOF

# Create ~/.bashrc file (for interactive non-login bash shells)
BASHRC_FILE="$HOME/.bashrc"
echo "📝 Creating $BASHRC_FILE..."
cat > "$BASHRC_FILE" << 'EOF'
# Source .profile if it exists
if [ -f "$HOME/.profile" ]; then
    . "$HOME/.profile"
fi
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "To apply changes:"
echo "  - Close and reopen your terminal, OR"
echo "  - Run: exec bash"

