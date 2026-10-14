#!/bin/zsh

# Put the resolved path of a file `touch` just created (or updated) on the
# clipboard and report it the way clipsend does. Called by the touch alias.
__touch_copy() {
  local out="${1:A}"
  if ! printf '%s' "$out" | /usr/bin/pbcopy; then
    printf '%s\n' "$out"
    echo '❌ File touched, but its path could not be copied to the clipboard' >&2
    return 1
  fi
  printf '%s\n' "$out"
  echo '✅ File path copied to clipboard'
}
