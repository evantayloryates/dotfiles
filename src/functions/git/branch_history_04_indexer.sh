#!/bin/zsh
# Git branch history — background last-used indexer.
#
# Additive-only last_used.jsonl. Usage-driven via hook; ~3h cooldown from newest
# successful index_run. Per branch: re-index if missing or newest entry > 2 months old.

_gbh_log() {
  local level="$1"
  shift
  local msg="$*"
  local logf ts
  logf=$(_gbh_log_file)
  /bin/mkdir -p "${logf:h}" 2>/dev/null
  ts=$(_gbh_utc_now)
  print -r -- "$ts [$level] $msg" >> "$logf" 2>/dev/null
}

_gbh_log_ok()  { _gbh_log ok "$*"; }
_gbh_log_err() { _gbh_log error "$*"; }

# Single python pass: print last successful index_run epoch, then branch→epoch map.
# Output format:
#   INDEX_OK\t<epoch>
#   <branch>\t<epoch>
_gbh_index_state() {
  local file="$1"
  _gbh_python - "$file" <<'PY'
import json, sys
from datetime import datetime, timezone

def parse_ts(ts: str):
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            return int(datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
        return int(datetime.fromisoformat(ts).timestamp())
    except Exception:
        return None

path = sys.argv[1]
best_ok = 0
newest = {}
try:
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            t = obj.get("type")
            if t == "index_run" and obj.get("status") == "ok":
                epoch = parse_ts(obj.get("finished_at") or obj.get("ts") or "")
                if epoch and epoch > best_ok:
                    best_ok = epoch
            elif t == "branch_last_used":
                branch = obj.get("branch") or ""
                if not branch:
                    continue
                epoch = parse_ts(obj.get("last_used_at") or obj.get("ts") or "")
                if epoch is None:
                    continue
                if branch not in newest or epoch > newest[branch]:
                    newest[branch] = epoch
except FileNotFoundError:
    pass
print(f"INDEX_OK\t{best_ok}")
for b, e in newest.items():
    print(f"{b}\t{e}")
PY
}

# Estimate last-used for a branch. Returns ISO UTC or empty.
_gbh_estimate_branch_last_used() {
  local root="$1" branch="$2"
  local epoch iso

  epoch=$(/usr/bin/git -C "$root" reflog show "$branch" --date=unix --format='%ct' -n 1 2>/dev/null | /usr/bin/head -n1)
  if [[ -z "$epoch" || ! "$epoch" =~ ^[0-9]+$ ]]; then
    epoch=$(/usr/bin/git -C "$root" --no-pager log -1 --format='%ct' "$branch" -- 2>/dev/null)
  fi
  [[ -n "$epoch" && "$epoch" =~ ^[0-9]+$ ]] || return 1
  iso=$(TZ=UTC /bin/date -u -r "$epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null) || return 1
  printf '%s' "$iso"
}

# Run indexer for one repo. Intended for background; never prints to the tty.
_gbh_run_indexer() {
  local root="$1"
  local repo_dir="$2"
  local last_used_file started finished now last_ok
  local -a branches
  local branch scanned=0 written=0
  local line lu_epoch stale_cut iso state_file

  last_used_file=$(_gbh_last_used_file "$repo_dir")
  now=$(_gbh_epoch_now)

  state_file="${repo_dir}/.index_state.$$"
  _gbh_index_state "$last_used_file" > "$state_file" 2>/dev/null

  typeset -A newest_epochs
  newest_epochs=()
  last_ok=0
  while IFS=$'\t' read -r key val; do
    if [[ "$key" == "INDEX_OK" ]]; then
      last_ok=$val
    elif [[ -n "$key" ]]; then
      newest_epochs[$key]=$val
    fi
  done < "$state_file"
  /bin/rm -f "$state_file"

  if (( last_ok > 0 && (now - last_ok) < GBH_INDEX_COOLDOWN_SECONDS )); then
    _gbh_log_ok "index_skip root=$root reason=cooldown age_s=$((now - last_ok))"
    return 0
  fi

  started=$(_gbh_utc_now)
  line=$(_gbh_json_obj \
    type "index_run" \
    status "running" \
    started_at "$started" \
    ts "$started" \
    source "indexer" \
    repo_root "$root" \
    shell_pid "$$") || return 1
  _gbh_append_jsonl "$last_used_file" "$line"

  stale_cut=$(( now - GBH_REINDEX_STALE_SECONDS ))
  branches=($(/usr/bin/git -C "$root" --no-pager branch --format='%(refname:short)' 2>/dev/null))

  for branch in "${branches[@]}"; do
    (( scanned++ ))
    lu_epoch="${newest_epochs[$branch]:-0}"
    if (( lu_epoch > 0 && lu_epoch >= stale_cut )); then
      continue
    fi
    iso=$(_gbh_estimate_branch_last_used "$root" "$branch") || continue
    line=$(_gbh_json_obj \
      type "branch_last_used" \
      branch "$branch" \
      last_used_at "$iso" \
      indexed_at "$(_gbh_utc_now)" \
      ts "$(_gbh_utc_now)" \
      method "reflog_or_commit" \
      confidence "medium" \
      source "indexer" \
      source_ref "$branch" \
      repo_root "$root" \
      shell_pid "$$") || continue
    _gbh_append_jsonl "$last_used_file" "$line"
    (( written++ ))
  done

  finished=$(_gbh_utc_now)
  line=$(_gbh_json_obj \
    type "index_run" \
    status "ok" \
    started_at "$started" \
    finished_at "$finished" \
    ts "$finished" \
    branches_scanned! "$scanned" \
    branches_written! "$written" \
    source "indexer" \
    repo_root "$root" \
    shell_pid "$$") || return 1
  _gbh_append_jsonl "$last_used_file" "$line"
  _gbh_log_ok "index_ok root=$root scanned=$scanned written=$written"
}

# Kick indexer in background. Never blocks the interactive shell meaningfully.
_gbh_kick_indexer() {
  local root="$1"
  local repo_dir="$2"
  (
    _gbh_run_indexer "$root" "$repo_dir" >/dev/null 2>&1 || \
      _gbh_log_err "index_fail root=$root exit=$?"
  ) &!
}
