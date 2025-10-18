#!/bin/bash

# Install zsh if not available
command -v zsh &>/dev/null || sudo apt-get update &>/dev/null && sudo apt-get install -y zsh &>/dev/null

# Get zsh path and set as default shell
ZSH_PATH=$(which zsh)
grep -q "^$ZSH_PATH$" /etc/shells 2>/dev/null || echo "$ZSH_PATH" | sudo tee -a /etc/shells >/dev/null
sudo usermod -s "$ZSH_PATH" "$(whoami)" 2>/dev/null || chsh -s "$ZSH_PATH" 2>/dev/null

# Set SHELL environment variable
[ -d /etc/profile.d ] && echo "export SHELL=$ZSH_PATH" | sudo tee /etc/profile.d/zsh-default.sh >/dev/null

