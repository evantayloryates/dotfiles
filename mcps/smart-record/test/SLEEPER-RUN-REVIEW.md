# Sleeper production-run review

The capture engine was reliable in this run; directing and reviewing the
production exposed usability and cursor-quality gaps. Adapter **0.20.2** addresses
the bounded defects below. It does not redesign the composition style or replace
the existing Desktop movie.

## What was inspected

The completed `smart-record-test` chat (01a128ea-7934-7c43-a8d7-5a98226562ae),
its native service log interval, retained session ses_35b2dasn, all three capture
manifests/journals and the two final cursor recipes/timelines/samples. The chat
lasted about8 minutes20 seconds, with112 MCP/computer-use calls and36 shell
commands. Call counts include preparation, review and cleanup, not just filming.
Raw account footage and event rows stay private.

All three takes finalized successfully: 146,1630 and321 written frames, zero
reported dropped frames and zero lost source-journal rows. The run's parsed native
RPC log contains no failed RPCs. Session closure was independently read back.
These observations establish this run's results, not universal capture reliability.

## Findings and corrections

| Finding | Practical impact | Disposition |
| --- | --- | --- |
| Two requests used unsupported target fields and a prose activity instead of an enum. The agent then repeatedly inspected implementation source. | Avoidable setup time and context use before filming. | Production-plan errors now name valid enums, unknown fields and nesting corrections. Target schemas explicitly disallow extras. A short valid-example production path precedes historical runbooks. No silent aliases or mutation retries. |
| A five-second canary ended without any input rows. | It cannot establish whether clicks/keys were captured. More setup/tool calls can consume the entire short take. | MCP and CLI waits now expose actual observed state, engine-clock remaining time and whether the snapshot permits beginning actions. A terminal return with timed_out:false explicitly cannot mean currently recording. Guidance requires delivered input and visible confirmation before calling a canary successful. |
| The final main render has723/1470 frames without a reconstructed pointer; the standings render has170/270. Together that is893/1740, about51.3%. The first positions arrive10.5s and5.67s into their outputs. | The added cursor appears late, jumps between sparse action positions and disappears. Successful encoding hid how incomplete this treatment was. | Render receipts and editable timelines now return position coverage, initial delay, longest gap, reason counts, outside-canvas anchors and warnings. This is timeline coverage, not measured visible pixels or continuous physical motion. No invented trajectory or attribution. |
| Escape closing a player card was treated as typing. | The renderer unnecessarily hid a known pointer after a non-typing action. | Escape and Command/Control shortcuts are excluded from the typing-hide heuristic. Rebuilding the retained main timeline restores40 positioned frames (about1.33s); it still has683 unpositioned frames. Unknown/other keys retain the documented heuristic. |
| A small stationary blue pointer/highlight is already in the captured pictures alongside the added cursor. | Two pointers appear in the finished video. Blurring its rectangle can damage changing page content. | Preserved as a compromised clean-source finding. Its producer is unconfirmed; capture-level pointer suppression cannot remove arbitrary painted overlays. Guidance requires inspecting source samples and recording/choosing a cleaner qualified path before final use. No automatic erasure or claim that the origin is fixed. A shared app observation preserves the finding with unknown versions explicitly preventing exact-environment reuse. |
| Scene labels precede actual roster/player/league input by roughly2.6–5.1s. The standings needed another take. | Treating a chapter label as the moment content becomes ready yields awkward cuts or missing actions. | Tool and usage guidance distinguish action-start intent from content-ready confirmation; check remaining time before each action and explicitly extend an owned take when appropriate. Marks do not become visual-success evidence. |
| The final58-second MP4 was assembled externally from49s+9s derivatives. Cursor derivatives and the external master are outside the session bundle inventory. | A later agent cannot reconstruct the master solely from ordinary session discovery. | Keep the existing official-composition task Ready. Require an external assembly sidecar in the interim; session-owned composition jobs, master maps and derivative registration remain the next design work. This review does not claim that gap is implemented. |

## Verification and availability

29 focused policy/cursor/wait/bundle checks and2 target-option contract checks pass. Fresh registered
minimal-PATH MCP reports0.20.2,46 tools and wait/coverage capabilities. An actual
read of the ended canary reports may_begin_actions:false and
terminal_before_observation; CLI agrees. Both retained final recipes were analyzed
against actual source snapshots. A fresh one-second/15-frame cursor render has15
positioned frames, returns the same coverage in its persisted receipt, and decodes
successfully. Native PID89707/build d7a6a75d975f stayed unchanged; no browser actions
or capture restart were needed. The Desktop movie's SHA-256 stayed unchanged.

Private evidence: the current chat's existing qualification bundle,
`release-next/sleeper-review/{run-summary.json,live-check.json,tests.log}`. Existing
clients keep their loaded adapter version; fresh MCP clients and current CLI use
the update. The next production should use these diagnostics, confirm clean source
pixels and capture content-ready anchors. Taylor's pending visual feedback should
inform the official composition recipes; no broad reshoot is required for this
review.
