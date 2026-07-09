#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOGGLE_FILE="$SCRIPT_DIR/.onsave-toggle"
USAGE_COMMENT="# first non-hash prefixed line that contains on or off will be used. if valid line is missing, or file is missing script should idempotently instantiate and append 2 lines: 1) first, a comment with # prefix saying how to use the config and 2) the ON line"

# Returns 0 if onsave should run (ON / just instantiated), 1 if it should no-op (OFF).
read_onsave_toggle() {
  if [[ ! -f "$TOGGLE_FILE" ]]; then
    printf '%s\nON\n' "$USAGE_COMMENT" > "$TOGGLE_FILE"
    return 0
  fi

  local state=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip hash-prefixed lines (leading whitespace allowed).
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    local lower
    lower=$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')

    # Prefer OFF when both appear; match as whole tokens so "only" ≠ ON.
    if [[ "$lower" =~ (^|[^a-z0-9_])off([^a-z0-9_]|$) ]]; then
      state="off"
      break
    fi
    if [[ "$lower" =~ (^|[^a-z0-9_])on([^a-z0-9_]|$) ]]; then
      state="on"
      break
    fi
  done < "$TOGGLE_FILE"

  if [[ -z "$state" ]]; then
    printf '%s\nON\n' "$USAGE_COMMENT" >> "$TOGGLE_FILE"
    return 0
  fi

  [[ "$state" == "on" ]]
}

if ! read_onsave_toggle; then
  echo "Auto-commit is disabled via .onsave-toggle file"
  exit 0
fi

# Format: MM/DD H:MM.SSam/pm (America/New_York handles EST/EDT automatically)
TIMESTAMP=$(TZ='America/New_York' date "+%m/%d %-I:%M.%S%p")

CHANGES_PUSHED=0

git add . > /dev/null 2>&1

if git commit -m "$TIMESTAMP" > /dev/null 2>&1; then
  git push > /dev/null 2>&1
  CHANGES_PUSHED=1
fi

if [ $CHANGES_PUSHED -eq 1 ]; then
  echo "Pushed commit: $TIMESTAMP"
fi
