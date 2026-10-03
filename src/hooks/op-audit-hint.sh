#!/bin/zsh
# One-line reminder at the top of every interactive shell: the shared
# 1Password broker keeps an audit log, and op-audit is how to read it.
# Printed only to a terminal, never into scripts, pipes or non-interactive runs.
if [[ -o interactive && -t 1 && "$TERM" != "dumb" ]]; then
  printf '\e[97mRun \e[35mop-audit\e[97m for 1P usage insights\e[0m\n'
fi
