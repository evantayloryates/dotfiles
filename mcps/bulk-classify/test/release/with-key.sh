#!/bin/bash
# Runs a node script with the classifier's key and nothing else, the way the
# launcher starts node: the key is read by name from this checkout's
# apps/zdr-agent/.env (else ~/.zdr-harness/.env), never printed; job and
# profile stores are a fresh temp dir, removed afterwards.
#   mcps/bulk-classify/test/release/with-key.sh <script.mjs> [args...]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "${HERE}/../../../.." && pwd -P)"
. "${ROOT}/src/lib/read-env.sh"
. "${ROOT}/src/lib/resolve-binary.sh"
ENV_FILE="${ROOT}/apps/zdr-agent/.env"
[[ -f "$ENV_FILE" ]] || ENV_FILE="${HOME}/.zdr-harness/.env"
KEY="$(ENV_FILE="$ENV_FILE" env_get KICKOFF_OPENAI_ZDR_API_KEY)" || { echo "with-key: KICKOFF_OPENAI_ZDR_API_KEY missing" >&2; exit 1; }
NODE="$(resolve_binary node)"
script="$1"; shift
script="$(cd "$(dirname "$script")" && pwd -P)/$(basename "$script")"
S="$(mktemp -d "${TMPDIR:-/tmp}/classifier-withkey-XXXXXX")"
trap 'rm -rf "$S"' EXIT
mkdir -p "$S/jobs" "$S/profiles"
cd "$S"
status=0
env -i HOME="$HOME" PATH=/usr/bin:/bin TMPDIR="$S" LANG=en_US.UTF-8 CLASSIFIER_OPENAI_KEY="$KEY" CLASSIFIER_JOBS_DIR="$S/jobs" CLASSIFIER_PROFILES_DIR="$S/profiles" "$NODE" --no-warnings "$script" "$@" || status=$?
exit "$status"
