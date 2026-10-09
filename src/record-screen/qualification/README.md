# Capture foundation qualification

This is an opt-in qualification kit, separate from the installed recorder. It
does not change grants, synthesize input, filter user input, or restart either
service. Use computer use to interact with the fixtures. The native fixture
activates its own window; arrange production time before opening it.

The October 8 findings and proposed service contracts are in
[STRATEGY.md](STRATEGY.md). Effect styles and compositing recipes are deferred.
The staged live/background passes and remaining acceptance gates are in [GATES.md](GATES.md).
The qualified Chrome native-select fallback and its remaining boundaries are in
[CHROME-SELECT.md](CHROME-SELECT.md). It uses a separate display source layer;
child inclusion alone did not preserve that popup in the tested window lane.

The [TextEdit menu lane](TEXTEDIT-MENUS.md) preserves built-in positive/fitted
results and the external childtrue omission with verified app-only backup.
Reuse exact-environment facts and retained actual source frames.

The [Safari native popup lane](SAFARI-MENUS.md) has real select/change/dismiss
and editing-root evidence with continuous fixed-crop marker verification.
It also retains a black app tail despite geometric containment; do not treat
a source-map containment report as proof of visible target content.

## Helpers

`register-paired-anchors.py CONFIG.json --output FRESH.json` is an offline
registration experiment, **not an MCP source-map correction**. Use the bundled
Python runtime with NumPy/Pillow. Configuration requires absolute retained
`primary_image`/`backup_image` paths, `primary_scale` in pixels per desktop point,
a six-number `backup_affine`, and two to four explicit anchors:
`{"id":"heading","x":140,"y":478,"w":340,"h":40}`. Anchors must be disjoint,
spatially separated and independently useful; coordinates/scales are caller
hypotheses. Both scales must be positive isotropic0.05..8. Textured templates
must fit16..512 by16..256 pixels; primary search<=1million pixels, images<=8million
pixels/32MiB, FFT<=2,097,152 cells, config<=64KiB. Regular nonsymlink inputs and
fresh mode0600 output are required. No video decoder, subprocess, UI or mutation is
performed by registration itself; impose an owned deadline on the CLI process.

Optional `"sampling":"quarter_phase"` tries32 bounded templates per anchor:
quarter-pixel phase offsets with the original rounded-region extent and an
extent preserving the declared source density. Choose the highest score, then
apply the same score/margin/translation gates. The default `single` result is
unchanged, including actual retained refusal output. No arbitrary grid/kernel
or threshold options are exposed. Two to four anchors give at most128 trials;
one FFT/allocation budget applies at a time. Expanded trial-crop extents must
remain independent; adjacent declared anchors can therefore be refused. Score
is not a calibrated probability. Include actual parent and child structure,
then verify withheld regions; parent agreement alone cannot prove a popup match.

Normalized correlation>=0.8, peak margin>=0.1 and translation agreement<=2px
produce a spatial candidate only. A convincing wrong-region lookalike can have
high correlation; independent held-out pixels, exact source/time provenance and
coverage checks remain mandatory. Stage60 recovers an authored above-left child
within1.243px at four withheld markers, while both initial real TextEdit anchor
configurations refuse. Stage64's new parent-toolbar/child-selection anchors and
bounded phase sampling recover one real retained fitted frame: four withheld
menu edges within0.803px and two glyph supports within about1px. Brightness/text
correlations differ; this is spatial support, not pixel equality. A mismatched
real backup keeps strong parent matches but refuses on child ambiguity/disagreement.
The initial lower-child anchor still refuses. Production fitted-origin
guard and legacy-clock limits remain unchanged; do not loosen thresholds to
force a map. `register-paired-anchors-test.py` has21 authored acceptance/refusal
checks, including repeated scene ambiguity, missing content, inconsistent
anchors, wrong scale, overlapping anchors, allocation budgets and fresh-file
preservation, phase trial bounds, expanded-crop independence and default output.
Run with the same NumPy/Pillow Python runtime. One three-anchor CLI took2.69s/
156.48MiB maximum RSS; that is observed offline cost, not production P80/capacity.

`paired-map.test.mjs` checks exact two-source interval joins, dense backup across
held primary packets and whole-interval named-region durations independent of
segment page size. Rational partitions, dynamic clipping/outside states,
clock/journal/transform refusal, summary work budgets and option-bound cursors
have explicit positive/negative controls. Service retry guidance preserves exact
adjacent intervals at unchanged budgets, including actual holes/unknown clocks;
fractional/excess plans refuse completely. Actual fresh MCP/CLI summaries match
through real launchers with a GUI-style minimal PATH. Launchers use the shared
resolver for optional FFprobe; direct Node consumers use FFPROBE_PATH or PATH.
The existing source interval checks cover
held primary packets, primary-relative epoch conversion, rational boundaries,
holes/unknown tails, legacy/different-process/clock-gap refusals, fitted geometry,
failed prefixes, signed content age and snapshot-bound pagination. Actual-file
FFmpeg/MCP/CLI checks retain resolved capture scope, exercise an effective-child
override, reject changed cursors/symlink/malformed leaves and settle owned readers.
Run alongside `frame-map.test.mjs` after changing shared snapshot handling;
adjacent options/reconnect/planning checks cover the public adapter boundary.
The media is authored and isolated, without UI, installed recorder mutation or
physical-clock/content recovery proof. Stage58 also retains separate real native
private/installed passive pair evidence and previously decoded legacy app images.

