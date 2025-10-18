#!/bin/zsh
export SHOULD_LOG=1

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}


# Control whether to sync dotfiles
export SYNC_DOTFILES=1

# Find and use the best available zsh
if [[ -n "$(command -v zsh)" ]]; then
  export SHELL="$(command -v zsh)"
fi

# Setup dotfiles sync (only initialize if not already set)
export LIVE_DOTFILES_REPO_DIR="${LIVE_DOTFILES_REPO_DIR:-$HOME/.live-dotfiles}"

# Preserve LATEST_DOTFILES_COMMIT across shell invocations
if [[ -z "$LATEST_DOTFILES_COMMIT" && -f "$HOME/.dotfiles_commit" ]]; then
  export LATEST_DOTFILES_COMMIT="$(cat "$HOME/.dotfiles_commit" 2>/dev/null)"
fi

# Source and run sync_dotfiles function only if SYNC_DOTFILES=1
if [[ "$SYNC_DOTFILES" -eq 1 && -f "$HOME/dotfiles/sync_dotfiles.sh" ]]; then
  log 'SYNC_DOTFILES=1 → running dotfiles sync'
  source "$HOME/dotfiles/sync_dotfiles.sh"
  sync_dotfiles
else
  log 'SYNC_DOTFILES=0 → skipping dotfiles sync, loading local dotfiles'
  # Load local dotfiles directly
  if [[ -f "$HOME/dotfiles/src/index.sh" ]]; then
    source "$HOME/dotfiles/src/index.sh"
    log 'Loaded local dotfiles from $HOME/dotfiles/src/index.sh'
  else
    log 'WARNING: $HOME/dotfiles/src/index.sh not found'
  fi
fi