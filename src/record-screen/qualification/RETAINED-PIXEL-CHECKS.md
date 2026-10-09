# Decoded frame checks

Native capability `retained_frame_pixel_stats:1` adds `pixel_checks` and exact
rational `frame_time` to existing `recording_frames` output. It samples the
returned decoded image at32×32, after requested preview scaling and before JPEG.
Missing/empty checks remain unmeasured; older native builds omit these fields.

The reused live-frame uniformity heuristic returns luma mean/standard deviation
and `looks_blank` when deviation<2. A legitimate white or black view can both
look blank. Use mean and the actual image, preserve ambiguity, and never turn
this into automatic target-loss detection, capture cancellation, universal
content presence or unsampled coverage. Small details can disappear in the
thumbnail and preview scaling. Colorimetric accuracy is unqualified.

`frame_time.value/timescale` is the actual decoder image time; `frame_t_s` remains
its historical millisecond rounding. Use source-map mux intervals for exact
source correspondence. Stage76 independently joins three actual returned times
to mux starts; this scoped agreement is not a universal decoder guarantee.

Actual Safari retained sample220s has luma201.9/deviation99.4. Samples231/245s
have0/0 despite available contained geometry. Authored controls retain both
uniform white (mean254) and black (0) as looks_blank; a varied test pattern does
not. Six actual Review.frames outputs validate additive fields without new capture.
The supported function is tested by `retained-frame-test.swift`, compiled with
engine/bridge sources excluding main.swift and `-parse-as-library`/Swift5/macOS15.
It takes a retained video, a fresh output directory and1–12 comma-separated times.

## Join the returned preview to its source

Current MCP 0.18 adds optional `include_source_map:true` to `recording_frames`.
The equivalent CLI is:

```sh
record-screen frames '{"recording_id":"rec_EXAMPLE","at_s":[1,12],"max_width":300,"include_source_map":true}'
```

`source_mapping.mapped` follows preview order and joins each exact returned
`frame_time.value/timescale` to an actual mux packet start and its retained source
reference. Requested seconds and rounded `frame_t_s` never substitute for that
join. Fractional values remain rational. Missing/unsafe timestamps, unmatched
packet times and missing source references stay explicit; there is no nearest
fallback. Held frames retain the referenced source's geometry and content time.

Coordinates and `muxed_canvas_pixels` refer to the original source video.
`preview_pixels` describes the resized preview separately. A timestamp join does
not authenticate decoded pixels, calibrate physical presentation or qualify
fitted child origins; the existing guard remains. Mapping snapshots cover the
separate retained source read, not atomic isolation across the native preview
decode and mapping. Preserve that limitation if files could be externally changed.

Without the option, no additional source lookup/probe is made and the response
has no `source_mapping`. If an opted-in source lookup/probe fails, images remain
available with `source_mapping.state:unavailable`; the helper does not dispatch
another preview. Old native output lacking exact times withholds the join.
Existing adapter read/replay policies remain unchanged. Use the current CLI
when an older loaded tool schema lacks the option; preserve peer connections.

Stage78 independently checks seven actual decoder/mux/source joins, including
two changing-fit samples that remain spatially guarded and three Safari samples
that preserve black-tail diagnostics. Minimal-PATH CLI/MCP maps agree; six source
hashes are unchanged across CLI reads. All73 affected checks pass, including
held references, fractional nanoseconds, missing fields, mismatch, invalid
requests and separate mapping failure. No new capture or native restart.
