#!/bin/bash
# The release success check (plan step 3b), one command, from any directory:
#   <checkout>/mcps/bulk-classify/test/release/check.sh <out-dir>
# Runs, against the checkout this script sits in: the harness launch proof
# (registration check, route, a synthetic classify_texts, the audit line),
# the offline suite, the mutation pass, the live Codex isolation check, the
# end-to-end canary (network) and the profile guard (key). Writes one log
# per step and a summary to <out-dir>; exits non-zero if any step failed.
# Start it from a shell whose command line does not name `.zdr-harness` or
# `apps/zdr-agent/` (an ancestor that does trips the process signal for the
# clean-launch tests, by design). Synthetic data only.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SVC="$(cd "${HERE}/../.." && pwd -P)"
ROOT="$(cd "${SVC}/../.." && pwd -P)"
OUT="${1:?usage: check.sh <out-dir>}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd -P)"
. "${ROOT}/src/lib/resolve-binary.sh"
NODE="$(resolve_binary node)"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
fail=0
step() { # name, command...
  local name="$1"; shift
  if (cd "$SVC" && "$@") > "${OUT}/${name}.log" 2>&1; then echo "ok      ${name}"; else echo "FAILED  ${name} (see ${OUT}/${name}.log)"; fail=1; fi
}
{
  echo "release check at ${SHA} (${ROOT}), $(date -u +%FT%TZ)"
  step harness-proof "${HERE}/harness-proof.sh" record "${OUT}/harness-proof.md"
  step unit-suite /bin/sh -c "\"$NODE\" --test test/*.test.mjs"
  step mutants "$NODE" test/mutants.mjs
  step codex-isolation "${HERE}/with-key.sh" "${SVC}/test/codex-isolation.live.mjs"
  step canary "$NODE" test/canary.e2e.mjs
  step guard "${HERE}/with-key.sh" "${SVC}/test/guard.online.mjs"
  grep -q 'harness registration check: passed' "${OUT}/harness-proof.md" || { echo "FAILED  harness-proof content (needs the registration check passed)"; fail=1; }
  # The proof's own audit line, read as JSON: PHI, no Codex of any engine
  # (exec, app-server, either ladder tier), and stage two really ran (PE diff
  # r1 point 2: a vote or cache hit made "no Codex calls" true by construction).
  /usr/bin/python3 -I - "${OUT}/harness-proof.md" <<'PY' || { echo "FAILED  harness-proof audit line (needs phi true, no Codex of any engine, decision_calls >= 1)"; fail=1; }
import json, sys
a = {}
for l in open(sys.argv[1]):
    l = l.strip()
    if l.startswith('{'):
        try:
            d = json.loads(l)
        except ValueError:
            continue
        if d.get('kind') == 'texts':
            a = d
tiers = a.get('tiers') or {}
ok = (a.get('phi') is True and a.get('route') == 'api'
      and a.get('codex_calls', 0) == 0 and a.get('codex_app_calls', 0) == 0 and a.get('codex_app_fallback_items', 0) == 0
      and all((tiers.get(t) or {}).get('items', 0) == 0 for t in ('codex', 'codex_strong'))
      and a.get('decision_calls', 0) >= 1 and (tiers.get('decisions') or {}).get('items', 0) >= 1)
print('harness-proof audit:', json.dumps({k: a.get(k) for k in ('phi', 'route', 'codex_calls', 'codex_app_calls', 'decision_calls', 'chat_calls')}), 'tiers:', json.dumps(tiers))
sys.exit(0 if ok else 1)
PY
  grep -q 'attack blocked 13 / 14  benign wrongly rejected 0 / 12' "${OUT}/guard.log" || { echo "FAILED  guard figures differ from 13/14 blocked and 0/12 rejected (see guard.log; compare with results.md before releasing)"; fail=1; }
  echo "result: $([ $fail = 0 ] && echo PASS || echo FAIL)"
} | tee "${OUT}/summary.txt"
grep -q '^result: PASS' "${OUT}/summary.txt"
