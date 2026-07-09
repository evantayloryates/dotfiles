#!/bin/zsh
# Git branch history — central precmd hook.
# Near-free outside git repos; touch blocking in-shell; indexer backgrounded.

_gbh_hook() {
  # Fast bail: not in a git work tree.
  _gbh_likely_in_git_repo || return 0

  local root repo_dir
  root=$(_gbh_repo_root) || return 0
  [[ -n "$root" ]] || return 0

  repo_dir=$(_gbh_ensure_repo_store "$root") || return 0
  _gbh_record_touch "$root" "$repo_dir" || true
  _gbh_kick_indexer "$root" "$repo_dir"
}

# Register without clobbering existing precmd hooks (clipboard, prompt, etc.).
autoload -Uz add-zsh-hook 2>/dev/null
if typeset -f add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook precmd _gbh_hook
else
  # Fallback: chain if a precmd already exists.
  if typeset -f precmd >/dev/null 2>&1; then
    functions -c precmd _gbh_precmd_prev
    precmd() {
      _gbh_precmd_prev "$@"
      _gbh_hook
    }
  else
    precmd() { _gbh_hook; }
  fi
fi
