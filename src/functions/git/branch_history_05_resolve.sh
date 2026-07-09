#!/bin/zsh
# Effective last-used resolution for git branch history consumers.
# Priority: newest touch entry → newest branch_last_used → missing.

# Print: branch<TAB>epoch for every branch with history. One python pass.
_gbh_effective_last_used_map() {
  local touches_file="$1"
  local last_used_file="$2"
  _gbh_python - "$touches_file" "$last_used_file" <<'PY'
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

def load_newest(path, type_filter=None, ts_keys=("ts",)):
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
                if type_filter is not None and obj.get("type") not in type_filter:
                    continue
                branch = obj.get("branch") or ""
                if not branch:
                    continue
                ts = ""
                for k in ts_keys:
                    if obj.get(k):
                        ts = obj[k]
                        break
                epoch = parse_ts(ts)
                if epoch is None:
                    continue
                if branch not in newest or epoch > newest[branch]:
                    newest[branch] = epoch
    except FileNotFoundError:
        pass
    return newest

touches = load_newest(sys.argv[1], type_filter={"start", "latest", "final"}, ts_keys=("ts",))
last_used = load_newest(sys.argv[2], type_filter={"branch_last_used"}, ts_keys=("last_used_at", "ts"))
branches = set(touches) | set(last_used)
for b in sorted(branches):
    if b in touches:
        print(f"{b}\t{touches[b]}")
    else:
        print(f"{b}\t{last_used[b]}")
PY
}
