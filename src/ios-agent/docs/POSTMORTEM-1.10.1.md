# Real-use postmortem: 1.10.1 → 1.10.2

## What the independent service evidence showed

Before reading Claude’s conclusions, Runner preserved the retained signals and wrote independent-analysis.json at 2026-10-12T02:43:29Z. The snapshot is in the existing iPhone-link report under evidence/postmortem-1-10-1/. Claude’s artifacts were copied and hashed separately in claude-held/ first.

The fresh smoke window was 02:30:19–02:38:28 UTC on 12 October (11 October Eastern). It contains 397 records: 192 MCP, 83 browser, 69 host, 13 web and 40 call. All 21 browser terminal reports completed and contained trace IDs. These are delivery observations, not proof that every workflow or audio outcome succeeded.

Independent concerns: two uncorrelated host actions, three release/lease_required warnings followed by successful inactive-lease reconciliation, a media failure without a retained failed-predicate code, and one final cleanup without fresh indicator-off feedback. The intermediate browser end actually requested Home.

## What Claude added, and what we can conclude

| Finding | Decision / delivered change |
| --- | --- |
| New server, old harness tool catalog | Claude restarted its process into 1.10.1, but ios_signals remained unavailable and the harness showed the old end schema. A live version/catalog response alone cannot certify what the harness can call. Guide now requires a callable signals read and harmless unknown-session end probe. The latter echoes cleanupIntent.home; dropping false is immediately visible. Refresh the harness catalog/connection at idle, not another agent’s process. |
| Intermediate end sent Home | The transcript tool input contains home as the STRING "false". Current MCP accepts a boolean and refuses that string if received on the wire. The precise client-side drop is unproven. Tests show genuine boolean false reaches the backend; omission returns effective true in the preflight. All end results now echo the effective cleanup intent, including repeated calls sharing the first in-flight end. No coercion added. |
| Chrome permission sheet absent from alert-only read | Claude’s native tree exposed ordinary camera/microphone buttons after alert=null. The API now labels native-alert-only coverage and directs one fresh tree read when needed. Alert absence is not “no permission UI.” No permission is granted blindly. |
| Media failure too vague | Failed media gates now return/log a fixed predicate code and requested direction: read, document, foreground, connected peer, sent or received advancement. Stable muted-peer counters still fail a both-direction test; choose sent only when that is the intended assertion. No audible-content or microphone proof inferred. |
| Expected native handoff release warned like a failure | Broker remembers only the exact most recently retired capability privately. Releasing that capability returns alreadyInactive and logs lease.release_reconciled at info; it cannot release a replacement owner. Unknown/older capabilities remain rejected and the CLI’s fresh-status fallback remains. |
| Normal Claude connection ownership looked broken | No inherited Codex thread is an expected non-Codex connection mode and now logs info. Invalid or unavailable claimed Codex ownership remains a warning/refusal where applicable. Explicit end/finally remains required. |
| Two host inputs lacked trace context | A real Node→Python→UNIX-socket fixture proves the current native handoff carries exact trace/session context. The live gap’s cause is not reproduced, so no speculative transport rewrite. Missing-context notices now include the fixed action name to distinguish the next occurrence; no URL or arguments are logged. |
| Final cleanup had no fresh page acknowledgment | Preserve unconfirmed. Result now includes the fixed reason and last feedback category (disconnected, changed runtime, unavailable catalog, indicator not off or stale feedback). Host release is not glow-off, Home or media-release proof. |

## Physical evidence reused, not overstated

Claude physically completed a system detour with system_end home=false and reacquired the same Chrome page with its microphone track live, without reloading. This qualifies that system handoff. It does not qualify a real web_end boolean false received through the previously stale harness. Existing app/relay no-Home tests and the real MCP schema probe cover the new contract; the next real run should qualify that specific physical path.

No new native build or page SDK is needed. No microphone, device permission, network setting, XCTest runner or browser was changed during this release review.

## Product follow-ups kept separate

Claude reports about 19.5–19.7 seconds without client transcription input during a source re-lease and about 12 seconds paused at a network-quality score change despite low measured jitter/loss/RTT. Those are actionable hypotheses for the transcription owner, not established iOS-agent service root causes; compare the existing gateway/source-selection traces before changing policy. The lobby microphone-retention investigation is deliberately pinned at Taylor’s request: muting intentionally retains a live track, camera off stops its track, and an explicit lobby exit release policy remains a separate product decision.

## Verification and delivery

Focused checks exercise the actual MCP protocol, dropped/invalid boolean detection, app/relay no-Home cleanup, media predicate projection, alert fencing, the real cross-language socket boundary and retired-capability collision safety. Fixture signals stay in temporary stores. Runtime installation is guarded by an idle check and verified by loaded worker release/source hash. Publication and fresh stdio receipts are recorded separately in publication.json. The next smoke must refresh the harness’s callable catalog, not just read its new server version.
