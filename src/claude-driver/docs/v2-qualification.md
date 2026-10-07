# Claude-driver v2 qualification

Latest audit: October 7,01:00 Eastern; app 2.26454.0 / CLI 2.1.289.
Host build `5dfbbdc62eb55f95bd60c62c13f9ae5560b6b41ff740ac67027a944a571d2b73`.
Active broker package `3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`,
bootstrap `7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4`,
generation 3. Host edits do not advance this pin. Exact reports: [resume.md](resume.md).

## Current readiness audit

| Requirement | Current evidence | Practical limit |
|---|---|---|
| Shared durable/steerable API | Three final isolated rounds passed unchanged source; additional positive/negative native-wake receipt cases | Actual filtered harness passes predate current host changes; no full current native controls pass |
| Native Code controls | Latest full run failed after initial reply/cancel; generic v7, named v7 and compatible v6 wakes all ended without tools | Existing owned fixture remains unarchived; do not rerun full suite without a justified serving improvement |
| Deterministic transport | Seven installed receiver VM cases and exact native msg_id acceptance; 155–159 ms; ordinary current-source client used direct | Socket completion alone is not acceptance; acceptance is not native operation execution |
| Failure containment | Correlated peer/UUID ancestry, end_turn without tools, same process idle and pending work yielded `broker_not_serving` in 3.35 s | Cancels only undispatched work; uncertain/dispatched results still require reconciliation; no model-compliance fix claimed |
| Service evidence/memory | Preserved native/isolated failures, host/broker fingerprints, metadata-only memory and reviewed detector reports | Candidate strategies are not promoted without actual qualification |
| Fast low-inference detection | Sealed detector LaunchAgent every 30s, zero inference; actual unserved-work event and liveness-only event; nine private boundary cases | Codex inbox scheduler still invokes inference every 30s; native Claude observer is hourly fallback, not event-driven recovery |
| Maintenance reconciliation | Last verified native list04:37:33Z reused job d7319422 and app recognition on PID 71262 | Evidence freshness ages out after 12 min; stale list is neither current protection proof nor evidence of job absence |
| Deployment isolation | Same-PID handoff; completed sealed entry records and native tool receipt; nine release boundary cases | Cached workspace shim remains mutable startup boundary; exact current-process entry provenance and different-build rollback need further work |
| Recovery | Observer hourly job ae838cf8 independently verified; intentional STOP suppressed by detector | Stale exited query, app closure/restart, cron expiry and actual natural governor pressure remain unqualified |
| Input usability/scope | Quarantine remains active; no input, app restart, auth change or native session termination; Codex/1Password fixes parked | Safe native-helper teardown remains unqualified |

Keep exact compatible `claude-driver wake v6` / `drain v6` while queued requests
retain protocol 7. Do not infer serving from “Broker running”, cron protection,
an unchanged PID, a matching file or a send return. Current full reliability
is incomplete. The independent observer owns offline recovery; avoid duplicate
wakes or unapproved cross-chat messages.

This chat's connected MCP is legacy driver 1a83e53/build 32a4b119 and lacks freshness
fields. Use current CLI/fresh MCP; source changes do not update that connection.
The 30-second inbox watcher scans first and is quiet without pending evidence.
Actual natural-pressure survival and unattended recovery remain separate from
synthetic governor tests and read-only idle survival.

## Historical and broader mechanism evidence

