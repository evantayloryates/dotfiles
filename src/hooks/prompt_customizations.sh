red() {
  echo "%B%F{red}$1%b%f"
}
blue() {
  echo "%B%F{red}$1%b%f"
}

darkgray() {
  echo "%B%F{236}$1%b%f"
}

pretty_date() {
  local current_time=$(TZ='America/New_York' date +%-I:%M%p)
  current_time=$(echo "$current_time" | awk '{print substr($0, 1, length($0)-2) tolower(substr($0, length($0)-1, 2))}')
  current_time=$(echo "$current_time" | awk '{print substr($0, 1, length($0)-1)}')

  local am_pm_char=$(echo "$current_time" | awk '{print substr($0, length($0))}')

  local prefix_time=$(echo "$current_time" | awk '{print substr($0, 1, index($0, ":") - 1)}')  
  local suffix_time=$(echo "$current_time" | awk '{print substr($0, index($0, ":") + 1, length($0) - index($0, ":"))}')
  suffix_time=$(echo "$suffix_time" | awk '{print substr($0, 1, length($0)-1)}')

  # Prefix single-digit hours with dark gray 0
  local colored_prefix
  if [[ ${#prefix_time} -eq 1 ]]; then
    colored_prefix="$(darkgray "0")$(red "$prefix_time")"
  else
    colored_prefix=$(red "$prefix_time")
  fi
  
  local colored_suffix=$(red "$suffix_time")

  current_time="${colored_prefix}:%B%F{white}%b%f${colored_suffix}%F{white}${am_pm_char}%f"

  echo "$current_time"
}


precmd() {
  PS1="$(pretty_date) | %F{cyan}%B%n%b%f:%F{magenta}%B%d%b%f "
}