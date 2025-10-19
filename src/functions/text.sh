_quick() {
  filepath="$1"
  if [[ -z "$filepath" || ! -f "$filepath" ]]; then
    echo "Invalid or missing filepath" >&2
    return 1
  fi

  output_path=$(python3 "$DOTFILES_DIR/src/python/replicate.quick.py" "$filepath")
  if [[ -z "$output_path" || ! -f "$output_path" ]]; then
    echo "Failed to generate text" >&2
    return 1
  fi

  echo "$output_path"
}

quick() {
  prompt="$*"
  if [[ -z "$prompt" ]]; then
    echo "Usage: quick <prompt>"
    return 1
  fi

  tmpfile="$(mktemp "$TMPDIR/quick_prompt_XXXXXX.txt")"
  echo "$prompt" > "$tmpfile"

  output_path=$(_quick "$tmpfile")
  rm -f "$tmpfile"

  if [[ -z "$output_path" || ! -f "$output_path" ]]; then
    echo "Failed to generate text" >&2
    return 1
  fi

  printf '\n'
  cat "$output_path"
  printf '\n\n'

  pbcopy < "$output_path"
  echo "📋 Copied response to clipboard"
}


research() {
  prompt="$*"
  filepath=$(python3 "$DOTFILES_DIR/src/python/replicate.research.py" "$prompt")
  if [[ -z "$filepath" || ! -f "$filepath" ]]; then
    echo "Failed to generate text"
    return 1
  fi
  printf '\n\n'
  cat "$filepath"
  printf '\n\n'

  pbcopy < "$filepath"
  echo "📋 Copied response to clipboard"
}