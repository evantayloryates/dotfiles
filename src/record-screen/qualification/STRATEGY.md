# Capture foundations: findings and next implementation

October 8, 2026. This pass qualified mechanisms on the actual Mac and built an
opt-in harness. The installed capture engine was not modified or restarted.
Visual effect styles, cursor animation recipes and composition rendering are
next-phase work. The supplied cursor.svg is a fixture asset only.

## What the tests establish

| Question | Evidence | Consequence |
| --- | --- | --- |
| Does pointer hiding remove every cursor-like visual? | Native video kept the text caret and content-painted arrow. Display video kept a separate software cursor despite `show_cursor:false`. | Report capabilities separately for system pointer, helper overlays and app content. |
| Can we remove the helper overlay without disturbing the desktop? | A scoped window inventory identified SkyComputerUseService's “Software Cursor”; excluding that process's application removed it in a display screenshot. | Add explicit capture-side overlay exclusions, resolved by bundle/process identity and verified every runtime version. Stream exclusion still needs qualification before delivery. |
| Is isolated footage always clean? | Native isolated video was clean of the helper pointer. Chrome isolated video kept a pointer-like automation residual near the HTML-menu button. | Clean-footage suitability is an observed app/provider/mode capability; Chrome residual cause remains open. |
| Are menus captured? | AppKit menu and submenu were present with child inclusion enabled; disabled inclusion omitted the menu. HTML menu was present in actual Chrome video. | Expose child inclusion and qualify transient surfaces explicitly. Do not infer coverage from the SDK description alone. |
| Does display capture always solve Chrome menus? | Chrome native-menu attempt on another Space caused SCK -3811 errors in several screenshot modes. Baseline isolated captures later succeeded; app mode also failed during an HTML-menu probe. | This is a constrained failure, not a universal Chrome result. Repeat while visible and distinguish menu presence, off-Space state and capture-filter failures. |
| Is foreground enough for event relevance? | Valid retest retained 46 key/modifier events addressed to the fixture; none had fixture foreground. 646 other events were counted without payload retention. | Prefer delivery evidence. Counts outside scope are not a contamination rate. Preserve uncertain events through explicitly bounded channels. |
| Do source fields identify the agent? | All retained events in this retest named the current Sky helper as source; source tags were zero. | Useful corroboration, not a durable agent identity. Require service/caller action receipts with session/action IDs. |
| Can capture own synchronization? | 1,178 complete frames: converted display time and PTS differed by less than 1 ns; median callback lag 0.391 ms, maximum 10.953 ms. Screen rect followed a controlled 80-point move. | Normalize within the service and preserve frame geometry. Action-to-pixel accuracy, sleep/wake and display transitions remain qualification work. |
| Can redundancy save a disrupted shot? | Matched 35-second isolated and display-crop recordings both dropped zero frames. Display footage was visibly occluded and clipped after a move; isolated footage retained the shot. Files totaled about 2.62 MB. | Use bounded, measured insurance for valuable takes. These small mostly static fixtures do not establish a resource budget. |
| Is shared computer use functioning? | Native typing/selection, AX button actions, menu interaction and cleanup worked; bridge MCP initialize/tool discovery passed. 2,555 native calls in 32 chats since September 17 were inventoried. | Core native mechanisms are verified here. Historical workflow success and fresh delegated bridge execution are not established by counts or discovery. |

The fixture's retained-window crash was repaired using
`isReleasedWhenClosed=false`; closing its repaired occlusion window and main
window was verified. A telemetry run spanning the crash/relaunch is invalid.
Initial no-event results do not prove that CUA bypasses all global event taps.

## Put shared knowledge in the computer-use capability layer

The existing shared Claude-to-Codex service is `src/codex-bridge`; native
Codex currently drives CUA directly. Neither inspected path has a demonstrated
central app-capability learning store. Skill-local RUNS/memories and bridge
timelines are evidence sources, not yet that store. Do not build a second
capture-only catalog of app behavior.

Create a service-facing capability store usable by both paths. Key facts by
bundle ID, app build, OS build, UI provider/version, surface kind, display
profile and tested capture mode. Store observation time, evidence reference,
sample count, result, uncertainty, failure/recovery cost and expiry. Never
turn a single successful take into an unconditional app guarantee.

