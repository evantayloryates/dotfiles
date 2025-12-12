#!/bin/zsh


# Dotfiles sync
source "$HOME/dotfiles/sync_dotfiles.sh"
alias sync='sync_dotfiles'
# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gb='git branch --sort=-committerdate'
alias gp='git push'
alias gl='git log --oneline'
alias dc="docker compose"
# Utilities
alias mkdir='mkdir -pv'
alias password="python3 $DOTFILES_DIR/src/python/password.py"
alias words="open $DOTFILES_DIR/src/__data/words.txt"