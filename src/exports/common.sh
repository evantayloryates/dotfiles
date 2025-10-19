#!/bin/zsh

export SHOULD_LOG=0

# Editor
export EDITOR='vim'
export VISUAL='vim'

# History
export HISTSIZE=10000
export SAVEHIST=10000
export HISTFILE=~/.zsh_history

# Colors
export CLICOLOR=1
export LSCOLORS=ExFxCxDxBxegedabagacad

# Less
export LESS='-R'

export DOTFILES_DIR="$HOME/dotfiles"
export TZ='America/New_York'

# Load environment variables from .env file
if [ -f "$DOTFILES_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Export the variable
    export "$line"
  done < "$DOTFILES_DIR/.env"
fi