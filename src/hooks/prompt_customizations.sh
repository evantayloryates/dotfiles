
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

# setopt PROMPT_SUBST
export PS1='$(pretty_date) | %F{magenta}%B%d%b%f
'
#        '

# # Custom accept-line widget to combine lines before executing
# function combine-lines-accept-line() {
#   # Move cursor up one line and to the beginning
#   printf '\r\033[1A'

#   # Clear the current line
#   printf '\033[2K'
#   # Print the single-line version with the command (use print -P for zsh prompt codes)
#   if [[ -n "$BUFFER" ]]; then
#     print -n -P "$(pretty_date) | %F{magenta}%B$PWD%b%f $BUFFER"
#   else
#     print -n -P "$(pretty_date) | %F{magenta}%B$PWD%b%f"
#   fi
#   # Move to the second line, clear it, and move cursor to end of first line
#   printf '\n\033[2K\033[1A\033[999C'
#   # Call the original accept-line
#   zle .accept-line
# }

# # Create a zle widget and bind it to Enter
# zle -N accept-line combine-lines-accept-line

export TZ='America/New_York'