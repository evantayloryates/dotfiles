#!/bin/zsh

# Homebrew
# Apple Silicon Macs use /opt/homebrew, Intel Macs use /usr/local
if [[ -d "/opt/homebrew" ]]; then
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
elif [[ -d "/usr/local/bin" ]]; then
    export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
fi