`request-contract-test.swift` exercises native discovery/capture field sets,
per-surface targets, image/session/caller options and exact-window selector
predicates offline. Freeze/compile it with engine/bridge sources excluding
main.swift, `-parse-as-library`, Swift5/macOS15 arm64. Stage55 final69 checks
supplement actual signed native/MCP probes, including retained first caller
incompatibility. Parser success alone does not qualify SDK/app readiness or
installation. `options-test.swift` supplies adjacent source-identity checks.


`frame-map.test.mjs` checks service-owned exact primary mappings: dynamic/held
source references, host integers beyond JS precision, rational/order/boundary
semantics, failed media/metadata gaps, unknown transforms/durations, invalid
identities/queries, actual FFmpeg/MCP file readback and owned probe timeout/busy
settlement. The media fixture and hanging child are authored and isolated; no UI
or installed recorder mutation. Run with existing adapter boundaries after
changing public tool wiring:

```sh
node --test src/record-screen/qualification/frame-map.test.mjs \
  src/record-screen/qualification/options-mcp.test.mjs \
  src/record-screen/qualification/reconnect-mcp.test.mjs \
  src/record-screen/qualification/production-plan.test.mjs
```

`transient-fixture.swift` is an authored attached-child geometry oracle. Launch
through native computer use; delivered Open/Close controls create/remove a
nonactivating NSPanel outside the parent, with exact lifecycle stamps and known
colored markers. No input synthesis or protected-mode changes. Its UI buttons
are AX actionable; this proof does not qualify their visual appearance.

`verify-transient-geometry.py --recording MANIFEST --oracle ACTIONS.jsonl
--output FRESH.json [--expect-excluded]` joins each exact encoded sample to its
source-frame geometry, checks every parent marker, and verifies child presence
in all stable open samples and absence before/after. It requires one logged
cycle and an actual included/excluded setting; each phase has at least20 samples.
Quarter-second boundary margins/1.25px tolerance are explicit. The included
case must change and restore its affine; the control must retain one map and
omit every child pixel.30s owned decoder deadline/16MiB frame limit, fresh
outputs, retained stderr/timeline/phase images. Authored source QA only, not a
menu detector, compositor or provider/presentation-latency claim. See stage33
for real positive captures and frozen-map/wrong-marker negative controls.

`sample-resources.mjs CONFIG.json FRESH_OUTPUT_DIRECTORY` passively samples
explicit PIDs and the shared pressure status file. Configuration: `pids`
(1–16 positive PIDs), `seconds` (1–3600), `interval_ms` (500–10000, default 1000),
and absolute `pressure_path`. Optional `guard_session_id` + `guard_recording_ids`
(at most 4) enables a critical-pressure stop after session/state readback. No
stop replay after unknown reply, no process restart/kill or user-input lock.
Fresh output preserves prior evidence; missing/stale observations remain explicit.
Observer monotonic time is not capture time; wall joins are approximate. Engine
read/stop calls can delay observer completion. Natural critical-pressure latency,
GPU/thermal attribution and production capacity are unqualified. Optional
absolute `thermal_path` accepts at most4096 bytes from a regular nonsymlink leaf;
its PID must be among `pids`, and level0..3 must match the declared state name.
A matching observation less than15s old at serious/critical level can activate
the same owned-stop guard. The motion fixture writes this coarse ProcessInfo
state every5s; it is not a temperature/GPU measurement or authenticated identity.
`resource-guard.test.mjs` checks owned single-stop, mismatch/settled refusal,
unknown stop without replay and stale-pressure refusal against a fake engine,
plus fresh serious thermal triggering and nominal/stale/mismatched/symlink refusal.

`sparse-recording-test.py --output FRESH_DIRECTORY` freezes the native writer
and runs owned off-screen buffers. `verify-sparse-finalization.py` independently
joins healthy/trimmed-case packets and checks endpoint exclusion, exact source
reference and decoded tail pixels. The take is `[start,end)`: endpoint samples
have no admitted interval; final padding copies the last successfully encoded
source. The deliberate unpadded encoder-failure diagnostic remains separate.
Stage52 retains a failed endpoint case and final corrected proof. No capture,
UI, permission or installation is involved.

`verify-motion-duration.py` joins actual mux/source timestamps to a supplied
motion lifecycle log and decodes the authored binary counter through its point
affine. It preserves timelines/stderr and rejects a mismatched stopped counter.
Declare `--scale 1|2` and optional `--minimum-motion-s`, `--minimum-static-s`,
`--minimum-duration-s`; `--decode-timeout-s` bounds the decoder to1..180s.
The fixture's `RSQualificationMotionSeconds` bundle setting permits10..600s
(default120). Duration and cadence summaries use actual encoded stamps/counters,
not the requested schedule. Stage37's330s Retina pair supplies one scoped profile.
This is source QA for the known scene, not generic motion detection, physical
latency proof, capture-clock calibration or a composition recipe.

`production-plan.test.mjs` checks mode/alignment boundaries, off-Space UI versus
passive capture, explicit runtime obstacles, per-layer cursor limits, measured
profile uncertainty, Retina parent-scale ambiguity, reference storage/reader
budget scenarios with unknown safe duration, and strict configuration. Its real MCP/socket fixture proves
planning performs only `status` / `windows.list`; invalid requests perform no
RPC. No UI, capture, install or user-input lock is involved. Run it with the
adjacent option and reconnect checks after changing the adapter:

