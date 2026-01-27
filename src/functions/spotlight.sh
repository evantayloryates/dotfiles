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
  local PS3='Select action: '
  local options=('list' 'clean' 'add')
  local opt
  local _columns="$COLUMNS"

  COLUMNS=1
  select opt in "${options[@]}"; do
    opt="${opt:-list}"
    echo

    case "$opt" in
      list)  spotlight_list_exclusions ;;
      clean) spotlight_clean_exclusions ;;
      add)   spotlight_add_exclusions ;;
    esac

    break
  done

  COLUMNS="$_columns"
}
