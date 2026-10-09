# Agent usage and recovery

This is the capture-foundations production runbook. The installed native build
3ff4c4519dc8 and fresh adapter0.11.3 have the scoped proofs in
[GATES.md](qualification/GATES.md). Treat these as a baseline, then inspect
loaded status. Visual effects, cursor styling and composition recipes are the
next phase. The [checklist](qualification/checklist.json) tracks unresolved
qualification; this runbook does not certify those environments.

## Choose the production arrangement

Reuse the user's current authorization and respect a later pause. Explain
whether actions will take focus, what can disrupt this particular source and
how to recover. Ask for a production interval only when needed and not already
authorized. Keep user input available. A display reservation is cooperation:
keyboard focus and global shortcuts can cross displays. No per-display input
lock or zero-collision guarantee is available.

| Arrangement | Agent behavior | What the user can expect |
| --- | --- | --- |
| Background | Passive capture, metadata and source checks; no agent-driven UI promise | Display/rect footage can include unrelated pixels and occlusion. A window source still needs source verification. |
| Cooperative | Drive the agreed target within the authorized interval; explain likely focus changes | User interruptions are allowed. Mark affected intervals and preserve useful footage. |
| Reserved interval | Use an agreed production interval for the intended shot | Input remains available; stop visible work when the user pauses. No automatic extension of consent. |

Start with loaded `status` and an exact `windows` result. A fresh adapter reports
`mcp_adapter.replay_policy:1`, `production_planning:1` and
`source_frame_mapping:1`. CLI status describes the native engine; it cannot
identify an already-loaded MCP process. An absent adapter field is unknown,
not current support. Use the CLI if necessary without restarting peers.

