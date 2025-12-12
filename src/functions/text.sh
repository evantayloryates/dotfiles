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

render_md_to_image() {
  srcfile="$1"
  if [[ -z "$srcfile" || ! -f "$srcfile" ]]; then
    echo "Usage: render_md_to_image /absolute/path/to/file.md" >&2
    return 1
  fi

  tmp_md="$(mktemp "$TMPDIR/rendermd_XXXXXX.md")"
  cp "$srcfile" "$tmp_md"

  tmp_html="${tmp_md%.md}.html"
  grip --export "$tmp_md" "$tmp_html" >/dev/null 2>&1
  if [[ ! -f "$tmp_html" ]]; then
    echo "Failed to render markdown to HTML with grip" >&2
    rm -f "$tmp_md"
    return 1
  fi

  node "$DOTFILES_DIR/src/javascript/html-to-png.js" "$tmp_html" > "$tmp_html.out" 2>/dev/null
  imgfile="$(cat "$tmp_html.out" 2>/dev/null)"
  rm -f "$tmp_html.out"

  if [[ -z "$imgfile" || ! -f "$imgfile" ]]; then
    echo "Failed to render HTML to PNG" >&2
    rm -f "$tmp_md" "$tmp_html"
    return 1
  fi

  pybin="${VIRTUAL_ENV:+$VIRTUAL_ENV/bin/python}"
  if [[ -z "$pybin" || ! -x "$pybin" ]]; then
    if [[ -x "$HOME/.venvs/dotfiles/bin/python" ]]; then
      pybin="$HOME/.venvs/dotfiles/bin/python"
    else
      pybin="python3"
    fi
  fi
  trimmed_path=$("$pybin" "$DOTFILES_DIR/src/python/trim_png.py" "$imgfile")
  if [[ -z "$trimmed_path" || ! -f "$trimmed_path" ]]; then
    echo "Failed to trim PNG" >&2
    rm -f "$tmp_md" "$tmp_html"
    return 1
  fi

  /Applications/kitty.app/Contents/MacOS/kitty +kitten icat \
  --align left \
  --scale-up \
  --place "$(identify -format '%wx%h' "$trimmed_path")@0x0" \
  "$trimmed_path"

  rm -f "$tmp_md" "$tmp_html"
}

researchmd() {
  prompt="$*"
  if [[ -z "$prompt" ]]; then
    echo "Usage: researchmd <prompt>"
    return 1
  fi

  tmp_prompt="$(mktemp "$TMPDIR/researchmd_prompt_XXXXXX.txt")"
  echo "$prompt" > "$tmp_prompt"

  research_path=$(_research "$tmp_prompt")
  rm -f "$tmp_prompt"

  if [[ -z "$research_path" || ! -f "$research_path" ]]; then
    echo "Failed to generate research response" >&2
    return 1
  fi

  tmp_amended="$(mktemp "$TMPDIR/researchmd_amended_XXXXXX.txt")"
  cat "$research_path" > "$tmp_amended"
  printf '\n\nPlease format this text block as markdown. Respond only with the markdown text result\n' >> "$tmp_amended"

  quick_path=$(_quick "$tmp_amended")
  rm -f "$tmp_amended"

  if [[ -z "$quick_path" || ! -f "$quick_path" ]]; then
    echo "Failed to generate markdown quick response" >&2
    return 1
  fi

  sed -i '' '1,/^#/ d' "$quick_path"

  render_md_to_image "$quick_path"

  pbcopy < "$quick_path"
  echo "📋 Copied markdown-enhanced response to clipboard"
}
