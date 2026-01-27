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

  local pipe=$'\e[90m'
  local reset=$'\e[0m'

  echo
  printf '1) add       %s|%s %sspot%s %sadd%s\n'  "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sa%s\n'     "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %shush%s\n'  "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sh%s\n'     "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"

  printf '2) clean     %s|%s %sspot%s %sclean%s\n' "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sc%s\n'     "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"

  printf '3) list      %s|%s %sspot%s %slist%s\n' "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sls%s\n'    "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sl%s\n'     "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"

  printf '4) watch     %s|%s %sspot%s %swatch%s\n' "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"
  printf '             %s|%s %sspot%s %sw%s\n'     "$pipe" "$reset" "$primary" "$reset" "$secondary" "$reset"

  echo
  printf 'Selection: '

  read -r choice
  echo

  case "$choice" in
    1) spotlight_add_exclusions ;;
    2) spotlight_clean_exclusions ;;
    3) spotlight_list_exclusions ;;
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
  local target="$RESERVED_SPOTLIGHT_EXCLUSION_DIR/watch.log"
  local cmd='sudo fs_usage -w -f filesys mds mdworker_shared'

  # MAGENTA (match your menu colors)
  local magenta=$'\e[35m'
  local reset=$'\e[0m'

  mkdir -p "$RESERVED_SPOTLIGHT_EXCLUSION_DIR" || return 1

  # clobber at start
  : > "$target" || return 1

  spotlight_watch__cleanup () {
    # copy "$ <cmd>\n<contents>" to clipboard
    {
      printf '$ %s\n' "$cmd"
      cat "$target"
    } | /usr/bin/pbcopy # use full path to bypass alias

    # colors
    local white=$'\e[97m'

    echo
    echo
    printf '%sLogs stored to:%s\n' "$white" "$reset"
    printf '%s  - %s%s\n' "$white" "$target" "$reset"
    printf '%s  - clipboard%s\n' "$white" "$reset"
  }

  trap '
    trap - INT TERM
    spotlight_watch__cleanup
    return 130
  ' INT TERM

  # stream live to stdout while also writing the file
  sudo fs_usage -w -f filesys mds mdworker_shared 2>&1 \
    | tee "$target"
  local rc=${PIPESTATUS[0]}

  trap - INT TERM

  spotlight_watch__cleanup
  return "$rc"
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