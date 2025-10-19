_quick() {
  filepath="$1"
  if [[ -z "$filepath" || ! -f "$filepath" ]]; then
    echo "Invalid or missing filepath"
    return 1
  fi

  output_path=$(python3 "$DOTFILES_DIR/src/python/replicate.quick.py" "$filepath")
  if [[ -z "$output_path" || ! -f "$output_path" ]]; then
    echo "Failed to generate text"
    return 1
  fi

  printf '\n'
  cat "$output_path"
  printf '\n\n'

  pbcopy < "$output_path"
  echo "📋 Copied response to clipboard"
}

quick() {
  prompt="$*"
  if [[ -z "$prompt" ]]; then
    echo "Usage: quick <prompt>"
    return 1
  fi

  tmpfile="$(mktemp "$TMPDIR/quick_prompt_XXXXXX.txt")"
  echo "$prompt" > "$tmpfile"

  _quick "$tmpfile"
  rm -f "$tmpfile"
}
