# Thrash attribution strategy — October 13, 2026

## What changed in our understanding

The afternoon evidence supports substantial host paging and compressor churn,
not a recurrence of the old BTLEServer spin or a multi-GiB Memory Cleaner burst.
At 17:19 EDT the recorder measured 484 MiB/s combined swap traffic. At 17:47 EDT
it measured 273 MiB/s. A subsequent live sample showed 49.5% host CPU time in
system work and roughly 9 GiB occupied by the compressor. Docker's host process
held about 10.6 GiB footprint, with additional large app/renderers. A Claude
process chain was launching filesystem jobs; Spotlight and window/rendering
work also overlapped. None of this identifies exclusive responsibility.

The previous one-minute process cadence missed short-lived work and obscured
its CPU/I/O chronology. Container probes also timed out during severe pressure.
Large retained allocations identify exposure to pressure, not the trigger.

## Capture now, without interrupting existing work

`focus_watch.py` is an independent unprivileged LaunchAgent. The original
recorder and BTLE watcher keep their current processes and captures intact.

1. Baseline process census every five seconds; two-minute in-memory prelude.
   Reuse fresh pressure telemetry from BTLE, with a local VM fallback.
2. Two distinct severe pressure readings trigger a 90-second window: >=128
   MiB/s paging, or >=1024 MiB/s compressor churn with >=30% RAM compressed.
   CPU-only capture also starts after >=90% host busy for 30 seconds, or
   >=70% busy with >=40% system CPU for 15 seconds. Swap occupancy alone does
   not trigger. This is an investigation gate,
   not a probability or leak score.
3. During the window, aim for two-second process CPU, physical I/O, page-in,
   footprint-growth and host user/system/idle CPU deltas. Collection time
   automatically stretches the interval to at least ten times its duration.
   Sampling is serial: slow probes cannot pile up.
4. Keep top counters, births/exits and their ancestors, with bounded launch-ID
   metadata. PID + process start identifies a lifetime. Missing/protected
   counters remain missing; counter resets never turn into fabricated spikes.
   Identity policy `resource-priority-v1` uses the same 20-probe census budget:
   rank uncached processes by CPU, growth, reads, page-ins and footprint,
   reserving up to four probes for immediate ancestors of the hottest unknowns.
   This addresses hot workers being skipped behind low-PID births. Status and
   captured rows expose the policy and probe count; status records the source
   hash loaded at startup. It does not fix census timeouts or identify swap
   ownership. The synthetic 2,000-process regression covers a hot high PID,
   ancestor lookup, full counter coverage and PID reuse without stale identity.
5. Sustained >=40% CPU over three selected intervals permits at most two
   one-second unprivileged stack attempts per window. Only symbol/count frames
   are saved; no prompts, command strings, thread names or user file paths.
   Failed/changed/exited targets are recorded and not escalated automatically.
   Policy `late-stack-v1` schedules serial diagnostic jobs: the Docker snapshot
   at 30 seconds does not close later stack eligibility. Attempts are reserved
   before launch and limited to two across the entire window, including failed
   attempts; each PID/start lifetime is attempted once. Later stacks preserve
   the earlier Docker result and attempt records, with separate timestamps.
6. Docker stats are asynchronous, output-bounded and time-bounded. Failure is
   explicit; stale container memory is never presented as current attribution.
7. Persistent pressure permits another bounded window after 15 minutes.
   Rotations remain the same incident until 120 seconds of verified quiet
   pressure and <70% host busy. Cooldown survives observer restarts. A sampling
   gap or missing telemetry cannot establish recovery.
8. Existing five-minute deterministic relay sends one completed-window event
   and a recovery event per incident, plus actionable monitoring failures.
   Queue acceptance and chat receipt remain separate; stable client IDs
   reconcile uncertain sends without blind retries. No polling model calls
   are added. Hourly review remains a fallback.
9. Captures are private under `data/agent_resource_monitor/focus/`. Eight MiB
   per window, 256 MiB retained budget, five GiB disk reserve. No automatic
   deletion: a full budget stops new captures and reports degraded health.

