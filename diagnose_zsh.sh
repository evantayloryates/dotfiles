#!/bin/bash
# Diagnostic script for zsh installation issues (runs in bash to avoid recursion)

echo "=== ZSH DIAGNOSTICS ==="
echo ""

echo "1. Current shell:"
echo "SHELL=$SHELL"
echo "Running in: $0"
echo ""

echo "2. Which zsh binary is found in PATH:"
which zsh 2>&1
echo ""

echo "3. Zsh binary path (command -v):"
command -v zsh 2>&1
echo ""

echo "4. Zsh version:"
"$(command -v zsh)" --version 2>&1 || echo "ERROR: zsh --version failed"
echo ""

echo "5. List all zsh binaries in dotfiles:"
find ~/dotfiles -name "zsh" -type f -executable 2>/dev/null || echo "find failed"
echo ""

echo "6. Check local installation directory:"
ls -la ~/dotfiles/local/ 2>/dev/null || echo "No local directory"
echo ""

echo "7. Check current TERM:"
echo "TERM=$TERM"
echo ""

echo "8. Check terminfo for current terminal:"
infocmp "$TERM" >/dev/null 2>&1 && echo "✓ terminfo found for $TERM" || echo "✗ terminfo NOT found for $TERM"
echo ""

echo "9. Current TTY settings (erase character):"
stty -a 2>&1 | grep "erase"
echo ""

echo "10. Test zsh -f (no rc files) interactively:"
echo "To test, run manually: ~/dotfiles/local/zsh-*/bin/zsh -f"
echo "Then try backspace to see if it works without .zshrc"
echo ""

echo "=== END DIAGNOSTICS ==="
