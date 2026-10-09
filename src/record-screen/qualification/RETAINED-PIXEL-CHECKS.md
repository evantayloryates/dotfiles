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
