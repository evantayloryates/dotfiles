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
    echo 'Usage: img <image_path_or_url>'
    return 1
  fi

  local img_path

  # Check if input is a URL
  if [[ "$1" =~ ^https?:// ]]; then
    local tmp_file="$TMPDIR/$(openssl rand -hex 8).img"
    curl -s -L "$1" -o "$tmp_file"
    if [[ $? -ne 0 || ! -s "$tmp_file" ]]; then
      echo 'Failed to download image.'
      return 1
    fi
    img_path="$tmp_file"
  else
    # Display local file
    if [[ ! -f "$1" ]]; then
      echo "File not found: $1"
      return 1
    fi
    img_path="$1"
  fi

  # Display image in Kitty
  kitty +kitten icat "$img_path"

  # Copy path to clipboard (macOS pbcopy or Linux xclip/xsel)
  if command -v pbcopy &>/dev/null; then
    echo -n "$img_path" | pbcopy
  elif command -v xclip &>/dev/null; then
    echo -n "$img_path" | xclip -selection clipboard
  elif command -v xsel &>/dev/null; then
    echo -n "$img_path" | xsel --clipboard --input
  else
    echo 'No clipboard utility found (pbcopy, xclip, or xsel).'
    return 1
  fi

  echo "✅ Image path copied to clipboard: $img_path"
}
