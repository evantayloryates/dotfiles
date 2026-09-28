#!/bin/zsh

# Evaluate clipboard text locally and write reports to ~/Desktop/clipcheck-*/.
clipcheck() {
  local repo="${CLIPCHECK_REPO:-$HOME/src/playgrounds/fast-detect-gpt}"
  local runner="${DOTFILES_DIR:-$HOME/dotfiles}/src/python/clipcheck.py"
  if [[ ! -x "$repo/.venv/bin/python" || ! -f "$runner" ]]; then
    print -u2 'clipcheck: runtime missing; see dotfiles/docs/clipcheck.md for setup.'
    return 1
  fi
  "$repo/.venv/bin/python" "$runner" --repo "$repo" "$@"
}