```sh
node --test src/record-screen/qualification/production-plan.test.mjs \
  src/record-screen/qualification/options-mcp.test.mjs \
  src/record-screen/qualification/reconnect-mcp.test.mjs
```

Build Swift helpers into a task-owned output directory with `swiftc -O`.
`capture-probe.swift` and `stream-probe.swift` also need `-parse-as-library`.
Use the current SDK and existing Screen Recording/Input Monitoring grants.
No helper requests a new grant.

| File | Purpose |
| --- | --- |
| `capture-probe.swift` | SCK screenshots, explicit pointer/child settings, capture transforms, optional helper-app exclusion |
| `stream-probe.swift` | Bounded frame timing/geometry, explicit filters, optional sparse source PNGs and authored marker sampling; no encoder/input |
| `normalize-source.py` | Qualification source packet with relative times, geometry segments, receipt/delivery evidence and marker joins |
| `event-preflight.swift` | Existing permissions; demonstrates why unposted event timestamps cannot calibrate sync |
| `event-observer.swift` | At most 180 seconds, listen-only annotated-session tap; fixture destination or foreground evidence, key codes without text |
| `native-fixture.swift` | AppKit caret, app-painted arrow, native menus, controlled move and occlusion; task-local delivery log |
| `browser-fixture.html` | HTML menu, native menu/select targets, CSS cursor and content-painted cursor/caret, bounded local event counter |
| `serve-fixture.py` | Loopback-only fixture plus explicitly supplied cursor file; no directory exposure |
| `overlay-inventory.swift` | Window metadata for one supplied process only |
| `usage-inventory.py` | Native CUA tool namespace inventory across a supplied transcript directory; metadata only |
| `probe-supervisor.py` | Serial admission, wall deadline, owned-process cleanup and private partial evidence for qualification helpers; not engine recovery |
| `supervisor-test.py` | Synthetic stall, interruption, concurrency and recovery checks with no screen capture |
| `exclusion-test.swift` | Mechanical helper identity, stale SDK filter, PID reuse, capacity, fanout and callback reentrancy; no real apps or capture |
| `preview-exclusion-test.swift` | Persistent preview and request lease lifetimes, stale resolution/delivery refusal and cleanup; no SDK capture |
| `options-test.swift` | Offline target parsing and filter/child/PID source identity checks; compile with engine sources except main.swift |
| `options-mcp.test.mjs` | Isolated engine socket: reject unsupported controls before forwarding; no real capture |
| `deadline-test.swift` | Shared producer deadlines, waiter cancellation, ignored late completions; no SDK capture |
| `managed-command-test.swift` | Owned child stdout/stderr drains, bounded output, deadline, retained admission, forced-exit recovery; no capture or UI. Integrated into candidate exports/probes. |
| `export-test.swift` | Actual software MP4/GIF exports of a supplied synthetic VFR source; invalid parameters, saved packet maps, immutable names and effort defaults |
| `verify-export.py` | Independent software packet/pixel proof for the authored uniform-grey VFR fixture; not an arbitrary app-image oracle |
| `derivative-source.test.mjs` | Service-owned trim/GIF mapping, exact rational integers beyond JS precision, wrong identity/unknown clock refusal |
| `encoder-finalization-test.py` | Frozen private compile plus actual off-screen AVAssetWriter, blocked finalization, late callback, peer isolation and retained manager admission; no screen or UI |
| `verify-encoder-finalization.py` | Independently decode retained offscreen packet clocks and verify that late finalization preserves the interrupted outcome |
| `stream-stop-test.py` | Frozen controlled asynchronous stop and actual recording/admission/persistence proof; no SDK or UI |
| `delivery-readiness.py` | Read-only active-job, runtime/signature and missing-diagnostic assessment; never installs or authorizes restart |
| `maintenance-test.swift` | Controlled load/admission/census/token/expiry and pinned-restart policy; no actual process exit |
| `maintenance-mcp.test.mjs` | Client capable/legacy maintenance guards, without live changes |
| `build-guard-test.py` | Authored filesystem and compiler/signature adapters: refusal, retained preparation, cache reuse and verified backup; no live install |
| `startup-test.swift` | Actual recording state/watchdog races with a controlled preflight; no SDK discovery |
| `input-test.swift` | Mechanical event scoping, contextual service stamps, namespace/restart uncertainty, strict numeric boundaries and persistence faults; no UI |
| `input-overload-test.py` | Frozen actual input/scoping queues, ordered loss, dropped release, joining scope and tail flush; authored scalar samples, no OS tap/UI |
| `prepare-candidate.py` | Frozen signed native bundle outside production; never calls the installing builder or requests a grant |
| `admission-test.swift` | Future schedule and extension overlap/duration/lead admission, cancellation; no capture |
| `recorded-action.test.mjs` | Supported wrapper never replays UI after missing receipt; shared imported provenance |
| `tap-fault-test.swift` | Pure passive-listener fault policy: fresh observations, timeout budget, user override and generation reset; no OS input |
| `input-health-journal-test.swift` | Bounded input summaries/footer and optional replay of saved fault notifications; no UI/event synthesis |
| `journal-test.swift` | Bounded asynchronous writes, queue/byte/footer failures, exact timestamps and private files |
| `host-clock-test.swift` | Bracketed clock samples, signed zero-offset intervals, injected divergence/regression/uncertainty, journal boundaries and passive awake samples |
| `clock-interruption-test.swift` | Actual arming state: affected-only interruption, unfinished admission, peer preservation and late-result cleanup; controlled preflight prevents SDK/UI |
| `verify-overflow.py` | Supplied authored popup region: actual muxed proof, exact decoded sample/time, global map and independent glyph alignment; no automatic segmentation |
| `verify-journal.py` | Compare journal decisions against actual muxed samples; optional authored-fixture pixels via ffmpeg/Pillow |
| `coordinate-color-fixture.swift` | Declared sRGB references, app-delivered Quartz/local coordinates and painted click markers; move between displays through exposed controls |
| `verify-coordinate-color.py` | Join actual native deliveries, journal positions and decoded authored marker/patch pixels; ffmpeg/Pillow, point-resolution fixture only |
| `color-buffer-probe.swift` | One retained frame from the owned color fixture, BGRA/NV12 and default/709 matrix; observed tags plus VT/explicit CI sRGB PNGs, no encoder/input |
| `color-profile-audit.swift` | Passive actual display ICC fingerprints and reference transforms; no capture, settings or UI changes |
| `capture-color-test.swift` | Actual CV buffer tags, absent/wrong-type/oversized values, pixel-format and transfer changes; no source pixels or capture |
| `bridge-probe.mjs` | MCP initialize/tools-list only, no app-server/model turn |

