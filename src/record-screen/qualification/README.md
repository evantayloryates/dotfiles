# Capture foundation qualification

This is an opt-in qualification kit, separate from the installed recorder. It
does not change grants, synthesize input, filter user input, or restart either
service. Use computer use to interact with the fixtures. The native fixture
activates its own window; arrange production time before opening it.

The October 8 findings and proposed service contracts are in
[STRATEGY.md](STRATEGY.md). Effect styles and compositing recipes are deferred.
The staged live/background passes and remaining acceptance gates are in [GATES.md](GATES.md).

## Helpers

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
| `startup-test.swift` | Actual recording state/watchdog races with a controlled preflight; no SDK discovery |
| `input-test.swift` | Mechanical event scoping, contextual service stamps, namespace/restart uncertainty, strict numeric boundaries and persistence faults; no UI |
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
