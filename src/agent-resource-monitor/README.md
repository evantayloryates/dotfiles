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

## Next increments

This version is on-demand; it installs no daemon, hooks, notifications, automatic
termination or ongoing chat surveillance. Bounded capture is the default so the
monitor does not become another unowned service.

For longer-term monitoring, add a bounded on-disk ring (for example 10 minutes at
5-second cadence), freeze pre/post evidence on threshold crossings, and impose
retention/disk limits. Benchmark the observer alone before enabling it globally.
The initial 2-second attributed capture averaged about 93 ms of collection wall
time per sample on this Mac; that is not the same as CPU usage, and provenance
discovery is more expensive on the first sample.

Optional native PreToolUse/PostToolUse hooks can supply stable session/turn/tool
metadata to a telemetry receipt endpoint, improving transient-process correlation.
Keep them content-free, asynchronous where supported, bounded and nonblocking.
Do not assume hooks expose the PID of the actual tool subprocess. Code-mode
calls and polling have special completion timing. Hooks need normal harness trust
review; no hook configuration is installed by this tool.

References: [OpenAI hook schema](https://learn.chatgpt.com/docs/hooks),
[Apple memory footprint guidance](https://developer.apple.com/videos/play/wwdc2022/10106/),
[Appium XCUITest settings](https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/settings.md).
