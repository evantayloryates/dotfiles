#!/bin/zsh


# Dotfiles sync
source "$HOME/dotfiles/sync_dotfiles.sh"
alias sync='sync_dotfiles'

function ls() { /bin/ls -AGhlo "$@"; }

alias src='source $HOME/.zshrc'

# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'

# Utilities
alias grep='grep --color=auto'
alias mkdir='mkdir -pv'

alias kit='kitty @ load-config /Users/taylor/.config/kitty/kitty.conf'

alias password="python $DOTFILES_DIR/python/pwd.py"
alias words="subl /Users/taylor/.dotfiles/assets/words.txt"