# Sustained source and resource envelope

Stage73 qualifies one owned authored source pair for eight minutes. Read the
current planner's `resource_guidance.measured_sustained_motion_pair_profile`
for exact measurements. It is reported evidence, not automatic admission or a
promise about another app, hardware load, encoder or GPU.

| Setting | Tested value |
| --- | --- |
| Recorder / OS | Signed7c0f81e9d71f / macOS25F80 |
| Source | Built-in2× display; stationary1000×732 point-resolution output |
| Primary | Exact isolated window, child inclusionfalse |
| Backup | Exact fixed crop including only the owned app |
| Media | H264, requested30fps, eight minutes; inputdisabled/pointerhidden |
| Motion | Nominal60Hz timer for420s; actual moving spans about419.4s |
| Static tail | About53s of the independently logged stopped counter |

Every counter sample decodes and26,648 mux timestamps match source references.
App static cadence is lower than isolated cadence while retaining the same
stopped content. Do not equate different cadence with missing source pixels.
One held preroll per source and one app held tail remain explicitly declared.
Last packet durations, container end and source-content time are separate clocks.

509 passive CPU/RSS/pressure/coarse thermal observations cover20 samples before,
474 during and15 after capture. Recorder peak45.94MiB, median recording CPU7.90%
of one core, after-recording peak79.69%. All pressure observations fresh level2;
thermal nominal. These phases are approximate wall joins with concurrent host
workload. Do not sum process RSS as physical allocation, treat the prephase as a
causal control, extrapolate GPU costs or infer a safe upper concurrency/P80.

The whole479s paired geometric summary requires26,614 boundaries, exceeding its
16,384 work budget. The service refuses with evaluated_segments0. Exact adjacent
240s/239s intervals each pass under that budget and preserve qualified common
clock/canvas containment. Geometry still cannot establish visible content or
rescue. Stage74 adds `coverage_summary.retry_guidance`: when its complete plan
is available, issue the returned requests explicitly through the service. The
actual retained479s plan splits at281.417899684s; its two reads evaluate16,384
and10,230 boundaries and cover the entire interval at the unchanged budget.
A plan has at most16 requests. Fractional split boundaries or excessive request
count withhold it completely; no rounding/partial plan or automatic aggregation.
Preserve each result's source/clock/content uncertainty and any later refusal.
No reshoot or higher budget is needed for this case.

Both launchers resolve optional FFprobe through the shared binary resolver,
respecting `FFPROBE_PATH`. This repairs the retained first minimal-PATH MCP
failure without changing the native engine or peer adapters. Capture/status stay
available if the dependency is absent; mapping reports its bounded probe error.

Use the current CLI/fresh MCP for this profile. The ordinary loaded chat still
exposes an older contract; an installed native build does not prove adapter
adoption. Three operation outcomes/two facts are stored in the shared computer-use
layer with exact source references. Unknown provider version still blocks reusable
readiness. The independently observed source-helper installed component is
26.1001.1001394/build1001394; that metadata does not authenticate loaded bytes or
the complete CUA wrapper/transport version.
