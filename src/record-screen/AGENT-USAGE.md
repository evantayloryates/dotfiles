# Agent usage and recovery

This is the capture-foundations production runbook. The installed native build
9bfabf2dbb5c and fresh adapter0.14.0 have the scoped proofs in
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

Both harness registrations point to
`/Users/taylor/dotfiles/src/record-screen/bin/record-screen-mcp`. Stage62 verified
that exact launcher with a minimal GUI-style PATH: initialize0.14.0, 27 tools,
read-only paired mapping and `mutation_replay:"never"` in loaded status.
That proves a fresh launch of the registered path, not adoption by an existing
chat. Correct configuration, server start time and a matching native build do
not identify the adapter serving a particular consumer. Read its own adapter
metadata and tool schema; if absent, keep that consumer's policy unknown and
use the qualified CLI. Do not rewrite correct registrations or restart unrelated
peers to discover capabilities. After a lost mutation reply, recover owned
state before choosing an explicit retry, whichever consumer path is used.

For workflow quality, use typed action outcomes and explicit session audits.
Historical bridge turn completion/tool counts are execution evidence, not app
verification, cleanup or provider adoption. A later cleanup settlement may keep
the earlier verification object unchanged, with that distinction recorded in
context. Check helper executable identity before acting on an old PID: stage63
found a fixture PID reused by a live computer-use runtime and left it intact.

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

Native `strict_capture_requests:1` rejects unknown discovery/capture fields and
wrong-surface target selectors. Use `include_transients` exactly, put capture
controls inside `target`, and omit unused app/title selectors. An exact window
ID with app/title must match both current constraints or returns `target_mismatch`.
Fresh MCP0.12.1 strips its hide:false routing flag; scheduling attaches supported
unverified caller metadata. These contracts cover option/selector parsing, not
every RPC or all time/path/capacity checks. After an uncertain schedule reply,
read back owned recordings/sessions before an explicit full validated retry;
entry validation also applies to idempotent requests. Verify source pixels for
hidden/minimized/off-Space apps; no unconditional background-render promise.

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
| App-only fixed crop | One exact running bundle in `include_apps`, display/rect crop, native `application_filter:1`; inspect actual source | Same-app windows/actions can enter. No automatic tracking or overflow expansion; hidden/Space/menu behavior needs an app check. Observed process changes interrupt affected take and retire its preview; resolve a fresh take. |
| Window plus display | Independently verify both sources on the intended interval | Extra CPU/storage cost. Backup coverage must actually contain the missing pixels and motion. No automatic semantic rescue or universal capacity claim. |

`include_apps` accepts exactly one bundle and cannot combine nonempty exclusions
or window targets. Current CLI/fresh MCP refuse unsupported native capability
before capture. Inspect `application_filter_quality`; identity change remains
uncertain and observation can lag. This optional lane preserves changing authored
source beneath actual unrelated-app occlusion in stage51; TextEdit off-Space
readiness still failed. Use it as a qualified source option and retain explicit
fallback expectations.

Consult shared app facts using `computer_use_plan` or
`node /Users/taylor/src/github/dotfiles/src/codex-bridge/evidence.mjs plan
/absolute/plan-request.json`. Confirm the app/version/build, OS, provider/version,
surface, capture options and display environment. Unknown dimensions, missing
baselines, expired facts, conflicts or incomplete observation windows prevent
reuse certainty. A historical pass is not present readiness. Recheck the
changed boundary, retaining useful previous evidence.

