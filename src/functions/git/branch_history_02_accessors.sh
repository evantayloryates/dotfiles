#!/bin/zsh
# Git branch history — idempotent accessors (self-seeding).

# Ensure data root + repo subtree + JSONL files exist. Safe to call repeatedly.
_gbh_ensure_repo_store() {
  local root="$1"
  local repo_dir touches last_used logs_dir origin logf
  [[ -n "$root" ]] || return 1
  : "${DOTFILES_DATA_DIR:=${DOTFILES_DIR:-$HOME/dotfiles}/data}"

  /bin/mkdir -p "$DOTFILES_DATA_DIR" || return 1
  repo_dir=$(_gbh_repo_data_dir "$root") || return 1
  /bin/mkdir -p "$repo_dir" || return 1

  touches=$(_gbh_touches_file "$repo_dir")
  last_used=$(_gbh_last_used_file "$repo_dir")
  [[ -f "$touches" ]] || : > "$touches"
  [[ -f "$last_used" ]] || : > "$last_used"

  # Sidecar for human debugging / future reverse lookup (not required by readers).
  origin="$repo_dir/repo_root.txt"
  if [[ ! -f "$origin" ]] || [[ "$(<"$origin")" != "$root" ]]; then
    printf '%s\n' "$root" > "$origin"
  fi

  logs_dir="$DOTFILES_DATA_DIR/logs"
  /bin/mkdir -p "$logs_dir" || return 1
  logf=$(_gbh_log_file)
  [[ -f "$logf" ]] || : > "$logf"

  printf '%s' "$repo_dir"
}

# Append one JSONL line (newline-terminated). Creates parent store if needed.
_gbh_append_jsonl() {
  local file="$1"
  local line="$2"
  [[ -n "$file" && -n "$line" ]] || return 1
  /bin/mkdir -p "${file:h}" || return 1
  [[ -f "$file" ]] || : > "$file"
  print -r -- "$line" >> "$file"
}

# Replace the last line of a JSONL file in place (for updating `latest` touches).
_gbh_replace_last_line() {
  local file="$1"
  local line="$2"
  local tmp
  [[ -n "$file" && -n "$line" ]] || return 1
  /bin/mkdir -p "${file:h}" || return 1
  if [[ ! -s "$file" ]]; then
    print -r -- "$line" > "$file"
    return 0
  fi
  tmp="${file}.tmp.$$"
  /usr/bin/sed '$d' "$file" > "$tmp" || { /bin/rm -f "$tmp"; return 1; }
  print -r -- "$line" >> "$tmp" || { /bin/rm -f "$tmp"; return 1; }
  /bin/mv -f "$tmp" "$file"
}

_gbh_read_last_line() {
  local file="$1"
  [[ -s "$file" ]] || return 1
  /usr/bin/tail -n 1 "$file"
}

# Escape a string for JSON (hot-path; no python).
_gbh_json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# Best-effort extract of a string field from our own JSONL lines (hot path).
_gbh_json_str_field() {
  local line="$1" field="$2"
  if [[ "$line" =~ "\"${field}\":\"([^\"]*)\"" ]]; then
    print -r -- "$match[1]"
    return 0
  fi
  return 1
}

# Build a JSON object via python (safe escaping). Args: key value key value...
# Values are strings unless a key ends with '!' (then raw JSON token, key without !).
_gbh_python() {
  local py="${DOTFILES_PY_VENV_DIR:-$HOME/.venvs/dotfiles}/bin/python"
  if [[ -x "$py" ]]; then
    "$py" "$@"
  else
    /usr/bin/env python3 "$@"
  fi
}

_gbh_json_obj() {
  _gbh_python - "$GBH_SCHEMA_VERSION" "$@" <<'PY'
import json, sys
schema = int(sys.argv[1])
args = sys.argv[2:]
obj = {"schema_version": schema}
i = 0
while i < len(args):
    key = args[i]
    val = args[i + 1] if i + 1 < len(args) else ""
    i += 2
    if key.endswith("!"):
        obj[key[:-1]] = json.loads(val)
    else:
        obj[key] = val
print(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
PY
}

_gbh_json_field() {
  local line="$1" field="$2"
  _gbh_json_str_field "$line" "$field" && return 0
  _gbh_python -c 'import json,sys; o=json.loads(sys.argv[1]); v=o.get(sys.argv[2],""); print("" if v is None else v if isinstance(v,str) else json.dumps(v,separators=(",",":")))' \
    "$line" "$field" 2>/dev/null
}
