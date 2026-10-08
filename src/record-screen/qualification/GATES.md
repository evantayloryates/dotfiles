# Qualification update — October 8, 2026

## Third pass: background implementation and fault qualification

No focus actions, recording, new grants, Claude inference or delegated model
turns. The installed engine was neither replaced nor restarted. Candidate
code is committed independently of live delivery.

| Gate | Qualified result | Remaining limit |
| --- | --- | --- |
| Capture option source contract | Explicit child-window setting and exact bundle exclusions on display/rect targets; missing apps and unsupported combinations fail. Full Swift candidate build and 25 parse/identity checks passed. | Real SDK filtering, exclusion PID churn and preview tap selection through the production engine still need a live pass. |
| Filter-aware source identity | Recording taps and viewfinder lanes include child configuration, exact bundles and resolved exclusion PIDs. Legacy keys remain unchanged. | A restarted excluded app requires fresh resolution; no universal cursor-cleaning recipe is enabled. |
| Engine capability negotiation | Candidate status advertises target options v1. Two tests, including an isolated socket engine, show the MCP rejects old-engine options before capture, passes explicit false and preserves legacy calls. | Raw socket callers must negotiate support too. Installed old engine does not advertise support. |
| Shared app facts and declared receipts | Four local MCP tools plus standalone CLI. Seven tests cover concurrent writers, atomic publication failure, exact version/expiry/conflicts, private files, exact nanoseconds, session scoping, readback and invalid requests. MCP tests forbid model/transport paths. | Reported observations and caller-claimed ownership; automatic interception and concurrent-user attribution remain open. |
| Persisted baseline learning | Two prior app observations and one prior action block saved in the shared computer-use evidence store and independently read back. Exact app/OS/provider/display keys; seven-day expiry. | Observation times use evidence mtime; versions reconciled after the same-day runs. No automatic model training, success audit or unconditional app guarantee. |
| Qualification startup recovery | Four synthetic tests cover stalled helpers ignoring SIGTERM, partial evidence, concurrent admission, handled supervisor interruption and subsequent successful starts. Private stdout/stderr/outcomes; only owned groups stopped. | Wrapper qualifies helper control only. Engine startup deadlines, root cause, forced supervisor termination, resource budgets and actual stalled-SDK recovery are still open. |

The shared store is `/Users/taylor/.local/state/codex-bridge/capability-evidence/`;
its contract is in `src/codex-bridge/CAPABILITY-EVIDENCE.md`. Native consumers
use it directly without self-delegation. Existing MCP processes may require
reconnection to discover new tools. Private test logs, source candidate binary,
option checks and persistence readback live in `gates-v3/` under the same
qualification bundle. No visual composition code was added.

Next delivery gate: bounded live engine qualification of the option/filter/tap
contract, automatic receipts and a dense source journal; then cross-display,
menu readiness/overflow, concurrent user input and realistic redundancy load.
Only focus-taking work needs another agreed production interval. Background
source preparation does not reserve a display or block Taylor's input.

## Second pass: live evidence

Second pass, within an approved 15-minute production interval. These are
qualification helpers and source contracts; the installed recorder has not
been changed or restarted. Visual composition remains deferred.

## Passed in bounded tests

