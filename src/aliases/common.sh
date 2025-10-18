#!/bin/zsh


# Dotfiles sync
source "$HOME/dotfiles/sync_dotfiles.sh"
alias sync='sync_dotfiles'
alias nn='echo "Hello, World!"'
alias bb='echo "Hello, World!"'
alias ls='ls -AGhlo'

# Directory navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

# List directory contents
alias ll='ls -lah'
alias la='ls -A'
alias l='ls -CF'

# Git shortcuts
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git log --oneline'

# Safety
alias rm='rm -i'
alias cp='cp -i'
alias mv='mv -i'

# Utilities
alias grep='grep --color=auto'
alias mkdir='mkdir -pv'

