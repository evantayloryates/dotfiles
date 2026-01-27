RESERVED_SPOTLIGHT_EXCLUSION_DIR=/Users/taylor/hush-spotlight

spotlight_select_action () {

  # MAGENTA
  local primary=$'\e[35m'
  local secondary=$'\e[95m'

  # BLUE
  # local primary=$'\e[34m'
  # local secondary=$'\e[94m'

  # CYAN
  # local primary=$'\e[36m'
  # local secondary=$'\e[96m'

  # GREEN
  # local primary=$'\e[32m'
  # local secondary=$'\e[92m'

  # RED
  # local primary=$'\e[31m'
  # local secondary=$'\e[91m'

  # YELLOW
  # local primary=$'\e[33m'
  # local secondary=$'\e[93m'

  local reset=$'\e[0m'

  echo
  printf '1) list     | %sspot%s %slist%s\n' "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sls%s\n'   "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sl%s\n'    "$primary" "$reset" "$secondary" "$reset"

  printf '2) clean    | %sspot%s %sclean%s\n' "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sc%s\n'     "$primary" "$reset" "$secondary" "$reset"

  printf '3) add      | %sspot%s %sadd%s\n'  "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sa%s\n'    "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %shush%s\n' "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sh%s\n'    "$primary" "$reset" "$secondary" "$reset"

  printf '4) watch    | %sspot%s %swatch%s\n' "$primary" "$reset" "$secondary" "$reset"
  printf '            | %sspot%s %sw%s\n'     "$primary" "$reset" "$secondary" "$reset"

  echo
  printf 'Selection: '

  read -r choice
  echo

  case "$choice" in
    1) spotlight_list_exclusions ;;
    2) spotlight_clean_exclusions ;;
    3) spotlight_add_exclusions ;;
    4) spotlight_watch_exclusions ;;
    *) return 0 ;;
  esac
}

spotlight_list_exclusions () {
  sudo /usr/libexec/PlistBuddy -c "Print :Exclusions" /System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist 2>/dev/null \
    | grep "^    " \
    | sed 's/^    //' \
    | sort
}

spotlight_watch_exclusions () {
  echo "spotlight_watch_exclusions"
}

spotlight_clean_exclusions() {
  local PLIST="/System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist"
  local count=$(sudo /usr/libexec/PlistBuddy -c "Print :Exclusions" "$PLIST" | grep -c "^    ")
  local removed=0

  for ((i=count-1; i>=0; i--)); do
    entry=$(sudo /usr/libexec/PlistBuddy -c "Print :Exclusions:$i" "$PLIST")
    if [[ "$entry" != "$RESERVED_SPOTLIGHT_EXCLUSION_DIR" ]]; then
      sudo /usr/libexec/PlistBuddy -c "Delete :Exclusions:$i" "$PLIST"
      ((removed++))
    fi
  done

  echo "Removed $removed exclusions (kept: $RESERVED_SPOTLIGHT_EXCLUSION_DIR)"
}

spotlight_add_exclusions() {
  local LIBRARY="$HOME/Library"
  local KEEP_LIBRARY=('Messages' 'Notes')
  local PLIST='/System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist'

  local current
  current=$(sudo /usr/libexec/PlistBuddy -c 'Print :Exclusions' "$PLIST" 2>/dev/null)

  local added=0

  for item in "$HOME"/*; do
    if [[ "$item" != "$LIBRARY" && "$item" != "$RESERVED_SPOTLIGHT_EXCLUSION_DIR" && ! "$current" =~ "$item" ]]; then
      sudo /usr/libexec/PlistBuddy -c "Add :Exclusions: string $item" "$PLIST"
      ((added++))
    fi
  done

  for item in "$HOME"/.*; do
    local basename=$(basename "$item")
    if [[ "$basename" != '.' && "$basename" != '..' && ! "$current" =~ "$item" ]]; then
      sudo /usr/libexec/PlistBuddy -c "Add :Exclusions: string $item" "$PLIST"
      ((added++))
    fi
  done

  for dir in "$LIBRARY"/*/; do
    local dirname=$(basename "$dir")
    if [[ ! " ${KEEP_LIBRARY[*]} " =~ " ${dirname} " && ! "$current" =~ "$dir" ]]; then
      sudo /usr/libexec/PlistBuddy -c "Add :Exclusions: string $dir" "$PLIST"
      ((added++))
    fi
  done

  sudo launchctl stop com.apple.metadata.mds && sudo launchctl start com.apple.metadata.mds
  echo "Done. Added $added new exclusions."
}