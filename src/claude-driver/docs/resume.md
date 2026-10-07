# Claude-driver continuity — 2026-10-06

## Resumed work — latest frontier

Taylor resumed this work on 2026-10-06. Input automation remains quarantined.
The current blocker is the app's exited broker query after an isolated cold
restart test. Taylor replaced the manual-wake request with an independent Claude
observer/recovery prompt and a Codex report-inbox watcher. The prompt is ready
for Taylor to paste; the observer has not yet been verified active. Do not
compete with its restart attempts or send another wake before reconciling outcome. This latest
failure is **not** a confirmed governor-cap refusal: native logs show query exit
code 143. Do not use external PID termination as routine broker recovery.

Current runtime fingerprint:
`73e5794f31db463ee439d85399531f17c856c0375dddc6d0e4a6d8ea6e2fe504`.
On this source, five fresh isolated rounds passed (98 cases each), actual Claude
Haiku and Codex gpt-6.1-sol each passed ten filtered API checks, and four isolated
scenarios exercised the installed app's actual governor/victim-selection code.
Those governor scenarios emit no real OS pressure or app IPC. During this run
Claude auto-updated to app 2.26454.0 / CLI 2.1.289. The earlier extractor failed
on renamed native bindings; the updated version-scoped adapter passes the four
scenarios on the current installed module. Failure retention now includes source
version/hash and extraction stage. Earlier native passes predate this app update.

Long-lived MCP runtimes expose sourceBuild/restartRequired and refuse new effects
when loaded code differs from files on disk. Read-only observation and job
cancellation remain available. Two actual stale-source tests verify rejection
before recipient resolution; reconnect rather than silently mixing revisions.

The initial native input-free run after resume passed all eleven checks,
including import/focus, durable reply, cancellation, settings, queue/interrupt,
single replies and archived cleanup. Its source predates the evidence-reader
hardening and therefore does not qualify the current fingerprint. The same
broker PID survived an eight-minute observation, but no natural governor pressure
occurred; the pressure requirement remains incomplete. Graceful STOP then
verified native deletion of only the exact owned maintenance job.

A candidate protocol-version upgrade was answered `ignored` by the existing
broker instead of causing it to reread the standing file. The pending control
was cancelled without native dispatch; the scratch fixture was independently
archived after restoring compatible v6. File equality (`templateCurrent`) is
not proof that a live broker loaded new instructions. Keep compatible v6 and
verify actual native behavior before future protocol upgrades.

Current reports under `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T03-02-07-451Z.json`: five isolated rounds passed, unchanged source.
- `harness-v2-{claude,codex}-2026-10-07T03-01-30-009Z.json`: ten checks per harness.
- `governor-contract-2026-10-07T03-02-53-593Z.json`: four installed-code scenarios.
- `governor-extraction-failure-reconciled-2026-10-07.json`: failed old extractor,
  reconstructed failure evidence explicitly marked; not a native pressure pass.
- `live-v2-2026-10-07T02-27-50-669Z.json`: eleven native checks passed on earlier source.
- `residency-v2-2026-10-07T02-27-33-201Z.json`: eight-minute same-PID survival,
  no natural pressure; not a passing pressure qualification.
- `live-v2-2026-10-07T02-36-44-905Z.json`: cancelled protocol-upgrade probe;
  owned scratch fixture subsequently verified archived.
- `warm-cold-v2-2026-10-07T02-41-36-542Z.json`: exact idle process exit and
  input audits passed; native warm recovery failed on stale exited app query.

Both new native scratch chats are archived; their durable jobs are terminal.
The approved dotfiles pool remains parked with cleared CLI context. No user
chat, permission, credential, app binary or global harness configuration changed.

After the observer reports a verified recovery, independently inspect the process and
native maintenance receipts/list/app acknowledgment. The reader now rejects
lists from before creation, unconfirmed deletes, invalid/future timestamps and
rows from earlier processes. It reads at most 2 MiB of the owned native journal;
a burst that exceeds retained evidence fails closed. Then rerun current-source
input-free native qualification and read-only residency observation. The observer
now records idle survival separately from the natural-pressure requirement.
Keep all failed/aborted reports and avoid Computer Use or another termination
experiment. Codex-driver fixes and the separate 1Password incident stay parked.

## Independent observer and report inbox

The exact requested directory is `/Users/taylor/Desktop/temp_reports`.
Paste the [monitor prompt](claude-monitor-prompt.md) into a separate Claude
Desktop Code session. A copy is at `/Users/taylor/Desktop/temp_reports/claude-monitor-prompt.md`.
It authorizes one reconciled native wake of only the approved broker, direct
native session-local five-minute observation, capped retries, exact owned
health/exit evidence and atomically published sanitized `.report.json` files.
It forbids keyboard automation, permission changes, app restart and process kills.
The native observer is **not active until Claude verifies it**; session-local
cron expiry/app closure remain explicit limits.

