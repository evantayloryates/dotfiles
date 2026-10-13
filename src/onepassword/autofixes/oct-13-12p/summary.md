# ⚙️ fix-1p-broker/oct-13-12p

CLI checks recovered; no broker repair warranted

Outcome: no_change. Created: 2026-10-13T16:38:22.779Z (America/New_York).

## What happened

Both accounts returned exit 1 in scheduled keepalive rounds at 12:38:22 and 12:45:27 Eastern on October 13. Independent account-scoped metadata checks at 12:41 succeeded; the normal keepalive calls at 12:52:32/33 then succeeded and cleared this fault episode. The broker and keepalive stayed alive throughout the observed incident.

## Cause

A transient failure of the CLI metadata calls is established; its underlying cause is not retained in the sanitized generic error category. Exit 1 alone does not establish authorization expiry, a network failure, or a broker crash. Lock parsing agrees with the live unlocked state, deployed worker and keepalive hashes match source, signature verification succeeds, and the heartbeat advances.

## Resolution

No implementation change or activation is warranted by the verified checks. No broker or keepalive restart, auth wake, additional approval notification, or UI action was performed. Only incident evidence and documentation were added.

## Verification

44 targeted Python tests passed across keepalive, recovery, isolated broker protocol, activation and agent guidance. The Node settlement, archive and dispatch test files returned exit 0. Absolute bin/op version and both account-scoped vault-list checks returned exit 0 with stdout and stderr discarded. Broker PID/session 1051 and /dev/ttys000, plus keepalive PID 1055, were preserved. Source/deployed hashes and running keepalive source hash match; bundle signature check returned 0. Timestamped lock parsing matches keepalive. Native readback verified the exact title, dotfiles cwd, Pinned section, strongest supported gpt-6-astra model and high effort. See artifacts/. Heartbeat advanced from 12:41:04 to 12:53:54 Eastern; final snapshot age was four seconds. Both keepalive account statuses are now ok, and fault_resolved records the exact incident episode at 12:52:33. Last successful prompted-call timestamps did not change.

## Service state and next load

Existing installed code remains running; nothing is staged and no service load or user action is required for this recovered incident. Recovery continues to own scheduled checks and notification-click auth wakes. Future native authentication or macOS consent remains Taylor's action.

## Limits and remaining action

The exact reason for the brief generic CLI errors is not known and is not asserted. Successful metadata checks establish access at verification time, not future availability. No physical notification click or native consent UI was exercised. Archive scheduling is not archive completion; the helper must record its private readback receipt.

## Agent documentation

Reviewed src/onepassword/README.md, agent-contract.md and autofixes/AGENTS.md. Updated README.md with this incident and the distinction between a successful manual smoke check and keepalive's stored account statuses. Existing shared contract already covers first-click release, quarantine, auth wake ownership and no-change settlement; no contract change or guidance sync was needed.

## Evidence

- artifacts/baseline.json (SHA-256 33a99e2977f1c9d1ae0fb6c7ed733deba6284d4de81d2c1c40d67d9644004e14)
- artifacts/chat-check.json (SHA-256 d9ef74565e1825bb128533d2bf3655313793a1a233059c9a7f672ab89d9f7003)
- artifacts/deployed-hashes.json (SHA-256 7156ed22dc48b1cf7fcb5242c1ab6974f9554dd841e47855c8358d4c47ecaa68)
- artifacts/diagnostic-db7de38b-291c-458d-82ea-5eb0feb8220d.json (SHA-256 299a45596af658b370077d0c9f0fbd3a688b4e104b27826eafabcdd5a014ad20)
- artifacts/final-status.json (SHA-256 1df5cad32c09ad3328a99474c61778918f0a966f86d5d43242f5cb57a03495e7)
- artifacts/identity-check.json (SHA-256 4739192383d959189ab94d415e1eabd7a31452b7b2e0f4ea48b7eea64420b14e)
- artifacts/metadata-smoke.json (SHA-256 d74693d5cafff39f5af7951b61af65fba47965f49f23d23a1562baf658cfe439)
- artifacts/node-tests.json (SHA-256 95a3052925e584c9c7a833cda4df11fb3001754793a1a6cf833bc2d479b469ca)
- artifacts/parser-check.json (SHA-256 d462b4282d285655f51cf2387fdd93a73a996886488299fb376ee55021a95255)
- artifacts/python-tests.json (SHA-256 6baad8c4fc7f0df10c7a8b1c57437ea6748c3964940a67ea7c53bd4f00593c6b)
- artifacts/recent-events.json (SHA-256 57c8f28a8e626a533d54968c44e9815e9b65a80c211a339c14c69c6160495939)
- artifacts/release-gate.json (SHA-256 877a798d11f4a9d0ab33a9ebe57c199a52a3ae410a7c06d74e23627f061933d4)
- artifacts/report-review.json (SHA-256 a2a76fd60001096e9c866744a155ae0af940643f1ebad95996a605020b4b4ab6)