An app entering scope gets a short baseline: focus/background access, native
menus, HTML controls, typing/shortcuts, geometry and cleanup. Stable apps then
get depth lanes with known good interaction paths and targeted canaries.
Keep breadth fixtures for unknown applications and system surfaces. App/OS
updates invalidate affected facts, not the whole knowledge base. Routine
computer-use outcomes should improve these same facts even when no recording
is running. Start with evidence-based updates and measured path selection;
this is not a claim of training a reinforcement-learning model.

Native CUA calls cannot silently be intercepted by an external MCP. Initially,
agents emit action receipts around supported calls; the bridge can journal
its own tool lifecycle. Join these receipts to observed delivery and pixels.
Later assess whether an officially supported shared action gateway can supply
the same receipts automatically without weakening CUA's routing policies.

## An interaction journal with relevance evidence

Use an immutable host-clock journal plus separate derived relevance views.
Store event sequence, host time, receipt time, type, destination PID/window
when available, source PID/tag clues, focus snapshot, geometry segment,
pointer location, button/drag state, scroll deltas/phases, modifiers and key
codes. Collect delivered density; never promise a particular hardware sample
rate or invent motion when an AX action bypasses pointer input.

For each agent action, preserve recording/session/caller/action IDs, intended
target, supported provider, dispatch start/end, actual result and semantic
intent. These receipts identify the action author; OS metadata corroborates
delivery. A screenshot or model assertion alone is not delivery proof.

Keyboard scope includes shortcuts, modifier sequences, menu accelerators,
non-text controls and system commands initiated by the agent. A focused text
field is not required. Where destination is unknown, retain an opt-in bounded
uncertain interval tied to an action, not all unrelated desktop typing. Keep
literal text separately opt-in; secure-input/access gaps remain explicit.

Relevance is a set of reasons and confidence, not one irreversible verdict:
explicit delivery; matching action receipt; drag latch from its initiating
surface; transient-child relationship; compatible geometry/time; foreground
only; unrelated destination; unknown. Allow many recordings to reference one
source event. Ownership of input and relevance to a story are distinct: a
human event may be relevant, and an agent event may belong to another take.

An agent can refine the derived view with semantic context. Preserve original
evidence and record overrides with reasons. Buffer/write off the input-tap
callback, monitor disabled taps, sequence gaps and capacity, and expose gaps
to consumers. The current bounded observer is a qualification prototype, not
that complete journal implementation.

## Recorder-owned time and coordinates

Record raw clock domains, their service-side conversion, uncertainty and
version. Use capture PTS/display time and delivered input timestamps as the
host timeline; wall time labels scheduling and audit only. Consumers request
artifact-relative times and positions without writing calibration code.

For each complete frame preserve display ID, screen/content rect, scale,
content scale, encoded dimensions, crop and presentation time. Generate
versioned transforms from desktop points to window/content points, source
pixels, cropped source and later composition pixels. Begin a new segment on
move, resize, display reconfiguration, scale change or source handover.
Represent preroll duplication, held frames and dropped frames explicitly.

Test host-clock continuity through sleep/wake, source resizes, cross-display
movement, negative desktop origins, variable refresh and concurrent streams.
Use visible action markers and frame analysis to qualify actual input-to-pixel
alignment; the sub-nanosecond clock agreement is not that bound. Geometry
must follow per-frame evidence, rather than the current one-second disturbance
poll being used as the sole coordinate history.

## Capture lanes and recovery

Prefer qualified isolated-window capture for clean stable footage. Add a
display-bound window lane with child inclusion and tracked padding for
transients. App capture is another lane, with resource and unrelated-window
tradeoffs. A broader display lane with selected overlay exclusions is a
fallback, not an automatic upgrade in every environment.

Detect a menu/tooltip/dialog using agent receipts plus app observations.
Preflight its actual presence in captured pixels. If the primary misses it,
try a qualified alternate source and preserve its global geometry and shared
host time. Use a bounded secondary stream or short ring buffer only when its
cost and privacy scope are understood. Transparent overflow layers, masking
and reintegration are composition-phase consumers of these source contracts.

