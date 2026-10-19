# Runner lifetime reservation — disabled candidate

This is preparation for an explicit long-running XCTest authorization window. It is **not physically qualified or enabled in the production MCP catalog**. Set `IOS_AGENT_EXPERIMENTAL_RETENTION=1` only in an isolated test MCP process to expose `ios_system_reservation`.

The reservation keeps one newly started signed runner and Apple’s automation indicator alive for an absolute1–36,000seconds. It does not hold the input lease, renew itself, adopt an existing runner, dismiss Apple authentication, or grant input authority. Normal native/page sessions retain their existing exclusive ownership and cleanup. A system fallback acquires that owner, attaches the exact retained WDA session, and releases only input control on end. Reservation end acquires the exclusive owner before asking the worker to stop; expiry stops independently. No runner can be kept beyond the monotonic deadline by changing the wall clock.

The detached worker owns its matching xcodebuild/process IDs and independently verifies stop. Private records and logs stay under the existing local state directory. The original agent connection may close after startup. Unknown cleanup remains unconfirmed and prevents replacement. A failed/expired attachment never starts a new runner or replays input automatically.

Qualification already completed:

- Absolute expiry, dead worker, private-file/symlink refusal, stop identity and original-input-lease independence.
- Retained attachment creates no new runner/WDA session; ordinary session end preserves the reservation.
- Changed session and expiry refuse input. Candidate is disabled without explicit opt-in.
- Physical negative gate: current authorized runner was detected and preserved; no reservation was created, and its original MCP inspection remained successful.

Required physical gate, after Taylor’s current ten-hour hold:

1. End the original bounded fallback only after the requested hold expires or Taylor authorizes it.
2. Start a short reservation; complete Apple authorization only if actually requested.
3. Release startup ownership, acquire a normal browser/native session and perform one bounded workflow with its normal glow and cleanup.
4. Re-enter system fallback, verify unchanged WDA session, perform an observed action, return Home, and end input control. Verify no new XCTest authorization prompt.
5. End the reservation and verify the exact runner stopped. Separately test short expiry and connection close.
6. Only then remove the experimental gate and publish the production MCP interface. Off-LAN attachment/start remains a separate physical transport gate.

Today’s running original runner is intentionally untouched. Its lifetime is still coupled to its original active agent/MCP owner; this candidate cannot retrofit it without ending that runner first.
