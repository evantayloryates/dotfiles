#!/bin/zsh

export SHOULD_LOG=0

# Shell options
setopt interactive_comments  # Allow inline # comments in interactive shell

# Editor
export EDITOR='vim'
export VISUAL='vim'
export GIT_PAGER=cat

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

# Claude Code
export PATH="$HOME/.local/bin:$PATH"

# opencode
export PATH=/Users/taylor/.opencode/bin:$PATH

# Added by Holistics CLI installer
export PATH="$HOME/.holistics/bin:$PATH"

# Environment variables from .env are loaded by exports/dotenv.sh, which is
# also sourced from ~/.zshenv so non-interactive shells get them too.