`capture-probe WINDOW_ID MODE OUTPUT.png [CURSOR] [CHILDREN] [MARGIN] [EXCLUDE_PID]`

Modes: `isolated`, `included-window`, `app`, `rect`, `rect-excluding-pid`.
Exclusion is for the supplied, verified process only. Padding applies to
display-bound modes; isolated-window capture stays at the window's size.
For a baseline, change one setting at a time. A capture error is a finding,
not proof that the target is empty. Inspect saved images and actual stream
frames, not just automation screenshots.

`event-observer FIXTURE_PID SECONDS OUTPUT.json`

Resolve PID/window ID again before and after a take. Discard comparisons
spanning a fixture restart. Global focus is weaker than explicit delivery;
an AX button action can change pixels without any mouse event. This probe's
scope rule is deliberately simple, not the final event relevance policy.
Outside-scope input contributes counts only. Capacity/disabled-tap counters
must stay explicit; production callbacks need further load qualification.

`stream-probe WINDOW_ID SECONDS OUTPUT.json [OPTIONS.json]`

Options: `mode` (`isolated`, `included-window`, `rect`,
`rect-excluding-pid`), `exclude_pid` (verified process), `include_children`,
`margin` (display-bound only), `evidence_directory`, `sample_marker` (authored
native fixture only). Duration is at most 60 seconds; a wall-time watchdog
also bounds discovery/start/stop. Source PNGs are capped at 180, with two
pending buffers; skipped previews are counted. Do not mistake these helpers'
PNG cost for production encoding cost. Start sequentially until concurrent
helper startup is separately qualified.

Frame PTS, Mach display time converted to nanoseconds, callback reception,
scale, content rect and screen rect are preserved. Clock agreement does not
establish an action-to-pixel latency bound. Marker joins use fixture handling,
not physical-input or dispatch timestamps. Never interpolate through a
display reconfiguration without starting a new geometry segment.

## Fixture and cleanup

Wrap the native binary in a task-owned `.app` with a matching
`CFBundleExecutable`, `CFBundleIdentifier`, `CFBundlePackageType=APPL` and
`NSHighResolutionCapable=true`. It writes `native-delivered-PID.jsonl` beside
the bundle, containing no characters. Prefer its observed AX controls over
hard-coded coordinates. Use its explicit edge-menu button for repeatable
child-window tests; also test genuine right-click delivery separately.
The marker and resize buttons provide timestamped visual/geometry transitions
in `native-actions-PID.jsonl`, separate from `native-delivered-PID.jsonl`.

`origin-fixture.swift` runs one28-second independently logged cycle after an
actual native Start action: baseline, right, left, above, below, corner and
restoration. Its panels have no shadows; marker animation supplies source
updates. `verify-origin-metadata.py --recording MANIFEST --oracle JSONL
--output FRESH.json` inspects every actual decoded packet, keys stable phases
to the referenced source PTS (including held content), excludes250ms at edges
and keeps the1.25px center threshold. Optional `--app-backup` verifies the exact
owned app-only crop using its declared affine, without a fitted-union override.
Fresh output,16MiB canvas,60s owned decoder deadline and per-phase source images
are explicit. The known oracle union is unavailable to production; a false
reference-check flag must remain false. Stage68 retains the1.333px right-child
failure, actual identical-metadata/different-origin pairs, and a passing fixed
crop. This is source QA, not visual composition or a general menu detector.

`production-click.py prepare /absolute/private/signal.json` creates a fresh
empty0600 file. The requested notification's fixed click command invokes
`production-click.py click` on that exact file. `production-click.py watch`
checks it every7s without a model and emits one terminal ready/expired result.
It performs no chat delivery; the active orchestrator delivers once and must
respect the remaining interval. Native CLOCK_UPTIME_RAW supplies a recorder
stamp; CLOCK_MONOTONIC_RAW separately measures the120s allowance and watcher
timeout, with boot identity checked. Duplicate callbacks do not extend time.
Private regular files only; symlinks, incompatible clocks/boot and future times
refuse. Native Python3.9→3.14 callback/watch, duplicates, stale allowance and
clock/boot/symlink negatives are synthetically verified. No physical sleep or
unattended chat wake is claimed. Stage70 supplies an actual
human click, prepared start and active-chat signal through this revision; its
menu batch overran the120s allowance and remains failed.
Do not substitute unqualified cross-runtime `time.monotonic_ns` comparisons.

