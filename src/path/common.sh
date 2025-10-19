#!/bin/zsh

# Homebrew
# Apple Silicon Macs use /opt/homebrew, Intel Macs use /usr/local
if [[ -d "/opt/homebrew" ]]; then
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
elif [[ -d "/usr/local/bin" ]]; then
    export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
fi

# VS Code CLI
if [[ -d "/Applications/Visual Studio Code.app/Contents/Resources/app/bin" ]]; then
    export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
fi

# Cursor CLI
if [[ -d "/Applications/Cursor.app/Contents/Resources/app/bin" ]]; then
    export PATH="$PATH:/Applications/Cursor.app/Contents/Resources/app/bin"
fi
