#!/bin/zsh

# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $DOTFILES_DIR/src/python/pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi



img() {
  if [[ -z "$1" ]]; then
    echo "Usage: img <image_path_or_url>"
    return 1
  fi

  # Check if input is a URL
  if [[ "$1" =~ ^https?:// ]]; then
    curl -s "$1" | kitty +kitten icat
  else
    # Display local file
    if [[ ! -f "$1" ]]; then
      echo "File not found: $1"
      return 1
    fi
    kitty +kitten icat "$1"
  fi
}