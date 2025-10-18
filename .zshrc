#!/bin/zsh
# Dotfiles zshrc for Linux devcontainers

echo "Hello from zshrc!"

# Use whatever TERM the container/VS Code sets - don't override
# (Overriding TERM without matching terminfo causes display issues)

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

# Custom widget to force display refresh after backspace
# (Fixes visual issue where backspace works but screen doesn't update)
_backward-delete-char-and-redisplay() {
    zle .backward-delete-char
    zle -R
}
zle -N backward-delete-char _backward-delete-char-and-redisplay

# Key bindings for common keys (AFTER syncing so these take precedence)
bindkey "^?" backward-delete-char      # Backspace (DEL) with redisplay
bindkey "^H" backward-delete-char      # Backspace (BS) with redisplay
bindkey "^[[3~" delete-char            # Delete
bindkey "^[[H" beginning-of-line       # Home
bindkey "^[[F" end-of-line             # End
bindkey "^[[1~" beginning-of-line      # Home (alternate)
bindkey "^[[4~" end-of-line            # End (alternate)
bindkey "^[[A" up-line-or-history      # Up arrow
bindkey "^[[B" down-line-or-history    # Down arrow
bindkey "^[[C" forward-char            # Right arrow
bindkey "^[[D" backward-char           # Left arrow
