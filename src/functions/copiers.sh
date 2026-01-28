# Copiers are quick commands to send predefined strings to the clipboard. Useful
# when working on remote servers, or when my dotfiles are unavailable.


__ () {
  # Lists all copier functions in this file
  local bold_blue="\033[1;34m"
  local faded_blue="\033[2;34m"
  local reset="\033[0m"
  
  printf "\nCOPIERS\n${bold_blue}_rs${reset}:\n${faded_blue}alias rs='DISABLE_SPRING=1 bin/rspec${reset}\n${bold_blue}_cache${reset}:\n${faded_blue}/Library/Caches/nexrender/versions/vast-enhanced-monolith/AE25/v1.2${reset}\n${bold_blue}_mig${reset}:\n${faded_blue}puts ['...', *ActiveRecord::SchemaMigration...].join(\"\\\\n\")${reset}\n\n"
}

_rs () { printf "alias rs='DISABLE_SPRING=1 bin/rspec'" | /usr/bin/pbcopy ;}
_cache () { printf "/Library/Caches/nexrender/versions/vast-enhanced-monolith/AE25/v1.2" | /usr/bin/pbcopy ;}
_mig () { printf "puts ['...', *ActiveRecord::SchemaMigration.order(version: :desc).limit(5).pluck(:version).reverse].join(\"\\\n\")" | /usr/bin/pbcopy ;}

_glob () {
  case "$1" in
    a|app)
      printf '*.{arm,axlsx,conf,css,default,erb,jbuilder,js,json,jsx,lock,md,rb,ru,scss,sh,template,txt}' | /usr/bin/pbcopy
      ;;
    c|client)
      printf '*.{js,json,md,scss,ts,tsx}' | /usr/bin/pbcopy
      ;;
    *)
      echo "Usage: _glob [app|a|client|c]" >&2
      ;;
  esac
}

lll() {
  local script_path="${(%):-%x}"
  python3 "${DOTFILES_DIR}/src/python/ls_copiers.py" "${script_path}"
}
puts ['...', *ActiveRecord::SchemaMigration.order(version: :desc).limit(5).pluck(:version).reverse].join("\n")