Treat disturbances as source annotations: occlusion, focus change, move,
resize, hide/minimize, capture loss, helper-overlay appearance and unrelated
input. Preserve the last good interval and alternative source coverage.
Return recovery options: trim the interval, switch verified source, reshoot
from a checkpoint, or declare unrecoverable. Live/irreversible takes warrant
more insurance than replayable demonstrations; never blindly double every
stream. Benchmark incremental CPU, memory, GPU/encoder pressure, thermals,
frame loss and storage under realistic motion before recommending redundancy.

## Human expectations during production

Choose an explicit mode and state its limits before starting: background
cooperative capture; agreed display reservation; or approved production
interval when focus/input interference cannot be avoided. Agents must request
production time rather than silently competing with the user. The current
30-minute authorization is a test interval, not a future standing reservation.

Show target display/app, expected duration with measured P80 once available,
what actions may take focus, what user behavior could disrupt this take,
pause/cancel control and recovery status. Do not invent a P80 estimate now.
For dual displays, reserve the built-in screen only when requested/approved;
cross-display behavior and global shortcuts can still interfere. A display
reservation is cooperation, not a guarantee of isolated OS input.

Do not block user input prophylactically. If explicit input locking is ever
added, it needs a separate agreed mode, independent override and fail-open
watchdog, and evidence that emergency input is not captured by the lock.
Such locking was not attempted here. Interruption should mark/recover the
shot, not punish the user or silently prolong a production interval.

## Context blocks and inexpensive verification

Capture semantic blocks richer than the eventual cue: intent, action IDs,
before/after observations, target/transient relationships, completion evidence,
timing uncertainty and interruption/recovery notes. They become edit anchors
and inputs for concise visual annotations or audio overlays later. Avoid
reconstructing intent from pixel changes alone.

Specify verification levels now: metadata/coverage check; sparse source-frame
inspection around key events; short source-resolution preview; full final
render later. Return effort, cost estimates, source fidelity and untested
conditions. Low-cost checks must use the same timeline/geometry contract as
full output. This pass used existing source-frame extraction; it added no
visual effect renderer or recipes.

## Implementation order and acceptance gates

1. **Shared receipts and capability facts.** Central app/provider observations,
   bounded action journal, passive diagnostics, explicit delivery vs focus,
   and a native/bridge integration contract. Gate: concurrent unrelated user
   input plus agent shortcuts are attributable with uncertainty preserved.
2. **Recorder synchronization and capture options.** Normalized input/frame
   timeline, geometry segments, helper exclusions and explicit child inclusion.
   Gate: marker alignment across move/resize/display change and no changed
   behavior for existing unconfigured captures. Qualify streaming exclusions,
   not just SCK screenshots, before enabling them in production.
3. **App lanes and recovery.** Visible Chrome native-menu retest, Electron,
   native text apps, nested menus/tooltips/dialogs; disturbance/recovery events
   and measured secondary coverage. Gate: actual captured-pixel assertions,
   fixture cleanup, failure preservation and realistic resource benchmarks.
4. **Consumer contract.** Bundle source tracks, input/receipts, geometry,
   semantic blocks, provenance, QA and uncertainty with source-only preview
   effort levels. Gate: an agent consumes it without implementing sync logic.
   Effect recipes and compositing belong to the next phase.

Next experiments include an approved secondary desktop/session or staging
surface, source handover at menu boundaries, short retrospective buffers and
checkpoint-based reshoots. Assess permissions, observability, latency and
resource costs before treating those as capabilities. Virtual displays,
headless capture, app-specific caret hiding and input locks remain unproven.

## Evidence

Private artifacts:
`/Users/taylor/.codex/visualizations/2026/10/07/01a11731-ba1f-73c3-bd83-f107fd8b467b/capture-qualification-2026-10-08/`.
Recorder session: `ses_znmm2ude`; recordings `rec_9ysm6u63`, `rec_329z2bru`,
`rec_pwxrgkwx`, `rec_cu7uaw6w`. Initial and revised probe outputs are preserved
with their limitations; no raw user typing or transcript bodies are published.
