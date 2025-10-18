#!/bin/bash

echo "🚀 Installing dotfiles for Taylor..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

# Check if dist directory exists
if [ ! -d "$DIST_DIR" ]; then
    echo "❌ dist directory not found at $DIST_DIR"
    exit 1
fi

# Find all files in dist directory that start with an integer
echo "🔍 Looking for dotfiles in $DIST_DIR..."

# Process each file that starts with a digit
for file in "$DIST_DIR"/[0-9]*; do
    # Check if file exists (in case no files match the pattern)
    if [ ! -f "$file" ]; then
        continue
    fi
    
    # Extract filename without the integer prefix
    filename=$(basename "$file")
    # Remove the leading digit and dot (e.g., "1.zshenv" -> ".zshenv")
    target_name=".${filename#*.}"
    
    # Copy file to home directory
    if cp "$file" "$HOME/$target_name"; then
        echo "✅ Installed $target_name"
    else
        echo "❌ Failed to install $target_name"
    fi
done

echo "✨ Dotfiles installation complete!"
echo "🎉 Your dotfiles have been installed to your home directory"
