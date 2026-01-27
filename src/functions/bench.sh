#!/bin/zsh

# bench - Time any command and log milliseconds elapsed
# Usage: bench <command> [args...]
bench() {
  local start end rounded

  # --- truecolor helpers ---------------------------------------------------
  fg_rgb() { # r g b
    printf '\033[38;2;%d;%d;%dm' "$1" "$2" "$3"
  }

  local reset='\033[0m'

  # --- colors --------------------------------------------------------------
  # Reds / others can stay basic ANSI
  local red='\033[31m'
  local yellow='\033[33m'
  local blue='\033[34m'
  local magenta='\033[35m'
  local cyan='\033[36m'
  local white='\033[37m'

  # Two *visibly distinct* greens (truecolor, no conditionals)
  local green="$(fg_rgb 0 180 0)"        # darker green
  local green_bright="$(fg_rgb 0 255 160)" # bright mint-green

  # Result mapping
  local result_prefix_color="${red}"
  local result_color="${green}"
  local result_ms_color="${green_bright}"

  # -------------------------------------------------------------------------

  # Get start time in seconds (with decimal precision)
  start=$(python3 -c 'import time; print(time.time())')

  # Execute the command with all arguments
  "$@"
  local exit_code=$?

  # Get end time and calculate rounded milliseconds
  rounded=$(python3 -c "
import time
elapsed = (time.time() - $start) * 1000
if elapsed < 5:
    print(round(elapsed, 1))
else:
    print(round(elapsed))
")

  echo
  echo "${result_prefix_color} ↳ ${result_ms_color}${rounded}ms${reset}"

  return $exit_code
}

b () {
  bench "$@"
}
