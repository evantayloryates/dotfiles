#!/bin/zsh

# bench - Time any command and log milliseconds elapsed
# Usage: bench <command> [args...]
bench() {
  local start end rounded
  local green="\033[32m"
  local bold_green="\033[1;32m"
  local red="\033[31m"
  local bold_red="\033[1;31m"
  local yellow="\033[33m"
  local bold_yellow="\033[1;33m"
  local blue="\033[34m"
  local bold_blue="\033[1;34m"
  local magenta="\033[35m"
  local bold_magenta="\033[1;35m"
  local cyan="\033[36m"
  local bold_cyan="\033[1;36m"
  local white="\033[37m"
  local bold_white="\033[1;37m"
  
  local result_color="${green}"
  local result_label_color="${bold_green}"
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
  
  # Log the result
  # echo " ⤷ ⏱️  ${rounded}ms"
  echo
  echo " ↳ ${rounded}ms"
  
  return $exit_code
}

b () {
  bench "$@"
}