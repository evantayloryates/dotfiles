# Qualification update — October 8, 2026

## Pause checkpoint — October 8, 18:55 UTC

Taylor requested a clean pause before the 3 p.m. call. Owned native fixtures,
input listener and isolated engines are stopped; no active recordings or action
scopes remained. Goal is paused until Taylor resumes. Production is unchanged.

After the measured listener-loop cost, source candidate 3a066b8a1c64 compiled with
window enumeration on a utility queue, one-query admission, stopped-generation
snapshot rejection and explicit age/stall/cost diagnostics. It has not been
launched/live-tested. Last live-qualified candidate remains 99752c4615cf. Resume
with its offload/lifecycle canary. Private pause/runtime evidence is in gates-v5.

## Fifth pass: input scope and contextual action blocks

Production remains the original signed engine (PID 840, build cd78c24b652e);
no installed binary, permission or input-lock state changed. This pass used
owned fixtures and isolated signed candidates db6985a8f52a and 99752c4615cf.
Taylor's 24-hour visible-test authorization remains in effect through October
9 at approximately 17:51 UTC. All raw evidence is private in gates-v5.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Scoped native keys | 36/36 AppKit-delivered key/modifier events matched recorder rows by order, type, key code and exact original event timestamp. Every match occurred without fixture foreground. | Current native fixture/CUA provider only; app-level delivery does not identify its input window or prove human/agent ownership. |
| Unrelated app typing | Separately owned app received 40 key events; zero keys addressed to that PID entered the recorded source after the declared action block ended. Outside-scope events contributed counts only (2,047 in the main take). | During a declared block, outside-app modifiers/shortcuts remain explicit candidates; all mode deliberately retains broader ambiguous keys. No guarantee of zero collisions. |
| Pointer/gesture signals | Main source retained movement, click/release, scroll, drag and right-click event types with source/destination/window clues. Queue overflow and journal loss both zero in this bounded run. | Pointer coordinates remain raw/unqualified. The context-menu click did not prove a visible menu in this pass. High-rate overload, other providers and physical input still need qualification. |
| Contextual action and pixels | Recorder stamped typing and an AX marker block. Fixture marker handling fell within its service interval; encoded before/after frames show red to green while another owned app occluded the target. AX changes need no fabricated mouse event. | Sparse visual evidence establishes this effect, not a universal presentation latency bound. Caller result remains unverified until corroborated. |
| Action recovery | Real isolated-engine restart recovered the open token as interrupted with null end time. Wrong caller was rejected; correct caller settled it without inventing an end timestamp. Callback wrapper ran once, stamped a mark, saved/read back a shared imported receipt. | Explicit native-CUA bracketing; no automatic global interception. List inspects newest 4,096 disk files, returns at most 100 and reports truncation/errors; explicit token lookup remains possible. |
| Offline policy and lifecycle | 138 assertions: scope rules, shortcuts, other windows, drag expiry, strict numbers/settings, exact service clocks, caller/session boundaries, expiry, concurrent close, private persistence and retry after failed publication. Nine schedule/extension assertions: 16 overlaps, rejected 17th, extension admission, lead/duration bounds and cancellation. | No input synthesis or SDK capture in these tests. Service stamps are observation times, not exclusive ownership. |
| Public and shared contracts | 14 Node tests passed: capability refusal before dispatch, explicit input settings, scoped action forwarding, wrapper no-replay behavior, imported provenance, restart uncertainty and existing shared-store regression. | Existing clients may need reconnect for new tools; current production engine deliberately rejects unsupported options. |
| Final signed native canary | Candidate 99752c4615cf received 8/8 delivered keys, zero reported input gaps, clean journal closure; five malformed RPCs failed with bad_params while the engine remained healthy. Listener returned inactive with zero subscribers after stop. | Secure-input, revoked grants, forced tap timeout and overload are not live-qualified; failures have explicit gap/status paths. |
| Source timing regression | Main take: 2,671 actual muxed samples; final canary: 573. All 3,244 match journal video times exactly, with zero lost rows. | Original event clocks are retained; normalized input v1 uses recorder reception time. Cross-clock/physical-input and sleep qualification remain open. |
| Context cost observation | Final candidate measured 115 context refreshes, mean 11.66 ms and max 41.50 ms. Raw event timestamp to recorder reception ranged 8.89–37.30 ms in its 8-key canary. | This is a component wall-cost/queue observation, not CPU or latency attribution. Move window enumeration off the listener run loop and benchmark before production recommendations. |

The first delivery comparison assumed a 10 ms handler window and matched only
11 events. That failed proof is retained. Exact original event timestamps and
ordered type/code matching established 36/36; handler lag ranged 0.480–32.982
ms. Do not erase this correction or convert it into a latency guarantee.

Two regression compiles initially failed because the shared checkout changed
while swiftc read it. Final source was frozen to private files; all four affected
suites and the full engine then compiled/passed. Total verified Swift assertions
including the unchanged 50-case deadline suite: 356. The reschedule admission
hole was fixed and tested: extending a take cannot quietly reserve a seventeenth
overlapping slot or bypass the three-hour/seven-day bounds.

