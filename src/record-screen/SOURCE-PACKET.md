# Recorder-owned source journal v1

Native build f314bb340344 is delivered; qualified scope and remaining limits are
in the qualification report. Loaded capability readback remains authoritative.
Use MCP `recording_source` or CLI `record-screen record-source <recording_id>`.
Socket consumers negotiate `status.capabilities.source_journal == 1`, then call
`record.source`. Legacy footage returns no source packet. The MCP refuses an
old engine explicitly. Replies contain paths and compact diagnostics, never
bulk frame rows.

### Primary media lookup without consumer synchronization code

Fresh MCP0.10.0 `recording_frame_map` or CLI `record-screen frame-map JSON`
accepts `recording_id` plus one array of actual `frame_indices`, exact
`relative_ns`, or `host_ns` with `clock_domain:"CLOCK_UPTIME_RAW"`. Optional
`desktop_points:[{x,y}]` receive service-owned source-pixel projections.
Loaded adapter status advertises `source_frame_mapping:1`; an existing older
MCP process must not be assumed to have it. The CLI needs no peer restart.

The response joins actual mux presentation timestamps to accepted source rows
and returns each referenced geometry. It retains rational video start/end times,
presentation and mux indices, source-content time, held reason, geometry segment
and explicit missing matches. Actual positive durations bound intervals; holes,
unknown tails and outside offsets are exclusions. A newer/current geometry never
replaces held-source geometry. Candidate affine qualification remains explicit.

Correspondence counts distinguish actual packets from accepted submissions and
source-reference coverage. Failed/interrupted readable media can return known
mappings with incomplete correspondence; an unreadable mux refuses without
replaying capture/export. Host epoch subtraction is exact, but declaring its
domain does not calibrate an external provider. Clock continuity and actor/input
uncertainty stay separate from media mapping.

