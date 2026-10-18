# Preview supported files in Ghostty with the shared terminal renderer.
source "$DOTFILES_DIR/src/lib/terminal-file.sh"

__o_preview_and_copy() {
  __terminal_preview "$1"
  local preview_status=$?
  if (( preview_status == 2 )); then
    open "$1"
    return
  fi
  (( preview_status == 0 )) || return "$preview_status"
  __terminal_copy 'file,transcode,path' "$1"
}

__show() {
  if [[ -z "$1" ]]; then
    echo 'Usage: img <image_path_or_url>'
    return 1
  fi

  local img_path

  # Check if input is a URL
  if [[ "$1" =~ ^https?:// ]]; then
    local tmp_dir="$TMPDIR/img-copies"
    mkdir -p "$tmp_dir"

    local fname
    fname=$(basename "${1%%\?*}")
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

  if ! chafa --probe=off --align=top,left --scale=max "$img_path"; then
    echo 'Failed to display image with chafa.' >&2
    return 1
  fi

  if osascript -e "set the clipboard to POSIX file \"$img_path\"" 2>/dev/null; then
    echo "📋 Image file copied to clipboard"
  else
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
  __show "$url"
}
