# Copiers are quick commands to send predefined strings to the clipboard. Useful
# when working on remote servers, or when my dotfiles are unavailable.


__ () {
  # Lists all copier functions in this file
  # List copier functions (starting with _), excluding __, and log function and value sorted alphabetically
  for fn in $(declare -F | awk '{print $3}' | grep '^_' | grep -v '^__$' | sort); do
    # get string to be copied by capturing the command before /usr/bin/pbcopy
    body="$(declare -f "$fn" | grep -v '^}' | grep 'pbcopy' | sed -nE "s/.*printf[[:space:]]+['\"]([^'\"]*)['\"].*/\1/p")"
    printf "%s:\n\n%s\n\n" "$fn" "${body:-<could not determine value>}"
  done
}

_rs () { printf "Hill world" | /usr/bin/pbcopy ;}
