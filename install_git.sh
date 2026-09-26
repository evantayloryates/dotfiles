#!/usr/bin/env bash
#
# Global git settings this machine expects. Idempotent: a key is written only
# when its value differs, and nothing else in ~/.gitconfig is touched.
#
# git log: `git log` in a terminal is drawn by
# src/functions/git/git_log_pretty.py, which needs no git config of its own
# (rows come from an explicit --format) and pages through git's pager, `git var
# GIT_PAGER` (less, LESS=FRX). The settings below keep native git log, which
# pipes, scripts and `command git log` still get, on git's defaults:
#   format.pretty, log.date   unset: native git log keeps its medium format
#   pager.log                 unset: native git log still pages
# GIT_PAGER must not be exported by the shell (src/exports) or nothing pages.

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg"
  echo "$msg" >> "$HOME/log.txt"
}

if ! command -v git >/dev/null 2>&1; then
  log "⚠️  git not found — skipping git config"
  exit 0
fi

SETTINGS=(
  "pager.branch=false"   # `git branch` prints straight to the terminal, unpaged
)
for kv in "${SETTINGS[@]}"; do
  key="${kv%%=*}" value="${kv#*=}"
  if [[ "$(git config --global --get "$key")" != "$value" ]]; then
    git config --global "$key" "$value"
    log "🔧 git config --global $key $value"
  fi
done

for key in format.pretty log.date pager.log; do
  if git config --global --get "$key" >/dev/null; then
    log "⚠️  git config --global $key is set; native git log will differ from git's default (see install_git.sh)"
  fi
done
