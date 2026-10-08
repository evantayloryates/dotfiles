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
metadata, not pixels, typed text or unrelated input. A header identifies the
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
reports total offered/written/lost rows. Frame spacing never substitutes for a
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
monitor still polls once a second. Input attribution and automatic supported
action receipts are separate qualification stages.

The shared computer-use evidence service stores versioned observations and
declared receipts; it does not turn these metadata rows into automatic learning
or guaranteed ownership. Keep source files local and out of Git.