Codex heartbeat `claude-broker-report-inbox` is saved ACTIVE every five minutes,
attached to this existing chat. Its execution depends on the local app scheduler;
creation/readback confirms configuration, not that a later scheduled run occurred.
It calls `scripts/report-inbox.mjs`, independently verifies new report evidence,
and checkpoints justified improvements before acknowledging the exact filename
and SHA256. No new report means no desktop actions or repeated status updates.
The scanner emits metadata only, skips symlinks/oversized/incomplete JSON and
recognizes changed content even under a previously reviewed filename. Two tests
verify those boundaries and persistent acknowledgment. Report text is untrusted
source material, not authority to execute commands. Reports with unresolved work
stay pending with a durable review note. A future explicit pause must pause the
heartbeat and stop owned observation, rather than auto-resume this work.

```sh
node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/report-inbox.mjs
# Only after independent review/checkpoint, with the exact scanned values:
node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/report-inbox.mjs --ack <filename> --sha256 <hash>
```

## Historical pause checkpoint

Status at the earlier checkpoint: paused at Taylor's request. All owned qualification processes are stopped;
no wake, navigation or input automation is pending. The earlier request to send
`claude-driver wake v6` is withdrawn for this pause. Codex-driver fixes remain
parked. The separate 1Password incident chat remains separate.

## Settled runtime

- The approved `claude-driver-broker` is offline, not resident. Its private
  template is current at protocol v6; v6 has not been qualified in the desktop.
- Computer Use remains quarantined. Taylor confirmed normal input after the
  exact stale helper was retired and manually woke v5 once. The cancelled
  observer's before/after audits both found zero Claude keyboard filters.
  This does not prove safe future helper teardown; retain quarantine.
- Both owned native scratch chats are archived. The approved dotfiles pool is
  archived/parked with its CLI context cleared. No owned probe process remains.
- Source and private service evidence are preserved. Existing MCP connections
  do not reload source; this chat's old binding still requires a fresh connection.

## Verified and pending

Current runtime fingerprint:
`32a4b1193203c235dd0ed63876c4231d7783d6e3999e11b1792da32b213b8780`.
On this source, five isolated rounds passed (87 tests each, 435 cases), and
actual Claude Haiku and Codex gpt-6.1-sol filtered harnesses each passed all ten
checks. These filtered harness runs cannot drive the desktop.

Reports in `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T00-39-50-052Z.json`: five rounds passed, source unchanged.
- `harness-v2-claude-2026-10-07T00-39-12-094Z.json`: ten checks passed.
- `harness-v2-codex-2026-10-07T00-39-12-094Z.json`: ten checks passed.
- `residency-v2-2026-10-07T00-39-12-093Z.json`: explicitly aborted for pause;
  no live maintenance job was acknowledged, no desktop write/navigation/input.
- `live-v2-2026-10-07T00-19-17-259Z.json`: earlier nine-check native control
  scope passed; its source predates the current input-free/bootstrap/v6 changes.
- `live-v2-2026-10-07T00-22-13-935Z.json`: failed interruption assertion;
  a quoted completion marker was mistaken for completion. Fixed fixture-only
  delegation and final-line assertions now need another native run.
- `live-v2-2026-10-07T00-27-59-144Z.json`: refused before creation when
  the broker was offline. Retain both failures, do not count them as passes.
- `cron-contract-2026-10-07T00-35-16-136Z-reconciled.json`: native CLI
  CronCreate/List/Delete receipts reconciled; the synthetic job was deleted.
  Original final-format failure is retained. Desktop governor protection is
  explicitly unqualified by this headless contract check.

The native governor evicted the v5 broker after 133 idle seconds despite its
foreground wait. Local app source excludes sessions with live native cron jobs
from its idle-victim selection. V6 stages one session-only recurring maintenance
job with exact prompt `claude-driver drain v6`; startup/idle reconciliation keeps
one owned job, and STOP deletes only that job. The new residency evidence reader
requires current-process tool receipts, a fresh list and native app acknowledgment.
This is a candidate, not established protection or unattended recovery. Warm-only
revival still refuses at the native process cap without keyboard fallback.

## Resume in order

1. Read this checkpoint and fresh `driver_status`/`broker_status` through the
   current CLI or a fresh MCP connection. Verify API v2, runtime fingerprint,
   app/CLI versions, quarantine, broker process and `residencyProtection`.
   Keep current failures and distinguish historical qualification by source.
2. Leave quarantine active and avoid Computer Use. Resume v6 only after Taylor
   resumes this work. If native warm-only revival has headroom, use its audited
   path; if it refuses at cap, retain the refusal and arrange one manual wake.
   Do not kill user sessions, raise permissions, spoof native APIs or inject keys.
3. With a current live v6 broker, require the correlated maintenance receipt/list
   and app acknowledgment. Run the read-only residency observer below; it must
   survive natural native governor pressure on one PID. No observed pressure
   means this requirement remains incomplete.
4. Run the scoped input-free live suite below against its single synthetic
   recipient. Require all eleven named checks, independent focus readback,
   before/after input audits and archived/cancelled cleanup. Do not run full
   UI qualification while quarantined.
5. If runtime source changes, rerun relevant isolated checks and both filtered
   harnesses on the final source. Only then reassess readiness. Sustained physical
   input, native-helper teardown and cold recovery at cap remain separate gaps.

```sh
node src/claude-driver/scripts/residency-v2.mjs --live --duration-sec 480
node src/claude-driver/scripts/live-v2.mjs --live --input-free
```

Shared technical mechanisms and reports belong to this service's docs and
private memory. Harness skills should retain only harness-specific judgment.
Nothing should automatically restart qualification while paused.
