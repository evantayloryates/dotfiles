#!/bin/zsh

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $SCRIPT_DIR/build_pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi