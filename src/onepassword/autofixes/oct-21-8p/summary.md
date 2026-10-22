# ⚙️ fix-1p-broker/oct-21-8p

Both accounts recovered; no broker repair needed

Outcome: no_change. Created: 2026-10-22T00:44:34.314Z (America/New_York).

## What happened

Both accounts returned generic CLI errors during three scheduled rounds at 20:44, 20:51 and 20:58 Eastern on October 21. Each passed an independent metadata-only check. The scheduled 21:05 round then succeeded for both accounts and cleared the fault episode.

## Cause

The original trigger is unknown: retained metadata reports exit 1 and generic error, not an authorization timeout. This does not establish authorization expiry, a network fault or a broker crash. Parser/watchdog checks independently verified an unlocked app, matching deployed code and signature, and a progressing heartbeat. The initial alert contained a mixed snapshot because it was saved between account checks.

## Resolution

No software defect requiring a change was established. Both accounts recovered without a patch, restart, installation or agent-requested auth wake. No candidate or staged implementation is needed; no permissions or native consent were changed.

## Verification

81 targeted synthetic tests passed: 31 keepalive/recovery/activation/guidance, 13 isolated broker and 37 Node incident/dispatch/archive tests. Version-only and single vault-list metadata checks for both accounts exited 0; stdout was discarded and no raw stderr was retained. Deployed worker and keepalive hashes, running keepalive hash, build stamp and app signature matched. Timestamped parser output matched stored state. Final readback at 21:06 Eastern verified last successes at 21:05:51/52, null fault episode, heartbeat age 8 seconds, broker PID 1213, PTY /dev/ttys000 and keepalive PID 1214 unchanged. Native metadata verified the exact title, dotfiles cwd, Pinned section and strongest advertised model gpt-6-astra at high reasoning.

## Service state and next load

The existing broker and keepalive remain running unchanged. Nothing is staged and no activation command or service restart is required. Normal keepalive scheduling continues.

## Limits and remaining action

The exact cause of the earlier generic errors cannot be recovered from the retained diagnostic category. Successful current checks establish recovery, not the historic trigger. No human action is required for this resolved episode; any future Touch ID/macOS consent remains Taylor's action, with recovery owning authorization wakes. Archive is a separate final step and is not established by this report.

## Agent documentation

Reviewed src/onepassword/README.md, src/onepassword/agent-contract.md and src/onepassword/autofixes/AGENTS.md. Updated README.md with this incident and the distinction between generic CLI errors and broker faults. Existing contract and autofix guidance already cover the result and remain unchanged.

## Evidence

- artifacts/baseline.json (SHA-256 177d0469cab43565d4d96e4297ac666d7672091322774d06bcad63b62afd6226)
- artifacts/deployed-hashes.json (SHA-256 69bcda136730f2a418e28c57bae60c30adfe83da2c77ce8d318345b7ffd36038)
- artifacts/parser-check.json (SHA-256 54ffec0c099f45807dba6a8e4d98ccd414afe4fe104388914b67cb6ccad01d88)
- artifacts/metadata-smoke.json (SHA-256 57a5d81b1f5712b4fdc30656c6bf3bb445f557986acb4da926b83031e7c9ce1c)
- artifacts/authenticated-smoke.json (SHA-256 aa84f8f262c1a0f343b5266ed59e12ec0b618cda5e780fee487970058d221f7c)
- artifacts/python-tests.json (SHA-256 620cad235f39c98e91bde8c91515c33677f0725e286c1ce1f4ddd8af3bf0986a)
- artifacts/broker-tests.json (SHA-256 abcedd6ef594dffacd59cbe18cc1703f143ef0b40e20b5a56d6d207e43452eeb)
- artifacts/node-tests.json (SHA-256 4395578c0ebca251c010071a4b601fead7ff3a53a880bf88c27cb169d88d4ec1)
- artifacts/timeline.json (SHA-256 a3349eaf0b22a1c22b9981562124806943f965800361dd2ddf5f6d851121b62d)
- artifacts/final-status.json (SHA-256 1094a4cbe4d7e68a554cc83de251f43c2c24ee8d7e56f8db308c0a25d2aa463e)
- artifacts/chat-check.json (SHA-256 9cc70e9653e077ed1396e4ad7e53fa6849aeaf3393cca8687afb7a247af5e116)
- artifacts/release-gate.json (SHA-256 877a798d11f4a9d0ab33a9ebe57c199a52a3ae410a7c06d74e23627f061933d4)
- artifacts/docs-review.json (SHA-256 93714838a6632ea488d2be2eb9b25e459acf6d7d8508eeab6c563a98aa258f40)
