function red() {
  echo "%B%F{red}$1%b%f"
}
function blue() {
  echo "%B%F{red}$1%b%f"
}

function darkgray() {
  echo "%B%F{8}$1%b%f"
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

  local colored_prefix=$(dark_gray "$prefix_time")
  local colored_suffix=$(red "$suffix_time")

  current_time="${colored_prefix}:%B%F{white}%b%f${colored_suffix}%F{white}${am_pm_char}%f"

  echo "$current_time"
}

export PS1="$(pretty_date) | %F{cyan}%B%n%b%f:%F{magenta}%B%d%b%f "
export TZ='America/New_York'