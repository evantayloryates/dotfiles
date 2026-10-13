# ⚙️ fix-1p-broker/oct-12-10p

Transient CLI failures recovered; no broker repair needed

Outcome: no_change. Created: 2026-10-13T02:38:54.688Z (America/New_York).

## What happened

Both accounts returned exit 1 in regular keepalive rounds at 22:38, 22:46 and 22:53 Eastern on October 12. Both succeeded at 23:00:14/15, and keepalive resolved this episode. Independent metadata-only checks then succeeded. The broker remained running throughout the observed incident.

## Cause

The observed fault was a transient CLI metadata-call failure, not an observed broker crash, parser regression or stalled watchdog. The retained generic error category and exit 1 do not identify the underlying cause or prove an authorization failure. No new prompt was recorded during recovery; last recorded prompts remained from earlier in the day. Current bounded log parsing reports unlocked, matching keepalive. Its older visible last-lock event differs from the preserved historical state after log rotation; this alone is not a parser regression.

## Resolution

No code change is warranted for the verified recovered service. No implementation was modified or installed, no process was restarted, and no auth wake or additional approval notification was requested. Only incident evidence and README guidance were added.

## Verification

44 Python tests passed across keepalive, recovery, broker isolation, activation and agent guidance; 37 Node settlement/archive/dispatch tests passed. Source and deployed worker/keepalive SHA-256 hashes match, the running keepalive source hash matches, and bundle signature verification returned 0. Absolute bin/op version and both account-scoped vault-list checks returned 0 with stdout/stderr discarded. Broker PID/session 1051 and /dev/ttys000, plus keepalive PID 1055, were preserved. Heartbeat advanced from 23:00:56 to 23:01:56; final snapshot age was 12 seconds. Exact incident title, dotfiles cwd, Pinned section, strongest advertised gpt-6-astra model and high effort were read back. Evidence is in artifacts/.

## Service state and next load

Existing installed code remains running. Nothing is staged and no activation or user action is required for this recovered incident. Future native authentication prompts still require Taylor; recovery owns notification-click auth wakes.

## Limits and remaining action

The underlying reason for the transient CLI exit 1 is not retained by the sanitized logs and is not asserted. Successful metadata checks establish access at verification time, not future availability. Physical notification clicking and native consent UI were not exercised. Archive scheduling is not proof of archive completion; the deferred helper records a private native readback receipt.

## Agent documentation

Reviewed src/onepassword/README.md, agent-contract.md and autofixes/AGENTS.md. Updated README.md with this recovered incident and the limit on interpreting generic exit 1. Existing agent-contract.md already covers the required permission and delivery boundaries; no contract change or guidance sync was needed.

## Evidence

- artifacts/baseline.json (SHA-256 7206fbbf42ed8d40005c731e77a81e4c16185d666b5a93c11fd06874405ea696)
- artifacts/chat-check.json (SHA-256 d23b08585a3083657a303d8c4a858d077039d67304c9c31e14cfa6684db43b9e)
- artifacts/deployed-hashes.json (SHA-256 8195e58271af1618ccbf53b2c2d1bfff9a20845c9bc288dfb17a79fdde371b6e)
- artifacts/diagnostic-3e35013b-5ccc-4877-bdb6-d507872b6e31.json (SHA-256 c392003fbd30e718deae1dc3d92b50f57b8f8848754ce2b25cfe2c5f18a2f27c)
- artifacts/final-status.json (SHA-256 c4efeca10ba0325f13f4c1e2c5f6af8f373db78c136ff999db58cc130fa71ddb)
- artifacts/metadata-smoke.json (SHA-256 b67c1dbbd880a67b59fe2aecd6e1b79d0f027ce0897c8383fabebd4b56cf01e3)
- artifacts/node-tests.json (SHA-256 78442aed7062d75c01b38a06200c94e4f638a6f4aa89fbc315554d3799175be5)
- artifacts/parser-check.json (SHA-256 bd1bb0b5e9f540d9e7d2a119b5612ee39ec56d0500cc812ebadb3d1c5b9d2923)
- artifacts/python-tests.json (SHA-256 8902d3b160ae2a32f5b3c6b117072cff0704bddf1009d76cdbbfb7be986340fc)
- artifacts/recent-events.json (SHA-256 07ebedd6b370e1bb1add267d15e9eb1b191805b119e9b96207cdb12cf6e8f5db)
- artifacts/release-gate.json (SHA-256 39ef3bfdde3c39ac56118368422ba5b561a40a73fa02ca0d372c5f15ac94a7ec)
- artifacts/report-review.json (SHA-256 30d8a121b8eb9b204be396201dc8f280af92ce0404169943cb68dbf742349b76)