Read-only CLI entry points:

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs status
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs windows Chrome
node /Users/taylor/src/github/dotfiles/src/record-screen/cli.mjs production-plan '{"target":{"type":"display","display_id":1},"mode":"background","activity":"passive_capture","duration_s":30}'
```

`production_plan` returns obstacles or `candidate_requires_source_check`.
It starts no recording, applies no capture settings and grants no UI permission.
For an exact window, confirm native identity and source content independently
of DOM/tab automation. A background tab screenshot can succeed while native
capture still targets another tab or an off-Space window. An on-screen flag
alone also does not prove input delivery. Do not capture unrelated content to
diagnose a failed owned-target preparation.

## Aim and qualify only the changed boundary

The default window inventory contains normal windows. For a missing floating
panel, use `windows {include_transients:true,app:"com.apple.finder",
on_screen_only:true}` or the CLI JSON form. Check native
`capabilities.transient_window_inventory:1` and fresh adapter
`mcp_adapter.transient_window_query:1`; explicit scope is refused on older
native engines. Narrow by app/title and inspect the actual ID, PID, layer and
extent. Membership is discovery, not semantic parenthood, input ownership or
pixel presence. Exact-window planning includes broader inventory when supported.
The scoped Finder Quick Look lane captures its layer3 panel directly; see
[Finder qualification](qualification/FINDER-TRANSIENTS.md). Verify current
identity and encoded pixels before depending on it. Keep display insurance for
unqualified surfaces rather than assuming all popups have the same behavior.

| Source | Selection and narrow check | Limits and fallback |
| --- | --- | --- |
| Window | Exact window ID, explicit child option, actual encoded pixels | Covered content may survive, but hidden/closed/off-Space behavior varies. Child inclusion may fit/shrink the parent. It does not establish arbitrary popup ownership. |
| Display/rect | Observed display and sufficiently padded desktop rectangle | Visible occlusion and unrelated content enter the source. A parent-sized crop can omit overflow. Preserve position and geometry when selecting a supplemental layer. |
| Window plus display | Independently verify both sources on the intended interval | Extra CPU/storage cost. Backup coverage must actually contain the missing pixels and motion. No automatic semantic rescue or universal capacity claim. |

Consult shared app facts using `computer_use_plan` or
`node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs plan
/absolute/plan-request.json`. Confirm the app/version/build, OS, provider/version,
surface, capture options and display environment. Unknown dimensions, missing
baselines, expired facts, conflicts or incomplete observation windows prevent
reuse certainty. A historical pass is not present readiness. Recheck the
changed boundary, retaining useful previous evidence.

Native AppKit and owned Electron menu scopes have passed; Chrome has both
passes and scoped omissions. See [Chrome select evidence](qualification/CHROME-SELECT.md).
On external1×, a native select survived display footage but was omitted by
window/application filters. On the tested built-in2× case, child-enabled
window footage retained overflow and changed the fitted affine. Do not turn
either result into a cross-app or cross-display rule.

`show_cursor:false` requests capture-level system-pointer hiding. App-painted
pointers, text carets and some provider/helper visuals can remain in content.
Inspect actual footage. Separate helper exclusions need exact live identity;
observed identity changes interrupt affected takes, with an uncertain first
affected pixel. There is no general app-content cursor eraser in this phase.

## Record with explicit settings and broad contextual evidence

Open/recover an explicit session and retain its ID before scheduling. Pass the
selected duration, fps, width, codec, cursor and input settings explicitly;
planning values are not silently applied. Scheduling requires absolute start
and end times. Retain the recording ID and idempotency key. A requested interval
does not guarantee exact decodable boundaries or physical presentation.

Input Monitoring and Screen Recording are separate grants. The installed
Input Monitoring grant and delivered-event canary passed. Idle
`listen_access:true` is last observed, not a fresh delivery proof. A requested
input subscription rechecks access; inspect input gaps, protected input,
tap health and queue loss. Video can succeed with incomplete input telemetry.
Only request another canary when the relevant boundary changes or fresh
delivery evidence is needed; do not repeat the completed grant flow.

Preserve broad keyboard/shortcut evidence, pointer transitions, drag continuity
and scroll context. Destination, source PID, focus and action intervals are
clues rather than authenticated human/agent ownership. Same-app other-window
keys can remain unresolved candidates. Keep inclusion reasons and uncertainty
for the director's semantic refinement. Do not invent physical rate coverage
from sparse virtual input or infer a session identity from zero-valued tags.

For native CUA, explicitly begin a compact `action_begin` before the operation,
retain its token and close promptly with `action_end`. Include intent and rich
before/after context. A missing future source cannot be the launch target:
scope the actual controller with explicit launch intent, then resolve the
launched source before its input operations. Never fabricate a PID.

Supported callback consumers may use `lib/recorded-workflow.mjs`. The operation
runs once; verification and cleanup are separate hooks after the scope closes.
Native CUA is not automatically intercepted. Import the terminal reply with
`evidence.mjs recorded-action`, publish independent `outcome`, then read back
`audit` in the exact session. Dispatch/delivery is not verification; successful
verification is not cleanup. Counts do not establish historical task success.
Publish new reusable app observations centrally, including ordinary computer
use outside recording. Keep raw media/events and literal sensitive text private.

For retained event inspection, use `recording_input` / CLI `input-query` with an
exact recorder-reception interval. Default preserves broad captured keys and
unassociated candidates; optional type/action-token filters expose their counts
without implying actor ownership. Snapshot/query-bound pages avoid bulk journal
loads and keep gap evidence independent of event selection. Source row order,
generation timestamps, unknown positions and actual media coverage stay distinct.
Fresh loaded status reports `retained_input_query:1`; older adapters can use the
CLI. See the bounded retained-input query section in README for limits and fields.

Verification callbacks must inspect actual operation/proof state before reporting
success. A returned receipt or evidence path is not verification. Match an oracle
to the recording's saved scope identity before joining events; a different fixture
PID is a failed precondition. If an earlier reported verification was incorrect,
append a corrected typed outcome and retain conflicting history rather than
overwriting the receipt or hiding the failed operation.

## Inspect coverage before accepting or recovering a take

Check the terminal manifest and `recording_source`. A closed zero-loss journal
does not establish every delivered event, pixel or decodable writer packet.
Use `recording_frame_map` / CLI `frame-map` for primary media. Request at most64
actual presentation-order frame indices, exact relative-nanosecond strings or
declared `CLOCK_UPTIME_RAW` host strings, with at most16 desktop points.
The service owns exact epoch subtraction, mux intervals and source/geometry joins.
Do not guess from nominal frame rate or current window dimensions.

Held frames preserve their referenced content time and affine. Use that map
even when a newer geometry segment exists. Inspect uncovered intervals, missing
references, unknown ends/transforms and accepted submissions without packets.
Failed readable media can still supply known coverage. Canvas bounds do not
prove visibility or ownership; declaring a provider clock is not calibration.
Malformed/unterminated journals are refused rather than silently salvaged.
Mapping bounds and busy/quarantine are per adapter process, not global capacity.

For inexpensive verification, escalate only as needed: metadata → representative
source frames → short mapped draft preview/export. Preserve actual source/time
mapping across derivatives. Full visual composition and effect recipes remain
deferred. A draft that omits the relevant interval cannot verify that interval.

| Observation | Next action | Preserve or verify |
| --- | --- | --- |
| UI call times out or its result is unknown | Read current app state and recover the same action token; do not blindly replay | Unknown/expired receipt, separate delivery/verification evidence |
| Schedule/stop/export reply is lost | Recover owned session/recording/export state before an explicit retry | Same IDs/key; mutation replay is never automatic |
| Native target is unreachable despite successful DOM | Continue independent work; seek minimal visibility help if necessary | Failed preparation, no capture claim, existing passes unchanged |
| User occludes or changes the production surface | Mark the affected interval; stop only the affected owned take if needed | Partial source, source clocks and geometry; user input stays available |
| Primary holds while backup still changes | Select independently verified dense backup coverage | Do not sample backup only at sparse primary timestamps |
| Source/exclusion identity or clock continuity changes | Preserve interrupted footage and inspect the uncertainty | Fresh narrow source/filter check; no automatic filter swap or end fill through a gap |
| Writer/source journal and media disagree | Use only actual known packets/intervals | Accepted decisions are not fabricated decodable frames; trim/reshoot only affected work |
| Discovery/encoder/stop work remains quarantined | Inspect status and retained unfinished reservations | No repeated producer spawn, whole-engine restart or peer interruption |
| Resource pressure exceeds the chosen envelope | Reduce owned work or preserve/stop affected owned sources | Current observations and take state; configured limits are not measured capacity |
| Cleanup inventory looks stale | Check known PID/window absence before another close | Do not reacquire an app merely to check cleanup; getApp can relaunch it |

Reshoot from a known application checkpoint only when replayable and needed.
Keep irrecoverable live gaps explicit. Redundancy is an option after scoped cost
and source checks, not the default for every shot. No automatic rollback or
whole-phase reset is necessary after a narrow failure.

## Resource and release expectations

Measured evidence covers a50s point-resolution pair, a110s moving/static window,
and a330s2000×1464/requested60fps pair. All passed actual media checks in their
written scope; the longer pair had327 fresh normal-pressure/nominal-coarse-thermal
observations. They do not establish requested-app representativeness, thermal
equilibrium/GPU/capacity, physical input rates or a P80 production duration.
Recorder CPU excludes fixture/WindowServer/GPU work; shared WindowServer costs
are observations, not attributable capture cost. Configured16 overlaps are
admission policy, not a production target.
Choose conservative effort, inspect current health and measure the new boundary.

Fresh0.11.1 planning exposes `production_storage_guidance:1`: the reference
scene's duration-scaled bytes/rows/packets and separate budget flags. A scenario
is not a prediction or safe take limit. Inspect actual disk space and source
bytes/max_bytes/rows_lost; journal exhaustion can lose metadata while video
continues, and bounded readers can refuse a long intact source. For long work
choose explicit shorter takes at application checkpoints, preserve actual source
coverage at joins and verify each source. This plan splits/schedules nothing and
reserves no disk space. Older loaded adapters can use the current CLI without
forcing a peer restart.

Routine agents must not rebuild/restart simply to refresh capability discovery.
If authorized maintenance is needed, use the idle fence and preserve prior
binary/state. Read back actual loaded PID/build/capabilities and persisted state.
Private current/previous/current restoration passed its copied-state scope;
live producers and universal schema compatibility are not promised. Existing
peer adapters can load newer source at their natural safe launch.

Physical sleep/wake, natural OS/hardware faults, remaining physical/global
event attribution, some daily-app surfaces and broader routine provider adoption
stay explicitly open in the checklist. Controlled fault tests and retained
source proofs need not be repeated to conceal those limits.


## Finder menus and Quick Look have different capture lanes

The [qualified Finder lane](qualification/FINDER-TRANSIENTS.md) records native
context/Open With submenu in child-enabled parent footage, while Quick Look
file preview is absent. A padded display source caught the panel but missed
its title/text above the crop. Full display retained that content, with an
unrelated notification over the upper-right panel. Inspect the specific
transient and actual encoded extent; menu success does not qualify Quick Look.
Unknown provider version and changed environments need a narrow refresh.

Select/verify the exact file row before Space, then verify preview identity
before recording. A wrong folder preview and correction after a take ended
cannot establish requested-file coverage. Begin/dispatch/observe/end action
scopes promptly and perform media QA afterwards; an expired scope cannot be
extended to cover a later cleanup. Preserve its bounds and report cleanup
separately. Broad source retains unrelated pixels; keep private evidence and
show only necessary owned content in reports. Composition remains deferred.


## Check a declared transient region against actual footage

Fresh MCP0.11.2 recording_frame_map accepts desktop_regions with unique id and
desktop-point x/y/w/h. The service joins actual mux frames to their referenced
source map, then returns transformed quads/clipped polygons and continuous
canvas-area fractions. Declared canvas dimensions must match actual muxed media
before point/region projection. Unknown frame/metadata/transform remains unknown.
Use a checked extent and exact source sample, then inspect relevant encoded pixels.
The region is caller-declared: geometric containment cannot certify that a menu
or Quick Look exists in that source, is unobscured, or belongs to the agent.
Held frames retain older referenced content geometry. See README primary mapping.
