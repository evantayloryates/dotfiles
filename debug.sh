#!/bin/bash
# Quick debug script to check shell configuration

echo "=== Shell Debug Info ==="
echo ""
echo "Current shell: $SHELL"
echo "Running process: $(ps -p $$ -o comm=)"
echo ""
echo "=== Files that exist ==="
ls -la ~ | grep -E '^\.|bash|zsh|profile'
echo ""
echo "=== Contents of .bashrc (last 20 lines) ==="
tail -20 ~/.bashrc
echo ""
echo "=== Contents of .profile (if exists) ==="
if [ -f ~/.profile ]; then
    tail -20 ~/.profile
else
    echo "No .profile found"
fi
echo ""
echo "=== Contents of .bash_profile (if exists) ==="
if [ -f ~/.bash_profile ]; then
    cat ~/.bash_profile
else
    echo "No .bash_profile found"
fi
echo ""
echo "=== Test if bash sources .bashrc ==="
bash -c 'echo "Running in bash, SHELL=$SHELL"'

