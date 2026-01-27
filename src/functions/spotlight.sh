list_spotlight() {
  sudo /usr/libexec/PlistBuddy -c "Print :Exclusions" /System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist 2>/dev/null \
    | grep "^    " \
    | sed 's/^    //' \
    | sort
}


spotlight_select_action () {
  echo "spotlight_select_action"
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