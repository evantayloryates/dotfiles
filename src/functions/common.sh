#!/bin/zsh


CONFIG='[
  {
    "slug": "amp",
    "path": "/Users/taylor/src/github/amplify",
    "default": "cd",
    "commands": {
      "ls": "ls -AGhlo <path> | grep"
    }
  }
]'

build_path_functions() {
  local config_json="$1"
  local count
  count=$(echo "$config_json" | jq 'length')

  for i in $(seq 0 $((count - 1))); do
    local slug path default_command
    slug=$(echo "$config_json" | jq -r ".[$i].slug")
    path=$(echo "$config_json" | jq -r ".[$i].path")
    default_command=$(echo "$config_json" | jq -r ".[$i].default")

    eval "
${slug}() {
  local subcmd=\"\$1\"
  shift || true

  case \"\$subcmd\" in
$(echo "$config_json" | jq -r ".[$i].commands | to_entries[] | \"    \(.key))\\n      \(.value | gsub(\"<path>\"; \"$path\")) \\\"\\\$@\\\"\\n      ;;\"")
    *)
      if [[ -z \"\$subcmd\" ]]; then
        $default_command \"$path\"
      else
        $subcmd \"$path\" \"\$@\"
      fi
      ;;
  esac
}
"
  done
}

build_path_functions "$CONFIG"