## Hypothesis / evidence / next test ledger

| Hypothesis | Existing support | What would narrow or weaken it |
| --- | --- | --- |
| Working-set overcommit is the dominant burden | High system CPU, sustained swap/compressor deltas, multiple large retained workloads | Compare pressure slopes and recovery with CPU/I/O work across the new dense windows; high swap occupancy alone is insufficient |
| Filesystem scanning triggers bursts | Claude scan descendants and Spotlight activity overlap | A launch preceding the pressure rise, sustained physical reads/page-ins, and relevant stack symbols; distinguish Spotlight follow-on work and cached reads |
| Docker guest work or VM retention contributes | Largest host footprint; dev container was large in last successful guest stats | Fresh guest stats and host VM CPU/I/O deltas; never add guest memory to host footprint or treat a timed-out probe as a measurement |
| Browser/UI work triggers hot working-set faults | Arc renderer and WindowServer CPU overlap | Per-lifetime CPU/page-in deltas and stacks aligned with pressure onset, not merely a large renderer allocation |
| A particular agent/tool creates repeated waves | Launch-owner IDs on transient descendants | Repeat the same ancestry and work signature across independent windows; owner means provenance, not exclusive use of shared services |

For every incident review, save `findings.json` beside its capture with observed
facts, counterevidence, uncertainty, next changed-condition test and cleanup
state. Compare earlier incident windows before recommending a surgical change.
Do not stop agents, disconnect devices, purge memory, delete data, restart
services or change permissions as part of automatic capture. A controlled
workload experiment requires its own authorized scope.

## Remaining limits

Sampling can still miss work shorter than two seconds. Protected process stacks
and swap ownership may be unavailable. CPU/I/O counters cannot establish which
allocation caused a fault. Exact root cause may require a later explicitly
scoped Instruments or kernel trace; this implementation does not claim that
permission or proof. Observe collector overhead and diagnostic status first.

## Verification and delivery limits

The test suite exercises real short-lived worker CPU/write deltas and a real
one-second unprivileged stack capture, plus simulated onset/recovery, PID reuse,
counter reset, missing metrics, restart cooldown, storage exhaustion, privacy
filtering and relay deduplication. Synthetic cases are not induced host thrash.
An isolated foreground run verifies the shipped `/usr/bin/python3` entrypoint;
live LaunchAgent heartbeat and collector coverage are recorded in the audit.
The existing transport has an open-app synthetic receipt from October 11.
Delivery of the new pressure event remains unverified until a real event is
received here. App-closed and live relay-restart tests remain deferred at
Taylor's request. Pending or uncertain sends retain their original client IDs.
The hourly fallback checks both BTLE and resource-focus evidence, independent
of whether an event was consumed by the desktop app.

Live installation verified October 13 at 20:24 EDT: LaunchAgent PID 20388,
advancing healthy heartbeat, fresh shared pressure and 516 processes with CPU
and I/O deltas. Latest collection took 75.7 ms at a five-second cadence; this
is collection wall time, not a controlled CPU-overhead benchmark. All 40 tests
passed using the installed `/usr/bin/python3` runtime. The real relay entrypoint
recognized both watchers as healthy and generated no new events. A stale
startup-health warning was retained as resolved without sending because its
phase was still `prepared`; uncertain/submitting IDs are never cancelled or
replayed blindly. The actual transport attempt found its existing daemon
unavailable. Immediate callbacks are degraded; captures remain local and the
existing hourly fallback is active with the updated investigation instructions.
No shared daemon was started or restarted to work around that condition.

## First natural windows and observer load

The October 13 21:01–22:30 EDT windows remain one unrecovered incident. Fresh
guest stats identify dev-container growth and activity, while later host Node
lint/test waves add transient multi-GiB footprints. Keep the per-window findings
beside each capture; a prior idle guest snapshot cannot exclude later activity.
Exact allocation/fault ownership remains unproven. VM stack attempts hit time
or output bounds; the bounded partial-output candidate remains prepared, not
installed, and does not justify a permissions change.