| Requirement | Verified evidence | Practical limit |
|---|---|---|
| Common CLI/MCP interface | Actual Claude Haiku and Codex gpt-6.1-sol harnesses each passed ten filtered API checks | Cursor CLI needs human login; native desktop callers' handback not separately qualified |
| Durable ownership | Detached workers survive client disconnection; idempotent reattach creates one worker and one recipient reply; historical native submit returned in 9 ms | Submission latency differs from recipient response latency |
| Cancellation | Native cancellation behind recipient lock dispatched nothing; expiry/checkpoint/cancellation races tested offline | A crash during native effects remains uncertain until reconciled |
| Native receipts | Exact checkpoint, canonical arguments and native tool/result IDs; batched checkpoints and late read-only reconciliation | Native journal rotation/version drift fail closed; never replay uncertainty |
| Steering | Queue preserved busy generation; stop verified, replacement observed, old completion absent; separate real Bash/Node tool interruption proof | Native stop preserves queued work; stopping does not undo past tool effects |
| Concurrency | Three native controls verified; isolated recipient locks, 12 registry writers and eight pool claimants | Native broker serializes controls; longer sustained load remains a usage frontier |
| Identity and observation | Recipient binding survives rename; bounded UTF-8/partial-record cursors; first reply from pending creation cursor | Live transcript rotation and arbitrary native caller handback remain unqualified |
| Creation and pool | Full native import/create/focus; approved pool-only claim through folder alias, fresh context, restored settings and parked cleanup | Permission raises/deletes still require their own explicit user action |
| Groups | Current manual sections merged with native legacy assignments; opaque create receipt resolved to one verified ID | Unknown schema or ambiguous names refuse/retain uncertainty |
| Recovery | Pre-recurrence owned idle-broker termination and verified wake; new explicit thread close, input-filter audit and quarantine guards tested in isolation | Native teardown remains unqualified; UI recovery is disabled; unknown sends require reconciliation |
| Service memory | Bounded metadata-only automatic records; candidate lessons distinguished from verified test evidence; source/version fingerprints | Continued usage supplies future evidence; no prompts or raw journal contents in automatic memory |
| Human usability | Recurrence captured; stale helper filters removed and renderer reload completed | Human input recovery observed; safe native-helper teardown remains unqualified |

Pre-authentication-change deterministic report: `<state>/pressure/v2-2026-10-06T22-20-58-626Z.json`:
68 tests in each of five fresh processes, 340 passed, unchanged runtime/suite
fingerprints. These exercise actual launchers, separate MCP clients, detached
workers and synthetic stores without desktop actions. New cases cover thread
archive success/refusal, precise filter ownership, preserved human quarantine
and an unavailable audit. A separate read-only live audit found zero surviving
helper keyboard filters at 22:20 UTC; it did not start Computer Use.

Historical native report, preceding the authentication change:
`<state>/pressure/live-v2-2026-10-06T22-20-43-966Z.json`: all eight checks
passed with active UI quarantine and unchanged runtime source. It exercised
delivery/reply, cancellation, three concurrent controls, busy queue,
interruption/replacement, duplicate-reply checks and archived cleanup of an
existing owned fixture. Submit was 9 ms; delivery/reply 12.000 s, concurrent
controls plus unpin 36.253 s, interruption/replacement 19.756 s. It did not
import, navigate, automate input or prove native UI teardown.

Pre-recurrence full live report:
`<state>/pressure/live-v2-2026-10-06T22-03-26-276Z.json`: all eight required
checks passed on unchanged source, including create/focus, durable delivery
and reply, cancellation, concurrent controls, busy queue, interruption,
single replies and archived cleanup. Submit was 6 ms; delivery/reply took
8.395 s; concurrent controls plus unpin took 36.420 s; interruption/replacement
20.069 s. These are observations, not latency guarantees. Job waits now tolerate
nonterminal bounded-wait returns and cleanup cancels outstanding owned jobs.

Actual model-driven filtered reports:
`harness-v2-claude-2026-10-06T22-20-36-999Z.json` (26.140 s) and
`harness-v2-codex-2026-10-06T22-20-36-999Z.json` (17.760 s), both under
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

Pre-recurrence controlled cold-recovery report:
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
Do not run full UI qualification while quarantined. Inspect `driver_status`
and the newest scoped native results; earlier passing UI runs did not
establish durable physical usability.
Avoid restarting the app while unrelated Claude work is active. Reconcile
uncertain effects before replay.
