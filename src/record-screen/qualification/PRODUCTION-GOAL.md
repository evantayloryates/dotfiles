# Production qualification goal

October 8, 2026. Goal resumed by Taylor on October 8 at 20:01 UTC. Objective: complete staged smoke testing, verification,
iteration and production delivery of capture foundations and their shared
computer-use contracts. The goal remains open until delivered behavior and
agent expectations are verified. Visual effects, cursor styling and final
composition/render recipes remain the next phase.

## Operating policy

Expect collisions; preserve evidence and recover rather than promise isolation.
Continue independent background work when a test needs user input. Visible
focus work uses an agreed production interval, with input available and cleanup
limited to owned surfaces. Taylor granted standing visible-test permission for
24 hours from October 8 at approximately 17:51 UTC (through October 9 17:51 UTC);
no repeated production-window request is needed within that interval. This does
not authorize new security grants, input locks or unrelated workflow changes.
Never stop another agent's app, tab or recording to
make a test pass. Seek the smallest necessary clarification when blocked.

A gate may pass with a clearly verified limitation and safe failure/recovery
behavior. Unsupported environments must remain explicit, not quietly inherit
another app/version's results. A successful fixture does not establish every
application's behavior or a production P80 duration.

## Stages and release evidence

| Stage | Acceptance evidence | State |
| --- | --- | --- |
| Bounded capture startup and recovery | Shared SDK deadlines; uncooperative-producer, cancellation, late-callback tests; admission includes unfinished work; healthy peers survive an isolated failure. | 50 deadline assertions and 12 actual recording state/race assertions passed. Signed isolated live captures/recovery passed; uncooperative SDK producer tested synthetically only. |
| Live capture controls and routing | Signed isolated candidate; child/menu pixels and helper exclusion; default compatibility; tap vs lane identity; current excluded PID checks; source cleanup. | Signed isolated engine passed native child inclusion/exclusion, filter-aware tap selection, unavailable-target isolation, scheduled cancellation, partial-file interruption and recovery. Exclusion PID churn and daily apps still open. |
| Recorder-owned source journal | Frame clock/encoded-time mapping, geometry segments, affine transform validity and unknowns, held/dropped frames, source identity and gaps. Consumer receives normalized data without writing synchronization logic. | Bounded recorder-owned journal/consumer candidate passed: 1,337 H.264/Retina HEVC muxed samples match exact times; three HEVC geometry segments within 0.884 px. Initial movie-offset failure fixed. Final interrupted-journal checkpoint labeling, real MCP readback and fresh recovery passed too (139 exact samples). Native Retina/external/return geometry passed; sleep and derivative timeline mapping remain open. |
| Input and action provenance | Broad keys/modifiers/scroll/drag, destination/child scope, bounded uncertain actions, no unrelated text retention; service-stamped semantic action blocks; explicit source/ownership uncertainty and access gaps. | Signed native candidates passed 36/36 and 8/8 delivered keys, 40 unrelated keys excluded, service-stamped scopes/AX pixels, restart uncertainty and callback wrapper readback. 138 policy/lifecycle and nine admission assertions passed. Enumeration offload and explicit protected-input omission/recovery passed. Browser virtual-input coverage, raw coordinates, tap faults and sleep remain open. |
| Daily app depth and transient surfaces | Native, Chrome and a supported Electron app; genuine context menus, nested/overflow surfaces, app updates, unreachable/occluded targets; useful bounded fallback. | Native and Chrome helper passes with documented limitations; depth requalification pending. |
| Collisions and synchronization | Window movement/resize/display scale and negative origins; concurrent unrelated input; idle/sleep/display changes; source loss and interruption evidence with trim/reshoot/source alternatives. | Basic marker/geometry evidence passed; broader transitions pending. |
| Realistic resource budget | Motion, two-source insurance, actual encoding, CPU/RSS/storage/frame loss and representative previews; conservative admission/fidelity recommendations. | Static insurance evidence only; load pass pending. |
| Safe production delivery | Verify source/build/signature, idle release boundary, preserve prior binary/state, install, read back loaded hash/capabilities, smoke real capture and consumer packet, verify rollback/recovery path. | Original signed engine remains live and unchanged. |
| Agent runbook and service expectations | Available capabilities, effort tiers, human production modes, deadlines, gaps, semantic blocks, known app facts, collision and cleanup runbooks; final report separates verified facts from limits. | Existing report and shared store contract; final reconciliation pending. |

