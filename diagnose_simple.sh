#!/bin/bash
# Super simple diagnostic - avoids any subshells

echo "=== SIMPLE DIAGNOSTICS ==="
echo ""
echo "PATH=$PATH"
echo ""
echo "TERM=$TERM"
echo ""
echo "Current erase setting:"
stty -a | grep erase
echo ""
echo "Zsh binary locations:"
ls -la ~/dotfiles/local/*/bin/zsh 2>/dev/null
echo ""
echo "=== Try this manually: ==="
echo "1. Type: exec bash"
echo "2. Then type: exec ~/dotfiles/local/zsh-linux-x86_64/bin/zsh -f"
echo "3. Test backspace"
echo ""

