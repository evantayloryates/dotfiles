#!/bin/zsh

# bench - Time any command and log milliseconds elapsed
# Usage: bench <command> [args...]
bench() {
  local start end rounded
  
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
  echo " ↳ ⏱️  ${rounded}ms"
  
  return $exit_code
}

