#!/bin/bash

echo "🚀 Setting up dotfiles system for dev container..."

# Configuration
DOTFILES_REPO_URL="https://github.com/evantayloryates/dotfiles.git"
DOTFILES_REPO_PATH="${DOTFILES_REPO_PATH:-$HOME/.dotfiles-repo}"

# Function to detect package manager
detect_package_manager() {
    if command -v apt-get &> /dev/null; then
        echo "apt-get"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v apk &> /dev/null; then
        echo "apk"
    elif command -v brew &> /dev/null; then
        echo "brew"
    else
        echo "none"
    fi
}

# Check if zsh is installed, install if needed
echo "🔍 Checking for zsh..."
if ! command -v zsh &> /dev/null; then
    echo "⚠️  zsh not found, attempting to install..."
    
    PKG_MANAGER=$(detect_package_manager)
    
    case "$PKG_MANAGER" in
        apt-get)
            echo "📦 Installing zsh via apt-get..."
            apt-get update && apt-get install -y zsh
            ;;
        yum)
            echo "📦 Installing zsh via yum..."
            yum install -y zsh
            ;;
        dnf)
            echo "📦 Installing zsh via dnf..."
            dnf install -y zsh
            ;;
        apk)
            echo "📦 Installing zsh via apk..."
            apk add zsh
            ;;
        brew)
            echo "📦 Installing zsh via brew..."
            brew install zsh
            ;;
        *)
            echo "❌ No supported package manager found. Cannot install zsh."
            echo "   Please install zsh manually and run this script again."
            exit 1
            ;;
    esac
    
    # Verify installation
    if ! command -v zsh &> /dev/null; then
        echo "❌ Failed to install zsh"
        exit 1
    fi
    
    echo "✅ zsh installed successfully"
else
    echo "✅ zsh is already installed"
fi

# Get zsh path
ZSH_PATH=$(which zsh)
echo "📍 zsh location: $ZSH_PATH"

# Set zsh as default shell
echo "🔧 Setting zsh as default shell..."
if [ "$SHELL" != "$ZSH_PATH" ]; then
    # Add zsh to /etc/shells if not already there
    if ! grep -q "$ZSH_PATH" /etc/shells 2>/dev/null; then
        echo "$ZSH_PATH" >> /etc/shells
    fi
    
    # Change default shell
    if chsh -s "$ZSH_PATH" 2>/dev/null; then
        echo "✅ Default shell set to zsh"
    else
        # Fallback: try using usermod or direct setting
        if command -v usermod &> /dev/null; then
            usermod -s "$ZSH_PATH" "$(whoami)" 2>/dev/null
        fi
        echo "✅ Attempted to set default shell to zsh"
    fi
else
    echo "✅ zsh is already the default shell"
fi

# Clone or update the repository
if [ ! -d "$DOTFILES_REPO_PATH" ]; then
    echo "📦 Cloning dotfiles repository to $DOTFILES_REPO_PATH..."
    if git clone "$DOTFILES_REPO_URL" "$DOTFILES_REPO_PATH"; then
        echo "✅ Repository cloned successfully"
    else
        echo "❌ Failed to clone repository"
        exit 1
    fi
else
    echo "📂 Dotfiles repository already exists at $DOTFILES_REPO_PATH"
    cd "$DOTFILES_REPO_PATH"
    echo "🔄 Updating repository..."
    git pull origin master 2>/dev/null || git pull origin main 2>/dev/null
    cd - > /dev/null
fi

# Copy .zshrc to home directory (only if it doesn't exist)
echo "🔧 Setting up .zshrc..."
if [ ! -f "$HOME/.zshrc" ]; then
    if [ -f "$DOTFILES_REPO_PATH/.zshrc" ]; then
        cp "$DOTFILES_REPO_PATH/.zshrc" "$HOME/.zshrc"
        echo "✅ Copied .zshrc to home directory"
    else
        echo "⚠️  .zshrc not found in repo, creating a basic one..."
        cat > "$HOME/.zshrc" << 'EOF'
# Dotfiles auto-update and loader
# Note: changes to this file are not recommended since it is primarily a loader for live source files

# Configuration
export DOTFILES_REPO_PATH="${DOTFILES_REPO_PATH:-$HOME/.dotfiles-repo}"
DOTFILES_REPO_URL="https://github.com/evantayloryates/dotfiles.git"
UPDATE_CHECK_FILE="$HOME/.dotfiles_last_check"
CHECK_INTERVAL=300  # Check every 5 minutes

# Function to check if we should run an update check
should_check_update() {
    if [ ! -f "$UPDATE_CHECK_FILE" ]; then
        return 0
    fi
    last_check=$(cat "$UPDATE_CHECK_FILE" 2>/dev/null || echo "0")
    current_time=$(date +%s)
    time_diff=$((current_time - last_check))
    [ $time_diff -gt $CHECK_INTERVAL ]
}

# Function to check and apply updates (in background)
check_and_update() {
    if ! should_check_update; then
        return 0
    fi
    
    date +%s > "$UPDATE_CHECK_FILE"
    
    if [ ! -d "$DOTFILES_REPO_PATH" ]; then
        git clone "$DOTFILES_REPO_URL" "$DOTFILES_REPO_PATH" 2>/dev/null
        return 0
    fi
    
    cd "$DOTFILES_REPO_PATH" || return 1
    git fetch origin master 2>/dev/null || git fetch origin main 2>/dev/null || return 1
    
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/master 2>/dev/null || git rev-parse origin/main 2>/dev/null)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        git pull origin master 2>/dev/null || git pull origin main 2>/dev/null
    fi
    
    cd - > /dev/null
}

# Run update check in background
check_and_update &

# Source the main loader script
if [ -f "$DOTFILES_REPO_PATH/src/index.sh" ]; then
    source "$DOTFILES_REPO_PATH/src/index.sh"
fi
EOF
        echo "✅ Created .zshrc"
    fi
else
    echo "✅ .zshrc already exists, skipping (to preserve local changes)"
fi

# Update DOTFILES_REPO_PATH in existing .zshrc if needed
if ! grep -q "DOTFILES_REPO_PATH" "$HOME/.zshrc" 2>/dev/null; then
    sed -i.bak "1i\\
export DOTFILES_REPO_PATH=\"$DOTFILES_REPO_PATH\"\\
" "$HOME/.zshrc"
    echo "✅ Added DOTFILES_REPO_PATH to .zshrc"
fi

echo ""
echo "✨ Dotfiles system setup complete!"
echo ""
echo "📝 Summary:"
echo "   - Shell: zsh (default)"
echo "   - Dotfiles repository: $DOTFILES_REPO_PATH"
echo "   - Auto-update interval: 5 minutes"
echo "   - Loader script: $DOTFILES_REPO_PATH/src/index.sh"
echo ""
echo "🎉 Start a new zsh shell to activate your dotfiles!"
echo "   Run: exec zsh"
