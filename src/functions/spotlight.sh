list_spotlight() {
  sudo /usr/libexec/PlistBuddy -c "Print :Exclusions" /System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist 2>/dev/null \
    | grep "^    " \
    | sed 's/^    //' \
    | sort
}



spotlight_list_exclusions () {
  echo "spotlight_list_exclusions"
}
spotlight_clean_exclusions () {
  echo "spotlight_clean_exclusions"
}
spotlight_add_exclusions () {
  echo "spotlight_add_exclusions"
}

spotlight_select_action () {
  local magenta=$'\e[35m'
  local reset=$'\e[0m'

  echo
  printf '1) list      | %sspot list%s or %sspot ls%s\n' "$magenta" "$reset" "$magenta" "$reset"
  printf '2) clean     | %sspot clean%s\n' "$magenta" "$reset"
  printf '3) add       | %sspot add%s or %sspot hush%s\n' "$magenta" "$reset" "$magenta" "$reset"
  printf 'Select action: '

  read -r choice
  echo

  case "$choice" in
    1) spotlight_list_exclusions ;;
    2) spotlight_clean_exclusions ;;
    3) spotlight_add_exclusions ;;
    *) return 0 ;;
  esac
}
