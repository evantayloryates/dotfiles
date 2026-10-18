# Render an image inline in the terminal. Goes through kitty's standalone
# `kitten` binary rather than the `kitty +kitten` launcher: kitten negotiates
# the Kitty graphics protocol with whatever terminal it is running under, and
# Ghostty implements that protocol, so this works in both.
source "$DOTFILES_DIR/src/lib/terminal-image.sh"

_term_image() {
  /Applications/kitty.app/Contents/MacOS/kitten icat "$@"
}

__o_preview_and_copy() {
  __terminal_image_preview "$1"
  local preview_status=$?
  if (( preview_status == 2 )); then
    open "$1"
    return
  fi
  (( preview_status == 0 )) || return "$preview_status"

  local error
  if error="$(__o_copy_file "$1" 2>&1)"; then
    print -r -- '✅ File contents copied to clipboard'
  else
    __o_copy_failure '❌ Copy Failure:' "$error"
    if error="$(__o_copy_png "$1" 2>&1)"; then
      print -r -- '✅ Transcoded png contents copied to clipboard'
    else
      __o_copy_failure '❌ Transcode Copy Failure:' "$error"
      return 1
    fi
  fi
}

__o_copy_file() {
  /usr/bin/osascript -l JavaScript "$DOTFILES_DIR/src/javascript/image-pasteboard.js" file "${1:A}"
}

__o_copy_png() {
  /usr/bin/osascript -l JavaScript "$DOTFILES_DIR/src/javascript/image-pasteboard.js" png "$1"
}

__o_copy_failure() {
  local label="$1" message="$2"
  message="${message%%$'\n'*}"
  message="${message//$'\r'/ }"
  message="${message//$'\e'/}"
  message="${message//$'\t'/ }"
  message="${message##*execution error: }"
  while [[ "$message" == 'Error: '* ]]; do message="${message#Error: }"; done
  if [[ "$message" =~ ' \(-[0-9]+\)$' ]]; then message="${message% *}"; fi
  message="${message#"${message%%[![:space:]]*}"}"
  message="${message%"${message##*[![:space:]]}"}"
  [[ -n "$message" ]] || message='Unknown Error'

  if (( ${#message} > 50 )); then
    printf '\033[37m%s\033[31m %s\033[90m...\033[0m\n' "$label" "${message[1,47]}" >&2
  else
    printf '\033[37m%s\033[31m %s\033[0m\n' "$label" "$message" >&2
  fi
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
