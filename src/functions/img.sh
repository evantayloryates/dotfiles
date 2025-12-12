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
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img1\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:34\",\"message\":\"Before kitty command\",\"data\":{\"img_path\":\"$img_path\",\"kitty_type\":\"$(type kitty 2>&1)\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img2\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:35\",\"message\":\"Executing kitty command\",\"data\":{\"command\":\"kitty +kitten icat --align left $img_path\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  kitty +kitten icat --align left "$img_path" 2>&1 | while IFS= read -r line; do
    echo "{\"id\":\"log_$(date +%s)_img3\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:35\",\"message\":\"kitty stderr\",\"data\":{\"line\":\"$line\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  done
  local kitty_exit_code=$?
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img4\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:35\",\"message\":\"After kitty command\",\"data\":{\"exit_code\":$kitty_exit_code},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log

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