| Gate | Actual evidence | Limit |
| --- | --- | --- |
| Live-stream helper exclusion | Sequential 8-second display-crop streams: baseline retained Sky's software pointer; explicit PID 4973 application exclusion removed it. 459 and 466 frame callbacks; source PNGs inspected. | Opt-in helper only. Do not exclude an application by a stale PID or automatically exclude every overlay. |
| Visible Chrome native menu | Task-created window 5798 was on screen. All four screenshot variants succeeded; isolated child inclusion omitted/preserved the menu as expected. A 10-second child-enabled stream supplied 568 frame callbacks and inspected menu pixels. | One Chrome/OS/provider configuration. Earlier off-Space errors remain a separate failure lane. |
| Native child surfaces in a stream | Display-bound window capture omitted the AppKit menu with inclusion disabled and contained it in later child-enabled source frames. | Enabled stream's sparse frames omitted it through 4.03 seconds and contained it at 5.04 seconds. This is a presence bracket, not exact onset or a proven SDK warmup delay; cause remains open. |
| Action handling to pixels | Move/resize run matched three markers at 8.72–31.79 ms. Longer run matched all 12 markers, 3.18–63.52 ms, median 8.13 ms. | Fixture action-handler timestamps, not physical input or agent dispatch. Sparse source PNG encoding adds probe overhead. No P80 production promise. |
| Geometry through move/resize | 22 actual source PNGs; predicted colored marker edges differed from observed edges by at most 0.884 pixels. Encoded size stayed fixed while content scale changed. | Authored fixture, one display/scale; not cross-display, sleep/wake, arbitrary app or input-coordinate qualification. |
| Broad keyboard delivery with receipts | Left and Shift+Right plus modifiers were retained by destination evidence while target was not foreground. Eight delivered input events; tap remained enabled, no reported gap. Twelve AX marker actions had separate handler evidence. | One declared action-block receipt; source PID is corroboration, not agent identity. No unrelated events occurred in this tap interval, so it does not prove concurrent-user filtering. |
| Source packet prototype | `normalize-source.py` emitted source-relative times, geometry segments, candidate transforms, evidence paths, handler-to-frame joins, receipt and delivery reasons. All 12 joins passed; changed PID rejected. | Private qualification artifact, not an installed MCP contract. Unqualified raw input coordinates are retained but withheld from composition positions. |

The longer stream had 1,110 callbacks, 1,106 complete frames and zero PNG
write errors. These are observed counts, not inferred dropped-frame counts.
SDK status alone must not be used as proof that a requested transient surface
has appeared. A first preview displayed incorrectly; direct PNG inspection
established an absent menu rather than an entirely blank window.

## Findings that change the implementation plan

Three standalone probe processes started together stalled before producing
evidence. A bounded stack sample showed repeated ReplayKit/ScreenCaptureKit
capture-service disconnection callbacks. They were terminated; sequential
retries succeeded. No engine restart was needed. Root cause and whether it
is specific to process startup remain unresolved. Previous dual recordings
inside the engine did succeed, so this is not evidence that all concurrent
capture fails. Add admission control, wall-time startup deadlines, failure
evidence and measured recovery before recommending redundancy. The final
probe now has a wall-time watchdog and at most two pending PNG buffers.

A browser debugging banner and an unrelated tab appeared in the owned Chrome
window during this pass. The fixture tab alone was closed; the shared window
and other tab were preserved. Window creation does not establish perpetual
exclusive ownership. Treat browser UI/layout shifts, provider decorations
and tab changes as disturbances, with source/action provenance. Do not
cancel another workflow's debugging session or close its window in cleanup.

A pointer-like visual in Chrome remained after excluding Sky's application
from a display capture. That rules out this exclusion as a complete fix for
that visual in this observed state. Its owner and exact rendering mechanism
are not established. Separately qualify provider decorations and app content;
do not promise universal cursor removal based on the native helper result.

## Next gates still open

1. Shared versioned facts and declared action blocks now have a tested store.
   Automatic supported action receipts and simultaneous agent/user attribution
   still need qualification.
2. The source candidate now has options, filter-aware tap identities and old-
   engine refusal. Live SDK/preview routing and installation remain pending.
3. Cross-display/scale and sleep/wake synchronization; injected pointer
   coordinate semantics; menu overflow beyond the frame; source handover.
4. Repeat the delayed AppKit menu case and qualify stable daily-app depth
   lanes, including Electron, with recovery and updated version facts.
5. Realistic motion/resource budgets for redundancy. Probe PNG overhead is
   not a production encoder budget; small static clips are insufficient.
6. Turn the demonstrated source packet into the MCP consumer contract with
   source-only verification effort tiers. Final effects/render recipes stay
   in the later composition phase.

## Evidence and cleanup

Private bundle: the existing `capture-qualification-2026-10-08/gates-v2/`
directory under this chat's visualization folder. Key files:
`isolated-retry.json`, `marker-series.json`, `geometry-pixel-proof.json`,
`marker-input.json`, `action-receipt.json`, `source-packet.json`,
`menu-readiness-samples.json`, `chrome-native-stream.json`, and the source PNG
directories. Input logs contain key codes, not characters; unrelated
transcript bodies were not imported into this qualification bundle.

The task-owned native fixture and browser fixture tab were closed; its
loopback server and probes stopped. Other Chrome tabs/windows were preserved.
Final engine/recording/process checks are recorded with the private results.
