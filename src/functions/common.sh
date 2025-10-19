#!/bin/zsh

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $SCRIPT_DIR/build_pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi





reload() {
  # Capture current environment before sourcing
  local _env_before _aliases_before _funcs_before
  _env_before=$(mktemp)
  _aliases_before=$(mktemp)
  _funcs_before=$(mktemp)
  
  # Snapshot existing state
  alias >"$_aliases_before"
  compgen -A function >"$_funcs_before"
  env | sort >"$_env_before"

  # Source a clean subshell's environment
  local _env_after _aliases_after _funcs_after
  _env_after=$(mktemp)
  _aliases_after=$(mktemp)
  _funcs_after=$(mktemp)
  
  bash -i -c '
    alias
    compgen -A function
    env | sort
  ' > >(tee "$_aliases_after" "$_funcs_after" "$_env_after" >/dev/null) 2>/dev/null
  
  # Unset all functions that weren't originally in the fresh shell
  while read -r f; do
    if ! grep -q "^$f\$" "$_funcs_after"; then
      unset -f "$f"
    fi
  done <"$_funcs_before"
  
  # Unalias everything that wasn’t in the clean shell
  while read -r a; do
    local name=${a%%=*}
    if ! grep -q "^alias $name=" "$_aliases_after"; then
      unalias "$name" 2>/dev/null
    fi
  done <"$_aliases_before"
  
  # Unset environment vars not present in fresh shell
  while read -r line; do
    local var=${line%%=*}
    if ! grep -q "^$var=" "$_env_after"; then
      unset "$var" 2>/dev/null
    fi
  done <"$_env_before"

  # Clean up temp files
  rm -f "$_env_before" "$_aliases_before" "$_funcs_before" \
        "$_env_after" "$_aliases_after" "$_funcs_after"

  # Finally, re-source your rc file
  source ~/.bashrc
  echo "Shell reloaded cleanly."
}