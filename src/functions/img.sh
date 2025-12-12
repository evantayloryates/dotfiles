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
  local kitty_type_output=$(type kitty 2>&1)
  local command_kitty_path=$(command -v kitty 2>&1)
  echo "{\"id\":\"log_$(date +%s)_img1\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:34\",\"message\":\"Before kitty command\",\"data\":{\"img_path\":\"$img_path\",\"kitty_type\":\"$kitty_type_output\",\"command_kitty_path\":\"$command_kitty_path\"},\"sessionId\":\"debug-session\",\"runId\":\"post-fix\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img2\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:35\",\"message\":\"Executing command kitty\",\"data\":{\"command\":\"command kitty +kitten icat --align left $img_path\"},\"sessionId\":\"debug-session\",\"runId\":\"post-fix\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  local kitty_stderr=$(mktemp)
  # Use absolute path to kitty binary to bypass kitty() function alias
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img4\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:43\",\"message\":\"Using absolute path to kitty\",\"data\":{\"kitty_path\":\"/Applications/kitty.app/Contents/MacOS/kitty\"},\"sessionId\":\"debug-session\",\"runId\":\"post-fix\",\"hypothesisId\":\"C\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  /Applications/kitty.app/Contents/MacOS/kitty +kitten icat --align left "$img_path" 2>"$kitty_stderr"
  local kitty_exit_code=$?
  # #region agent log
  local kitty_error=$(cat "$kitty_stderr" 2>/dev/null || echo "")
  echo "{\"id\":\"log_$(date +%s)_img3\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:35\",\"message\":\"After kitty command\",\"data\":{\"exit_code\":$kitty_exit_code,\"stderr\":\"$kitty_error\"},\"sessionId\":\"debug-session\",\"runId\":\"post-fix\",\"hypothesisId\":\"A\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  rm -f "$kitty_stderr"

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
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img5\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:47\",\"message\":\"imagine function entry\",\"data\":{\"prompt\":\"$*\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  prompt="$*"
  url=$(python3 "$DOTFILES_DIR/src/python/replicate.image.py" "$prompt")
  # #region agent log
  echo "{\"id\":\"log_$(date +%s)_img6\",\"timestamp\":$(date +%s)000,\"location\":\"img.sh:49\",\"message\":\"After python call\",\"data\":{\"url\":\"$url\"},\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\"}" >> /Users/taylor/dotfiles/.cursor/debug.log
  # #endregion agent log
  if [[ -z "$url" ]]; then
    echo "Failed to generate image"
    return 1
  fi
  _show "$url"
}
