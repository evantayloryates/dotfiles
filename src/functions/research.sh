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