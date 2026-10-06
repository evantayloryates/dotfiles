# Claude-driver v2 qualification

V2 is available through the CLI and fresh MCP processes on Claude desktop
2.19675.0 / bundled CLI 2.1.286. Taylor confirmed normal physical typing on
2026-10-06; the shared UI quarantine was explicitly released. Duplication's
root cause remains unproven. Empty-composer protection and exact paste readback
remain mandatory.

This chat's connected MCP still serves legacy `706a338`; use the current CLI
or a fresh connection and verify `apiVersion:2`, `runtimeBuild` and current
qualification. Source updates do not reload an existing MCP process.

| Requirement | Verified evidence | Practical limit |
|---|---|---|
| Common CLI/MCP interface | Actual Claude Haiku and Codex gpt-6.1-sol harnesses each passed ten filtered API checks | Cursor CLI needs human login; native desktop callers' handback not separately qualified |
| Durable ownership | Detached workers survive client disconnection; idempotent reattach creates one worker and one recipient reply; current native submit returned in 6 ms | Submission latency differs from recipient response latency |
| Cancellation | Native cancellation behind recipient lock dispatched nothing; expiry/checkpoint/cancellation races tested offline | A crash during native effects remains uncertain until reconciled |
| Native receipts | Exact checkpoint, canonical arguments and native tool/result IDs; batched checkpoints and late read-only reconciliation | Native journal rotation/version drift fail closed; never replay uncertainty |
| Steering | Queue preserved busy generation; stop verified, replacement observed, old completion absent; separate real Bash/Node tool interruption proof | Native stop preserves queued work; stopping does not undo past tool effects |
| Concurrency | Three native controls verified; isolated recipient locks, 12 registry writers and eight pool claimants | Native broker serializes controls; longer sustained load remains a usage frontier |
| Identity and observation | Recipient binding survives rename; bounded UTF-8/partial-record cursors; first reply from pending creation cursor | Live transcript rotation and arbitrary native caller handback remain unqualified |
| Creation and pool | Full native import/create/focus; approved pool-only claim through folder alias, fresh context, restored settings and parked cleanup | Permission raises/deletes still require their own explicit user action |
| Groups | Current manual sections merged with native legacy assignments; opaque create receipt resolved to one verified ID | Unknown schema or ambiguous names refuse/retain uncertainty |
| Recovery | Deliberate owned idle-broker termination, verified cold UI wake, restored focus, private stdio/state, zero shell calls and exited backend; quarantine/cooldown guards | Human edits/drafts/cards stop the worker; unknown sends require reconciliation |
| Service memory | Bounded metadata-only automatic records; candidate lessons distinguished from verified test evidence; source/version fingerprints | Continued usage supplies future evidence; no prompts or raw journal contents in automatic memory |
| Human usability | Taylor's physical typing confirmation and supported renderer recovery | Root cause of original duplicate input remains unproven |

Final deterministic report: `<state>/pressure/v2-2026-10-06T22-03-45-263Z.json`:
62 tests in each of five fresh processes, 310 passed, unchanged runtime/suite
fingerprints. These exercise actual launchers, separate MCP clients, detached
workers and synthetic stores without desktop actions.

Final full live report:
`<state>/pressure/live-v2-2026-10-06T22-03-26-276Z.json`: all eight required
checks passed on unchanged source, including create/focus, durable delivery
and reply, cancellation, concurrent controls, busy queue, interruption,
single replies and archived cleanup. Submit was 6 ms; delivery/reply took
8.395 s; concurrent controls plus unpin took 36.420 s; interruption/replacement
20.069 s. These are observations, not latency guarantees. Job waits now tolerate
nonterminal bounded-wait returns and cleanup cancels outstanding owned jobs.

Actual model-driven filtered reports:
`harness-v2-claude-2026-10-06T22-03-31-307Z.json` (26.314 s) and
`harness-v2-codex-2026-10-06T22-03-31-307Z.json` (22.710 s), both under
`<state>/pressure/`. All ten checks passed: required MCP replies, identical
submissions yielding one completed worker, matching recipient, cursor,
shared candidate memory, unchanged source and global configs. The filter
refuses desktop actions; these are API workflow checks, not UI evidence.

Additional native reports under `<state>/pressure/`:

- `native-pool-v2-2026-10-06T21-32-38-401Z.json`: three lifecycle checks,
  first reply from creation cursor, model/effort restored, cleared/archived pool.
- `native-tool-v2-2026-10-06T21-41-27-854Z.json`: four checks proving exact
  bounded tool process ancestry, termination, replacement and pool cleanup.
- `native-group-v2-2026-10-06T21-44-52-136Z.json`: current group schemas,
  movement/readback and archived fixture cleanup.
- `probe-v2-2026-10-06T21-46-29-350Z.json`: all twelve existing mechanisms,
  including fork/unarchive and focus; test fixtures archived.
- `native-recovery-v2-2026-10-06T21-47-44-320Z.json`: isolated broker-state
  governor-cap refusal with Tier C disabled and focus restoration. This is
  a fail-closed test, not proof of successful warm-spawn.

Final controlled cold-recovery report:
`<state>/pressure/cold-recovery-v2-2026-10-06T22-05-59-471Z.json` passed all
three checks on the same final source. Under the broker lock, only the exact
owned idle broker process was terminated. Warm-spawn did not happen; the
private 0.160.0 stdio worker pasted and byte-verified one wake line, sent once,
reset its own native UI kernel, and independent disk/process evidence proved
the new broker live. The prior main chat and front app were restored. The
private backend exited, no shell calls occurred, and global configs were
unchanged. Recovery took 37.304 s (24.850 s in the UI lease). An initial
fixture stopped before termination because it required a waiting heartbeat
rather than also accepting independently idle native status; that failed
precondition remains retained, with no desktop effect.

Those additional reports identify their own earlier source fingerprints.
Failed, interrupted and superseded reports remain retained, including
`live-v2-2026-10-06T21-58-35-639Z.json`; they are never counted as passing.
Its native send was not dispatched: `setValue` left a delayed broker draft,
which was subsequently reconciled and sent once through supported native UI.
The failed fixture was archived without replaying its task.

`driver_status.nativeQualification` selects the latest full-live or scoped
native result, requiring exact runtime and app/CLI versions. Full-live
qualification includes import/focus but does not itself prove physical typing
or cold UI recovery. Private reports, lease evidence and shared memory live
in `~/.local/state/claude-driver/`. Tier C forces the installed backend through
private stdio/state rather than the older shared managed Codex daemon; general
Codex bridge fixes remain parked.

The incident-only native scope accepts a live broker and a proven owned fixture:

```sh
node src/claude-driver/scripts/live-v2.mjs --live --broker-only \
  --restore-fixture --session local_<owned-fixture>
```

It requires active UI quarantine and refuses bootstrap/navigation/input.
For normal readiness use the full `--live` run and inspect `driver_status`.
Avoid restarting the app while unrelated Claude work is active. Reconcile
uncertain effects before replay.