Next: remove listener-loop context enumeration, qualify actual event clock and
coordinates across displays, broaden Chrome/Electron app lanes, audit historical
computer-use outcomes structurally, measure motion/insurance costs, then deliver
at a verified idle boundary with rollback and loaded-capability readback. Visual
effect strategies and final composition remain deferred.

## Fourth pass: signed candidate and recovery

The production engine remains unchanged. This pass used an isolated signed
engine, a task-owned native fixture and Taylor's standing visible-test permission.

| Gate | Actual result | Limit |
| --- | --- | --- |
| Shared SDK deadline | 50 assertions: shared producer, canceled waiter, uncooperative producer, fail-fast retries, ignored late success. Discovery/start/screenshot 3-second bounds and retiring-lane admission added. | Synthetic producer faults; not proof of recovering the actual capture service from every SDK stall. |
| Recording state/race handling | 12 assertions against actual recording scheduling/preflight: cancel/stop, eight-second production watchdog, late failures, retained unfinished admission, no peer restart. A failure reason was erased by later persistence; fixed and retested. | No synthetic SDK start seam or encoder-stall claim. Existing encoder-finalization restart behavior remains separate. |
| Signed live capture routing | Candidate cfd6e1f887d2, PID 53662, reused existing Screen Recording access. Native menu present with child inclusion, absent with explicit false. Exclusion resolved current Sky PID 4973. Identical filtered target returned tap; baseline/different explicit options returned independent lanes. | One app/display/configuration; stale-exclusion PID churn and Chrome/Electron depth still need testing. |
| Healthy peer survives failed target | Missing window failed; healthy display-crop take completed with 1,270 written frames, zero reported encoder drops, actual 44.302-second MP4. Scheduled cancellation passed. | Reported encoder drops do not establish every source callback/frame was delivered. |
| Interruption and recovery | Stopped only isolated candidate mid-take, restarted against same state. Take became interrupted. Partial MP4 decoded 292 frames across 10.012 seconds; next 8-second take completed, 228 written frames, zero reported drops. | Plain ffprobe nb_frames said 30 despite 292 decoded frames. Restored manifest counters were stale (1); now identified as checkpoints. Decode footage to establish actual coverage. |
| Source journal candidate | Asynchronous, bounded 64 queued rows/64 MiB per take; private JSONL, source/geometry/encoded frame linkage, exact decimal nanoseconds, declared semantic marks and explicit gaps. 122 overflow/clock/private-file/write/footer assertions passed. | Corrected H.264/Retina HEVC journals matched all 1,337 muxed samples exactly; zero row loss. Three HEVC geometry segments matched encoded pixels within 0.884 px. Cross-display geometry and physical-input timing remain open. No input collector or automatic native action interception claimed. |

Live timing correction: the first 25-second journal take had 716 samples and
zero telemetry loss, but every muxed timestamp differed by -1.643910 ms. A
1 GHz track alone did not fix the separately quantized movie edit-list offset.
Setting both movie and track timescales fixed the next H.264 (336 samples)
and Retina HEVC (1,001 samples) takes. The failed proof remains saved.

Correction: the original recorder already had an eight-second arming watchdog.
Earlier descriptions of all engine startup as unbounded were too broad. The
candidate isolates SDK-start failure from peer restarts, quarantines unfinished
work and bounds discovery/preview waits. Encoder finalization retains its own
15-second watchdog. Actual SDK process recovery remains a separate gate.

Private evidence is in `gates-v4/`: deadline/startup/journal test results,
signed candidate metadata, native source PNGs, filter/tap replies, unavailable
and canceled recording replies, interruption/readback, and recovery capture.
The first candidate was stopped, restarted, exercised and stopped again; its
fixture was closed and viewfinder lanes drained. Production was not restarted.
Final signed journal build 69ba825e0ce1 also passed real MCP readback, interrupted
checkpoint labeling and recovery. Its partial take decoded 759 frames across
26.021 seconds without a journal footer; the descriptor correctly reported
incomplete telemetry and checkpoint counts. A fresh five-second take closed
cleanly, and all 139 muxed samples matched journal timestamps exactly.
All 209 Swift assertions, nine Node tests and four supervisor tests passed.
Owned engines/fixture exited, active jobs and lanes were empty, and private
runtime evidence was copied into gates-v4/runtime-evidence. No new grants or
input lock; production remains the original build cd78c24b652e (PID 840).

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

The private unsigned candidate also passed a real socket status/list smoke:
capture-options v1 was advertised, no recordings or warm lanes were present,
and its owned process exited cleanly. No SDK capture or permission request was
made. Initial fixture state exceeded the macOS Unix socket path limit; the
engine rejected it explicitly, and a short isolated state path passed. Failure
and recovery evidence were retained; the temporary runtime state was removed.

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