Before EACH next protected UI action, run `production-click.py check SIGNAL
--operation-s 10 --cleanup-s 20` on the original signal. Dispatch only when
`admitted` is true. Budgets are conservative estimates, not measured P80;
cleanup reserves10–60s and cannot be spent on another production action.
An expired/empty/invalid signal never admits. Check again after any tool,
transport or observation delay; do not reuse an earlier ready result. Keep
scopes short, leave time for dismissal/cleanup, and retain an overrun instead
of extending a click or replaying uncertain actions. The check is a snapshot,
not automatic native interception, cancellation or input locking. Nine boundary
tests include the stage70 late dismissal, wrong clocks/boot, future/invalid
stamps, duplicate nonextension, stale observation and unsafe signal files.
Run `python3 src/record-screen/qualification/production-click-test.py`.

`normalize-source.py --stream FILE --actions JSONL --input FILE --receipt FILE --output FILE`

This produces a private prototype packet, not an installed service API.
Transforms are candidates qualified against authored fixture pixels. Raw
input positions remain unavailable for composition until their coordinate
semantics are tested. Missing geometry stays unknown; origin stays uncertain.

Serve the browser fixture with:

```sh
python3 src/record-screen/qualification/serve-fixture.py --cursor /Users/taylor/Desktop/cursor.svg
```

Use an owned temporary tab. The default URL is `http://127.0.0.1:47861/`.
Close only owned tabs/windows, stop owned servers/taps, confirm no active
recordings or fixture process, and preserve evidence privately outside Git.

## Known experimental limitations

- Initial fixture crashed on closing a retained AppKit window. The final
  source uses `isReleasedWhenClosed=false`; closing the repaired occlusion
  window and main window was verified. This was a fixture defect, not an
  observed recorder failure.
- Initial event tap and first foreground-only comparison are insufficient
  to establish telemetry coverage. Destination-aware retest succeeded.
- Screenshot helpers initially used 1× scale before correction. Historical
  outputs retain their actual pixel sizes. Earlier isolated metadata could
  report requested padding although the image stayed at window size.
- `includeChildWindows` behavior must be tested per app/mode/OS. October 8
  AppKit results are evidence, not a universal guarantee.
- CSS/system pointer suppression and browser native menus are not fully
  qualified. Chrome on another Space retained an automation pointer-like
  residual and produced errors in some capture modes.

## Third-pass background checks

The supervisor wraps only task-owned qualification helpers. Use one admission
folder for the whole series, and a new output folder for each run:

```sh
python3 src/record-screen/qualification/probe-supervisor.py --output /absolute/new-run --admission /absolute/series-admission --timeout 30 -- /absolute/stream-probe WINDOW_ID 8 /absolute/result.json
```

It returns busy instead of starting a second helper, preserves stdout/stderr
and mechanical outcomes privately, and reaps its owned child/group after a
deadline or handled interruption. A retry is a separate explicit run. This
is not a root-cause fix for SCK startup stalls and does not change the engine's
unbounded startup path. Forced supervisor termination/power loss remain open.

```sh
python3 src/record-screen/qualification/supervisor-test.py
node --test src/record-screen/qualification/options-mcp.test.mjs
```

Shared app facts and action blocks live at the computer-use capability layer;
see `src/codex-bridge/CAPABILITY-EVIDENCE.md`. Source packets remain a private
prototype. Their consumer delivery and automatic receipts still need work.

## Recorder journal qualification

Candidate service contract: [SOURCE-PACKET.md](../SOURCE-PACKET.md). Do not run
`build.py` while preparing an isolated candidate: its default path replaces and
registers the installed bundle. Compile into a task-owned bundle, set its source
hash, sign with the existing identity and use a short `RECORD_SCREEN_HOME` path.
The Unix socket path must fit macOS's path limit. Never stop the live engine or
other agents' recordings for an isolated test.

`verify-journal.py --journal SOURCE.jsonl --video VIDEO.mp4 --output PROOF.json`

Add `--authored-fixture-pixels` only for this native fixture: it checks the
known marker against each geometry segment in decoded source footage. Failed
proofs remain evidence; do not accept a constant timestamp offset as exact
synchronization. Baseline track timescale and movie edit-list timescale must
both be verified. Preserve metadata equality separately from physical latency.

Taylor's standing visible-test permission expires October 9 at approximately
17:51 UTC. Input remains available; interruption is allowed. Reconfirm only
when scope/access changes or after that authorization interval.

The coordinate/color fixture writes `coordinate-delivered-PID.jsonl` beside its
owned bundle. Capture its window at `max_width: 440` for the authored sampler.
One take can contain external/home moves, native coordinate clicks and all color
references; retain delivery refusals separately from subsequent successful input.
The verifier's `--recording`, `--delivered` and `--output` accept absolute private
paths. It verifies all delivered clicks and reports color error; a successful
pointer proof does not mean color fidelity passed. Do not repeat the tenth-pass
click series solely to investigate color: target the buffer/conversion boundary.

`color-buffer-probe WINDOW_ID bgra|nv12 default|709 PRIVATE_DIRECTORY` admits
only the owned color fixture bundle. Compile this single `@main` file with
`swiftc -parse-as-library -O`, use a task-owned signed bundle with the existing
capture identity, and fail if the existing grant is missing. It requests no new
grant, retains one buffer, stops the stream, and has a 15-second process watchdog.
Keep runs sequential and verify actual child exit. `color-profile-audit` takes
one private output directory; ICC profiles and raw frames remain outside Git.

