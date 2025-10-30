#!/bin/zsh


# Dotfiles sync
source "$HOME/dotfiles/sync_dotfiles.sh"
alias sync='sync_dotfiles'

ls() { /bin/ls -AGhlo "$@"; }


abs() { realpath "$@"; }
# Note: this will overwrite the /usr/bin/ex command
ex() { exiftool "$@"; }
convert() { magick "$@"; }
src() { exec "$SHELL" -l; }
env() { /usr/bin/env | sort; }
path() { python3 "$DOTFILES_DIR/src/python/path.py"; }

grep() {
  if command -v rg >/dev/null 2>&1; then
    /opt/homebrew/bin/rg "$@"
  else
    /usr/bin/grep "$@"
  fi
}

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