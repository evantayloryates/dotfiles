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

# # Initialize completion system (AFTER syncing)
# autoload -Uz compinit && compinit

# # Use emacs key bindings (AFTER syncing to ensure they stick)
# bindkey -e

# # Fix for backspace display issues - send explicit erase sequence
# _fix-backspace() {
#     # Delete the character
#     zle .backward-delete-char
#     # Force full line redraw
#     zle .redisplay
#     # Alternative: send explicit terminal control
#     # echoti cub1  # move cursor back
#     # echoti dch1  # delete character
# }
# zle -N _fix-backspace

# # Key bindings for common keys (AFTER syncing so these take precedence)
# bindkey "^?" _fix-backspace            # Backspace (DEL) with redisplay
# bindkey "^H" _fix-backspace            # Backspace (BS) with redisplay
# bindkey "^[[3~" delete-char            # Delete
# bindkey "^[[H" beginning-of-line       # Home
# bindkey "^[[F" end-of-line             # End
# bindkey "^[[1~" beginning-of-line      # Home (alternate)
# bindkey "^[[4~" end-of-line            # End (alternate)
# bindkey "^[[A" up-line-or-history      # Up arrow
# bindkey "^[[B" down-line-or-history    # Down arrow
# bindkey "^[[C" forward-char            # Right arrow
# bindkey "^[[D" backward-char           # Left arrow
