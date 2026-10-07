# Claude-driver pause checkpoint — 2026-10-06

Status: paused at Taylor's request. All owned qualification processes are stopped;
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
