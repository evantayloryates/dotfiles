#!/bin/bash
# Fix terminal rendering issues

echo "=== Terminal Diagnostics ==="
echo "TERM=$TERM"
echo ""

# Check if terminfo exists for current TERM
if infocmp "$TERM" >/dev/null 2>&1; then
    echo "✓ terminfo found for $TERM"
else
    echo "✗ terminfo NOT found for $TERM"
    echo "Installing ncurses-term..."
    sudo apt-get update -qq && sudo apt-get install -y ncurses-term 2>&1 | tail -5
fi

echo ""
echo "Checking terminal capabilities..."
echo "kbs (backspace): $(tput kbs | od -An -tx1)"
echo "kdch1 (delete): $(tput kdch1 | od -An -tx1 2>/dev/null || echo 'not defined')"

echo ""
echo "Current stty erase:"
stty -a | grep erase

echo ""
echo "Recommended fixes:"
echo "1. Add to .zshrc: export TERM=xterm-256color"
echo "2. Or try: export TERM=xterm"
echo "3. Check VS Code setting: terminal.integrated.enablePersistentSessions"

