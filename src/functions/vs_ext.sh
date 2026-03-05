vsx () {
  vscode_extension "$@"
}

vs_ext () {
  vscode_extension "$@"
}

vscode_extension () {
  local base_dir='/Users/taylor/src/vscode-extensions'
  local name="${1:-}"
  local desc="${2:-Quick copy helper extension}"

  if [[ -z "$name" ]]; then
    echo "usage: vscode_ext <kebab-name> [description]" >&2
    return 2
  fi

  if ! command -v expect >/dev/null 2>&1; then
    echo "missing dependency: expect (macOS: brew install expect)" >&2
    return 1
  fi

  mkdir -p "$base_dir" || return 1

  (
    cd "$base_dir" || exit 1

    expect <<'EXP' "$name" "$desc"
      set name [lindex $argv 0]
      set desc [lindex $argv 1]
      set timeout -1

      spawn yo code

      expect {
        -re "What type of extension do you want to create\\?" { send "\r" } ;# New Extension (TypeScript)
        eof { exit 1 }
      }

      expect {
        -re "What's the name of your extension\\?" { send -- "$name\r" }
        eof { exit 1 }
      }

      expect {
        -re "What's the identifier of your extension\\?" { send -- "$name\r" }
        eof { exit 1 }
      }

      expect {
        -re "What's the description of your extension\\?" { send -- "$desc\r" }
        eof { exit 1 }
      }

      expect {
        -re "Initialize a git repository\\?" { send "n\r" }
        eof { exit 1 }
      }

      expect {
        -re "Which bundler to use\\?" { send "\r" } ;# unbundled
        eof { exit 1 }
      }

      expect {
        -re "Which package manager to use\\?" { send "\r" } ;# yarn
        eof { exit 1 }
      }

      expect {
        -re "Do you want to open the new folder with Visual Studio Code\\?" { send "s\r" } ;# Skip
        eof { exit 1 }
      }

      expect eof
EXP
  )
}