The fixture now logs backing/profile draw state separately and exposes Redraw
references / Use sRGB backing. The default preserves inherited app behavior for
diagnosis. Use the explicit backing control for nominal sRGB reference acceptance;
do not silently compare inherited display RGB against raw sRGB literals. The
eleventh-pass one-take reference and consumer proof is already saved; follow
new evidence rather than rerunning it to investigate another unrelated gate.

## Maintained progress checklist

Canonical states, scopes, evidence and transition history live in
`checklist.json`. The published page is
`/Users/taylor/src/docs/html/record-screen-strategies/checklist.html`, linked from
Capture foundations. Completed means verified for the stated scope; candidate
checks and installed delivery remain separate. Follow the current workflow state
and explicit pause/resume instructions. Checklist maintenance alone does not
resume the production goal.

Update after a material evidence/state change (replace the illustrative values
with the actual result):

```sh
python3 src/record-screen/qualification/checklist.py update ITEM_ID \
  --status partial --evidence 'Actual saved result and its limits.' \
  --next 'Remaining acceptance check.' --anchor ninth-pass
```

Statuses: `completed`, `partial`, `in_progress`, `needs_retest`, `pending`,
`deferred`. Use an empty `--next ''` only for a completed scoped check. Update
scope with `--scope` when acceptance criteria change. Do not mark a pending
release complete because an isolated candidate passed. Commands save history,
record Eastern time and immediately regenerate the page.

```sh
python3 src/record-screen/qualification/checklist.py workflow \
  --state paused --note 'Taylor requested a pause; no qualification tests running.'
python3 src/record-screen/qualification/checklist.py validate
python3 src/record-screen/qualification/checklist.py render
```

`render-report.py --evidence EXISTING_PRIVATE_BUNDLE --output
/Users/taylor/src/docs/html/record-screen-strategies/capture-readiness.html`
regenerates both pages and preserves the reciprocal links. Verify that all
checklist evidence anchors exist in the report and the published revision
matches the canonical ledger. Read `../AGENTS.md` for the required update policy.

## Transient-region spatial kit

Installed qualification: `installed-consumer-smoke.mjs ABSOLUTE_PRIVATE_OUTPUT`
uses a tiny passive crop, disables input capture, tests owned admission, then
requests one idle fenced restart. It is a production mutation kit, not a casual
background test. Optional retained capture and export run paths resume completed
work without replay. Keep raw media/state output private. `reconnect-mcp.test.mjs`
uses only authored sockets to prove read recovery and single mutation submissions.
MCP status reports loaded adapter replay policy; native CLI status does not.

`serve-fixture.py --fixture /absolute/authored-fixture.html` serves only that file
and the supplied cursor, never a directory. `browser-overflow-fixture.html` adds
an edge native-select/editing-menu surface. Keep its server in a retained exec;
a detached helper can disappear when its launching exec ends. Native popup
readiness requires observation beyond DOM/AX focus and window on-screen metadata.

Use `verify-overflow.py --recording RETAINED_MANIFEST.json --reference SCREENSHOT.png
--reference-metadata CAPTURE_METADATA.json --region X Y W H --original-frame
GLOBAL_X GLOBAL_Y W H --output NEW_PROOF.json`. Bounds use source pixels; the
original frame uses global points. The verifier requires one axis-aligned geometry
segment and equal reference/source scale, preserves the exact decoded frame time,
and refuses an existing proof/crop name. Supply only an independently observed,
authored popup region; this is not an arbitrary-app image oracle. Source journal
closure, spatial alignment and simultaneous scene recovery are separate claims.


### Off-screen encoder failure isolation

Run `encoder-finalization-test.py --output /absolute/private/new-stage`.
The output directory must be new: failures, compile logs and authored videos are
preserved rather than overwritten. The builder freezes engine/bridge sources,
appends fixture-only accessors to the copied Recording/Recordings files and sets
`RECORD_SCREEN_QUALIFICATION`. The production build excludes these accessors and
queue-blocking hooks. It never installs or requests screen/input permissions.

The test feeds authored 32×32 pixel buffers through the actual writer, blocks one
finalization queue before encoder calls, and verifies the real watchdog, healthy
peer finalization, far-future admission, journal closure and late-return policy.
A separate controlled callback-before-call-return case keeps admission until both
conditions settle. This is fault handling, not a natural hardware hang or resource
stress test. Probe retained MP4 packets independently; complete journal rows do
not imply complete video coverage.


Run `stream-stop-test.py --output /absolute/private/new-stage` for the controlled
stop lane. Its accessors are appended only to frozen qualification copies.
Run `delivery-readiness.py --candidate /absolute/candidate.app --output
/absolute/private/new-assessment` for a live read-only inventory. It preserves
before/after status and job responses, checks signatures and source stamp, and
keeps missing legacy diagnostics unknown. Its result does not reserve admission
or authorize a restart. Both tools preserve prior stages rather than overwrite.

### Native gesture receipts and pixels

`gesture-fixture.swift` is an authored AppKit drag/wheel delivery oracle. It logs
only events delivered to its canvas, with raw CG timestamps/points, independent
AppKit-to-Quartz coordinates and scroll fields. It neither installs a global tap
nor synthesizes input. Raise its observed window and verify native screenshot
readiness before a coordinate gesture; isolated capture readiness alone is
insufficient. Keep its delivered JSONL and video private.

