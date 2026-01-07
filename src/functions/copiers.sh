# Copiers are quick commands to send predefined strings to the clipboard. Useful
# when working on remote servers, or when my dotfiles are unavailable.


__ () {
  # Lists all copier functions in this file
  local bold_blue="\033[1;34m"
  local faded_blue="\033[2;34m"
  local reset="\033[0m"
  
  printf "${bold_blue}_rs${reset}:\n\n${faded_blue}Hill world${reset}\n\n"
}

_rs () { printf "Hill world" | /usr/bin/pbcopy ;}
