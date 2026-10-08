# Production qualification goal

October 8, 2026. Active goal: complete staged smoke testing, verification,
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
| Recorder-owned source journal | Frame clock/encoded-time mapping, geometry segments, affine transform validity and unknowns, held/dropped frames, source identity and gaps. Consumer receives normalized data without writing synchronization logic. | Bounded recorder-owned journal/consumer candidate passed: 1,337 H.264/Retina HEVC muxed samples match exact times; three HEVC geometry segments within 0.884 px. Initial movie-offset failure fixed. Final interrupted-journal checkpoint labeling, real MCP readback and fresh recovery passed too (139 exact samples). Cross-display/sleep and derivative timeline mapping remain open. |
| Input and action provenance | Broad keys/modifiers/scroll/drag, destination/child scope, bounded uncertain actions, no unrelated text retention; service-stamped semantic action blocks; explicit source/ownership uncertainty and access gaps. | Shared declared receipt store passed; automatic stamps and scoped collector pending. |
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
with `gates-v2`, `gates-v3`, and now `gates-v4`.
Shared evidence: `/Users/taylor/.local/state/codex-bridge/capability-evidence/`.
Keep source footage/input evidence local and outside Git. Update stage states
from actual saved results; do not infer success from tool discovery or counts.

## Next checkpoint

Start with supported action receipts and a scoped passive input collector:
preflight existing access, retain broad key/modifier/drag/scroll signals with
destination and action-block evidence, and expose uncertain ownership/gaps.
Do not invent automatic interception of native CUA or promote injected pointer
coordinates until tested. Extend the structural recent-usage audit beyond tool
counts without importing bulk/private transcript bodies. Numeric RPC validation
and input/telemetry admission must also be checked before delivery.

The signed isolated journal candidate and all fourth-pass footage/results are
in the existing private gates-v4 bundle. The final source hash/build is saved
in journal-candidate-final-build.json. Runtime evidence is copied there; the
short /tmp runtime remains stopped for optional reuse. All owned GUI/process
resources were closed. Production delivery, input attribution, cross-display
and daily-app/load qualification are required work; the goal stays active.
