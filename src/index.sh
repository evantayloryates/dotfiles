#!/bin/zsh
# Main loader for dotfiles
# This file sources all configuration from subdirectories

# Get the directory where this script is located
DOTFILES_SRC_DIR="${0:A:h}"

_() { :; }

# Recursive ** globs require extended_glob (must be set before category load).
setopt extended_glob

# Source all .sh files in category dirs (recursive, deterministic).
# Nested files load before top-level siblings so co-located implementations
# are available to thin wrappers in e.g. functions/git.sh.
for category in aliases exports functions hooks path; do
    category_dir="$DOTFILES_SRC_DIR/$category"
    if [ -d "$category_dir" ]; then
        typeset -a _df_nested _df_top _df_all
        _df_nested=()
        _df_top=()
        # Recursive glob; (N) = null if none, (on) = sort by name
        for file in "$category_dir"/**/*.sh(N.on); do
            [[ -f "$file" ]] || continue
            # Skip non-shell artifacts that happen to end in .sh
            case "${file:t}" in
                .*|*~|*.bak|*.swp) continue ;;
            esac
            if [[ "${file:h}" == "$category_dir" ]]; then
                _df_top+=("$file")
            else
                _df_nested+=("$file")
            fi
        done
        _df_all=("${_df_nested[@]}" "${_df_top[@]}")
        for file in "${_df_all[@]}"; do
            source "$file"
        done
        unset _df_nested _df_top _df_all
    fi
done

# Unset temporary variable
unset DOTFILES_SRC_DIR category category_dir file
