#!/bin/sh
# Resolve a binary NAME to an absolute path.
#
# Why this exists: GUI-launched apps (Claude desktop, and every MCP server it
# spawns) do not read ~/.zshenv, so they inherit a minimal PATH. A bare `npx` in
# an MCP launcher resolves fine in a terminal and not at all from the Dock. Every
# launcher therefore resolves its interpreter through here instead of trusting PATH.
#
# Sourced by:
#   - src/functions/binaries.sh   (interactive zsh)
#   - src/mcps/*                  (bash MCP launchers)
# Or run directly:
#   src/lib/resolve-binary.sh npx
#
# Contract, per binary NAME:
#   1. An explicit <NAME>_PATH override wins and is TRUSTED — never probed.
#      Deliberate: an override is a human saying "use exactly this". See
#      src/exports/binaries.sh for the ones we set.
#   2. Otherwise walk BINARY_SEARCH_DIRS in order and take the first candidate
#      that both exists and is executable.
#   3. Otherwise fall back to whatever PATH says, if anything.
#
# POSIX sh on purpose — sourced from bash, zsh and sh alike.

# Idempotent: index.sh globs recursively AND functions/common.sh sources its
# siblings, so this file gets pulled in more than once per shell.
if [ -z "${__RESOLVE_BINARY_LOADED:-}" ]; then
__RESOLVE_BINARY_LOADED=1

# The centralized list. Order is preference order. Add a directory here and
# every caller picks it up — that is the point of the single list.
BINARY_SEARCH_DIRS="\
/opt/homebrew/bin \
/usr/local/bin \
/opt/homebrew/sbin \
/usr/local/sbin \
${HOME}/.local/bin \
${HOME}/.bun/bin \
${HOME}/.volta/bin \
/usr/bin \
/bin \
/usr/sbin \
/sbin"

resolve_binary() {
  _rb_name="$1"

  if [ -z "$_rb_name" ]; then
    echo "resolve_binary: a binary name is required" >&2
    return 2
  fi

  # Name goes into an eval below; allow only characters that can appear in a
  # shell variable name once uppercased.
  case "$_rb_name" in
    *[!A-Za-z0-9_-]*)
      echo "resolve_binary: invalid binary name '$_rb_name'" >&2
      return 2
      ;;
  esac

  # 1. Explicit override, trusted as-is.
  _rb_var="$(printf '%s' "$_rb_name" | tr '[:lower:]-' '[:upper:]_')_PATH"
  eval "_rb_override=\${$_rb_var:-}"
  if [ -n "$_rb_override" ]; then
    printf '%s\n' "$_rb_override"
    unset _rb_name _rb_var _rb_override
    return 0
  fi

  # 2. Probe the centralized list: exists, and is actually executable.
  #
  # Walked with parameter expansion rather than `for dir in $BINARY_SEARCH_DIRS`
  # because zsh does NOT word-split unquoted parameters: that loop runs ONCE with
  # the whole list as a single bogus path, silently skips the probe, and falls
  # through to step 3. It looks like it works right up until step 3 returns
  # something wrong. Expansion below splits identically in sh, bash and zsh.
  _rb_rest="$BINARY_SEARCH_DIRS"
  while [ -n "$_rb_rest" ]; do
    _rb_dir="${_rb_rest%% *}"
    case "$_rb_rest" in
      *" "*) _rb_rest="${_rb_rest#* }" ;;
      *)     _rb_rest="" ;;
    esac
    [ -n "$_rb_dir" ] || continue

    _rb_candidate="$_rb_dir/$_rb_name"
    if [ -f "$_rb_candidate" ] && [ -x "$_rb_candidate" ]; then
      printf '%s\n' "$_rb_candidate"
      unset _rb_name _rb_var _rb_override _rb_dir _rb_candidate _rb_rest
      return 0
    fi
  done

  # 3. Whatever PATH has left, if we are lucky enough to have one.
  #
  # Must be an absolute path: `command -v` reports shell functions and aliases
  # by bare name, and this repo defines a `git` function — returning "git" here
  # would hand the caller something it cannot exec.
  if _rb_candidate="$(command -v "$_rb_name" 2>/dev/null)" && [ -n "$_rb_candidate" ]; then
    case "$_rb_candidate" in
      /*)
        printf '%s\n' "$_rb_candidate"
        unset _rb_name _rb_var _rb_override _rb_dir _rb_candidate _rb_rest
        return 0
        ;;
    esac
  fi

  echo "resolve_binary: '$_rb_name' not found in \$${_rb_var}, BINARY_SEARCH_DIRS, or PATH" >&2
  unset _rb_name _rb_var _rb_override _rb_dir _rb_candidate _rb_rest
  return 1
}

fi

# Executed rather than sourced: resolve the argument and print it.
# The `$#` test matters — zsh sets $0 to the sourced file (bash does not), so
# without it every zsh `source` of this file would run resolve_binary with no
# arguments and print a spurious "a binary name is required".
case "${0##*/}" in
  resolve-binary.sh)
    # An `if` rather than `[ ... ] && ...`: the latter returns 1 when the test
    # fails, which becomes the SOURCED file's exit status and aborts any caller
    # running `set -e` (every launcher in src/mcps/ does).
    if [ "$#" -gt 0 ]; then
      resolve_binary "$@"
    fi
    ;;
esac
