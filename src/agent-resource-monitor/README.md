# Agent resource monitor

Observe bounded Mac-side CPU, memory, swap and GPU windows, and trace agent-launched
processes back to the session that created them. Python standard library only;
no root privileges, dependency installation or global harness configuration changes.

```sh
/Users/taylor/dotfiles/bin/agent-resource-monitor capture \
  --seconds 120 --interval 2 \
  --out /absolute/path/to/new-capture

# Optional: correlate one authorized Codex chat's tool timing, without content.
/Users/taylor/dotfiles/bin/agent-resource-monitor capture \
  --seconds 120 --interval 2 --out /absolute/path/to/new-capture \
  --rollout /absolute/path/to/that-chat-rollout.jsonl

# Explicitly tag a command and its descendants, useful in either harness.
/Users/taylor/dotfiles/bin/agent-resource-monitor tag \
  --thread 01a116ef-a3ad-74c3-ad32-6869c9c14e03 -- your-command its-arguments

# Mark phases in an active capture; this changes telemetry, not the running agent.
/Users/taylor/dotfiles/bin/agent-resource-monitor mark \
  --out /absolute/path/to/capture \
  --thread 01a116ef-a3ad-74c3-ad32-6869c9c14e03 --phase screenshot-read

/Users/taylor/dotfiles/bin/agent-resource-monitor report /absolute/path/to/capture
python3 -m unittest discover -s /Users/taylor/dotfiles/src/agent-resource-monitor -v
```

Captures finish automatically at the requested duration. SIGINT/SIGTERM request
graceful completion and a report. Existing captures are never overwritten. Use a
task-owned output folder; telemetry is deliberately outside the repository.
Output permissions are private by default (umask 077). A pre-existing output
directory's permissions are not altered.

## Evidence recorded

- `samples.jsonl`: PID, parent PID, process start ticks, executable/script basename,
  launch owner/evidence, interval CPU, physical footprint, RSS, disk counters,
  page-ins, VM counters, swap occupancy, memory-pressure level, GPU counters and
  collector duration. Unavailable metrics are omitted/null, never invented as zero.
- `spikes.jsonl`: per-sample threshold crossings: CPU >=80% of one core, footprint
  growth >=128 MiB/sample, warning/critical memory pressure, GPU utilization >=80%.
  Thresholds are initial investigation triggers, not proof of bad behavior. Growth
  thresholds are per sample: keep the same interval when comparing runs.
- `events.jsonl`: scoped tool-call and command-completion identifiers/timestamps,
  plus explicit phase markers. An exec session identifier is **not** an OS PID.
- `summary.json`: per-process peaks and first/last footprints; PID and start ticks
  identify a process lifetime, avoiding attribution from a reused PID.
- `windows.json`: repeated crossings merged into episodes, with 15 seconds before
  and after, the triggering process, top CPU processes, system state, and nearby
  scoped tool events. Windows truncate at capture boundaries. CPU is an interval
  average ending near the sample timestamp.
- `metadata.json`: cadence, observer identity, Mach clock conversion and policy.

The collector reads argument/environment buffers privately with Darwin
`KERN_PROCARGS2`, retaining only service identity and a narrow allowlist of
session identifiers. It never writes raw argv/environment, credentials, chat
messages, tool inputs/outputs, screen pixels, device data or application logs.
The optional rollout reader starts at the current end and handles partial lines;
it is a best-effort adapter to a changing transcript format, not a stable API.
It parses new records locally and immediately discards non-telemetry content.
The process metadata and IDs are still private diagnostic information: don't
publish a raw capture to an external service.

## Attribution confidence

1. **Explicit launch tag:** `AGENT_RESOURCE_THREAD_ID` was attached by `tag`.
2. **Observed launch environment:** `CODEX_THREAD_ID` / `CODEX_SESSION_ID`, or
   `CLAUDE_CODE_SESSION_ID` / `CLAUDE_SESSION_ID`. The current Mac confirmed this
   route for Runner's Appium and Metro, including detached Appium.
3. **Observed Claude CLI session argument:** a concrete `--session-id` or UUID
   `--resume` target. A resume alias such as `latest` is insufficient.
