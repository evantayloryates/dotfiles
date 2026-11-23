#!/bin/bash
# Launches the classifier exactly as the ZDR harness does and records the
# proof with the commit it ran: the harness's own isolated_env (from
# <root>/apps/zdr-agent/bin/zdr-harness, secrets replaced by dummies; the
# classifier reads its key itself), cwd ~/.zdr-harness/work, command =
# $ZDR_HARNESS_CLASSIFIER_MCP (opencode.json mcp.classifier, no extra env),
# after the harness's own check_classifier_registration.
#
#   mcps/bulk-classify/test/release/harness-proof.sh [route|texts '<json>'|record <out.md>]
#
# ROOT defaults to the checkout this script sits in, so the copy in the
# installed master checkout proves the installed path. Only deviation from
# the harness start: CLASSIFIER_RETENTION_DAYS=36500, so the start prunes
# nothing in the real
# store. Synthetic text only. Never zdr_ask, never exports.
set -euo pipefail
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)}"
ROOT="$(cd "$ROOT" && pwd -P)"
ZH="${HOME}/.zdr-harness"
PROJECT_DIR="${ROOT}/apps/zdr-agent"
CONFIG_FILE="${PROJECT_DIR}/opencode/opencode.json"
GLOBAL_CONFIG_DIR="${ZH}/xdg/config/opencode"
CLASSIFIER_MCP="${PROJECT_DIR}/../../mcps/bulk-classify/src/launch"
KICKOFF_OPENAI_ZDR_API_KEY=dummy ZDR_HARNESS_PASSWORD=dummy KICKOFF_BUGSNAG_TOKEN=dummy KICKOFF_POSTHOG_TOKEN=dummy
die() { printf 'harness-proof: %s\n' "$*" >&2; exit 1; }
eval "$(sed -n '/^isolated_env() {/,/^}/p' "${PROJECT_DIR}/bin/zdr-harness")"
eval "$(sed -n '/^check_classifier_registration() {/,/^}/p' "${PROJECT_DIR}/bin/zdr-harness")"
. "${ROOT}/src/lib/resolve-binary.sh"
NODE="$(resolve_binary node)"
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
route() { (cd "${ZH}/work" && isolated_env /bin/bash -c 'exec env CLASSIFIER_RETENTION_DAYS=36500 "$ZDR_HARNESS_CLASSIFIER_MCP" cli route --json'); }
texts() { (cd "${ZH}/work" && isolated_env "$NODE" "$TOOLS/mcp-call.mjs" classify_texts "$1" -- /bin/bash -c 'exec env CLASSIFIER_RETENTION_DAYS=36500 "$ZDR_HARNESS_CLASSIFIER_MCP"'); }
case "${1:-route}" in
  route) route ;;
  texts) texts "$2" ;;
  record)
    out="$2"
    {
      echo "# ZDR harness launch proof"
      echo
      echo "- when: $(date -u +%FT%TZ)"
      echo "- checkout: ${ROOT}"
      echo "- commit: $(git -C "$ROOT" rev-parse HEAD) ($(git -C "$ROOT" rev-parse --abbrev-ref HEAD)); classifier and harness files clean: $(git -C "$ROOT" status --porcelain -- mcps/bulk-classify apps/zdr-agent/bin apps/zdr-agent/opencode apps/zdr-agent/mcps | grep -q . && echo NO || echo yes)"
      echo "- launcher: $(cd "$(dirname "$CLASSIFIER_MCP")" && pwd -P)/launch"
      check_classifier_registration && echo "- harness registration check: passed"
      echo
      echo '## cli route --json'
      route | /usr/bin/python3 -c "import json,sys;d=json.load(sys.stdin);print(json.dumps({k:d[k] for k in ['scope','route','engine','phi','codes']}))"
      echo
      echo '## classify_texts (synthetic)'
      since="$(date -u +%FT%T)"
      texts '{"labels":["billing","scheduling"],"items":["refund my last invoice please","push our call to next week"]}' 2>&1 | tail -4
      echo
      echo '## audit line (this call: kind texts, 2 items, after the call started)'
      # The audit file is shared with real harness jobs: pick this call's own
      # line, never just the last one.
      /usr/bin/python3 -I -c 'import json,sys
since=sys.argv[2]; hit=None
for l in open(sys.argv[1]):
    try: a=json.loads(l)
    except Exception: continue
    if a.get("kind")=="texts" and a.get("items")==2 and a.get("at","")[:19]>=since: hit=l.strip()
print(hit or "NO AUDIT LINE FOR THIS CALL")' "${ZH}/classifier/audit.jsonl" "$since"
    } > "$out"
    cat "$out"
    ;;
esac
