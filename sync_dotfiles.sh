#!/bin/zsh
# Sync dotfiles from remote repository

export SHOULD_LOG=0

log() {
  if [[ "$SHOULD_LOG" -eq 1 ]]; then
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$HOME/log.txt"
  fi
}

sync_dotfiles() {
  local LOG_FILE="$HOME/log.txt"
  local REPO_URL="https://github.com/evantayloryates/dotfiles"
  
  log '=== Starting sync_dotfiles ==='
  
  # Check if required env vars are set
  if [[ -z "$LIVE_DOTFILES_REPO_DIR" ]]; then
    log 'ERROR: LIVE_DOTFILES_REPO_DIR not set'
    return 1
  fi
  
  log "LIVE_DOTFILES_REPO_DIR: $LIVE_DOTFILES_REPO_DIR"
  log "LATEST_DOTFILES_COMMIT: ${LATEST_DOTFILES_COMMIT:-'(not set)'}"
  
  # Step 1: Get the remote HEAD commit SHA as quickly as possible
  log 'Fetching remote HEAD commit...'
  local REMOTE_COMMIT=$(git ls-remote "$REPO_URL" HEAD 2>> "$LOG_FILE" | awk '{print $1}')
  
  if [[ -z "$REMOTE_COMMIT" ]]; then
    log 'ERROR: Failed to fetch remote HEAD commit'
    return 1
  fi
  
  log "Remote HEAD commit: $REMOTE_COMMIT"
  
  # Step 2: Check if commit SHA differs from LATEST_DOTFILES_COMMIT
  if [[ "$REMOTE_COMMIT" == "$LATEST_DOTFILES_COMMIT" ]]; then
    log 'No changes detected. Already up to date.'
    log '=== Sync complete (no changes) ==='
    return 0
  fi
  
  # Also persist if we have a commit but file doesn't exist
  if [[ -n "$LATEST_DOTFILES_COMMIT" && ! -f "$HOME/.dotfiles_commit" ]]; then
    echo "$LATEST_DOTFILES_COMMIT" > "$HOME/.dotfiles_commit"
  fi
  
  log 'Changes detected! Syncing...'
  
  # Step 3: Load changes to LIVE_DOTFILES_REPO_DIR
  if [[ -d "$LIVE_DOTFILES_REPO_DIR/.git" ]]; then
    # Repository exists, pull latest changes
    log 'Repository exists. Pulling latest changes...'
    cd "$LIVE_DOTFILES_REPO_DIR" || {
      log "ERROR: Failed to cd to $LIVE_DOTFILES_REPO_DIR"
      return 1
    }
    
    git fetch origin 2>> "$LOG_FILE" 1>> "$LOG_FILE"
    if [[ $? -ne 0 ]]; then
      log 'ERROR: git fetch failed'
      return 1
    fi
    
    git reset --hard origin/master 2>> "$LOG_FILE" 1>> "$LOG_FILE"
    if [[ $? -ne 0 ]]; then
      log 'ERROR: git reset failed'
      return 1
    fi
    
    log 'Successfully pulled latest changes'
  else
    # Repository doesn't exist, clone it
    log 'Repository does not exist. Cloning...'
    mkdir -p "$(dirname "$LIVE_DOTFILES_REPO_DIR")" 2>> "$LOG_FILE"
    
    git clone "$REPO_URL" "$LIVE_DOTFILES_REPO_DIR" 2>> "$LOG_FILE" 1>> "$LOG_FILE"
    if [[ $? -ne 0 ]]; then
      log 'ERROR: git clone failed'
      return 1
    fi
    
    log 'Successfully cloned repository'
  fi
  
  # Step 4: Source the index.sh file
  local INDEX_FILE="$LIVE_DOTFILES_REPO_DIR/src/index.sh"
  log "Sourcing $INDEX_FILE..."
  
  if [[ ! -f "$INDEX_FILE" ]]; then
    log "ERROR: $INDEX_FILE not found"
    return 1
  fi
  
  source "$INDEX_FILE" 2>> "$LOG_FILE"
  if [[ $? -ne 0 ]]; then
    log "ERROR: Failed to source $INDEX_FILE"
    return 1
  fi
  
  log "Successfully sourced $INDEX_FILE"
  
  # Update the LATEST_DOTFILES_COMMIT env var and persist it
  export LATEST_DOTFILES_COMMIT="$REMOTE_COMMIT"
  echo "$REMOTE_COMMIT" > "$HOME/.dotfiles_commit"
  log "Updated LATEST_DOTFILES_COMMIT to $REMOTE_COMMIT"
  
  log '=== Sync complete (changes applied) ==='
  return 0
}
