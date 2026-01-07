# Copiers are quick commands to send predefined strings to the clipboard. Useful
# when working on remote servers, or when my dotfiles are unavailable.


__ () {
  # Lists all copier functions in this file
  declare -F | awk '{print $3}' | grep '^_' | grep -v '^__$'
}

_rs () { printf "Hill world" | /usr/bin/pbcopy ;}