## Current correction

The original recording implementation already has an eight-second arming
watchdog, with an engine-restart callback. Earlier notes describing all engine
startup as unbounded were too broad. The open risks are late SDK completions,
preview/discovery waits, resource admission for unfinished work and unintended
impact of restarting peer recordings. The next candidate addresses these paths
and preserves encoder-stall recovery as a separate condition.

## Evidence continuity

Source kit: `/Users/taylor/src/github/dotfiles/src/record-screen/qualification/`.
Human report: `/Users/taylor/src/docs/html/record-screen-strategies/capture-readiness.html`.
Private stages: the chat's existing `capture-qualification-2026-10-08/` bundle,
with `gates-v2`, `gates-v3`, `gates-v4`, and now `gates-v5`.
Shared evidence: `/Users/taylor/.local/state/codex-bridge/capability-evidence/`.
Keep source footage/input evidence local and outside Git. Update stage states
from actual saved results; do not infer success from tool discovery or counts.

## Next checkpoint

Fifth-pass native input/action/source proofs are saved in gates-v5. Full final
source snapshot hash 99752c4615cf, signed isolated engine, 138 input/action/numeric
assertions, nine admission assertions, 14 Node tests and previous state/options/
journal regressions passed. Real restart preserved unknown action end time; final
canary returned listener to inactive. Installed production is still cd78c24b652e.

Context enumeration averaged 11.66 ms (max 41.50 ms) at five refreshes/second;
move that work off the listener run loop before latency/load recommendations.
Retain raw event clocks, qualify their mapping to video/host time across displays
and sleep, and preserve uncertainty for injected pointer coordinates. Begin daily
Chrome/Electron depth requalification; then realistic motion/insurance budgets,
structural historical workflow outcome audit and safe production delivery.
The goal remains active. A bounded native canary is not the production release.

## Clean pause — October 8, 18:55 UTC

Taylor asked to pause before the 3 p.m. call. Stop visible tests and automated
progress until Taylor resumes, even though the earlier display authorization
continues. All owned fixtures and isolated candidate engines are closed/stopped;
recordings, action scopes and input subscribers were zero before teardown. Private
runtime files were copied to gates-v5/runtime-evidence; pause-checkpoint.json
records the boundary. Installed production remains untouched.

The listener-loop cost finding prompted an additional source candidate:
3a066b8a1c64 moves Quartz window enumeration to a utility queue, admits one query
at a time, rejects late stopped-generation snapshots, exposes separate costs and
snapshot staleness, and reports a query stalled past two seconds. It compiled
successfully but has not been launched/live-qualified. Last live-qualified build
is 99752c4615cf. Resume with the offload canary and failure/lifecycle checks before
cross-display, Chrome/Electron depth, resources and production delivery.

Resume: explicit go-ahead received. The earlier clean pause remains historical; production-window permission is still valid. Start with window-context sampler lifecycle and live canary.

## Sixth-pass checkpoint — October 8, 20:34 UTC

Signed isolated build 47ba5460519f is live in private gates-v6. Source changes
remain a candidate; installed production is still cd78c24b652e, now PID 955
after actual desktop-session recovery. 113 window-query, 139 input/action and
125 journal assertions passed, plus 14 Node regressions. Cross-display transforms
matched four actual encoded marker images exactly. All 14,411 samples across
the cross-display, secure-field, explicit protected-input and recovered Chrome
takes matched journal times; zero row loss. These totals exclude the failed take.