For alternative footage, fresh MCP0.13.0 `recording_paired_map` or CLI
`paired-map JSON` owns synchronization across terminal primary/backup sources.
Pass a primary-relative interval; follow snapshot-bound pages to preserve dense
backup content across held primary frames. Retained same-process clock identity
is required for qualified timing. Legacy/different-process/unknown clock state
returns numeric candidates only. Read exact gaps, content age, per-source scope
and fitted-position guards; geometric availability is not captured-pixel or
rescue proof. Inspect the relevant backup pixels before choosing coverage. See
[the complete paired-source bounds](README.md#service-owned-paired-source-mapping-october-9).

Fresh MCP0.14.0 adds `include_coverage_summary:true` for at least one named
`desktop_regions` entry. The service sums exact durations across the entire
requested interval, even when the returned segment page is small. Read the
contained/clipped/outside and unknown-state durations for each source, with
`content_presence:unverified`. A contained menu region can still be omitted
from the footage. The summary uses the same candidate affines and fitted guard.
`coverage_max_segments` defaults4096, bounded1..16384; exceeding it returns
`summary_available:false`, not a partial result. Shorten the interval or choose
an explicit budget. Keep summary options/budget unchanged when following its
snapshot-bound cursor; page size may change. No consumer epoch or duration
arithmetic is required. Old adapters retain the CLI/fresh-launch fallback.

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

Use `recording_input` / CLI `input-query` with `include_context:true` to read
captured action snapshots alongside retained input. Fresh adapter0.11.4 reports
`retained_action_context:1`. Rich purpose/before/expected/verification context
is caller-authored. Exact start/end offsets support service-owned frame mapping;
a declared deadline is not an observed end. Source snapshots can remain active
after the live action store closes. Never backfill that later result into footage.
Up to64 overlapping updates repeat on input pages, identified by source_row;
inspect truncation and narrow the interval as needed. Event-type filters preserve
context; action-token filters constrain it. A claimed result is separate from
typed verification/cleanup. Actions outside capture can be absent, and empty
captured context stays empty. Visual/audio synthesis is the next phase.

For native CUA, explicitly begin a compact `action_begin` before the operation,
retain its token and close promptly with `action_end`. Include intent and rich
before/after context. A missing future source cannot be the launch target:
scope the actual controller with explicit launch intent, then resolve the
launched source before its input operations. Never fabricate a PID.

For TextEdit menus, consult [the scoped app lane](qualification/TEXTEDIT-MENUS.md).
Actual external-display footage omitted root/nested/typeface menus even with
resolved child inclusion, while concurrent app-only footage retained them.
Use paired-source mapping and independently decoded pixels to choose a useful
backup. Native discovery, delivery, interval coverage and content are separate
checks. After Quit, verify absence through independent process or recorder
reads; native app observation can expose a fresh Open-panel instance.

Supported callback consumers may use `lib/recorded-workflow.mjs`. The operation
runs once; verification and cleanup are separate hooks after the scope closes.
Native CUA is not automatically intercepted. Import the terminal reply with
`evidence.mjs recorded-action`, publish independent `outcome`, then read back
`audit` in the exact session. Dispatch/delivery is not verification; successful
verification is not cleanup. Counts do not establish historical task success.
Publish new reusable app observations centrally, including ordinary computer
use outside recording. Keep raw media/events and literal sensitive text private.

On callback failure, inspect the thrown error's `workflowReport` before deciding
what needs recovery. Ordinary writable errors retain their identity. Frozen or
primitive values, or a provider-owned report slot, become `RecordedWorkflowError`:
the original thrown value remains `cause`, with the workflow report alongside it.
Report attachment must not mask the original failure or invoke provider accessors.
Do not serialize raw causes/provider values into shared summaries.

If `receiptError` is present and no terminal receipt was received, use the retained
action token and exact session/caller with `action.list` to inspect actual state.
An independently observed terminal action may be imported and receive a separate
typed outcome. Keep the earlier unknown report intact. If still active/unknown,
retain that uncertainty; do not resend the operation/end request automatically.
Verification, cleanup and publication errors remain separate in the report.
Stage49 actual installed controlled callback consumer proved this path, including
one locally withheld successful end reply, without UI, capture or native restart.

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

Fresh MCP0.12.2 exposes `fitted_child_mapping_guard:1`. For an isolated window
with children enabled or unknown and observed `content_scale` other than1,
the service returns `transform_available:false`, reason
`fitted_child_window_origin_unqualified`, and null point/region projections.
Raw geometry and exact source/video joins remain available for diagnosis.
TextEdit's tall-menu lane disproved its declared fitted origin; do not bypass
the guard by applying that raw candidate affine to overlays. Use an independently
qualified source such as the tested full-app lane. Restored scale1 and explicit
child-excluded mappings retain their prior scope; this guard does not prove
arbitrary menu mapping or content presence.

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

For transient menus, inspect the finished take around the expected opening;
a current `frame_check` after disappearance cannot establish earlier coverage.
The installed TextEdit1.20/415 app-only test retained its typeface popup beyond
the document bottom with both child settings. The lower menu was crop-clipped.
Existing `recording_frames` at3/15/25s recovered before/menu/after through the
loaded chat MCP. Review seek requests use a600-timescale clock and returned
`frame_t_s` is rounded to milliseconds; exact geometry/source joins belong to
`recording_frame_map`. Copy inspected evidence privately before reusing the same
extraction offset, whose generated filename can be overwritten.

That TextEdit lane prepared a fresh owned document through New Document and
the observed Window > Move to Built-in Retina Display menu. Confirm inventory,
geometry and actual source pixels before recording. This qualified preparation
does not repair every existing off-Space document or guarantee Raise succeeds.
New documents may silently autosave into cloud storage. Track ownership and
save owned synthetic content into the requested private evidence directory
before quit; independently verify file content/location and PID absence. Preserve
unrelated documents and do not turn a Save sheet's permanent Delete into routine
cleanup. Context/nested menus remain separate unqualified cases in this pass.

Stage54 extends the installed TextEdit lane to context root > Font > Highlight
in app-only full-display crop and isolated-window childtrue sources. Actual
encoded before/root/submenus/after pixels pass; the stack fits the parent in this
placement. The root menu scrolls, so AX enumeration is not a promise that all
entries appear simultaneously. Capture starts before the menu action, and scene
checks happen while the menu is open. Preserve earlier childfalse/off-Space limits.

That take retains right-click and Escape down/up addressed to TextEdit even while
another app is globally foreground. Native submenu expansions appear without
additional retained CG events. Use declared semantic scopes plus source-linked
checkpoints for native AX actions; four retained events are not a complete UI
history, actor identity or physical rate measurement. Outside-scope counts do
not identify user events. Keep captured unknown ends separate from later outcomes.

Prefer the current CLI/MCP schemas over raw RPC. For opt-in broad inventory the
field is `include_transients`; confirm `inventory_scope:including_transients`.
Three mistyped raw calls with `include_transient` silently returned normal scope.
RPC success alone does not prove an option was applied. Those calls contribute
no transient-enumeration pass; actual encoded menu coverage is separate evidence.

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


## Turn rich context into a verified capture milestone

Before an action, declare purpose, before_state, expected_change and
verification_plan in an explicit action scope. Observe the actual app state,
close that scope promptly, and query the terminal source with include_context:true.
Keep its captured active/closed snapshots separate from later live action state.
Select actual media with recording_frame_map, inspect decoded pixels, then
publish a typed observed-state outcome linked to the imported terminal receipt.
A rich block or a delivered result is not verification by itself. Native CUA
still needs explicit bracketing; no automatic interception is implied.

Stage43 Finder selection milestones proved this path with real rich snapshots,
AX readback and actual frames465/795. A sample after the last action end was
outside media coverage; a covered earlier sample from the same take verified
the state without recapture. Never assume an action end or requested duration
is a valid video time, and do not rewrite the receipt to fit the source.

An empty interval gap list means no gap notifications in that interval. It
does not certify clean input: inspect total notifications, recording_source
protected-input state and retained event snapshots too. This take's secure-input
notification preceded epoch, with secure_input_snapshot=true on its delivered
pointer events; it established no new keyboard coverage.

## Unknown app dimensions cannot become reusable facts

Read the shared `computer_use_plan` result's `environment_policy_version:1`,
`environment_claimed_verified`, effective `environment_verified` and
`unknown_dimensions`. Reserved explicit unknown/unavailable/unspecified/unverified/
not_available values block reuse even if the caller checks the confirmation flag.
The passing fact remains visible, with its original entity/ID/limits; it does
not become a current readiness guarantee. Other named dimensions still require
actual metadata confirmation. Case/whitespace handling applies to reserved
sentinels, not entity-key normalization or arbitrary prose interpretation.

Stage47 reproduced the prior contradiction with the actual TextEdit fact and
verified current CLI/fresh shared MCP agree on blocked reuse. Existing loaded
consumers may retain earlier behavior; inspect the policy marker or use the
shared evidence CLI without restarting peers. Installed app version readback
alone does not establish native UI reachability: Chrome's current native app
observation timed out while its unrelated window was off-screen. Preserve that
window and qualify the failed precondition before dispatching or recording.


## When an ordinary chat still exposes an older MCP contract

Check the actual loaded status.mcp_adapter and enabled tools. Native engine
PID/build alone cannot identify the adapter version or its replay behavior.
Stage44 this chat could read a retained source while reporting no adapter metadata
and exposing no recording_input, recording_frame_map or production_plan. Its
schedule description still promised exact times and safe retries; those claims
contradict the current production contract and must not guide recovery.

Use the current CLI for missing capabilities, preserving the explicit session/
recording IDs and action scopes. Current input-query and frame-map were checked
against this ordinary consumer's source epoch and retained rich context without
a new capture or peer restart. Treat automatic mutation replay as never allowed,
even if old tool prose advertises safe retries. Recover actual owned state first.
Refresh only the relevant consumer at a safe launch boundary and read back its
loaded capabilities/descriptions. No native restart or global peer reload is
needed to refresh an adapter; do not infer adoption from a source-code update.


## Keep preceding input-health evidence visible

Fresh MCP0.11.5/current CLI input-query accepts include_health_context:true.
Use it with rich captured context when inspecting retained telemetry. It returns
bounded preceding/in-interval/untimed input-gap and listener observations, plus
protected/unprotected/unknown snapshot counts for all retained interval events
before filters or pages. An empty keyboard result can still have protected input.

Latest timed preceding protection/listener notifications use exact offsets and
remain historical observations; later notifications are not borrowed backward.
They do not establish continuous interval-start state or current permissions.
Check loss, untimed observations and truncation. Health summaries repeat across
pages, not a separate pagination stream. Defaults/cursors stay unchanged unless
the option is enabled. Current CLI is available while older MCP refresh is pending.
