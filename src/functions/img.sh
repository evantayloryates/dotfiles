_show() {
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
    if [[ ! -f "$1" ]]; then
      echo "File not found: $1"
      return 1
    fi
    img_path="$1"
  fi

  # Display image in Kitty
  kitty +kitten icat --align left "$img_path"

  # Copy file reference to clipboard (Cmd+P works in Finder)
  if osascript -e "set the clipboard to POSIX file \"$img_path\"" 2>/dev/null; then
    echo "📋 Image file copied to clipboard"
  else
    # Fallback: copy image data (pasteable into Messages, Slack, etc.)
    osascript -e "set the clipboard to (read (POSIX file \"$img_path\") as picture)"
    echo "📋 Image data copied to clipboard"
  fi
}

imagine() {
  prompt="$*"
  url=$(python3 "$DOTFILES_DIR/src/python/replicate.image.py" "$prompt")
  if [[ -z "$url" ]]; then
    echo "Failed to generate image"
    return 1
  fi
  _show "$url"
}
