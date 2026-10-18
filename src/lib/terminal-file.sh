#!/bin/zsh

# One content gate for terminal previews. Return 2 for files we do not handle,
# 1 for a renderer failure, and 0 after a successful preview. Never copy here.
__terminal_file_kind() {
  [[ -f "$1" ]] || return 2
  local mime
  mime=$(/usr/bin/file -L -b --mime-type -- "$1") || return 2
  case "$mime" in
    image/avif|image/bmp|image/gif|image/heic|image/heif|image/jpeg|image/jxl|image/png|image/qoi|image/svg+xml|image/tiff|image/vnd.microsoft.icon|image/webp|image/x-qoi|image/x-xwindowdump)
      print -r -- image ;;
    application/pdf)
      print -r -- pdf ;;
    text/plain|text/markdown|text/x-markdown)
      # Markdown has no reliable byte signature. Require a Markdown suffix and
      # text content so a binary file renamed to .md is not sent to mdcat.
      case "${1:e:l}" in md|markdown) print -r -- markdown ;; *) return 2 ;; esac ;;
    *) return 2 ;;
  esac
}

__terminal_preview() {
  local kind
  kind="$(__terminal_file_kind "$1")" || return 2
  case "$kind" in
    image)
      command -v chafa >/dev/null 2>&1 || return 1
      chafa --probe=off --size=50x24 "$1" ;;
    pdf)
      command -v pdfinfo >/dev/null 2>&1 && command -v pdftoppm >/dev/null 2>&1 && command -v chafa >/dev/null 2>&1 || return 1
      local pages page previous=0
      local -a selected=()
      pages="$(pdfinfo "$1" 2>/dev/null | /usr/bin/awk '/^Pages:/ { print $2; exit }')"
      [[ "$pages" =~ '^[0-9]+$' ]] && (( pages > 0 )) || return 1
      if (( pages <= 6 )); then
        for (( page = 1; page <= pages; page++ )); do selected+=("$page"); done
      else
        selected=(1 2 3 "$((pages - 1))" "$pages")
      fi
      for page in "${selected[@]}"; do
        if (( pages > 6 && page == pages - 1 )); then
          printf '\n\033[90m%s\033[0m\n\n' "────────  ... pages 4-$((pages - 2)) omitted ...  ────────"
        elif (( previous > 0 )); then
          print -r -- ''
        fi
        # One page at a time streams PNG bytes; no temporary images are saved.
        ( setopt pipefail; pdftoppm -f "$page" -l "$page" -singlefile -scale-to 1000 -png "$1" 2>/dev/null | chafa --probe=off - ) || return 1
        previous="$page"
      done ;;
    markdown)
      command -v mdcat >/dev/null 2>&1 || return 1
      mdcat --local --no-pager "$1" ;;
  esac
}

# The caller chooses a comma-separated copy chain. "transcode" is meaningful
# only for supported images; other kinds advance directly to the next step.
# Multiple paths are supported for a path-only chain (used by clipsend).
__terminal_copy() {
  local chain="$1" strategy error kind
  shift
  (( $# )) || return 1
  local -a paths=("$@") steps=("${(@s:,:)chain}")
  for strategy in "${steps[@]}"; do
    case "$strategy" in
      file)
        (( ${#paths} == 1 )) || return 1
        if error="$(__terminal_copy_file "$paths[1]" 2>&1)"; then
          print -r -- '✅ File contents copied to clipboard'
          return 0
        fi
        __terminal_copy_failure '❌ Copy Failure:' "$error" ;;
      transcode)
        (( ${#paths} == 1 )) || return 1
        kind="$(__terminal_file_kind "$paths[1]")" || kind=''
        [[ "$kind" == image ]] || continue
        if error="$(__terminal_copy_png "$paths[1]" 2>&1)"; then
          print -r -- '✅ Transcoded png contents copied to clipboard'
          return 0
        fi
        __terminal_copy_failure '❌ Transcode Copy Failure:' "$error" ;;
      path)
        if error="$(__terminal_copy_paths "${paths[@]}" 2>&1)"; then
          if (( ${#paths} > 1 )); then
            print -r -- '✅ File paths copied to clipboard'
          else
            print -r -- '✅ File path copied to clipboard'
          fi
          return 0
        fi
        __terminal_copy_failure '❌ Path Copy Failure:' "$error" ;;
      *) print -u2 -- "Unknown terminal copy strategy: $strategy"; return 2 ;;
    esac
  done
  return 1
}

__terminal_copy_file() {
  /usr/bin/osascript -l JavaScript "$DOTFILES_DIR/src/javascript/image-pasteboard.js" file "${1:A}"
}

__terminal_copy_png() {
  /usr/bin/osascript -l JavaScript "$DOTFILES_DIR/src/javascript/image-pasteboard.js" png "$1"
}

__terminal_copy_paths() {
  printf '%s' "${(F)@}" | /usr/bin/pbcopy
}

__terminal_copy_failure() {
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
