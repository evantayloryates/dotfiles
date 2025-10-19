#!/bin/zsh


# Dotfiles sync
source "$HOME/dotfiles/sync_dotfiles.sh"
alias sync='sync_dotfiles'

ls() { /bin/ls -AGhlo "$@"; }


abs() { realpath "$@"; }
src() { exec "$SHELL" -l; }
env() { /usr/bin/env | sort; }

# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'

# Utilities
alias mkdir='mkdir -pv'

alias kit='kitty @ load-config /Users/taylor/.config/kitty/kitty.conf'

alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="subl $DOTFILES_DIR/src/__data/words.txt"