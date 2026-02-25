# Copiers are quick commands to send predefined strings to the clipboard. 
# Useful when working on remote servers, or when my dotfiles are unavailable.

_rs () { printf "alias rs='DISABLE_SPRING=1 bin/rspec'" | /usr/bin/pbcopy ;}
_cache () { printf "/Library/Caches/nexrender/versions/vast-enhanced-monolith/AE25/v1.2" | /usr/bin/pbcopy ;}
_mig () { printf "puts ['...', *ActiveRecord::SchemaMigration.order(version: :desc).limit(5).pluck(:version).reverse].join(\"\\\n\")" | /usr/bin/pbcopy ;}

_glob__variants() { echo 'app client'; }
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

_ship () {
  local target_id
  local clip
  clip="$(/usr/bin/pbpaste | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ "$clip" =~ ^[0-9]{1,9}$ ]]; then
    target_id="$clip"
  fi
  printf "def ship(cid) = Creative.find(cid).update(account_id: 1, workspace_id: 1801, campaign_id: nil)\nship %s" "${target_id:-}" | /usr/bin/pbcopy
}

_patch () {
  local repo_path="/Users/taylor/src/github/amplify"
  local current_branch diff_output temp_file formatted_output git_cmd
  
  # Get current branch name
  current_branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD)"
  
  # Create temp file for diff output
  temp_file="$(mktemp)"
  
  # Run git diff using three-dot syntax to compare against master
  # This shows only changes unique to current branch, excluding intermediate branches
  git_cmd="git diff master...$current_branch"
  git -C "$repo_path" diff master..."$current_branch" > "$temp_file"
  
  # Read diff content
  diff_output="$(cat "$temp_file")"
  
  # Format the complete string: $ command\n\n<diff content>
  formatted_output="$ git -C $repo_path diff master...$current_branch

$diff_output"
  
  # Copy to clipboard
  printf '%s' "$formatted_output" | /usr/bin/pbcopy
  
  # Print yellow ANSI message
  echo -e "\033[33mPatch file content was stored to clipboard\033[0m"
  
  # Clean up temp file
  rm -f "$temp_file"
}

__() {
  clear;
  local script_path="${(%):-%x}"

  # save current clipboard
  local __clipboard_backup
  __clipboard_backup="$(/usr/bin/pbpaste)"

  # run copier inspection
  python3 "${DOTFILES_DIR}/src/python/ls_copiers.py" "${script_path}"

  # restore clipboard
  printf '%s' "${__clipboard_backup}" | /usr/bin/pbcopy
}
