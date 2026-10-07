#!/bin/zsh

# Echo a path in $1 for name $2 that does not exist yet, adding -1, -2, ...
# before the extension until it is free.
__clipsend_free_path() {
  local dir="$1"
  local name="$2"
  local stem="$name"
  local ext=""
  local candidate="$dir/$name"
  local n=1

  if [[ "${name#.}" == ?*.* && "$name" != *. ]]; then
    stem="${name%.*}"
    ext=".${name##*.}"
  fi

  while [[ -e "$candidate" || -L "$candidate" ]]; do
    candidate="$dir/${stem}-${n}${ext}"
    ((n++))
  done
  printf '%s' "$candidate"
}

# Keep OS clipboard access behind one bridge (also usable by isolated tests).
__clipsend_pasteboard() {
  /usr/bin/osascript -l JavaScript "$DOTFILES_DIR/src/javascript/clipsend-pasteboard.js" "$@"
}

__clipsend_name() {
  local name="$1" content="$2" inferred
  # A leading dot alone is not an extension. An explicit suffix always wins.
  if [[ "${name#.}" == ?*.* && "$name" != *. ]]; then
    printf '%s' "$name"
    return
  fi
  if inferred="$(python3 "$DOTFILES_DIR/src/python/clipsend.py" "$name" "$content")"; then
    printf '%s' "$inferred"
  else
    echo '⚠️  Could not infer content type; using .txt' >&2
    while [[ "$name" == *. ]]; do name="${name%.}"; done
    printf '%s.txt' "${name:-clipsend}"
  fi
}

# Save the clipboard to ~/Desktop and put the saved path on the clipboard.
#   clipsend [name]    (or its alias: cs [name])
# Infer suffixes for unnamed text and extensionless names; preserve bytes.
# Finder files retain existing suffixes and directories retain their names.
# Images are PNG by default, or converted to an explicitly supported format.
clipsend() {
  __alias_nudge cs

  local desktop="$HOME/Desktop"
  local custom_name="${1##*/}"
  local ts
  local info
  local kind
  local src
  local name
  local fmt
  local tmp
  local lines
  local out
  local -a sources
  local -a outs

  ts="$(date '+%H%M%S')"
  mkdir -p "$desktop" || return 1

  # Select the image encoding before capture so one AppKit process can read,
  # optionally convert, and save. No later clipboard read or pbpaste decoding.
  name="${custom_name:-clipsend-$ts-image.png}"
  case "${name:e:l}" in
    png) fmt=png ;;
    jpg|jpeg) fmt=jpeg ;;
    tif|tiff) fmt=tiff ;;
    gif) fmt=gif ;;
    bmp) fmt=bmp ;;
    *) fmt=png; name="${name%.}.png" ;;
  esac
  tmp="$(mktemp)" || return 1
  if ! info="$(__clipsend_pasteboard capture "$tmp" "$fmt" 2>&1)"; then
    rm -f "$tmp"
    echo "❌ Could not read the clipboard: $info" >&2
    return 1
  fi
  kind="${info%%$'\n'*}"

  case "$kind" in
    files)
      rm -f "$tmp"
      sources=("${(@f)${info#*$'\n'}}")
      if [[ -n "$custom_name" && ${#sources} -gt 1 ]]; then
        echo "⚠️  ${#sources} files on the clipboard; ignoring name '$custom_name'" >&2
        custom_name=""
      fi
      for src in "${sources[@]}"; do
        name="${src:t}"
        if [[ -n "$custom_name" ]]; then
          name="$custom_name"
          # keep the source extension when the given name has none
          if [[ ( "${name#.}" != ?*.* || "$name" == *. ) && "${${src:t}#.}" == ?*.* && "$src" != *. && ! -d "$src" ]]; then
            while [[ "$name" == *. ]]; do name="${name%.}"; done
            name="${name:-clipsend}"
            name="$name.${src:t:e}"
          fi
        fi
        if [[ -f "$src" ]]; then
          name="$(__clipsend_name "$name" "$src")"
        fi
        out="$(__clipsend_free_path "$desktop" "$name")"
        if ! /bin/cp -Rp "$src" "$out"; then
          echo "❌ Could not copy $src" >&2
          return 1
        fi
        outs+=("$out")
      done
      ;;
    image)
      out="$(__clipsend_free_path "$desktop" "$name")"
      if ! mv "$tmp" "$out"; then
        rm -f "$tmp"
        echo '❌ Could not save clipboard image' >&2
        return 1
      fi
      outs+=("$out")
      ;;
    empty)
      rm -f "$tmp"
      echo '❌ Nothing on the clipboard that clipsend can save' >&2
      return 1
      ;;
    text)
      lines="$(wc -l < "$tmp" | tr -d '[:space:]')"
      name="$(__clipsend_name "${custom_name:-clipsend-$ts-$lines-lines}" "$tmp")"
      out="$(__clipsend_free_path "$desktop" "$name")"
      if ! mv "$tmp" "$out"; then
        rm -f "$tmp"
        echo '❌ Could not save clipboard text' >&2
        return 1
      fi
      outs+=("$out")
      ;;
    data)
      # The bridge has already identified binary bytes. Avoid text parsers and
      # retain unknown binary as .bin, even for payloads larger than 16 MiB.
      name="${custom_name:-clipsend-$ts-data}"
      if [[ "${name#.}" != ?*.* || "$name" == *. ]]; then
        name="${name%.}.${info#*$'\n'}"
      fi
      out="$(__clipsend_free_path "$desktop" "$name")"
      if ! mv "$tmp" "$out"; then
        rm -f "$tmp"
        echo '❌ Could not save clipboard data' >&2
        return 1
      fi
      outs+=("$out")
      ;;
    *)
      rm -f "$tmp"
      echo "❌ Unknown clipboard type: $kind" >&2
      return 1
      ;;
  esac

  if ! printf '%s' "${(F)outs}" | /usr/bin/pbcopy; then
    printf '%s\n' "${outs[@]}"
    echo '❌ Files saved, but their paths could not be copied to the clipboard' >&2
    return 1
  fi
  printf '%s\n' "${outs[@]}"
  if (( ${#outs} > 1 )); then
    echo '✅ File paths copied to clipboard'
  else
    echo '✅ File path copied to clipboard'
  fi
}
