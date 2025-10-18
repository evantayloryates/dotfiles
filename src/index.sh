#!/bin/zsh
# Main loader for dotfiles
# This file sources all configuration from subdirectories

# Get the directory where this script is located
DOTFILES_SRC_DIR="${0:A:h}"

# Source all files in subdirectories
for category in aliases exports functions hooks path; do
    category_dir="$DOTFILES_SRC_DIR/$category"
    if [ -d "$category_dir" ]; then
        for file in "$category_dir"/*.sh(N); do
            if [ -f "$file" ]; then
                source "$file"
            fi
        done
    fi
done



# Unset temporary variable
unset DOTFILES_SRC_DIR category category_dir file