4. **Ancestry:** a live older parent has identified launch provenance. This only
   applies when start ticks are available and ancestry is consistent.
5. **Timing correlation:** shared renderer/GPU activity overlaps a scoped tool
   event. This remains a hypothesis, not an assigned owner.

`owner` means **launch provenance**, not exclusive current use or fault. Docker
can inherit a Claude session ID at startup, then serve many later agents. Shared
Codex renderers, GPU service, MCP servers, WindowServer and Docker must not be
charged entirely to a single session. No session ID means unknown/shared;
absence of a tag is not proof that a process is unrelated. Cached identity can
miss an in-place executable/session change with the same PID/start/path.

## Monitoring strategy

Start with a 2-minute, 2-second capture around the reported problem. Keep an idle
baseline and separate build, launch, screenshot, tree-read, image-display and
debugger-attachment phases. Use markers when you control the workflow; correlate
one explicitly scoped chat when observing another runner. Do not restart, stop or
reconfigure another agent's work merely to obtain a cleaner experiment.

Inspect **deltas and recovery**, not just large footprints. Footprint includes
compressed/swapped pages; RSS can fall during compression without releasing the
allocation. Swap occupancy can reflect earlier work; swap-in/out and compressor
counter **deltas** distinguish current churn from historical pressure. Apple
silicon uses unified memory; GPU allocation counters overlap accounting elsewhere
and must not be added to process footprints or called dedicated VRAM. IORegistry
GPU counter names are implementation details and may be absent/change by OS.
WindowServer and other protected processes may have only RSS/ps CPU estimates.

For a recurring spike, run a short `sample PID 8 10 -file /absolute/path/report.txt`
on the implicated accessible process. A stack sample is not an allocation/leak
trace; stripped Chromium symbols are particularly easy to overinterpret.
`vmmap -summary PID` can help but may report incomplete malloc-zone analysis.
Escalate to a short Instruments/Metal trace only when these windows identify a
specific unresolved question; instrumentation adds its own resource load.
`powermetrics` needs root and is not part of this unprivileged monitor.

Compare identical outcomes with one change at a time: peak and retained memory,
CPU-seconds, latency, screenshot/tree bytes, retries, and verification fidelity.
Candidate workflow improvements: reuse healthy services, bound worker counts,
use targeted element queries instead of re-reading whole trees, keep large logs
on disk, deduplicate unchanged screenshots, attach optional inspectors only
during the required diagnostic window, and clean up only task-owned resources.
Do not lower snapshot depth or discard evidence without checking that verification
still catches the same failures.

## Persistent pressure flight recorder

```sh
/Users/taylor/dotfiles/bin/agent-resource-monitor install
/Users/taylor/dotfiles/bin/agent-resource-monitor status
# Optional foreground run; singleton lock refuses a second observer.
/Users/taylor/dotfiles/bin/agent-resource-monitor watch
# Pause only the recorder (active capture closes without claiming recovery):
launchctl bootout gui/$(id -u)/com.taylor.agent-resource-monitor
# Resume:
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taylor.agent-resource-monitor.plist
```

`watcher.py` is a standard-library, unprivileged launchd service, with `Nice=10`
and low-priority I/O. Main dotfiles installation includes its scoped installer;
reinstalling leaves a loaded watcher/capture intact. It does not install agent
hooks, send messages/notifications, or perform remediation. Only its own bounded
diagnostic subprocesses are terminated on timeout/output overflow.

- **Cadence:** VM counters/pressure every 15 seconds; attributed process/GPU
  snapshots every 60 seconds, including a five-minute rolling prelude. The
  lightweight interval is configurable with `watch --interval`; detailed cadence
  with `--detail-interval`. Sparse prelude snapshots can miss short processes.
- **Start:** two consecutive samples at >=64 MiB/s combined swap-in/out, or
  macOS warning pressure. Critical pressure starts immediately. A compressor
  occupying >=30% of RAM plus >=16 MiB/s paging also starts after two samples.
  At that occupancy, >=256 MiB/s compressor churn (compressions + decompressions,
  measured in uncompressed page equivalents) is another sustained trigger.
  These are investigation thresholds, not a claim of a leak. Polling can miss
  bursts shorter than 15 seconds. Persistently high CPU alone is recorded in
  process snapshots but is not a memory-thrash trigger.