Run `verify-gesture.py --recording /absolute/recording-dir --delivered
/absolute/delivered-PID.jsonl --output /absolute/private/proof-dir`. Add
`--require-input` after the installed recorder's human-approved Input Monitoring
grant. Without that flag, the result can prove pixels while explicitly reporting
zero input matches. It filters app receipts to the take's interval, checks exact
raw event timestamps/positions/scroll fields when present, and decodes the drag
endpoint and scroll stripe using the recorded affine geometry. Separately run
`verify-journal.py` for actual mux/source parity. Sparse CUA drag events do not
qualify physical trajectory density, touchpad phases or actor identity.

### Private signed restoration

Run `restoration-drill.py --current /absolute/current.app --previous
/absolute/preserved-previous.app --state-root /absolute/record-screen-state
--session-id ses_EXPLICIT --output /absolute/private/new-drill`. Use a real
lowercase recorder session identifier. The named session must contain only
terminal recordings and settled actions; scheduled/live state is refused.
The tool copies one session, relocates copied JSON paths, verifies signatures,
and loads current/fallback/forward privately with a short distinct Unix socket.
It verifies exact terminal source descriptors/counters, settled receipts,
unchanged original/copy hashes and an authored interrupted checkpoint. Each
owned process is stopped and reaped before the next bundle copy. Failure keeps
the private runtime; success keeps state, replies and signed bundle copies.
This does not install, request grants, record, replay actions, restore a live
producer or qualify production launchd rollback. Existing byte-identical decoded
media evidence can be reused without re-rendering.

### Typed recorded workflow

`recorded-workflow-smoke.mjs --output /absolute/private/new-dir --session
ses_EXPLICIT --recording rec_EXPLICIT --retained /absolute/retained-take
--proof /absolute/source-journal-proof.json` exercises the supported callback
wrapper against an installed engine. The explicit owned recording must be done.
It reads source, compares actual media/source hashes with already decoded copies,
closes the action before verification, confirms own action closure and publishes
typed outcomes to the shared capability service. It does not record, render,
request permission, operate UI, restart or replay a mutation. Retained proof and
byte identity preserve prior media checks without rerunning them. This tests
source-consumer workflow integration; it does not add native gesture coverage.

Run `node --test src/codex-bridge/scripts/workflow-outcome.test.mjs
src/record-screen/qualification/recorded-workflow.test.mjs` for outcome linking,
uncovered/future/conflicting/truncated claims, scope/payload refusal and exactly
once callback/hook behavior. See the shared CAPABILITY-EVIDENCE.md contract for
the CLI/MCP audit. Explicit reported results stay separate from evidence truth.

### Keyboard delivery and relevance oracle

`keyboard-fixture.swift` creates two owned AppKit windows with a key sink and a
real Command+Shift+K menu action; no text field is required. It logs delivered
codes/flags/raw CG timestamps and window clues beside its bundle, without text,
a global tap or input synthesis. Compile into a private bundle using the existing
native-fixture recipe, launch through supported native UI, and inspect readiness.

Use `verify-keyboard.py --recording /absolute/saved-recording-reply.json
--delivered /absolute/keyboard-delivered-PID.jsonl --action
/absolute/terminal-action.json --mode related --output /absolute/proof.json`.
Repeat `--action` for both windows. Related mode checks all delivered keys,
semantic execution, unresolved keyboard window ownership and action-token
separation. `--mode cross-app-shortcuts` checks an actual different-app
unmodified key plus shortcut: default unmodified exclusion, bounded candidate
retention and no stronger foreground claim. Original negative proof is valuable;
never replace it with a later passing take. Separately run verify-journal.py.

`keyboard-relevance-test.swift` compiles with the shared native
InteractionScope.swift using swiftc -parse-as-library -O. Its12 focused checks
cover known-other destination versus foreground, unknown physical destination,
protected input, target-app keys and none/shortcuts/all configuration. It supplies
no live physical/provider or actor proof. Full input-test.swift uses engine sources
except main.swift and the shared native sources;141 checks passed for this repair.

### Retina popup catalog and source-affine QA

`popup-catalog.swift` is a one-shot read-only CG window metadata probe, scoped
around an owned anchor ID. It omits titles and unrelated normal windows; same
PID/layer/overlap are candidate clues. Compile privately with `swiftc`, then run
under `probe-supervisor.py` with a shared series admission directory and bounded
deadline. A missing anchor fails explicitly. This is not a daemon or UI driver.

`verify-popup-affine.py` checks a supplied authored popup through the recorder
map after actual mux/source verification. Example parameters: `--recording`
terminal manifest JSON, `--catalog` saved probe stdout, `--popup-window` observed
candidate ID, `--reference-menu` independently cropped authored screenshot,
`--reference-scale 2`, `--frame-index 70`, and a fresh `--output` JSON. Explicit
reference resampling supports fitted child content, with no searched translation.
`--ignore-top-reference-pixels 124 --expect-absent` is the scoped contained-menu
control used in gates-v28; it is not a general absence detector. One geometry
segment and bright-on-dark authored glyphs only. Selected frames do not prove
complete shot coverage or dynamic overflow transitions. Dependencies match the
existing journal/overflow kits (Pillow, ffmpeg/ffprobe). New source QA remains
separate from the deferred effects/composition recipes.

### Bounded motion obstruction and backup QA

