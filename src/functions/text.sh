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


_research() {
  filepath="$1"
  if [[ -z "$filepath" || ! -f "$filepath" ]]; then
    echo "Invalid or missing filepath" >&2
    return 1
  fi

  output_path=$(python3 "$DOTFILES_DIR/src/python/replicate.research.py" "$filepath")
  if [[ -z "$output_path" || ! -f "$output_path" ]]; then
    echo "Failed to generate text" >&2
    return 1
  fi

  echo "$output_path"
}

research() {
  prompt="$*"
  if [[ -z "$prompt" ]]; then
    echo "Usage: research <prompt>"
    return 1
  fi

  tmpfile="$(mktemp "$TMPDIR/research_prompt_XXXXXX.txt")"
  echo "$prompt" > "$tmpfile"

  output_path=$(_research "$tmpfile")
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


researchmd() {
  prompt="$*"
  if [[ -z "$prompt" ]]; then
    echo "Usage: researchmd <prompt>"
    return 1
  fi

  # Step 1: Create temp file for prompt
  tmp_prompt="$(mktemp "$TMPDIR/researchmd_prompt_XXXXXX.txt")"
  echo "$prompt" > "$tmp_prompt"

  # Step 2: Run _research to get main response file
  research_path=$(_research "$tmp_prompt")
  rm -f "$tmp_prompt"

  if [[ -z "$research_path" || ! -f "$research_path" ]]; then
    echo "Failed to generate research response" >&2
    return 1
  fi

  # Step 3: Create amended temp file (response + extra markdown prompt)
  tmp_amended="$(mktemp "$TMPDIR/researchmd_amended_XXXXXX.txt")"
  cat "$research_path" > "$tmp_amended"
  printf '\n\nPlease format this text block as markdown\n' >> "$tmp_amended"

  # Step 4: Pass amended file to _quick
  quick_path=$(_quick "$tmp_amended")

  # Cleanup intermediate file
  rm -f "$tmp_amended"

  if [[ -z "$quick_path" || ! -f "$quick_path" ]]; then
    echo "Failed to generate markdown quick response" >&2
    return 1
  fi

  # Step 5: Display result using mdcat
  printf '\n'
  mdcat "$quick_path"
  printf '\n\n'

  # Step 6: Copy result to clipboard and log
  pbcopy < "$quick_path"
  echo "📋 Copied markdown-enhanced response to clipboard"
}