The 22:12 window also caught our own `build.py` reading 1,360 MiB and using 11.7
observed CPU seconds. Its first observed sample followed the paging peak by
35 seconds, so this is avoidable observer load rather than onset evidence.
The archive last-seen step now uses `archive_scan.py` to read only new complete
rows while preserving historical grouping and coverage. Actual warm build:
0.082 seconds and 1.04 MiB of appended rows after one initial index pass.
The Memory Cleaner checkpoint also retains complete-line file cursors to avoid
re-reading old session history during its next evaluation. Continue measuring
analysis overhead alongside the watcher itself. No workload was altered to
obtain these observations or the indexing improvement.

## Identity capture improvement loaded October 14

Taylor authorized the tested identity-priority improvement and observer-only
reload. All 43 tests passed with `/usr/bin/python3`. The current capture finished
before graceful SIGTERM and a launchd kickstart without forced termination.
At 01:42:25 EDT, new observer PID 9339 reported `resource-priority-v1` and the
expected startup source hash across advancing samples: 785 processes, 618
CPU/I/O deltas, 20 identity probes, 104.8 ms collection at a five-second cadence.
This is an observed sample, not a controlled overhead benchmark.

The active incident, all prior capture paths and last-capture cooldown epoch
were identical across handover. Checked app, Docker, recorder, BTLE watcher and
Memory Cleaner lifetimes were unchanged. The in-memory prelude warms again for
120 seconds; the observer handover is a monitoring gap, not recovery. Verification
is private at `data/agent_resource_monitor/focus/identity-priority-live-verification-20261014.json`.
Next: compare identity completeness on the next natural hot/growing worker wave.
Actual attribution gains remain unverified until that event. Census timeouts
and the separate unapplied VM partial-stack-output candidate remain distinct
limits; neither warrants changing workloads or permissions.

## Late diagnostic timing correction — October 14

The 12:26 EDT window confirmed a timing gap: Docker diagnostics started at
31.8 seconds with no hot target. Yarn PID 54153 became eligible later, but the
single existing diagnostic thread prevented any further stack selection.
Replay of the actual retained window selects that Yarn lifetime at 74.3 seconds
with the correction, while preserving one Docker job and the two-attempt stack
budget. Replay uses mocked workers and makes no native probes; it proves target
selection, not that a future stack will succeed or establish causality.

The regression suite covers late work after Docker, serial scheduling, failed
attempt budgets, PID reuse, missing identity, self/prelude exclusions, result
merging, symbol privacy, and the existing real worker/stack test. Pressure-based
growth/page-in target selection and partial VM stack retention remain separate,
unapplied candidates. The timing correction retains the current CPU gate and
read-only sampling bounds. Live load evidence belongs in the private focus
checkpoint and audit, including the observer PID/source hash and preserved
incident/cooldown/workload lifetimes.

Live load verified at 13:08:15 EDT: observer PID 9339 exited gracefully between
windows, and PID 50056 reports `late-stack-v1` with the expected source hash
across advancing samples. Incident/capture/cooldown state and checked app,
Docker, recorder and BTLE watcher lifetimes were preserved. The verification
sample covered 845 CPU/I/O deltas across 1,050 processes, with 20 identity probes
and 747.6 ms collection at an adaptive 7.48-second cadence. This is wall time,
not a controlled overhead benchmark. All 46 tests passed. The handover is a
monitoring gap and resets the two-minute in-memory prelude, not incident recovery.
Proof: `data/agent_resource_monitor/focus/diagnostic-timing-live-verification-20261014.json`.
Next: inspect stack attempts and timestamps in the next natural late-work window;
timeouts, output bounds and exact causal attribution remain unresolved.

## Early task identity and guest rankings — October 14

The first natural late stack targeted a Yarn descendant 51 seconds after the
initial diagnostic job. Its footprint grew from 0.25 to 1.74 GiB; it exited
during sampling and returned no usable frames. Later windows also show active
Docker work and a dev guest near 8 GiB. This narrows workload families but leaves
the exact short task and guest process distribution uncertain.

