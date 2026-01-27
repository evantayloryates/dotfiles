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
  echo '1) list'
  echo '2) clean'
  echo '3) add'
  printf 'Select action: '

  read -r choice

  case "$choice" in
    1)
      spotlight_list_exclusions
      ;;
    2)
      spotlight_clean_exclusions
      ;;
    3)
      spotlight_add_exclusions
      ;;
    *)
      return 0
      ;;
  esac
}
