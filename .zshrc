echo "Hello from zshrc!"
export SHELL=$(which zsh)
alias l="cat $HOME/log.txt"

# Enable zsh line editor and key bindings
autoload -Uz compinit && compinit
zle -N zle-line-init
zle -N zle-keymap-select

# Set up key bindings for terminal
bindkey -e  # Use emacs key bindings (can change to -v for vi mode)

# Explicitly bind common keys
bindkey "^[[3~" delete-char          # Delete
bindkey "^[[H" beginning-of-line     # Home
bindkey "^[[F" end-of-line           # End
bindkey "^[[A" up-line-or-history    # Up arrow
bindkey "^[[B" down-line-or-history  # Down arrow
bindkey "^[[C" forward-char          # Right arrow
bindkey "^[[D" backward-char         # Left arrow
bindkey "^?" backward-delete-char    # Backspace
bindkey "^[[3;5~" delete-char        # Ctrl+Delete

# Setup dotfiles sync
export LIVE_DOTFILES_REPO_DIR="$HOME/.live-dotfiles"
export LATEST_DOTFILES_COMMIT=""

# Source and run sync_dotfiles function
source "$HOME/dotfiles/sync_dotfiles.sh"
sync_dotfiles