`early-task-v1` reserves eight slots within the existing twenty identity probes
for new Node lifetimes, before those workers become hot or disappear. The safe
task schema identifies known extensionless launchers, approved task identifiers
and a small boolean-flag allowlist. Unknown input and inline code remain unknown;
raw argv, environment, workspace names, paths and forwarded values are excluded.
Parent rows and ranked reports preserve the identity with PID/start provenance.

`early-task-guest-v1` adds one bounded guest ranking phase after Docker stats:
at most two containers, two seconds and 256 KiB per container, 2,048 considered
process rows and 24 retained hot/large processes and parents. It uses Docker top,
without Docker exec, guest filesystem reads, workload mutation or retries.
Guest CPU is a lifetime average; RSS/elapsed time are point measurements rather
than host PID/start identity, physical I/O, or swap ownership. Later stack jobs
preserve these snapshots and their own timestamps. Combined with the existing
two stack attempts, diagnostic command time is bounded to 15 seconds per window;
full process collection remains serial and backs off independently.

Regression coverage includes early low-footprint births amid larger processes,
PID reuse, missing identity, task/path/inline privacy, process ranking/ancestry,
timeout/truncation/row/output limits, two-container caps and diagnostic merging.
The real stack fixture now rate-limits its own writes and sleeps after measuring
CPU/I/O deltas, avoiding an unbounded test write loop during host pressure.
Live helper/source hashes and scoped workload-preservation evidence are recorded
in the private task/guest release artifact and audit. Exact natural-event task
attribution remains to be confirmed from subsequent captures.

Live load verified at 14:05:05 EDT: observer PID 50056 exited gracefully between
completed captures and diagnostic jobs; PID 49669 reports `early-task-v1`,
`early-task-guest-v1`, and matching observer/helper hashes across advancing
samples. Incident/capture/cooldown state and checked app, Docker, recorder and
BTLE watcher lifetimes were preserved. The verification sample had 944 CPU/I/O
deltas across 1,158 processes, 20 identity probes and 701.6 ms collection at an
adaptive 7.02-second cadence. Named host tasks were absent in that particular
sample; unknown identities remain explicit. This is wall time, not an overhead
benchmark. All 53 tests passed. An integrated read-only Docker smoke captured
48 dev-guest processes and one database process, with recognized Yarn tasks
`start:server:development` and `build:server:development` plus Webpack tooling.
The observer handover resets the two-minute prelude and is not recovery.
Proof: `data/agent_resource_monitor/focus/task-guest-live-verification-20261014.json`.

## Independent pressure loop — October 14

After that release, a process census timed out with 14.1 seconds collection
and 141 seconds backoff during an observed 887 MiB/s paging burst. Offline replay
confirmed that gaps above 30 seconds repeatedly reset onset counters. The gate
was also waiting for a successful census before creating a window. This is a
capture blind spot; it does not identify the workload causing the pressure.

`independent-pressure-v1` evaluates fresh pressure every two seconds with a
separate cheap host CPU counter history. Full censuses run in one worker with
the original five/two-second targets and completion-based ten-times-duration
backoff. There are no replacement workers while a scan is blocked. Fresh BTLE
pressure is reused; when unavailable, a separate single-flight VM fallback
cannot block the control loop and its stale output is rejected.

The unchanged two-distinct-reading gate can open a bounded window without a
successful census. Pressure-only rows explicitly mark missing process data;
completed census intervals are retained once, never replayed into totals.
Missing census rows do not reset valid hot-lifetime streaks; actual census gaps
over 30 seconds reset stack eligibility. Missing/stale pressure or actual
control-loop gaps still block recovery. CPU-only decisions use the independent
host counter history, not old census CPU. No 90-second window, 15-minute cooldown,
storage cap/reserve, identity budget or diagnostic limit is weakened.

Status exposes pressure versus census health, in-flight state, sample time/age,
backoff/next due and control-loop wall time. A fresh pressure heartbeat is not
proof of process attribution. Review pressure-only and census sample counts
separately; filter null collection/counter values. Census intervals can straddle
capture boundaries. On shutdown, owned census/fallback workers drain before
exit, retaining the singleton across handover rather than abandoning scans.

