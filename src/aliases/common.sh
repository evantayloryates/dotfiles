#!/bin/zsh
# Common aliases

alias loog="cat $HOME/log.txt"
alias ls='ls -AGhlo'
alias hello='echo "Hello, World!"'

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

