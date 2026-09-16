#!/bin/zsh
# Trunk branch names — the single source of truth for every git helper that
# needs to recognize or resolve a repo's trunk: `gl` (git_log_local_pretty),
# `gb`/`gbv` (gbs), and rm_branch. Add a trunk name here and all of them follow.

# Preference order: the first name that exists in a repo is its trunk.
typeset -ga GIT_TRUNK_BRANCHES=(master main develop)

# True when $1 is a trunk branch name (exact match, short name).
__git_is_trunk() {
  (( ${GIT_TRUNK_BRANCHES[(Ie)$1]} ))
}

# Print the repo's trunk ref: local branches in preference order, then their
# origin/ counterparts. `--local` skips the remote fallback.
__git_resolve_trunk() {
  local name
  for name in $GIT_TRUNK_BRANCHES; do
    if /usr/bin/git show-ref --verify --quiet "refs/heads/$name" 2>/dev/null; then
      print -r -- "$name"
      return 0
    fi
  done
  [[ "$1" == "--local" ]] && return 1
  for name in $GIT_TRUNK_BRANCHES; do
    if /usr/bin/git show-ref --verify --quiet "refs/remotes/origin/$name" 2>/dev/null; then
      print -r -- "origin/$name"
      return 0
    fi
  done
  return 1
}
