#!/bin/bash

# Setup logging
LOG_FILE="$HOME/log.txt"
echo "========================================" > "$LOG_FILE"
echo "Dotfiles Installation Log" >> "$LOG_FILE"
echo "Started at: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Logging function
log() {
    echo "$1" | tee -a "$LOG_FILE"
}

log "🚀 Setting up dotfiles system for dev container..."

# Configuration
DOTFILES_REPO_URL="https://github.com/evantayloryates/dotfiles.git"
DOTFILES_REPO_PATH="${DOTFILES_REPO_PATH:-$HOME/.dotfiles-repo}"

log "Configuration:"
log "  DOTFILES_REPO_URL=$DOTFILES_REPO_URL"
log "  DOTFILES_REPO_PATH=$DOTFILES_REPO_PATH"
log "  HOME=$HOME"
log "  USER=$(whoami)"
log "  SHELL=$SHELL"
log ""

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
log "🔍 Checking for zsh..."
if ! command -v zsh &> /dev/null; then
    log "⚠️  zsh not found, attempting to install..."
    
    PKG_MANAGER=$(detect_package_manager)
    log "  Detected package manager: $PKG_MANAGER"
    
    case "$PKG_MANAGER" in
        apt-get)
            log "📦 Installing zsh via apt-get..."
            apt-get update >> "$LOG_FILE" 2>&1 && apt-get install -y zsh >> "$LOG_FILE" 2>&1
            ;;
        yum)
            log "📦 Installing zsh via yum..."
            yum install -y zsh >> "$LOG_FILE" 2>&1
            ;;
        dnf)
            log "📦 Installing zsh via dnf..."
            dnf install -y zsh >> "$LOG_FILE" 2>&1
            ;;
        apk)
            log "📦 Installing zsh via apk..."
            apk add zsh >> "$LOG_FILE" 2>&1
            ;;
        brew)
            log "📦 Installing zsh via brew..."
            brew install zsh >> "$LOG_FILE" 2>&1
            ;;
        *)
            log "❌ No supported package manager found. Cannot install zsh."
            log "   Please install zsh manually and run this script again."
            exit 1
            ;;
    esac
    
    # Verify installation
    if ! command -v zsh &> /dev/null; then
        log "❌ Failed to install zsh"
        exit 1
    fi
    
    log "✅ zsh installed successfully"
else
    log "✅ zsh is already installed"
fi

# Get zsh path
ZSH_PATH=$(which zsh)
log "📍 zsh location: $ZSH_PATH"

# Log current shell information
log ""
log "Current shell information:"
log "  SHELL environment variable: $SHELL"
log "  /etc/shells contents:"
cat /etc/shells >> "$LOG_FILE" 2>&1
log ""

# Set zsh as default shell
log "🔧 Setting zsh as default shell..."
if [ "$SHELL" != "$ZSH_PATH" ]; then
    # Add zsh to /etc/shells if not already there
    if ! grep -q "$ZSH_PATH" /etc/shells 2>/dev/null; then
        log "  Adding $ZSH_PATH to /etc/shells..."
        echo "$ZSH_PATH" >> /etc/shells 2>> "$LOG_FILE"
        if [ $? -eq 0 ]; then
            log "  ✓ Added successfully"
        else
            log "  ⚠️  Failed to add to /etc/shells (may need root)"
        fi
    else
        log "  ✓ $ZSH_PATH already in /etc/shells"
    fi
    
    # Change default shell
    log "  Attempting to change shell with chsh..."
    if chsh -s "$ZSH_PATH" 2>> "$LOG_FILE"; then
        log "✅ Default shell set to zsh via chsh"
    else
        log "⚠️  chsh failed (exit code: $?), trying usermod..."
        # Fallback: try using usermod or direct setting
        if command -v usermod &> /dev/null; then
            usermod -s "$ZSH_PATH" "$(whoami)" >> "$LOG_FILE" 2>&1
            if [ $? -eq 0 ]; then
                log "✅ Default shell set to zsh via usermod"
            else
                log "⚠️  usermod failed (exit code: $?)"
            fi
        else
            log "⚠️  usermod not available"
        fi
    fi
    
    # Check /etc/passwd
    log ""
    log "Current user entry in /etc/passwd:"
    grep "^$(whoami):" /etc/passwd >> "$LOG_FILE" 2>&1
    log ""
else
    log "✅ zsh is already the default shell"
fi

# Clone or update the repository
if [ ! -d "$DOTFILES_REPO_PATH" ]; then
    log "📦 Cloning dotfiles repository to $DOTFILES_REPO_PATH..."
    if git clone "$DOTFILES_REPO_URL" "$DOTFILES_REPO_PATH" >> "$LOG_FILE" 2>&1; then
        log "✅ Repository cloned successfully"
    else
        log "❌ Failed to clone repository"
        log "Git clone output:"
        tail -20 "$LOG_FILE"
        exit 1
    fi
else
    log "📂 Dotfiles repository already exists at $DOTFILES_REPO_PATH"
    cd "$DOTFILES_REPO_PATH"
    log "🔄 Updating repository..."
    if git pull origin master >> "$LOG_FILE" 2>&1 || git pull origin main >> "$LOG_FILE" 2>&1; then
        log "✅ Repository updated"
    else
        log "⚠️  Failed to update repository"
    fi
    cd - > /dev/null
fi

# Copy .zshrc to home directory (only if it doesn't exist)
log "🔧 Setting up .zshrc..."
if [ ! -f "$HOME/.zshrc" ]; then
    if [ -f "$DOTFILES_REPO_PATH/.zshrc" ]; then
        cp "$DOTFILES_REPO_PATH/.zshrc" "$HOME/.zshrc"
        log "✅ Copied .zshrc to home directory"
    else
        log "⚠️  .zshrc not found in repo, creating a basic one..."
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
        log "✅ Created .zshrc"
    fi
else
    log "✅ .zshrc already exists, skipping (to preserve local changes)"
fi

# Update DOTFILES_REPO_PATH in existing .zshrc if needed
if ! grep -q "DOTFILES_REPO_PATH" "$HOME/.zshrc" 2>/dev/null; then
    log "  Adding DOTFILES_REPO_PATH to .zshrc..."
    sed -i.bak "1i\\
export DOTFILES_REPO_PATH=\"$DOTFILES_REPO_PATH\"\\
" "$HOME/.zshrc"
    log "✅ Added DOTFILES_REPO_PATH to .zshrc"
else
    log "  DOTFILES_REPO_PATH already in .zshrc"
fi

log ""
log "========================================"
log "✨ Dotfiles system setup complete!"
log "========================================"
log ""
log "📝 Summary:"
log "   - Shell: zsh (default)"
log "   - Dotfiles repository: $DOTFILES_REPO_PATH"
log "   - Auto-update interval: 5 minutes"
log "   - Loader script: $DOTFILES_REPO_PATH/src/index.sh"
log "   - Log file: $LOG_FILE"
log ""
log "🎉 Start a new zsh shell to activate your dotfiles!"
log "   Run: exec zsh"
log ""
log "Installation completed at: $(date)"
