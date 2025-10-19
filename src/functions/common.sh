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
    local tmp_dir="$TMPDIR/img-copies"
    mkdir -p "$tmp_dir"

    # Try to extract filename from URL, fallback to random hash
    local fname
    fname=$(basename "${1%%\?*}") # remove query params
    [[ -z "$fname" || "$fname" == */* ]] && fname="$(openssl rand -hex 8).img"

    local tmp_file="$tmp_dir/$fname"
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

  # Copy file reference to clipboard (so Cmd+P works in Finder)
  if command -v osascript &>/dev/null; then
    if osascript -e "set the clipboard to POSIX file \"$img_path\"" 2>/dev/null; then
      echo "✅ Image file copied to clipboard (as file reference): $img_path"
    else
      # Fallback: copy image data (works for pasting into Messages, Slack, etc.)
      osascript -e "set the clipboard to (read (POSIX file \"$img_path\") as picture)"
      echo "✅ Image data copied to clipboard: $img_path"
    fi
  elif command -v pbcopy &>/dev/null; then
    # macOS fallback if osascript missing
    osascript -e "set the clipboard to (read (POSIX file \"$img_path\") as picture)"
    echo "✅ Image data copied to clipboard: $img_path"
  elif command -v xclip &>/dev/null; then
    xclip -selection clipboard -t image/png -i "$img_path"
    echo "✅ Image data copied to clipboard (xclip): $img_path"
  elif command -v xsel &>/dev/null; then
    xsel --clipboard --input < "$img_path"
    echo "✅ Image data copied to clipboard (xsel): $img_path"
  else
    echo '⚠️ No compatible clipboard utility found.'
    return 1
  fi
}
