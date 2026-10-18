# Render an image inline in the terminal. Goes through kitty's standalone
# `kitten` binary rather than the `kitty +kitten` launcher: kitten negotiates
# the Kitty graphics protocol with whatever terminal it is running under, and
# Ghostty implements that protocol, so this works in both.
_term_image() {
  /Applications/kitty.app/Contents/MacOS/kitten icat "$@"
}

__o_is_chafa_image() {
  [[ -f "$1" ]] && command -v chafa >/dev/null 2>&1 || return 1

  # Inspect the target of a symlink and its contents, not the path suffix.
  local mime
  mime=$(/usr/bin/file -L -b --mime-type -- "$1") || return 1
  case "$mime" in
    image/avif|image/bmp|image/gif|image/heic|image/heif|image/jpeg|image/jxl|image/png|image/qoi|image/svg+xml|image/tiff|image/vnd.microsoft.icon|image/webp|image/x-qoi|image/x-xwindowdump)
      return 0 ;;
  esac
  return 1
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

  /Applications/kitty.app/Contents/MacOS/kitty +kitten icat --align left "$img_path" 2>/dev/null

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
