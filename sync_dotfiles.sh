#!/bin/zsh
# Sync dotfiles from remote repository

# Log function
log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" | tee -a "$HOME/log.txt"
}

sync_dotfiles() {
    local LOG_FILE="$HOME/log.txt"
    local REPO_URL="https://github.com/evantayloryates/dotfiles"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Starting sync_dotfiles ===" >> "$LOG_FILE"
    
    # Check if required env vars are set
    if [[ -z "$LIVE_DOTFILES_REPO_DIR" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: LIVE_DOTFILES_REPO_DIR not set" >> "$LOG_FILE"
        return 1
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LIVE_DOTFILES_REPO_DIR: $LIVE_DOTFILES_REPO_DIR" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] LATEST_DOTFILES_COMMIT: ${LATEST_DOTFILES_COMMIT:-'(not set)'}" >> "$LOG_FILE"
    
    # Step 1: Get the remote HEAD commit SHA as quickly as possible
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetching remote HEAD commit..." >> "$LOG_FILE"
    local REMOTE_COMMIT=$(git ls-remote "$REPO_URL" HEAD 2>> "$LOG_FILE" | awk '{print $1}')
    
    if [[ -z "$REMOTE_COMMIT" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to fetch remote HEAD commit" >> "$LOG_FILE"
        return 1
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Remote HEAD commit: $REMOTE_COMMIT" >> "$LOG_FILE"
    
    # Step 2: Check if commit SHA differs from LATEST_DOTFILES_COMMIT
    if [[ "$REMOTE_COMMIT" == "$LATEST_DOTFILES_COMMIT" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes detected. Already up to date." >> "$LOG_FILE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Sync complete (no changes) ===" >> "$LOG_FILE"
        return 0
    fi
    
    # Also persist if we have a commit but file doesn't exist
    if [[ -n "$LATEST_DOTFILES_COMMIT" && ! -f "$HOME/.dotfiles_commit" ]]; then
        echo "$LATEST_DOTFILES_COMMIT" > "$HOME/.dotfiles_commit"
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected! Syncing..." >> "$LOG_FILE"
    
    # Step 3: Load changes to LIVE_DOTFILES_REPO_DIR
    if [[ -d "$LIVE_DOTFILES_REPO_DIR/.git" ]]; then
        # Repository exists, pull latest changes
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Repository exists. Pulling latest changes..." >> "$LOG_FILE"
        cd "$LIVE_DOTFILES_REPO_DIR" || {
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to cd to $LIVE_DOTFILES_REPO_DIR" >> "$LOG_FILE"
            return 1
        }
        
        git fetch origin 2>> "$LOG_FILE" 1>> "$LOG_FILE"
        if [[ $? -ne 0 ]]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git fetch failed" >> "$LOG_FILE"
            return 1
        fi
        
        git reset --hard origin/master 2>> "$LOG_FILE" 1>> "$LOG_FILE"
        if [[ $? -ne 0 ]]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git reset failed" >> "$LOG_FILE"
            return 1
        fi
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Successfully pulled latest changes" >> "$LOG_FILE"
    else
        # Repository doesn't exist, clone it
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Repository doesn't exist. Cloning..." >> "$LOG_FILE"
        
        mkdir -p "$(dirname "$LIVE_DOTFILES_REPO_DIR")" 2>> "$LOG_FILE"
        
        git clone "$REPO_URL" "$LIVE_DOTFILES_REPO_DIR" 2>> "$LOG_FILE" 1>> "$LOG_FILE"
        if [[ $? -ne 0 ]]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: git clone failed" >> "$LOG_FILE"
            return 1
        fi
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Successfully cloned repository" >> "$LOG_FILE"
    fi
    
    # Step 4: Source the index.sh file
    local INDEX_FILE="$LIVE_DOTFILES_REPO_DIR/src/index.sh"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sourcing $INDEX_FILE..." >> "$LOG_FILE"
    
    if [[ ! -f "$INDEX_FILE" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $INDEX_FILE not found" >> "$LOG_FILE"
        return 1
    fi
    
    source "$INDEX_FILE" 2>> "$LOG_FILE"
    if [[ $? -ne 0 ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Failed to source $INDEX_FILE" >> "$LOG_FILE"
        return 1
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Successfully sourced $INDEX_FILE" >> "$LOG_FILE"
    
    # Update the LATEST_DOTFILES_COMMIT env var and persist it
    export LATEST_DOTFILES_COMMIT="$REMOTE_COMMIT"
    echo "$REMOTE_COMMIT" > "$HOME/.dotfiles_commit"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updated LATEST_DOTFILES_COMMIT to $REMOTE_COMMIT" >> "$LOG_FILE"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Sync complete (changes applied) ===" >> "$LOG_FILE"
    return 0
}

