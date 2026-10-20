# ⚙️ fix-1p-broker/oct-19-10p

Both accounts recovered; no broker repair warranted

Outcome: no_change. Created: 2026-10-20T01:33:58.439Z (America/New_York).

## What happened

Both accounts returned generic exit 1 in the normal keepalive rounds at 21:33, 21:41 and 21:48 Eastern on October 19. The normal 21:55 round succeeded for both accounts and cleared the fault before this investigation. Fresh metadata-only checks also succeeded. The broker remained running.

## Cause

Transient CLI failures, with the exact trigger unknown: retained evidence records only generic error/exit 1, not an authorization timeout. It does not prove authorization expiry, network failure or a broker crash. Parser/watchdog checks were independently healthy: the timestamped parser reports unlocked, matching persisted state; the heartbeat advanced and deployed source hashes and signature match. The 21:55 personal-account result was ok_queued, not ok_prompted.

## Resolution

No implementation change, installation, restart or additional authorization wake was warranted. Existing recovery cleared the fault. Added this verified incident to README.md and saved sanitized evidence; no secrets, raw logs or vault output were retained.

## Verification

44 targeted synthetic tests passed (keepalive, broker, recovery, activation and agent guidance). Both account-scoped vault-list smoke checks returned 0 with stdout/stderr discarded. Deployed worker and keepalive hashes, build stamp, running keepalive hash and strict signature verification passed. Parser agreed with unlocked state. Between baseline and final readback the heartbeat advanced from 21:56:10 to 21:56:30 Eastern; broker PID/session 1213, /dev/ttys000 and keepalive PID 1214 were preserved. Persisted fault_episode was null. Native thread readback verified exact title, dotfiles project path, Pinned section, gpt-6-astra and high reasoning against the supported catalog.

## Service state and next load

Existing installed code remains running. No staged fix or activation command is needed. Normal keepalive continues; broker PID/PTY and active commands were not interrupted.

## Limits and remaining action

The exact cause of the earlier generic exit-1 failures cannot be reconstructed from retained sanitized categories. Successful smoke checks establish current metadata access, not every future operation or absence of future consent prompts. No Touch ID/macOS consent was approved by the agent. The release gate remains false; no-change settlement requires no click. Archive completion must be independently read back by the deferred helper after this turn ends.

## Agent documentation

Reviewed src/onepassword/README.md, src/onepassword/agent-contract.md and src/onepassword/autofixes/AGENTS.md. Updated README.md with the incident outcome and evidence limits. The contract and autofix guidance already cover generic-error uncertainty, separate parser/auth diagnosis and no-change settlement; no behavioral guidance change or sync was needed.

## Evidence

- artifacts/baseline.json (SHA-256 455b98a0620708cced77357e7a32a88e774d8522bbf192b3c105ba99103c0e6c)
- artifacts/final-status.json (SHA-256 e7eb25bf3d686f168a24963b6c19cd80573a58c03485063dcd5c044b91f25e66)
- artifacts/deployed-hashes.json (SHA-256 72e8dcc403757ad6228bc93749c1c5dcee47a18cece93e3257d91d5f83f1b672)
- artifacts/parser-check.json (SHA-256 68a1ef476150a100b37d6453332f5e4371c0c542c44b3d8cbff647d1e2294cb0)
- artifacts/recent-events.json (SHA-256 07687cdad9b3e066202a4cd96093a9a9027456d148b6746aa7bf97efb42180c7)
- artifacts/metadata-smoke.json (SHA-256 68f9dbd45d4f74a0b172fa63fa9bbbb76775e2f96e0fd240644b9c8007f0f5dd)
- artifacts/python-tests.json (SHA-256 f5388bcba6377f002e913ed5104b0cc9e2eff93863cd9bd53098bbdcb02c4bf1)
- artifacts/identity-check.json (SHA-256 7ff41d6ea85f1e0dfb572d863c7f1fc4dcfe9488388dda98a68d2080512ab004)
- artifacts/chat-check.json (SHA-256 7b159e06ec02af93870d57db33094ad75c76097cfddd3ffa2391e134c17f2a29)
- artifacts/release-gate.json (SHA-256 b214d446e8c49fc13f9de5c45c781b0c9ce493e257bedc190828684a41a44214)
- artifacts/verify.py (SHA-256 e304695dfc04275761c4a478d6e8d9c5f82a54727547eb122901f36c091d7d6e)