- **Finish:** normal macOS pressure, <8 MiB/s paging and <64 MiB/s compressor
  churn for 120 seconds. Missing
  metrics and sampling gaps never count as recovery. Gaps over four intervals
  reset the gate and are recorded in an open capture. Swap occupancy alone
  never triggers: old swapped pages can remain after recovery.
- **Bundle:** each incident has `report.html`, `summary.json`, `metadata.json`,
  `README.txt`, `light_samples.jsonl`, `process_samples.jsonl`, `context.jsonl`
  and `events.jsonl`. Detailed snapshots track PID + start ticks, ancestry,
  safe executable/service names, launch-owner IDs, footprint/RSS, per-process
  CPU/page-ins/disk I/O and shared GPU counters. Context records Docker stats
  and two container process trees, disk I/O, thermal/platform state, Codex config
  change markers and bounded structural MCP/config/thread event timestamps,
  counts and numeric app-window origins. Configuration write/read metadata
  helps distinguish reconfiguration/client startup waves from timer hypotheses.
  Active Codex heartbeat schedules and the preceding ten minutes of turn
  start/completion/duration metadata are also recorded through a bounded,
  read-only local history query; prompts, conversation items and queued payloads
  are excluded. This does not distinguish scheduled from human-started turns.
  No app log bodies,
  raw argv/env, credentials, chat contents, tool inputs/outputs or screens are
  persisted. There are no root-only Instruments/powermetrics traces, stack
  samples or heap dumps: deeper instrumentation is a separate targeted step.
- **Bounds:** sessions rotate at two hours or 128 MiB and point back to the
  preceding bundle. Completed sessions expire after 14 days or a 2 GiB budget,
  checked hourly; an active session and prelude are additional bounded storage.
  Active/unknown directories are never pruned. A 5 GiB free-disk reserve stops
  recording and shows degraded status. SIGTERM closes as `observer_stopped`;
  a crash/relaunch marks unfinished bundles `observer_interrupted`. Neither
  claims recovery. Atomic state writes and a singleton lock prevent overlap.
