# Claude-driver v2 qualification

The input incident takes priority: physical typing recovery is not yet
confirmed. Live app testing remains stopped. The v2 goal is unfinished.

| Requirement / failure boundary | Current evidence | Remaining verification |
|---|---|---|
| Reuse existing core and cross-harness API | CLI/MCP share the operation layer; actual Claude Haiku and Codex gpt-6.1-sol headless models passed private fixture workflows | Native app control qualification; Cursor CLI requires human login |
| Runtime activation | Fresh MCP launcher exposes v2; current Codex connection still reports legacy driver 706a338 | Refresh the connection and verify apiVersion/runtimeBuild; source presence alone is insufficient |
| Fast submission, durable ownership | Earlier live submit returned in 9 ms; isolated MCP disconnect/reattach/cancel uses real launcher and detached worker | Repeat native timing on final implementation; measure full recipient latency separately |
| Exactly one dispatch, expiry and cancellation | Parallel pickup, duplicate checkpoint, malformed/missing checkpoint, expiry and pre-dispatch cancellation tests | Native recipient duplicate-send, lost-receipt and permission-gate cases |
| Controllable steering | Two independent MCP clients cannot interleave stop/replacement; cancellation after stop reports known partial effect | Busy native fixture, queue versus interrupt, replacement response and cancellation under load |
| Stable recipient and caller identity | Mutable titles bind once, including controls waiting on a lock; idempotent reattach survives rename; worker refuses stopping its original caller | Native desktop-caller handback and cross-harness reattachment |
| Concurrent state ownership | Twelve independent processes retain all registry updates; live locks cannot be stolen on age | Higher-load native controls and interrupted import cleanup |
| Pool partial failures | Member unavailable during parking; eight concurrent claims yield one owner; partial unarchive cannot return a member as ready | Native pool regression on an owned, previously approved member |
| Incremental observation | Unicode, partial lines, malformed records, truncation and live status transitions; bounded bytes, no thinking/tool content | Native transcript rotation and continuation after restart |
| Service memory | Metadata-only automatic records, candidate labels, private modes, bounded reverse reads and runtime fingerprints | Ongoing usage; reconcile candidates into curated findings only with evidence |
| Human app usability | UI reload completed; synthetic a/b/c read back as abc; test text removed; CUA reset; shared quarantine prevents UI fallback and live-script app work | Taylor's physical keyboard check and a proven duplication root cause |
| Recovery and version drift | Existing recovery serializes, restores focus and cools down failures; unsupported Codex Tier C remains a known limitation | Controlled broker death/restart, version drift and recovery tests; Codex bridge fixes stay parked |

`test/v2.test.mjs` tests lifecycle/state boundaries in private stores.
`test/mcp-v2.test.mjs` runs the actual MCP launcher with independent clients,
detached workers and a synthetic broker. Its fixture actions never execute
Claude tools or UI actions. Passing those tests does not qualify the live
native controls or the real external harnesses.

Separate model-driven fixture reports verify successful tool replies, two
idempotent submissions producing one completed job, matching recipient,
events cursor and service memory. Global harness configuration hashes stayed
unchanged. Claude: `harness-v2-claude-2026-10-06T20-13-32-515Z.json` (25.456 s).
Codex: `harness-v2-codex-2026-10-06T20-14-27-285Z.json` (27.451 s).
Both are under `<state>/pressure/`. Cursor's run and catalogue attempt stopped
at authentication before any tools, so Cursor remains unqualified.

`scripts/pressure-v2.mjs` repeats both suites in fresh processes and writes
service-level evidence. Reports include source and suite fingerprints; a
source change during a run prevents qualification. The live script requires
all six named checks and records interrupted runs as incomplete.

Latest offline evidence: 40 checks in each of five fresh runs (200 total),
all passed with unchanged source/suite fingerprints. Report:
`<state>/pressure/v2-2026-10-06T20-19-15-423Z.json`.

Resume live testing in this order: confirm physical typing, qualify the busy
fixture and steering, test cancellation/duplicate boundaries, then run the
real external harnesses and controlled recovery cases. Avoid app restart
while unrelated Claude work is active. Preserve every failed result and
reconcile uncertain effects before submitting replacements.