Tests include a real blocked worker with no duplicate launches and 140-second
reported backoff, a real threaded watch that completes a pressure-only window
while the worker is blocked, and deterministic timeout/backoff/cooldown/storage/
recovery tests. Separate coverage checks stale VM fallback, host CPU/recovery
gates, missing identities, serial diagnostics and counter de-duplication.

Live load verified at 14:31:00 EDT: PID 49669 exited gracefully between captures,
and PID 18333 reports `independent-pressure-v1` with matching observer/helper
hashes and advancing two-second pressure heartbeats. Incident/capture/cooldown
state and checked app, Docker, recorder and BTLE watcher lifetimes were preserved.
The control-loop wall measurement was 0.92 ms in the verification sample, while
the separate first census took 170.3 ms across 1,144 processes. First-census
deltas were warming; subsequent census counters are verified separately. These
are observed wall times, not a controlled overhead benchmark. All 58 tests pass.
The handover resets the two-minute prelude and is not recovery. Process-level
coverage can still be missing during OS stalls; pressure-only windows now retain
the event and diagnostic status under those conditions rather than silently
waiting for census success.
Proof: `data/agent_resource_monitor/focus/pressure-loop-live-verification-20261014.json`.

## Guest worker identity and task ancestry — October 14

Natural guest rankings retained large `other` workers beneath Next.js and
unrecognized Node entrypoints. A bounded read-only snapshot confirmed that
Next rewrites some worker titles to `next-server (v...)`, removing the original
Node entrypoint. `guest-task-lineage-v2` recognizes that exact title and fixed
Next/Jest-worker/Piscina/Vitest package entrypoints. It saves fixed tool/role
labels only; versions, arbitrary script basenames, paths and raw arguments are
excluded. A generic Jest-worker library label does not establish a Jest test.

Each selected guest process also receives a separate `task_context` from the
already collected snapshot: at most four parent hops, preferring the nearest
named Yarn/npm/pnpm task over a generic tool ancestor. Parent PID, elapsed age,
distance and evidence source are retained. Cycles and parents younger than
their children stop resolution. Context can survive process-row pruning, but
never replaces the worker's own identity or proves that it executed the parent
task. Unknown workers remain explicitly unknown. Guest PID and elapsed time are
snapshot provenance, not host lifetime IDs or swap ownership.

This uses the existing Docker top output, with no additional commands, guest
filesystem reads, Docker exec or retries. Limits remain two containers, two
seconds and 256 KiB each, 2,048 considered rows, 24 saved processes each, four
ancestry hops, two native stack attempts, 90-second windows, 15-minute cooldown,
8 MiB per window, 256 MiB retained budget and 5 GiB free-disk reserve. Test and live load
evidence belongs in `focus/guest-lineage-live-verification-20261014.json` and
the audit. Compare exact identities/context in the next natural window; a
read-only smoke snapshot is not proof of incident causality.

Live load verified at 15:45:11 EDT: observer PID 18333 exited gracefully between
completed windows and diagnostics; PID 81333 reports `guest-task-lineage-v2`,
matching helper/source hashes and advancing independent pressure heartbeats.
Incident state, cooldown and checked app, Docker, recorder and BTLE watcher
lifetimes were preserved. A later census covered 1,025 CPU/I/O deltas across
1,220 processes; collection took 726.6 ms with 7.29-second census backoff while
the pressure control tick took 3.13 ms. These are observed wall times, not a
controlled overhead benchmark. Prelude warms for 120 seconds after handover.

All nine task-parser tests pass. The full suite passed 61 of 62 tests; its
existing real native-stack fixture reached the unchanged four-second timeout
during severe host pressure and was cleaned up. No retry was made while that
condition persisted, and no timeout or capture limits were widened. All new
identity/ancestry tests, privacy/caps/timeout tests, independent-pressure and
backoff/cooldown tests passed. A real bounded Docker snapshot increased
recognized identities from six to eight and retained contexts for `yarn build`,
`yarn build:scripts` and `yarn start:development`. Native frame availability and
unknown task identities remain conditional. Raw argv was not saved.