- **Location:** `$DOTFILES_DATA_DIR/agent_resource_monitor/` (fallback:
  this checkout's `data/agent_resource_monitor/`). New telemetry is private
  (umask 077), ignored by Git and stays on this Mac. `status.json` is the heartbeat;
  `prelude.json` and `detail_ring/` hold the bounded preceding window. Preserve
  wanted completed bundles elsewhere before retention expires them.

To customize a launchd instance, edit its version-controlled ProgramArguments,
then gracefully bootout/bootstrap **this service only**. `--paging-mib-s`,
`--exit-paging-mib-s`, `--compressor-mib-s`, `--exit-compressor-mib-s`,
and `--recovery-seconds` tune the gate. Defaults are in
`watcher.py`; lowering thresholds increases diagnostic capture volume. On a
second Mac, adjust the absolute plist paths before installation.

The monitor observes launch provenance and overlapping activity; it cannot
prove that one chat caused a shared service's allocation. Compare same-time
process snapshots and actual counter deltas, not a sum of per-process peaks.
Observer collection timings are in status/captures; measure overhead on the
actual Mac before increasing cadence.

Save deeper incident investigations inside the corresponding session's
`analysis/` folder. An `analysis/index.html` is linked from regenerated overviews;
keep `findings.json`, a frozen-input cutoff and a reproducible analysis script
beside it. This preserves evidence and uncertainty for the next investigation
without putting private telemetry in Git. These files follow bundle retention.
An already-running observer retains its loaded code until its next safe restart;
do not interrupt an active capture merely to pick up report-template changes.

## Further instrumentation

Optional native PreToolUse/PostToolUse hooks can supply stable session/turn/tool
metadata to a telemetry receipt endpoint, improving transient-process correlation.
Keep them content-free, asynchronous where supported, bounded and nonblocking.
Do not assume hooks expose the PID of the actual tool subprocess. Code-mode
calls and polling have special completion timing. Hooks need normal harness trust
review; no hook configuration is installed by this tool.

References: [OpenAI hook schema](https://learn.chatgpt.com/docs/hooks),
[Apple memory footprint guidance](https://developer.apple.com/videos/play/wwdc2022/10106/),
[Appium XCUITest settings](https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/settings.md).

## BTLEServer focused watcher

Install with `src/agent-resource-monitor/install-btle.sh`. Its canonical LaunchAgent
is in `src/launchd`; the host LaunchAgents entry is a symlink. Use
`/Users/taylor/dotfiles/bin/btle-watch status` or `preflight` for fresh machine-readable
status. It measures BTLEServer cumulative CPU deltas every second (100% = one core),
checks VM/swap/compressor pressure every five seconds, and captures a 60-sample
prelude after five consecutive samples at >=80% CPU. Episodes close after 30 quiet
samples or rotate at 360 samples. Candidate executable/PID/parent inventories are
captured every ten seconds during incidents. No arguments, environments, identifiers,
application log bodies, network calls, restarts or remediation are collected/performed.
Bundles retain at most 100 files, 32 MiB and 14 days. Status becomes stale at 15 seconds.
Data lives under `data/agent_resource_monitor/btle/` (private, ignored).

Before paired-device discovery or reconnect-heavy work, read preflight. Reuse an
owned transport, batch reads, and avoid repeated discovery/restart attempts. A warning
is advisory: do not break an active session or assume this daemon caused paging.
The iOS MCP guide includes the fresh watcher snapshot and this operating guidance;
existing MCP processes require a natural reconnect to load new guide code.

### Stack sampling authorization

The unprivileged `sample` attempt was denied; `sudo -n` also confirmed administrator
authentication is needed on this host. Taylor can run a bounded elevated capture:

```
sudo /usr/bin/sample "$(/usr/bin/pgrep -x BTLEServer | /usr/bin/head -1)" 5 -file /tmp/taylor-btleserver-stack.txt
```

Run only while the watcher reports high CPU; the PID is looked up afresh. Complete
macOS authentication personally. Then the agent can read that file and identify hot
functions/frameworks. This grants one capture, not unattended elevated sampling. If
root sampling is still denied, preserve the exact denial and investigate the supported
OS diagnostic route; do not disable SIP or install a broadly privileged writable helper.
CPU, pressure and candidate inventories alone cannot identify an exact caller. Compare
multiple incidents and controlled, owned consumer operations before assigning cause.

### Verified incident: October 11, 2026, 13:43:30 Eastern

Taylor's elevated five-second sample succeeded. All 4,197 samples of worker
Thread_1336673 were in CoreUARP asset-rescind handling: 2,089 leaves at
`uarpTransmitQueueAssetRescinded`, 2,108 at its immediate deduplicated callee.
The main thread synchronously waited in `UARPUploaderUARP accessoryUnreachable:error:`
after a CoreBluetooth connection event. This strongly suggests a busy loop in
accessory-update cleanup; the blocked main thread itself is not the CPU source.
Sample footprint was 8,289 KiB, peak 12 MiB. Exact accessory, originating client
and defect remain unknown; do not attribute it to iOS-agent or infer it caused
paging from simultaneous pressure. Elevated capture works after human authentication;
this does not enable unattended root sampling. Preserve connections and avoid
interrupting possible firmware transfers while investigating.
Evidence: `/Users/taylor/src/docs/html/resource-usage-audit/btleserver-stack-analysis-2026-10-11.json`
and adjacent retained stack text. Repeat the sample on recurrence, then correlate
bounded accessory events and a single authorized connection change before assigning cause.

### Recurrence capture and notifications

The BTLE watcher now starts one asynchronous diagnostic capture at incident onset
(with a ten-minute cooldown across rotated bundles): the preceding two minutes
of BTLE/UARP events plus narrowly selected accessory identity events, connected
and disconnected device models/names/firmware/battery, and one `sudo -n sample`
attempt after verifying the PID still belongs to BTLEServer. It never prompts for
credentials, grants root access, restarts a daemon or changes a connection. If
administrator authorization is unavailable, stack capture is marked unavailable.
Identifiers are sanitized; OS-private fields remain private, so exact accessory
attribution is not guaranteed. Log and inventory reads have 12-second timeouts
and 1 MiB / 512 KiB limits. Diagnostic/stack companions share the 100-file,
32-MiB, 14-day retention bound. This explicitly authorized diagnostic extension
captures selected sanitized event bodies; the ordinary recorder remains content-free.
A thread heartbeat named `btleserver-recurrence-watch` checks every five minutes,
deduplicates recurrence alerts, updates the audit and reports actionable failures.
CPU detection remains one-second local sampling; notifications are on the heartbeat
cadence and depend on Codex being able to run. Old PID 11713 incidents are baseline,
not new recurrence alerts. No remediation runs automatically.

### Optional narrowly scoped automatic stack permission

Prepared at Taylor's explicit request. Install once with:

```
sudo /bin/bash /Users/taylor/src/github/dotfiles/src/agent-resource-monitor/install-btle-stack-permission.sh
```

The installer copies the helper to `/Library/PrivilegedHelperTools/com.taylor.btle-stack-capture`,
root:wheel 0755, checks root-owned non-writable parent directories, and validates
`/private/etc/sudoers.d/taylor-btle-stack` (0440) with visudo. The rule permits only
Taylor to invoke this fixed helper as root with **no arguments**. No passwordless
permission is granted for sample, launchctl, a shell, or editable repository code.
The helper selects only a root-owned `/usr/sbin/BTLEServer`, samples three seconds,
returns up to 500,000 bytes on stdout, uses root-only temporary storage, and limits
captures to once per minute with an exclusive lock. It does not change a daemon,
accessory, SIP or any credential. The watcher copies returned stacks into its
ordinary private incident bundle. Installation requires one human administrator
authentication. The installer is not itself authorized in sudoers. Post-install
verification must check ownership, no-argument permission, rejected extra arguments,
and one real capture before claiming unattended capture works. Remove the grant
with `sudo rm /private/etc/sudoers.d/taylor-btle-stack`; this does not stop monitoring.

### BTLE event relay and hourly evaluation (Oct 11)

`com.taylor.btle-watch` retains one-second local detection and bounded async
capture. Presence is not an incident. Capture starts at >=80% CPU for five
consecutive samples, or >=30% mean CPU across 30 same-PID samples. CPU100% is
one core. The 0–100 activity index is severity, not a probability or proof of
pathology: max(current CPU/80, 30-s mean CPU/30), capped at100. Thirty samples
below30% end an incident. PID changes reset the rolling work window.

`com.taylor.btle-events` uses launchd StartInterval300 (not a model scheduler).
It reads local episode files, groups uninterrupted rotations, coalesces phases,
and queues only new onset, diagnostic-status, recovery or health-failure events.
Idle/absent targets invoke no Node transport and no model. An exclusive lock
prevents overlapping relays. State lives in private `btle/event-relay.json`.
Run `python3 src/agent-resource-monitor/btle_events.py` for the real entrypoint.
Both LaunchAgent trigger paths are symlinks to canonical dotfiles plists.

The event adapter uses the existing local app-server durable `thread/queue/add`
for the explicitly authorized audit chat. It never resumes the chat on another
server, changes model/settings, interrupts a turn or restarts a shared daemon.
It saves a stable client message ID before sending, independently reads the
queue, reconciles consumed items in history after uncertain replies, and never
blindly retries a mutation. Queue acceptance does not prove chat execution.
Hourly dedicated evaluation replaces five-minute model polling and audits both
capture and delivery health. If the app/daemon is unavailable, pending evidence
remains local for hourly review; the adapter does not start it automatically.
The initial transport experiment started a previously stopped managed daemon;
no existing daemon or active agent was restarted. Its experimental queue API
is locally qualified, not established by the public App Server docs. Requalify
on protocol/app upgrades. Actual first callback receipt remains a separate gate.

Smoke evidence: five Python tests cover sustained high/moderate load, short
spikes, stale status, rotation/recovery deduplication and redaction. Live watcher
sampling and launchd relay entrypoint were checked; idle relay ~66ms, no send.
A deterministic eight-second-spike simulation caught7/300 onset phases with
five-minute point samples versus300/300 with ideal one-second capture. This is
simulation, not an induced system incident. Synthetic real callback has a
private queue receipt in `btle/event-transport-smoke.json`; its eventual chat
receipt belongs in `btle/event-smoke-received.json`.

Investigation callbacks read capture output while the bounded recorder continues.
Keep explicit hypotheses, supporting/contradicting evidence and next safe test;
compare CoreUARP hot stacks with accessory timelines, not only CPU. Firmware or
connection timing alone never proves an accessory caused the spin. No automated
remediation or elevated arbitrary command access is introduced.

### Resource thrash attribution (Oct 13)

The separate `com.taylor.resource-focus` LaunchAgent adds five-second process
CPU/I/O/page-in/growth deltas and a two-minute in-memory prelude. Sustained
paging, compressor churn or high host CPU starts a bounded 90-second window
at a target two-second cadence. Collection backs off when slow. Lifetimes,
launch ancestry, births/exits, limited stack symbols and bounded asynchronous
Docker stats help distinguish retained memory from active work.
Identity probes prioritize hot/growing workers and their immediate parents
within the existing 20-probe budget. Status exposes `identity_policy`,
`identity_lookups` and the startup `source_sha256` for live-load verification.
Policy `early-task-v1` reserves up to eight of those probes for newborn Node
lifetimes, then fills the remaining priority/ancestor slots. Task identity
recognizes extensionless tools such as `tsc` and `eslint`, plus allowlisted
Yarn/npm/pnpm task identifiers and boolean flags. Inline code, unknown task
names, forwarded arguments, workspace names and paths are excluded. Captured
parents retain task identity so short workers can be traced through Yarn.
Diagnostic policy `late-stack-v1` keeps stack eligibility open throughout the
window after the one-time Docker snapshot. Jobs run serially, with at most two
stack attempts across all jobs and no retry of the same PID/start lifetime.
Late stacks append to `diagnostics.json`, preserving the earlier Docker result
and failed attempts. Each stack and Docker snapshot has its own timestamp.
Timeouts and PID changes consume the budget; the worker revalidates lifetimes
immediately before sampling. Status and capture reports expose the policy.
After the one Docker snapshot, `early-task-guest-v1` requests read-only
`docker top` rankings from at most two busy/large containers. Each request has
a two-second/256 KiB cap, considers at most 2,048 rows and saves at most 24
CPU/RSS workers and parents. No `docker exec`, guest file reads or workload
processes are introduced. Arguments are parsed transiently into the same safe
task schema and discarded. CPU is a lifetime average and RSS is a snapshot;
these do not measure guest swap ownership or host physical disk traffic.
Timeouts, truncation and partial coverage stay explicit; no retries occur.
Status records `task_capture_policy`, `task_capture_sha256` and identity
coverage so the helper loaded by the observer can be verified independently.

Install with `agent-resource-monitor install-focus`; inspect with
`agent-resource-monitor focus-status`. Installation leaves loaded recorders
and workloads running. Data is private under `data/agent_resource_monitor/focus`.
No automatic deletion or remediation occurs; storage exhaustion is a failure.
The existing event relay coalesces rotations into one incident and the hourly
evaluation reviews new evidence as a fallback. Queue acceptance is not receipt.
See [thrash-strategy.md](thrash-strategy.md) for thresholds, the hypothesis
ledger, measured verification and attribution/delivery limits.

### Audit archive indexing

`archive_scan.py` maintains a private metadata-only index for
`/Users/taylor/src/docs/html/resource-usage-audit/update-archive.py`, invoked by
the existing `build.py`. It preserves the last-seen grouping and rolling
seven-day coverage rule while reading only appended complete JSONL rows.
Inode/birth/prefix/size checks detect replaced or truncated files; a mapping
digest invalidates the index when `usage-identity.py` changes. Partial trailing
rows are retried. Retention removes derived entries only when their source is
already absent; this helper never deletes source evidence.

The first natural captures identified a chat-owned audit rebuild reading
1,360 MiB with 11.7 observed CPU seconds after a pressure peak. It did not cause
that onset. After one initial index pass, the actual configured Python 3.14
build completed in 0.082 seconds, reading 1.04 MiB of appended rows rather than
rescanning 1.77 GB. This is an observed warm run, not a controlled CPU benchmark.
The index/cache lock lives beside the audit as `.archive-scan-cache.json`;
verification is recorded in `archive-scan-verification.json`. No daemon reload
or application/workload change is required for this build-only improvement.