`occlusion-fixture.swift` creates owned controls beside the authored motion
window. Its private bundle `TargetFrame` dictionary supplies x/y/w/h desktop
points. Native Show places a floating opaque magenta cover for at most20s;
Remove/close restores the source. Inspect actual display pixels before assuming
its log means visible obstruction. Do not cover unrelated windows.

`verify-motion-insurance.py --primary /absolute/terminal-display.json --backup
/absolute/terminal-window.json --cover-log /absolute/occlusion-PID.jsonl --output
/absolute/proof.json --diagnostics` checks the point1000x732 authored motion
fixture at(120,110),12binary counter cells and same declared source maps. Both
media sources are independently probed/decoded. An incomplete primary permits
only an exact verified muxed prefix; the backup must cover planned time within
40ms and keep changing. Recovery selects actual backup samples without
stretching missing primary footage. Diagnostic frames/maps remain private.
This scoped oracle is not a general collision detector or composition recipe.
Failed-backup and non-overlapping-cover controls must reject. Dependencies match
the existing journal QA (ffmpeg/ffprobe; no additional UI control).

`sparse-writer-probe.swift` isolates AVAssetWriter from screen capture using
authored pixel buffers and sparse source times. Compile privately; run under
probe-supervisor.py with25s deadline and a fresh output folder. Ten variants
compare nanosecond gap boundaries, a microsecond diagnostic control and explicit
one-second held-buffer control. Saved NSError domain/code/underlying chain and
actual ffprobe packets establish the result. This reproducer intentionally
includes failed variants; its process exit alone is not writer success. It is
not the production repair or physical capture timing proof.

### Sparse recording repair and preserved failure controls

`sparse-recording-test.py --output /absolute/fresh/private/stage` freezes the
production sources and appends test-only owned32px frame hooks. It checks actual
writer resume, prior-source pixel references, bounded padding interruption,
protected clock-gap behavior, forced backpressure and raw unpadded error chains.
The production build has no test hooks or readiness waits. Original failed
harness stages remain private; virtual receipt times must follow supplied PTS
to avoid legitimately trimming a zero-duration accepted tail. Use ffprobe/journal
checks and decoded pixels, not process exit alone. Signed prepare-candidate.py
then builds without hooks; actual display/window capture qualifies live behavior.

`verify-motion-insurance.py` accepts repeated identical geometry declarations
from static/complete transitions while requiring every encoded-source transform
to match the authored map. A sparse obstructed primary is covered by the backup's
full dense source timeline; matching only the primary's sparse timestamps would
reduce recovered motion to1fps. The map remains QA, not a composition recipe.


## Real-app host observations

Use [RESOURCE-OBSERVATIONS.md](RESOURCE-OBSERVATIONS.md) for the bounded passive GPU collector and scoped TextEdit pair. Reported host utilization is not recorder/encoder cost or a safe admission threshold. Stage48 preserves actual source recovery and failed display occlusion without a reshoot.


## Callback failure reports and terminal recovery

Stage49 fixes lost workflow reports for frozen/primitive errors and provider-owned report slots. `RecordedWorkflowError` preserves the original as `cause`, while ordinary errors retain identity. Inspect `workflowReport`; unknown terminal receipt is not cleanup/verification failure and does not permit replay. See AGENT-USAGE.md and GATES.md stage49.

The installed smoke takes one fresh absolute private output directory and performs only controlled status-reader failures and one locally withheld end reply:

```sh
node /Users/taylor/src/github/dotfiles/src/record-screen/qualification/workflow-error-recovery-smoke.mjs /absolute/fresh/private-directory
```

This creates/settles an owned recorder session and scopes, with four typed failed/cleanup-complete outcomes and exact readback. It drives no UI/input/capture, requests no grant, and restarts no native or peer. On a qualification failure, inspect its saved session/action files and actual state before explicit cleanup; do not rerun blindly. Natural transport loss and loaded MCP policy remain separate gates.

## Declared target context checks

Stage69 adds target_resolution observed/declared without a new tool. Full input-test.swift verifies declaration-only exclusion from passive attribution and immutable terminal recovery. declared-context.test.mjs checks source snapshot uncertainty and contradictory identities. recorded-action/workflow tests check exact capability refusal before callbacks and persisted receipt/outcome resolution. Legacy normalization remains unchanged; no new media or physical input is generated. Real installed launch/close qualification and scoped post-close read relaunch evidence are in gates-v69.

### App-local delivery and same-app relevance canary

`interaction-fixture.swift` provides two owned windows and a non-text canvas,
app-local event logging, app-painted point markers and genuine nested native
menus. No global collection, input synthesis, literal text or actor inference.
Compile an owned private `.app`, drive it through native computer use, and keep
its delivery log alongside the recorder source. `verify-interaction.py --oracle
FILE --journal FILE --output FRESH` checks exact timestamp/type identity,
per-window sample coverage, key-code identity, receipt/delivery differences and
raw position agreement. Oracle app receipt is bounded by the take epoch and
terminal input-scope end; later activity is counted separately. Independently inspect actual encoded pixels and consumer queries;
this helper does not qualify physical rate, source transforms or menu overflow.

Stage72 retained28/28 delivered events in37 rows. App-delivered sibling keys
remain window-unresolved. Action filters can exclude that sample while optional
unassociated retention brings it back; neither mode proves human/agent identity.
Native menus can adapt into scrolling, ellipsized surfaces rather than overflow.
Do not call missing rows capture loss until the actual UI and encoded source are
compared. Keep expired scopes failed even when the pixels show success.
