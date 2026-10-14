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
