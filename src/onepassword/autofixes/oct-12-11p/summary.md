# ⚙️ fix-1p-broker/oct-12-11p

Broker verified; personal-account authorization timed out

Outcome: no_change. Created: 2026-10-13T03:15:26.205Z (America/New_York).

## What happened

At 23:15 Eastern the personal-account keepalive returned an authorization timeout after 60.12 seconds. The other account succeeded at 23:15:43. The broker and watchdog remain running; personal-account authorization remains unverified and may require Taylor to complete native consent.

## Cause

The personal CLI call reported authorization timeout, independently of parser/watchdog health. Its previous successful prompted call was at 11:12:15 Eastern, approximately twelve hours earlier, consistent with renewal but not proof of the exact expiry trigger. No recent challenge was found in the bounded application-log tails, so visible prompt presentation is not established. The parser agrees with persisted unlocked state; the heartbeat advanced and deployed code matches source.

## Resolution

No implementation change is warranted. The existing timeout classification and 14-minute backoff behaved as designed; the second account succeeded. No broker restart, installation, auth wake, credential read or permission change was performed. Updated README incident guidance to distinguish timeout, successful-prompt timestamps and per-account authorization.

## Verification

44 focused synthetic Python tests passed (keepalive, recovery, broker, activation and agent guidance); all three Node test files exited successfully. Source/deployed worker and keepalive hashes match, running keepalive hash matches, and codesign verification exited 0. A bounded absolute-wrapper --version smoke exited 0 with stdout/stderr discarded. Parser and persisted lock state agree; heartbeat advanced; broker PID 1051/session 1051/PTY /dev/ttys000 and keepalive PID 1055 were preserved. Exact chat title, Pinned section, dotfiles cwd, strongest advertised gpt-6-astra model and high reasoning were read back.

## Service state and next load

Existing signed broker and keepalive remain running unchanged. Nothing is applied or staged; no service load or restart is needed.

## Limits and remaining action

Personal-account authorization is not restored or proven. Taylor must handle any native Touch ID/macOS consent when presented; recovery owns the auth wake. Authenticated smoke calls were skipped to avoid a competing retry. The timeout does not prove a prompt appeared, and its exact renewal trigger remains uncertain. Successful other-account metadata and version output do not establish personal-account readiness. No Computer Use or Claude UI checks were performed.

## Agent documentation

Reviewed src/onepassword/README.md, agent-contract.md and autofixes/AGENTS.md. Updated README.md with this incident and last_prompt/per-account evidence limits. Shared agent-contract.md and autofixes/AGENTS.md already require human consent and recovery-owned wakes; no contract change or guidance sync was needed.

## Evidence

- artifacts/authorization-check.json (SHA-256 81c5e8c0112f3837fe21f390224ccec130cfc1621425798d6926de7a8a96af6b)
- artifacts/baseline.json (SHA-256 288730df9d8cb0bd022433592395f438968ea8e203ab8c963924555e658fa7a1)
- artifacts/chat-check.json (SHA-256 8d44b990810f4c39c156c8b74711ec06a37ef2a23bf7716293fba834a084dc61)
- artifacts/deployed-hashes.json (SHA-256 8195e58271af1618ccbf53b2c2d1bfff9a20845c9bc288dfb17a79fdde371b6e)
- artifacts/diagnostic-8044875a-047d-4e12-9ce2-65cbf1ed5c4d.json (SHA-256 7c2c7be9ed28b0a4e39f7c6f445fb14379b71af9d791549ad33d7bb8963216a1)
- artifacts/final-status.json (SHA-256 1bad52c50294c7acd903581465eb027d80741b75904cd89d3fb1ceb9c601a8cd)
- artifacts/metadata-smoke.json (SHA-256 612720e0092f03b19b97d12cd65c9b4f0c47bf99bab880b3fc30bbc9410c65e2)
- artifacts/node-tests.json (SHA-256 589b6c8ea2101a73c0c65da2d2f07acee79f60341d0fa7de897a3502624bb56b)
- artifacts/parser-check.json (SHA-256 bd1bb0b5e9f540d9e7d2a119b5612ee39ec56d0500cc812ebadb3d1c5b9d2923)
- artifacts/python-tests.json (SHA-256 6cad90e82d73e327a4cfd87f95d538c85afcea05ed4c7558fe238f006a9905bb)
- artifacts/recent-events.json (SHA-256 de35561ebbcdb96080f8e0895a3ab20b890dcf35c1ab8d0ac56be88449c39d56)
- artifacts/release-gate.json (SHA-256 877a798d11f4a9d0ab33a9ebe57c199a52a3ae410a7c06d74e23627f061933d4)
