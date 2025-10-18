#!/bin/bash
# Diagnostic script for zsh installation issues

echo "=== ZSH DIAGNOSTICS ==="
echo ""

echo "1. Which zsh binary is being used:"
which zsh
echo ""

echo "2. Zsh binary path:"
command -v zsh
echo ""

echo "3. Zsh version:"
zsh --version 2>&1 || echo "ERROR: zsh --version failed"
echo ""

echo "4. Check if zsh has ZLE (line editor) support:"
zsh -c 'echo "ZLE available: $ZLE_INSTALLED"' 2>&1 || echo "ERROR: Could not check ZLE"
echo ""

echo "5. Check terminfo for current terminal ($TERM):"
infocmp "$TERM" >/dev/null 2>&1 && echo "✓ terminfo found for $TERM" || echo "✗ terminfo NOT found for $TERM"
echo ""

echo "6. Check if terminfo database is accessible:"
if [[ -d "${HOME}/dotfiles/local/zsh-"*/share/terminfo ]]; then
    echo "✓ Found terminfo in zsh installation:"
    ls -la "${HOME}/dotfiles/local/zsh-"*/share/terminfo 2>/dev/null | head -5
else
    echo "✗ No terminfo in zsh installation directory"
fi
echo ""

echo "7. System terminfo locations:"
ls -la /usr/share/terminfo 2>/dev/null | head -3 || echo "✗ /usr/share/terminfo not found"
ls -la /lib/terminfo 2>/dev/null | head -3 || echo "✓ /lib/terminfo exists"
echo ""

echo "8. Current TTY settings:"
stty -a 2>&1 | head -5
echo ""

echo "9. Check for features in zsh binary:"
strings "$(which zsh)" 2>/dev/null | grep -i "zle\|terminfo\|ncurses" | head -10 || echo "Could not check binary"
echo ""

echo "10. Environment variables:"
echo "TERM=$TERM"
echo "TERMINFO=$TERMINFO"
echo "SHELL=$SHELL"
echo "ZSH_VERSION=$ZSH_VERSION"
echo ""

echo "11. Test zsh -f (no rc files):"
echo 'echo "test backspace"; read -k1' | zsh -f 2>&1 || echo "ERROR"
echo ""

echo "=== END DIAGNOSTICS ==="

