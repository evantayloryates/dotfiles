#!/bin/zsh
# Dotfiles zshrc for Linux devcontainers

echo "Hello from zshrc!"

# Ensure proper terminal type for VS Code
export TERM="${TERM:-xterm-256color}"

# Find and use the best available zsh
if [[ -n "$(command -v zsh)" ]]; then
    export SHELL="$(command -v zsh)"
fi

# Aliases
alias loog="cat $HOME/log.txt"
alias ls='ls -AGhlo'

# Setup dotfiles sync (only initialize if not already set)
export LIVE_DOTFILES_REPO_DIR="${LIVE_DOTFILES_REPO_DIR:-$HOME/.live-dotfiles}"

# Preserve LATEST_DOTFILES_COMMIT across shell invocations
if [[ -z "$LATEST_DOTFILES_COMMIT" && -f "$HOME/.dotfiles_commit" ]]; then
    export LATEST_DOTFILES_COMMIT="$(cat "$HOME/.dotfiles_commit" 2>/dev/null)"
fi

# # Source and run sync_dotfiles function
# if [[ -f "$HOME/dotfiles/sync_dotfiles.sh" ]]; then
#     source "$HOME/dotfiles/sync_dotfiles.sh"
#     sync_dotfiles
# fi

# Initialize completion system (AFTER syncing)
autoload -Uz compinit && compinit

# Use emacs key bindings (AFTER syncing to ensure they stick)
bindkey -e

# Key bindings for common keys (AFTER syncing so these take precedence)
bindkey "^?" backward-delete-char      # Backspace (DEL)
bindkey "^H" backward-delete-char      # Backspace (BS)  
bindkey "^[[3~" delete-char            # Delete
bindkey "^[[H" beginning-of-line       # Home
bindkey "^[[F" end-of-line             # End
bindkey "^[[1~" beginning-of-line      # Home (alternate)
bindkey "^[[4~" end-of-line            # End (alternate)
bindkey "^[[A" up-line-or-history      # Up arrow
bindkey "^[[B" down-line-or-history    # Down arrow
bindkey "^[[C" forward-char            # Right arrow
bindkey "^[[D" backward-char           # Left arrow
