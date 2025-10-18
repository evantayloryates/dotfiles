# Dotfiles auto-update and loader
# Note: changes to this file are not recommended since it is primarily a loader for live source files

# Ensure SHELL is set correctly
export SHELL=$(which zsh)

# Configuration
export DOTFILES_REPO_PATH="${DOTFILES_REPO_PATH:-$HOME/.dotfiles-repo}"
export SHOULD_PIPE_ZSH="${SHOULD_PIPE_ZSH:-1}"  # Set to 0 to disable auto-launch to zsh
DOTFILES_REPO_URL="https://github.com/evantayloryates/dotfiles.git"
UPDATE_CHECK_FILE="$HOME/.dotfiles_last_check"
CHECK_INTERVAL=300  # Check every 5 minutes (300 seconds)

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

# Function to check and apply updates (runs in background)
check_and_update() {
    if ! should_check_update; then
        return 0
    fi
    
    # Update timestamp to prevent multiple checks
    date +%s > "$UPDATE_CHECK_FILE"
    
    # If repo doesn't exist, clone it
    if [ ! -d "$DOTFILES_REPO_PATH" ]; then
        git clone "$DOTFILES_REPO_URL" "$DOTFILES_REPO_PATH" 2>/dev/null
        return 0
    fi
    
    # Change to repo directory
    cd "$DOTFILES_REPO_PATH" || return 1
    
    # Fetch updates from remote
    git fetch origin master 2>/dev/null || git fetch origin main 2>/dev/null || return 1
    
    # Check if there are updates
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/master 2>/dev/null || git rev-parse origin/main 2>/dev/null)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        # Pull the latest changes
        git pull origin master 2>/dev/null || git pull origin main 2>/dev/null
    fi
    
    cd - > /dev/null
}

# Run update check in background to not slow down shell startup
check_and_update &

# Function to manually reload dotfiles (useful after updates)
reload_dotfiles() {
    echo "🔄 Reloading dotfiles..."
    if [ -d "$DOTFILES_REPO_PATH" ]; then
        cd "$DOTFILES_REPO_PATH" || return 1
        echo "📡 Fetching updates..."
        git fetch origin master 2>/dev/null || git fetch origin main 2>/dev/null || return 1
        echo "📥 Pulling latest changes..."
        git pull origin master 2>/dev/null || git pull origin main 2>/dev/null
        cd - > /dev/null
    fi
    
    if [ -f "$DOTFILES_REPO_PATH/src/index.sh" ]; then
        echo "✅ Sourcing updated configuration..."
        source "$DOTFILES_REPO_PATH/src/index.sh"
        echo "✨ Dotfiles reloaded!"
    else
        echo "❌ Failed to find index.sh"
        return 1
    fi
}

# Alias for convenience
alias dotfiles-reload='reload_dotfiles'
alias dr='reload_dotfiles'

# Source the main loader script from the repo
if [ -f "$DOTFILES_REPO_PATH/src/index.sh" ]; then
    source "$DOTFILES_REPO_PATH/src/index.sh"
fi
