#!/bin/zsh

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

# Source and run sync_dotfiles function
if [[ -f "$HOME/dotfiles/sync_dotfiles.sh" ]]; then
    source "$HOME/dotfiles/sync_dotfiles.sh"
    sync_dotfiles
fi
