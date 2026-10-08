# Recorder-owned source journal v1

Candidate contract; production delivery is gated by the qualification report.
Use MCP `recording_source` or CLI `record-screen record-source <recording_id>`.
Socket consumers negotiate `status.capabilities.source_journal == 1`, then call
`record.source`. Legacy footage returns no source packet. The MCP refuses an
old engine explicitly. Replies contain paths and compact diagnostics, never
bulk frame rows.

This packet references the original capture video. Exported/trimmed/transcoded
files must not silently reuse its origin; derivative timeline mapping remains
a delivery gate.

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

Negotiate `input_timeline == 1`. New takes on capable engines enable passive
scoped input by default; legacy saved jobs keep input disabled. `record_schedule`
accepts `input: {enabled, ambiguous_keys, pointer_in_frame}`. No grant is requested
automatically; disabled/missing/revoked access and tap/secure-input interruptions
produce explicit status/gaps while video can continue. The shared listener uses
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
in status. Listener-loop window enumeration is a required improvement before
production latency/load recommendations.

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