A real WindowServer exit at 20:16:53 UTC interrupted the Chrome take. Cause is
unknown; system logs and private source/video proofs are preserved. The failed
video decoded 1,197 frames/42.02 seconds versus 1,210 accepted writer submissions.
The next candidate exposes video_outcome separately from journal completeness.
Surviving old SDK discovery timed out/quarantined, fast-refused the next call,
then a fresh idle isolated process recovered. No production or peer take stopped.

Chrome 154.0.8037.98 on macOS 26.5.1/25F80 captured HTML and genuine native menus
with child inclusion. Virtual browser typing had no app-addressed OS keyboard
evidence; bounded action candidates addressed Codex remain uncertain. Three
version/surface-scoped observations were saved/read back in the shared service
evidence store. Keep compact operation scopes rather than one long test-series
block. Current report reflects the resume and preserved failures.

Next: Electron depth and remaining transient surfaces; exclusion/app lifetime
recovery; pointer-coordinate and sleep limits; motion/insurance resource budget;
derivative source mapping and preview effort tiers; structural workflow outcome
audit; then production installation/rollback/readback and final runbooks.

## Seventh-pass checkpoint — WindowServer watchdog

Electron menu depth passed paired child inclusion/exclusion; five takes supplied
5,002 exact muxed timestamps. Two single-window motion takes supplied another
2,105 exact timestamps and decoded counter changes. Preliminary CPU/RSS/storage
numbers are measured, with concurrent-workload and GPU attribution limits.

The paired motion take failed during a second desktop discontinuity. User's
WindowServer report shows a 40-second watchdog miss and main-thread kernel frames
in IOGPUFamily/AGXG17X. Cause remains unproven. The window source had 713 decoded
packets vs 715 submissions and no changing counter; the display source finalized
but same-scene backup coverage was not established while the window was off Space.
This remains a failed resource/insurance gate, not production-ready redundancy.

63-second listener context and 68-second Quartz query costs exposed more blocking
paths. Private candidate cfbf7de741a7 moves periodic listener context and recording
disturbance checks away from main/frame queues, with shared bounded worker slots
retained across closures and late-result rejection. 113/106/113 lifecycle checks
passed; full source compiled and signed. It has not been launched or installed.
Initial tap/SDK/encoder OS calls remain separately unbounded possibilities.

The idle owned engine and reopened qualification fixtures were stopped/closed.
Installed production automatically recovered on its original cd78c24b652e build
with the existing screen grant; no release occurred. A structural audit of 31
historical chats has matched call/results and observation references, but opaque
outputs do not establish task outcomes. Goal remains active; continue passive
incident/health reconciliation, offline regression and source/consumer work, then
a small low-load canary before more resource tests or production delivery.

Live qualification remains deferred at the current host-health boundary: the
passive recorder entered an active memory-pressure episode at 20:58:45 UTC.
At 21:13:49 UTC it reported pressure level 2, paging 45.74 MiB/s and compressor
churn 666.77 MiB/s. Its existing watcher was confirmed alive; no peer workload
was stopped or restarted. This later episode does not prove the watchdog cause.

## Clean pause — October 8, 21:28 UTC

Taylor requested another pause and will explicitly resume later. No owned
capture engine, fixture or visible test is running; production remains on the
original build. Do not resume automatically under the earlier display grant.
The resource watcher and unrelated workflows remain untouched.

The next source-to-preview gate identified two existing export gaps: no
derivative timeline/geometry manifest, and unbounded ffmpeg termination with
stderr read only after exit. A new standalone `ManagedCommand` runner has
88 passing actual-child checks for pipe drains, bounded buffers, concurrent
admission, caller deadlines, retained quarantine and recovery after exit.
It is compiled/tested separately and **not yet wired into `Export.run`**;
installed behavior has not changed. Private results are in gates-v8.

Resume with a passive host-health refresh, then finish export integration,
effort controls and a recorder-owned derivative map. Verify against authored
VFR/held-frame footage, including non-grid trim boundaries and GIF timestamp
quantization. Avoid promoting nominal preview sample times to actual source
presentation times. Then return to the remaining live canary, helper PID churn,
transient-surface, resource/insurance and production delivery gates above.
