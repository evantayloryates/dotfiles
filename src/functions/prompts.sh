tune() {
  local mode="${1:-}"

  case "$mode" in
    test)
      python3 "$DOTFILES_DIR/src/python/cerebras/test/test.py"
      ;;
    up)
      local subscope="${2:-}"
      local content result exit_code

      content="$(pbpaste)"

      local -a cmd_args=(--scope up --prompt "$content")
      [[ -n "$subscope" ]] && cmd_args+=(--subscope "$subscope")

      result="$(python3 "$DOTFILES_DIR/src/python/cerebras/cerebras.py" "${cmd_args[@]}")"
      exit_code=$?

      if [[ $exit_code -eq 0 && -n "$result" ]]; then
        printf '%s' "$result" | /usr/bin/pbcopy
        echo "tune: success — clipboard updated"
      else
        echo "tune: failed (exit $exit_code)" >&2
        return 1
      fi
      ;;
    *)
      echo "Usage: tune <command> [subscope]" >&2
      echo "  up [subscope]    improve prompt from clipboard (optional subscope)" >&2
      echo "  test             run validation test harness" >&2
      return 1
      ;;
  esac
}
