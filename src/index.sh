#!/bin/zsh
# Main loader for dotfiles
# This file sources all configuration from subdirectories

# Get the directory where this script is located
DOTFILES_SRC_DIR="${0:A:h}"

_() { :; }
# Source all .sh files in each category, RECURSING into subfolders so that
# domain-specific flows can be co-located (e.g. functions/git/). Globbing is
# deterministic (zsh sorts glob results lexicographically by full path), and
# only real shell files are sourced — backups and non-shell artifacts are skipped.
for category in aliases exports functions hooks path; do
    category_dir="$DOTFILES_SRC_DIR/$category"
    if [ -d "$category_dir" ]; then
        for file in "$category_dir"/**/*.sh(N.); do
            # Skip archived/backup artifacts (kept out of the load path).
            case "$file" in
                *__old*|*.bak.sh|*.disabled.sh) continue ;;
            esac
            source "$file"
        done
    fi
done

# Unset temporary variable
unset DOTFILES_SRC_DIR category category_dir file
