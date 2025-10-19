
function red() {
  echo "%B%F{red}$1%b%f"
}
function blue() {
  echo "%B%F{red}$1%b%f"
}

function pretty_date() {
  local current_time=$(TZ='America/New_York' date +%-I:%M%p)
  current_time=$(echo "$current_time" | awk '{print substr($0, 1, length($0)-2) tolower(substr($0, length($0)-1, 2))}')
  current_time=$(echo "$current_time" | awk '{print substr($0, 1, length($0)-1)}')

  local am_pm_char=$(echo "$current_time" | awk '{print substr($0, length($0))}')

  if [[ ${#current_time} -eq 7 ]]; then
    current_time=" $current_time"
  fi

  local prefix_time=$(echo "$current_time" | awk '{print substr($0, 1, index($0, ":") - 1)}')  
  local suffix_time=$(echo "$current_time" | awk '{print substr($0, index($0, ":") + 1, length($0) - index($0, ":"))}')
  suffix_time=$(echo "$suffix_time" | awk '{print substr($0, 1, length($0)-1)}')

  local colored_prefix=$(red "$prefix_time")
  local colored_suffix=$(red "$suffix_time")

  current_time="${colored_prefix}:%B%F{white}%b%f${colored_suffix}%F{white}${am_pm_char}%f"

  echo "$current_time"
}

setopt PROMPT_SUBST
export PS1='$(pretty_date) | %F{magenta}%B%d%b%f
      | '

# Hook that runs before each command execution
# This moves the command up to the first line for cleaner output
function preexec() {
  # Move cursor up one line, to the end of the first line
  printf '\033[1A\033[999C'
  # Print the command on the same line
  printf " | %s\n" "$1"
}

export TZ='America/New_York'