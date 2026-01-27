#!/bin/zsh

# bench - Time any command and log milliseconds elapsed
# Usage: bench <command> [args...]
bench() {
  local start rounded

  # --- truecolor helper ----------------------------------------------------
  fg_rgb() { # r g b
    printf '\033[38;2;%d;%d;%dm' "$1" "$2" "$3"
  }

  local reset='\033[0m'

  # --- colors --------------------------------------------------------------
  local red='\033[31m'

  # Greens (number darker, unit lighter)
  local green="$(fg_rgb 0 180 0)"       # number
  local green_dark="$(fg_rgb 0 144 0)"       # number
  # local green_light="$(fg_rgb 0 255 160)"    # unit

  local result_prefix_color="${red}"
  local result_number_color="${green}"
  local result_unit_color="${green_dark}"

  # -------------------------------------------------------------------------

  start=$(python3 -c 'import time; print(time.time())')

  "$@"
  local exit_code=$?

  rounded=$(python3 -c "
import time
elapsed = (time.time() - $start) * 1000
if elapsed < 5:
    print(round(elapsed, 1))
else:
    print(round(elapsed))
")

  echo
  echo "${result_prefix_color} ↳ ${result_number_color}${rounded}${result_unit_color}ms${reset}"

  return $exit_code
}

b () {
  bench "$@"
}
