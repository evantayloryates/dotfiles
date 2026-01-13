# Copiers are quick commands to send predefined strings to the clipboard. Useful
# when working on remote servers, or when my dotfiles are unavailable.


__ () {
  # Lists all copier functions in this file
  local bold_blue="\033[1;34m"
  local faded_blue="\033[2;34m"
  local reset="\033[0m"
  
  printf "\nCOPIERS\n${bold_blue}_rs${reset}:\n${faded_blue}Hill world${reset}\n${bold_blue}_cache${reset}:\n${faded_blue}/Library/Caches/nexrender/versions/vast-enhanced-monolith/AE25/v1.2${reset}\n\n"
}

_rs () { printf "alias rs='DISABLE_SPRING=1 bin/rspec'" | /usr/bin/pbcopy ;}
_cache () { printf "/Library/Caches/nexrender/versions/vast-enhanced-monolith/AE25/v1.2" | /usr/bin/pbcopy ;}
