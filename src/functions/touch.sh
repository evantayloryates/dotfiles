#!/bin/zsh

# Put the resolved path of a file or directory on the clipboard after a
# successful interactive `touch` or `mkdir` call.
__copy_created_path() {
  local out="${1:A}"
  local kind="$2"
  local action="${3:-created}"
  if ! printf '%s' "$out" | /usr/bin/pbcopy; then
    printf '%s\n' "$out"
    echo "❌ $kind $action, but its path could not be copied to the clipboard" >&2
    return 1
  fi
  printf '%s\n' "$out"
  echo "✅ $kind path copied to clipboard"
}