The helper bounds queries, response size, regular-file reads and one owned
probe per adapter process. Symlink leaves, malformed/inconsistent snapshots and
oversized data refuse; a timed-out child keeps admission until actual close.
See [the usage/bounds contract](README.md#service-owned-primary-frame-mapping-october-9)
and [stage34 qualification](qualification/GATES.md#thirty-fourth-pass-service-owned-actual-frame-and-point-mapping).

### Sparse/static footage and writer failures

Negotiate `sparse_frame_padding == 1`. Native nanosecond media timing is retained.
A static source receives explicitly held copies at approximately one-second
intervals; bounded catch-up fills interior intervals before a resumed source.
`encoded_frame.held == "held_for_sparse_interval"` refers to the last successfully
encoded source frame, never to future pixels. It is neither fresh capture nor
interpolation. `source_packet.held_encoded_frames` counts accepted journal
submissions by reason, separately from actual media coverage and row loss.
Older missing fields mean unmeasured behavior, not zero held frames.

At most64 interior held frames are inserted per append. An oversized interval or
encoder backpressure that prevents safe padding trims/interrupts only the affected
take; it does not silently extend stale footage to claim completion. Clock-gap
interruption still disables filling through uncertain time. Exact source/video
nanoseconds remain strings; consumers do not reconstruct synchronization.

Negotiate `writer_failure_details == 1` for the first observed writer failure:
manifest/video outcome and a `writer_failure` journal row preserve observation
and requested clocks, status and a bounded NSError domain/code chain. Arbitrary
userInfo is not exported. Null means no observed failure/older evidence, not a
prediction of future encoder health. Actual muxed/decoded coverage remains
necessary: accepted submissions can exceed persisted packets.

An authored50s point1000x732/30fps pair survived20s obstruction with2371 exact
samples and zero dropped frames. The recovery QA map keeps the backup's dense
clock through the obstruction rather than replacing only sparse primary samples
at1fps. This is qualified fixture coverage, not an automatic arbitrary-app
collision detector, menu rescue or production-duration/capacity guarantee.
Final styling/composition remains the next phase.

### Ordered input loss (input_queue_loss v1)

Negotiate `status.capabilities.input_queue_loss == 1` for callback sequences and
ordered loss frontiers. Retained input rows carry exact `callback_sequence` strings
and the overflow total observed at their admission. Earlier queued rows never
borrow a later overflow count. A gap is emitted after earlier accepted callbacks,
or at scope end when no accepted callback follows it. Missing transitions clear
drag continuity; outside motion cannot inherit a drag whose release may be lost.

Gap `events_skipped` counts overlap this subscription. Global frontiers/type counts
can extend before its start and are explicitly marked global; destinations and
actors of omitted events are unknown. Newly joining scopes do not inherit old
loss. Type metadata is bounded and reports unrepresented counts. No omitted
positions, key codes, text or trajectories are reconstructed.

`source_packet.input_events_skipped_observed` and `latest_input_queue_loss` summarize
accepted gap metadata separately from `rows_lost`. A journal can close with
`complete:true` and zero row loss while input callbacks were lost. Missing fields
mean unmeasured/older behavior, and a loss gap itself can be lost by the journal.
Production ingress capacity remains 2048; journal capacity remains 64. These are
configured bounds, not measured provider-rate or workload capacity guarantees.

MCP adapter 0.8.0 reports `status.mcp_adapter.replay_policy:1`: only readbacks
reconnect automatically after engine loss. Mutations are never resubmitted,
including schedules with an idempotency key. Recover owned state before a new
explicit request. An absent adapter field means unknown/older loaded policy;
native engine delivery does not reload existing MCP JavaScript processes.

This packet references the original capture video. New capable exports carry
a separate `record-screen-derivative/v1` sidecar and never silently reuse the
parent epoch. Candidate delivery remains gated below.

## Clock discontinuities

Candidate capability `source_clock_continuity == 1` adds bracketed clock anchors,
explicit `clock_gap` rows and `source_packet.clock_continuity`. Older source
packets lack these fields; their continuity is unknown, not verified. Exact clock
values remain decimal strings. Receipt time stays `CLOCK_UPTIME_RAW`; the
additional `CLOCK_MONOTONIC_RAW` sample detects changes in the observed offset.
The two uptime reads bound sampling skew, including a signed interval around zero.

Frames link `receipt_clock_segment`, which identifies their receipt-time segment;
it does not remap frame PTS or calibrate a provider's raw event timestamp. A change
greater than the recorded 250-ms threshold, clock regression or unbounded sampling
bracket creates an explicit uncertain observation interval. Delayed callbacks
with both clocks advancing equally do not establish sleep. The 1-ms bracket
limit and threshold are reported in the policy; smaller changes remain unqualified.

The candidate interrupts only the affected take. It preserves partial footage,
ends at the previous observation/accepted frame boundary and disables the normal
held-at-end fill. An arming take fails without inventing media; unfinished startup
still retains admission until actual completion. No service restart or peer stop
is requested. Inspect decoded partial coverage or reshoot; do not interpolate
through the gap. Samples alone do not establish physical sleep duration or cause.
Journal loss and writer outcome remain separate from observed clock state.

Primary clock semantics: Apple's [uptime clock](https://developer.apple.com/documentation/kernel/1462446-mach_absolute_time)
and [continuous clock](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time).
Actual shared-host sleep/wake and all-provider clock equivalence remain open.

## Mapped previews and exports

Negotiate `derivative_source == 1`. `record_export` adds `effort` and `backend`:
draft defaults to software, 640-pixel maximum width and 12 fps; standard to
hardware, native size and 30 fps; full to hardware, native size and 60 fps.
Width/fps/backend remain explicit overrides. GIF defaults to software, 960
pixels and 12 fps, with a 60-second limit and at most 50 fps. MP4 supports
1–120 fps; the derivative mapping budget is 120,000 output frames. Native
size does not upscale. Presets select encoding effort, not visual effect styles.

The trim starts at the first sampling tick at or after `from_s` and excludes
ticks at or after `to_s`. The final frame's duration can extend to the next
tick. Decode from the beginning to preserve previously held content; round
source transitions up so future content is not pulled into an earlier tick.
The sidecar records requested limits, effective file coverage, grid boundaries,
actual output packet PTS/durations, corresponding actual parent packet PTS,
parent/source identity and an affine scale from parent pixels. Nonzero source
starts have explicit first-frame padding. Nanosecond/clock integers are strings;
time bases are rational. A parent packet reference is not an ownership claim.

MCP `export_time_map` takes recording ID, export name and 1–256 exact parent
relative-nanosecond strings. The service maps timeline positions into the actual
saved media clock, including GIF centisecond rounding. It returns exact rational
nanoseconds, the output frame index and a separate parent content-frame time.
Outside-grid offsets remain explicit exclusions. This avoids consumer clock
reconstruction; reception latency, protected input, pointer coordinate validity,
parent journal gaps and physical display presentation remain independent.
GIF viewer scheduling has not been qualified.

One owned export/probe child is admitted at a time. A caller deadline requests
termination, escalating only that child after 0.5 seconds; unfinished work keeps
admission until actual exit and pipe drains. Pipes are read concurrently into a
bounded buffer and keep draining after overflow. Probes have 30-second deadlines;
draft encoding has 120 seconds, other encoding 300 seconds. A stopped connection
never automatically replays an export. Partial files remain private diagnostic
artifacts. Names are immutable; default names include a unique suffix. Published
media requires a validated packet map; old engines refuse this contract explicitly.

Software held-frame tests matched all 264 decoded output frames across ten MP4/GIF
exports, including a nonzero parent start. A real isolated native take had 639
exact source/mux matches; its three 145-frame previews had correct parent packet
references, and real MCP source/map readback passed. A later full/native/60-fps
hardware export produced 725 mapped frames. The original differential GIF palette
lost a late color change despite correct packet counts on ffmpeg 8.1.2; full-frame
histograms fixed the authored pixel proof. These are candidate results, not a
general color-fidelity, encoder capacity, GIF playback or production-release claim.

Each new take writes a private `source.jsonl` alongside its video. It retains
metadata, not pixels or literal typed text. Outside-scope input contributes
counts only; ambiguous key/shortcut candidates during declared blocks remain
explicitly differentiated rather than treated as exclusively agent-owned. A header identifies the
take, raw target and host epoch. The capture row identifies resolved options,
current exclusions and settings. Every delivered screen callback with metadata
has a source-frame sequence, status, original rational PTS, normalized time,
receipt clock and available display-time ticks. Geometry changes become
segments. Encoding decisions reference their source frame, requested video
time, acceptance/backpressure and optional held-frame reason. Preroll at zero
and the held final frame remain distinct from newly captured content.

## Time and geometry

All nanosecond timestamps and offsets are decimal strings. Parse them as exact
integers, including negative preroll offsets. `epoch_host_ns` uses
`CLOCK_UPTIME_RAW`; video-relative zero corresponds to that epoch. Source PTS
conversion truncates by less than one nanosecond and preserves the original
rational timestamp. Display ticks are converted with the current Mach
timebase when conversion is safe; missing/invalid metadata stays unknown.

`encoded_frame.relative_ns` is the writer-requested timestamp, not a measurement
of physical display presentation. The candidate requests 1,000,000,000 for both the movie and video
track timescales: the previous default selected 600, losing sub-millisecond
precision; the movie edit-list offset can quantize independently. In corrected
H.264 and Retina HEVC fixture takes, all 1,337 muxed samples matched requested
timestamps exactly. Correspondence must still be checked against actual encoded samples
for supported codecs/players before claiming a delivered precision guarantee.
Apple documents the separate [track](https://developer.apple.com/documentation/avfoundation/avassetwriterinput/mediatimescale)
and [movie](https://developer.apple.com/documentation/avfoundation/avassetwriter/movietimescale) settings.
No physical-input latency, universal dispatch clock or sleep transition is
implied by this clock representation.

Each geometry row carries desktop screen points, source content points, scale,
content scale and source pixel size. The candidate affine matrix is serialized
as `[a,b,c,d,tx,ty]`, with `x'=a*x+c*y+tx`, `y'=b*x+d*y+ty`.
It remains explicitly candidate-qualified outside tested app/display geometry.
Do not silently extrapolate a built-in-display fixture result across displays,
sleep/wake, arbitrary app renderers or injected input coordinates. Missing
inputs yield a null matrix. No raw input coordinates are promoted to a
composition position by this contract.

## Gaps, completion and interruption

The asynchronous writer retains at most 64 queued rows and writes at most
64 MiB per take. Serialization/file failures, queue overflow and the byte cap
increase loss diagnostics rather than blocking video capture. Journal sequence
gaps identify omitted accepted-source observations; the descriptor/footer
reports total offered/written/lost rows. New journal descriptors and footers also
carry `video_outcome`: recording state, writer status, successful finalization,
accepted submission count and explicit unverified muxed coverage. Legacy or
unfinished output can have a null outcome. `record.source` surfaces this separately.
The real WindowServer-loss take closed its ledger but persisted 13 fewer packets
than its accepted encoder submissions; recovered footage must be probed before
using it. Frame spacing never substitutes for a
source-drop count. Encoder backpressure is separately recorded.

`state=writing` or `draining` is not final telemetry. `complete=true` requires
closed output, zero lost rows and no reported write error. This says the
accepted callback ledger closed cleanly, not that the OS delivered every
possible frame or that a menu appeared. A take can succeed with incomplete
telemetry; composing with it requires an explicit fallback choice.

After an engine interruption, saved counters are labeled
`persisted_checkpoint_not_final` and the packet is incomplete. Decode the
partial video to establish playable coverage; a fragmented MP4's `nb_frames`
metadata can undercount its decoded samples. No last-full-second promise is
made. Record marks have exact host/relative timestamps and caller-declared
ownership. Disturbance events carry observation clocks; the current window
monitor still polls once a second. Input/action rows are described below; other providers, overload and clock
transitions remain qualification gates.

The shared computer-use evidence service stores versioned observations and
declared receipts; it does not turn these metadata rows into automatic learning
or guaranteed ownership. Keep source files local and out of Git.

## Input and semantic blocks

Fresh MCP0.11.0 `recording_input` / CLI `input-query` consumes the terminal source
packet through a bounded, whitelisted interval query. Exact receipt offsets,
relevance reasons and unresolved same-app/action/actor metadata remain explicit.
Snapshot/query-bound pagination preserves source-row order and duplicate events;
gaps survive type/action filtering. It never loads bulk raw rows into an agent
response, reads characters or promotes raw generation timestamps/coordinates.
Known retained rows from incomplete terminal journals can be returned with missing
footer/coverage explicit; malformed or unterminated rows refuse the entire read.
Capture-excluded contents, actual video coverage and physical completeness cannot
be inferred. See README's bounded retained-input query contract and stage36 evidence.

Negotiate `input_timeline == 1`. New takes on capable engines enable passive
scoped input by default; legacy saved jobs keep input disabled. `record_schedule`
accepts `input: {enabled, ambiguous_keys, pointer_in_frame}`. No grant is requested
automatically; disabled/missing/revoked access and tap/secure-input interruptions
produce explicit status/gaps while video can continue. The shared listener uses
bounded background periodic context producers. Listener TCC/workspace/tap reads
and recording disturbance enumeration have separate pending/stale/cost status;
unfinished work retains its slot across listener/take closures. Unknown context
cannot inherit a previous generation's focus or secure-input snapshot.
`input_timeline.listen_access` is the last observed value, null before the first
listener startup; it is not a fresh authorization query in every status call.
Its observed-time field uses the conservative query-begin timestamp; context
diagnostics expose begin/end times so a stalled producer cannot make old focus
or permission reads appear newly observed when it eventually returns.
Per-event protected-input checks remain separate. Initial OS tap creation and
encoder/SDK operations can still stall; background context alone is not an
all-API timeout guarantee. The eighth-pass isolated native canary verified these
background workers and cleanup, with four exact delivered-key matches. This is
not a universal stall-recovery or physical-input latency guarantee.

The shared listener uses
at most 2,048 queued scalar events, and stops after its last recording unsubscribes.
Raw characters, Unicode text and clipboard contents are never read.

`input_event` retains type, key code/autorepeat or raw pointer/scroll/drag data,
source/destination PID, source tag, pointer window, modifier flags, contextual
snapshot time, relevance reasons, certainty and applicable action tokens. App-
delivered keys survive lack of foreground or focused text fields. Drag candidates
follow their starting scope with expiry; source PID cannot identify an agent when
providers multiplex callers. Child surfaces are candidates derived from app PID
and window layer, not proven parentage. The policy is shared native source in
`src/codex-bridge/native/InteractionScope.swift`.

Normalized input offsets use exact recorder reception time in CLOCK_UPTIME_RAW.
Original CG event timestamps remain separate and explicitly unqualified against
that clock. They matched AppKit event timestamps in the native canaries, but
this does not prove cross-provider or sleep-safe equivalence. Event reception
can lag generation; consumers must not infer a physical-input latency guarantee.
`position_for_composition` remains null until the provider coordinate convention
is qualified. Context refresh cost and last observed tap-enabled state are visible
in status. The eighth-pass listener-loop refresh averaged 24.7 microseconds
after periodic OS context moved to background workers. That bounded component
cost does not establish production input latency or resource capacity.

The default `ambiguous_keys=shortcuts` retains extra shortcut/modifier candidates
only during declared action blocks. `none` disables that extra temporal lane;
`all` retains every key code during the bounded block and can include human
activity. App delivery/focus evidence still applies in all modes. Agents use
intent and delivery/pixel evidence to refine these candidates; no zero-collision
promise is made. A complete journal does not prove complete keyboard coverage.

Negotiate `action_scopes == 1`, then bracket native work with `action_begin` and
`action_end` (socket action.begin/end). Begin validates the current exact bundle,
PID and optional window; it records verbose intent plus purpose/before-state/
expected-change/verification-plan context. Service stamps are exact decimal
nanoseconds; deadline is 1–120 seconds, 30 by default. Expiry ends attribution,
not the UI operation. Caller-reported result is not app-success evidence.
Recently closed intervals remain joinable to delayed queued events.

`action_scopes` recovers tokens by session/caller, including disk history after
restart (newest 4,096 files inspected; at most 100 returned; truncation/errors
explicit). A restarted active scope has interrupted state and null end time.
Closing requires the same declared caller/session, and repeats cannot enlarge
a settled interval. This is namespace checking, not authenticated agent identity.

Supported callbacks can use `lib/recorded-action.mjs:withRecordedAction`. It never
retries the UI callback after a receipt failure. Native CUA still needs explicit
bracketing. Optional shared evidence publication preserves rich context and exact
stamps as `recorder_reply_imported`, with ownership/result unverified; it does
not manufacture a verified native-provider receipt. Source action_scope rows
reference recorder-stamped blocks alongside video metadata and semantic marks.

## Sixth-pass platform qualification

The native fixture crossed built-in Retina (2×), external DELL (1×, negative
desktop origin), then returned. Four actual encoded marker frames matched
their own geometry matrices exactly. All 8,315 muxed timestamps and 24 delivered
key/modifier timestamps corresponded. This does not qualify raw provider pointer
coordinates, physical latency or sleep transitions.

Carbon protected-input canary produced enabled/ended gaps, omitted 24 delivered
protected key/modifier events and recovered six normal events. A secure field
alone stayed globally unprotected for the injected native provider; agents must
not infer protection from appearance or healthy listener status.

Chrome tab-provider actions changed DOM text without app-addressed OS keyboard
evidence. During the declared block, retained modifier/shortcut candidates were
addressed to Codex and remain uncertain. Rich service-stamped action receipts
provide operation context when a provider does not produce the OS event stream.
They cannot fabricate the missing delivered-key trajectory or prove ownership.

Eighth-pass export qualification also covered decimal cut boundaries: 0.07–0.14 s
at 100 fps produced exactly seven packets on the latest signed isolated engine.
Six authored final-repeat exports matched 139 decoded parent-content frames;
these checks do not establish arbitrary codec/color or viewer scheduling fidelity.

## Excluded helper lifetime (candidate)

Explicit display/rect app exclusions carry a recording lease against observed
bundle/PID/launch identity. A detected identity change interrupts the take and
preserves partial media; startup identity disagreement fails explicitly. The
manifest and `recording_source.exclusion_quality` report uncertainty, also retained
in the journal video outcome and derivative parent outcome. The observed host
stamp is not the first contaminated pixel. Successful finalization does not
establish clean footage. Resolve again before a new take. MCP requires
`exclusion_identity: 1` for a recording with nonempty exclusions.

Excluded frame checks require `preview_exclusion_identity: 1`. Each request
validates identity across resolution and image delivery; each persistent lane
holds its own lease. Identity change invalidates its newest buffer immediately,
retires only that lane, and releases its lease. SDK work retains its admission
slot until settled. The shared observer admits at most 16 exclusion leases,
including recordings, persistent lanes and in-flight frame checks; overload
returns `capture_busy`. Fresh requests resolve new identities. Fifteen mechanical
checks plus an owned live helper termination/relaunch canary qualified this
candidate policy. The live preview canary did not establish pixel exclusion
because its helper was on another Space; ninth-pass recording pixel proof remains
separate. Forced late SDK delivery and main-run-loop stalls remain unqualified.

Tenth-pass native CUA clicks matched app-delivered Quartz coordinates and raw
event timestamps exactly across 1×/2× displays, including a negative desktop
origin. Four decoded marker centers were within 0.5 source pixels of the saved
affine map. This does not promote every provider's raw positions: drags, scrolling,
physical input and other providers still need their own evidence. Requested CUA
screenshot coordinates differed from delivered points; use delivered events.

Six declared sRGB patches in three geometry segments exposed a color failure.
Retina samples differed by at most two 8-bit channel values; the external-display
segment differed by as much as 76. The software preview preserved all 18 sampled
source values exactly. Capture already requests sRGB; isolate actual SCK buffer
color metadata/pixel format and writer interpretation before selecting a fix.
Do not normalize these results by assuming the display profile is the cause.

Eleventh-pass diagnosis carried this source forward: cold BGRA/NV12 buffers on
the external display both shifted, while an explicit 709 matrix and CI sRGB
conversion did not repair them. The shift closely matched device RGB primaries
interpreted through the external ICC profile. Changing only the owned fixture's
window backing to sRGB restored raw references within one channel value. Its
actual recorded/preview path then passed 18 samples across three display segments
within two channel values, with exact preview preservation and 229 exact muxed
timestamps. This identifies the controlled backing-color boundary; it does not
justify changing another app's colors or applying a global inverse transform.

New source journals emit `color` rows when the observed pixel format or
primaries/transfer/YCbCr tags change. Complete source frames carry a
`color_segment`; absence before a complete buffer stays null. Source metadata
includes `color_segments` and `latest_observed_color`, with the requested sRGB
space kept separate from actual tags (the NV12 canary observed 709). Missing
fields/tags are unknown. Metadata summarizes accepted journal rows; loss/write
errors remain explicit. These are additive candidate fields, not an assumption
that legacy engines measured colors. HDR, physical colorimetry, viewer transfer
behavior and another application's original backing intent remain unqualified.

An `exclusion_quality.state` of `observing` means no identity change was observed
by that lease. It is not a general clean-footage proof; missing quality is unknown.

### Passive listener fault contract (candidate)

Negotiate `input_tap_faults == 1`. `status.input_timeline.tap_fault_policy`
exposes state, generation, observed faults, timeout attempts/limit and whether
callbacks are accepted or automatic restart is blocked. A timeout can recover
at most three times per listening lifecycle, using a fresh background permission
observation begun after the fault and an actual tap-enabled readback. User-disable,
exhaustion, failed recovery and observed revocation do not automatically restart
while subscriptions remain. End existing scopes and deliberately recreate the
listener after resolving the cause; starting another take alone cannot repair
that shared lifecycle. No recovery reconstructs omitted events.

Source descriptors/footer add `input_gaps_observed`, `latest_input_listener`
and `protected_input_last_observed`. Counts summarize accepted gap notifications,
with at most 32 named reasons plus `other`. Latest negative fault policy replaces
an older positive listener notification. Protection is null before an observed
enabled/ended notification. These are historical accepted notifications, not a
live-health or delivered-coverage guarantee; row loss/error remains authoritative.

Thirteenth-pass controlled faults and eight exact native deliveries verified
omission/recreation. A 750-ms passive delay produced no natural timeout. Physical
TCC revocation and broader provider coverage remain unqualified. Initial tap,
per-key secure checks and recovery SDK calls are not all bounded.

### Supplied transient regions and visibility limits

Fourteenth-pass padded display footage retained an authored popup outside the
original window frame. A decoded region and its exact source time/global affine
position matched an independent screenshot. `qualification/verify-overflow.py`
is a single-geometry fixture verifier; it does not infer menu ownership or perform
automatic segmentation. Its bounded crop manifest can preserve a source layer
for the later composition phase without copying unrelated background.

Window `on_screen`, app focus, an AX tree and a browser screenshot are different
observations. None establishes visible unoccluded display content or native popup
readiness. The same stage captured an isolated Chrome fixture while display
capture showed occlusion and native pointer delivery failed. A padded native take
also retained the popup while losing its base. Validate the intended source and
preserve disturbances; do not block human input or claim a usable backup merely
from finalization. Sequential sources do not prove synchronized whole-shot recovery.


## Candidate encoder deadline and retained admission

`encoder_failure_isolation: 1` means the candidate finalization watchdog has no
whole-engine restart callback. The affected recording becomes `interrupted`;
`frames_provenance` is a persisted checkpoint and `video_outcome` records failed
finalization with unverified muxed coverage. A closed/complete source journal
still does not certify the partial MP4. Decode before trimming, using another
source or reshooting. A late successful writer callback does not upgrade the
terminal outcome or generate a review.

`unfinished_work` distinguishes startup, encoder callback completion, encoder-call
return and stream-stop acknowledgments. Unfinished work holds admission even
when the requested interval ended or the recording is terminal. `capture_health`
reports unfinished IDs and terminal quarantines; the configured cap is not a
current hardware-capacity promise. Returned stream-stop errors remain unconfirmed
and reserved; this does not repeatedly spawn SDK work. If a producer never returns,
keep healthy peers running and choose maintenance at an explicitly idle boundary.

The controlled off-screen proof exercises actual AVAssetWriter output and
recording/admission code with a deliberately blocked queue. It is not a naturally
wedged encoder, stalled stopCapture proof, or a guarantee that shared hardware
cannot affect peers. Installed capabilities must be read back after delivery.


## Stream-stop diagnostics

`stream_stop_diagnostics: 1` exposes `unfinished_work.stream_stop_work` for each
recording: request count, held reservations, pending producers, overdue stops,
returned/unconfirmed errors, attempt states and the latest actual outcome.
Exact string host timestamps use CLOCK_UPTIME_RAW. The three-second diagnostic
deadline changes only the observed state; it does not cancel/retry the stop or
release admission. Successful actual SDK acknowledgment releases its reservation.
A returned error marks the producer finished but resource release unconfirmed;
retain that reservation until an explicitly idle maintenance boundary.

The result is SDK acknowledgment, not an independently measured hardware-release
assertion. Each owned SCStream is requested once. A late successful acknowledgment
retains deadline history and cannot revive a terminal take. Metadata is available
without waiting on the recording queue; a closed journal is separate from stop
acknowledgment and actual muxed coverage.


## Idle maintenance and delivery

`maintenance_fence: 1` exposes acquire, validate, release and restart operations.
Acquire fences new engine work before inspecting existing jobs. Active/scheduled
takes always block maintenance. Default leases require settled resources; explicit
`allow_unfinished_terminal:true` can prepare recovery of unconfirmed terminal
resources, retaining coverage uncertainty. It does not cancel/replay actions or
lock user input. Saved-history loading also rejects new capture/mutation work.

Leases expire after 5–180 seconds unless a checked restart is committed. Expiry
opens admission without restarting; commitment pins admission until actual process
exit. Tokens bind to that process. Inspect/validate the owner token immediately
before delivery; a read-only idle snapshot does not replace a fence. Lease clocks
are CLOCK_MONOTONIC_RAW, distinct from the frame journal's CLOCK_UPTIME_RAW.

CLI `build`/`restart` use these guards and submit restart once. They observe a new
PID and completed history loading, and build checks the expected loaded hash.
`--recover-terminal` is explicit idle recovery, not permission to stop active
peers. First legacy upgrades require `--legacy-idle`: missing legacy diagnostics
remain unknown and this boundary is unfenced. Normal installers do not infer that
flag. Prepared bundles and verified prior copies are retained; do not automatically
roll back or repeat a restart after an observation timeout. Inspect authoritative
process/build state and preserve partial source evidence first.
