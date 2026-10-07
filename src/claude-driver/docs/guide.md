# claude-driver guide (for any harness)

claude-driver drives Taylor's Claude desktop app from Claude Code, Codex,
Cursor, OpenCode or a script. This is the usage contract; the README has the
mechanisms and evidence.

Native batch and concurrent controls have passed, but later full runs failed
serving and concurrency. Full current native steering remains unqualified.
The installed PreToolUse adapter redirects exact cached wait/check commands,
and a separate gate checks the actual native operation. See [resume.md](resume.md) for
exact source/package distinctions, preserved failures and readiness gates.
Ordinary requests send exactly `claude-driver request <id> v7`, bound to the
durable request and hook arm. Native admission waits before enqueue for a real
current-epoch foreground waiter or stable idle boundary. Working/rearming
heartbeats alone cannot establish readiness. Non-native legacy heartbeat
evidence remains explicitly weaker. Receipt collection tracks only exact owned
Stop feedback with per-ID/peer/epoch consumption and causal ancestry; initial
end_turn alone does not preempt that bounded continuation.

Protocol v7 retains exact compatible `claude-driver wake v6` / `drain v6`
identities. Wake enters the loop; operation arguments come only from the durable
request, dispatch checkpoint and native admission. Native envelope sender fields are routing
metadata, not an identity gate. A matched file or send return alone never proves
that the live model loaded instructions or applied an operation.

After IDLE the broker must list maintenance before waiting again. The waiter
limits waiting to nine minutes from the last native list, including across
requests. `broker_status.residencyProtection.verified` still requires a fresh
current-process list after creation and no unresolved native mutation. Its
12-minute limit is unchanged. Evidence reads are bounded to 2 MiB of the owned
journal; missing/rotated evidence fails closed. Maintenance proof does not
replace actual natural-pressure survival or qualify cold recovery. The observer
owns offline restart attempts; avoid competing wakes. UI quarantine stays active.

The broker-scoped command Stop rescue is installed separately from its active
dependency pin. Ordinary requests arm only their own exact prepared native peer
UUID before socket bytes, with at most one wake and one continuation. The hook
runs only for the exact reviewed receiver framing, same native ancestry/epoch,
unexpired pending undispatched work and no STOP; it consumes its attempt before
feedback. It never copies request arguments or model text into instructions.
Changed settings/handler policy refuses effects. Cancellation or missing native
receipts still requires reconciliation. An explicitly enrolled compact feedbackVersion2 uses shorter, fixed tool-first
instructions. Its exact consumed version must match native feedback; unknown
versions refuse. New installs default toversion1, and compact plus quiet
waiting is currently refused. Three post-compaction reads passed, but this does
not qualify sustained residency or full controls. Use a fresh current CLI/MCP;
legacy connected servers do not acquire this behavior from source edits.

Never interpret `dispatched:false` as proof that no native effect occurred: that
field describes the helper checkpoint. A real legacy mutation happened after
dispatch:false/cancelled. Current clients require the installed native gate
policy before enqueueing mutations, and bind each request to its handler and
settings hashes. The gate checks expiry/cancel/STOP again at the actual native
tool and consumes one exact slot. Enqueued native mutations without a correlated
receipt remain outcome_unknown/retrySafe:false, even with that policy, because
platform hook runner failures are not yet exhaustively qualified. Reconcile
before new work; neither cancellation nor a stop reverses an earlier effect.
See [native-effect-admission.md](native-effect-admission.md).

The optional quiet command-hook experiment polls durable metadata without idle
model calls and supplies one fixed continuation per request ID. It is disabled:
the real native continuation arrived, but Claude ended without tool calls. A
verified quiet helper proves mechanical signaling availability only. It does not
prove serving, completion, sustained residency or general-use readiness. Existing
fast local detection remains30s; the hourly observer is fallback, not test pacing.
See [broker-quiet-stop-candidate.md](broker-quiet-stop-candidate.md).

## V2 control interface

Check `driver_status.runtimeBuild`, `sourceBuild` and `restartRequired` when
connecting a long-lived MCP process. Missing sourceBuild/restartRequired in an
older server requires a fresh connection or current CLI before writes. Updated
files do not reload it. A stale
runtime rejects effects with `runtime_stale`, `dispatched:false` and
`retrySafe:true` before recipient resolution; read-only observations and
`driver_cancel` remain available. Reconnect or use a fresh current CLI process.
Serialized recipient controls recheck after acquiring their lock, so a source
change while waiting cannot slip past the entry check. Qualification still
depends on both runtime fingerprint and installed app/CLI version. See [resume.md](resume.md) for current reports and observer handoff.

Wake delivery shares the remaining broker deadline. CLI helper cancellation
persists queued-request cancellation while shutting down that exact launched
helper; cleanup grace may add250ms plus lock/scheduling time. A partial socket
write never starts a fallback sender. These guarantees concern transport/helper
ownership, not reversal of dispatched native effects. A discarded-output waiter
cannot claim work; one kernel-owned waiter captures output in a pipe/socket or
owned regular file. Active wait/check dependencies now load an immutable pinned package through a
validated sealed bootstrap; cached workspace command shims remain the startup
boundary. Completed entries now require the exact native PID/start ancestry; a legacy unbound activation is not current-process proof. Host/source and active broker fingerprints are distinct. Do not
advance the pin through ordinary source edits or treat staged candidates as
native handoffs. Different-build rollback remains unqualified. Unexpected
native model behavior still requires reconciliation.

Qualified CLI 2.1.289 direct delivery removes the sender inference turn. Exact
PID/start epoch, CLI session, private owned key and reviewed version are required;
explicit direct mode fails closed and has no version environment override.
A wake's exact native peer msg_id, causal UUID ancestry, end_turn without tools
and same process idle state can establish `broker_not_serving`. The client then
cancels still-unclaimed work without another wake. A tool result/checkpoint wins
a completion race; dispatched effects remain `outcome_unknown` when unresolved.
Missing/cross-branch journal evidence is not refusal proof. Model prose is never
used to decide this guard.

The metadata-only local detector runs every 30 seconds and publishes only changed
observations into Taylor's report inbox. STOP suppresses recovery alerts; idle
alone is healthy; unserved work requires a current aged unclaimed request.
Liveness-returned does not establish serving readiness. The detector uses zero
inference and never wakes another chat. Codex's 30-second report watcher still
has inference-bearing scheduler ticks. The native Claude observer is hourly
fallback; event-triggered native recovery remains a separate integration.

A recipient can refuse a peer replacement after interpreting stop as human
intervention. `stopped:true` and a send receipt do not prove the replacement was
accepted. Use observations; never override a real human stop or blindly replay.

Use `driver_submit {operation, arguments, idempotency_key, timeout_sec}`
for work that must survive client disconnection. It immediately returns a
job ID. Reuse the same key and arguments to reattach; changing the arguments
with the same key is an error. Titles and `self` bind to a session ID at
submission; later renames cannot change the recipient. Detached workers
retain the desktop caller identity and its self-protection gates. They also
retain the submitting runtime fingerprint, exposed by `driver_job.runtimeBuild`.
A worker starts only from queued state; another launch cannot reclaim a running
job or replace its claimant PID. Mismatched or missing source provenance fails
with `runtime_stale`, `dispatched:false`, `retrySafe:true` before the operation.
Reattaching an old idempotency key returns that existing failure, never a replay;
only submit new work after inspecting the failure and current source.
`driver_job` inspects the job and
`driver_wait {job_id, timeout_sec}` waits at most 60 seconds. A wait timeout
does not cancel work. `driver_cancel` cancels the driver operation, not the
recipient Claude turn. A dispatched request or lost worker can produce
`outcome_unknown`: reconcile the app state before submitting another job.
Use `driver_request {request_id}` from the error details to inspect a correlated
late native receipt without replaying the action; raw results are opt-in.
Native desktop broker receipts come from its actual tool-use journal, matched
to the dispatch checkpoint and exact arguments. A relay paraphrase cannot
settle those requests. A receipt still requires app-state/response verification.
If interruption completed but cancellation prevented the replacement, the
job reports a `partial_effect` error with `stopped:true` and
`replacementSent:false`; the stop already happened.
Delete and project archive remain on their explicit gated entry points.

Capture `session_events {session}` before sending: the initial cursor starts
at the transcript's current end. Continue with `session_wait {session,
cursor, include_text:true}` to observe subsequent replies. Text is opt-in
and assistant-only; thinking and tool inputs/results are excluded. Long assistant text includes `textTruncated` and `textChars`; when truncated,
`textTail` contains at most the final 256 characters alongside the 4000-character
prefix. Inspect the tail for an exact terminal protocol marker, rather than
mistaking a quoted marker for completion. Text, length and tail remain opt-in;
thinking and tool inputs/results remain excluded. Cursors
reset when the underlying transcript changes. A cleared/new session gets a
pending cursor that captures its first transcript when it appears.
`create_session.observationCursor` is captured before `first_message`; use
that cursor even when the reply finishes before creation returns. A new
cursor after creation would intentionally skip the already-written reply.
Use `include_causality:true` on observations when correlating replies. It adds
bounded `parentId`, `peerMessageId` and `sidechain` fields and metadata-only
ancestors. Match the send receipt's `messageId` to a user peer event, then follow
actual parent IDs to the assistant reply. Missing/reset ancestry is inconclusive;
a new human/peer instruction belongs to a different branch. Deduplicate repeated
journal envelopes by event UUID. Text remains separately opt-in; user text,
thinking, tool inputs/results and peer sender fields remain excluded. For a
synthetic exact-reply protocol, use a fresh token for each run and require an
exact terminal reply on that branch. This proves response correlation, not sender
authority or arbitrary task completion. An observed desired app state does not
settle a different uncertain request that might still have an effect.

Waits also return live status
changes, such as busy → idle, even without new text. A status change or
delivery receipt does not prove that an instruction was applied.

`steer_session {session, mode:"queue", message}` adds a follow-up.
`mode:"interrupt"` requests native stop, verifies idle, then sends the new
instruction. Both require recipient response observation before claiming
application. `stop_session` interrupts without sending a replacement.
Controls for one recipient serialize across processes; an interrupt's stop
and replacement cannot interleave with another control for that recipient.
Native stop preserves existing queued messages; they can run before the new
replacement. `queueDisposition` makes this explicit. Interruption does not
silently discard another caller's queued work.

Current cross-process locks have an outer kernel `flock` held by Node's file
descriptor throughout the operation, acquired through isolated `/usr/bin/python3`
stdlib `fcntl`. The helper exits before the callback; Node retains ownership.
Cancellation/deadline while queued refuses the callback, holder death releases
kernel ownership, and helper failure reports `lock_unavailable` without unsafe
fallback. The legacy directory guard remains for older clients; reconnect stale
clients for current guarantees. Do not remove or age-reclaim `locks/*.mutex`:
unlinking creates a different inode and would split a live lock. No service
credential, native app process, keyboard helper or event tap is involved.
Broker lock timeout/abort before publication reports `dispatched:false`,
`retrySafe:true` and no request ID. A progress/notice failure after publication
returns the exact request ID and cancels/disarms its owned work. Enqueued native
mutations still require reconciliation with `outcome_unknown/retrySafe:false`;
a known receipt is inspected rather than replayed.

For several settings on one recipient, use one `set_session_config
{session, title, pinned, model, effort, permission_mode}` with only the desired
fields. `pinned:false` is an explicit unpin. One broker request executes ordered
native controls and verifies every requested field. The batch is not atomic:
a failed later control can leave earlier changes applied. Error details include
`requestId`, native `results`, `partial` and `retrySafe:false`. Reconcile the
receipt and disk state before sending only the remaining changes.
Repeated identical native operation slots are refused before enqueue unless
`broker_status.batchAdmission.verified` proves an indexed checkpoint from the
actual completed current-epoch helper. Staged/newer host index support alone
cannot enable duplicates. Distinct operation slots remain usable with the
legacy helper. The service does not split or replay a refused batch automatically.

Use `driver_memory_query {topic, kind, limit}` for shared technical lessons.
`driver_memory_record {topic, lesson, evidence}` appends a candidate lesson;
it is not a verified conclusion. The service automatically records bounded
operation metadata without prompts or raw replies. Keep harness-specific
quirks in the harness skill, and shared behavior in this service's evidence.
Records identify the runtime source fingerprint. Queries scan backwards
with bounded memory; technical lessons and their evidence have length caps.

Physical keyboard duplication was reported during live qualification on
2026-10-06. Taylor initially confirmed normal physical typing, but duplicate characters
and pastes recurred around 17:56 Eastern. The shared UI quarantine is active
again. Two active Computer Use keyboard filters targeted Claude and survived
JS reset; retiring the helper removed them. Taylor subsequently confirmed recovered input and one manual wake with
paste/send screenshots. Explicit thread-close/native-helper teardown
qualification remains pending; quarantine remains active. The service
audits helper-owned Claude keyboard filters before and after each UI lease,
including cancellation/failure. Surviving filters or an unavailable audit
quarantine further UI work; the driver does not kill shared helper processes.
When enabled, the service's private `ui-quarantine.json` blocks Tier C before
loading Computer Use, dead-broker recovery before navigation, new/forced
broker initialization, probes and full `live-v2.mjs --live` runs.
The explicit `broker_status {revive:true, warm_only:true}` is an exception
for audited native navigation only: it validates the approved broker, snapshots
focus, opens its native deep link, waits for a live process and conditionally
restores focus. It never starts Computer Use or types/pastes. Input filters are
audited before and after, including errors/cancellation. A failure returns
`broker_wake_required` without keyboard fallback. Error details distinguish
`reason:governor_cap`, `reason:app_query_exited` (with numeric `exitCode`) and
`reason:native_warm_spawn_unobserved`; do not infer a cap from the category alone.
External termination left a stale exited app query in a live pressure experiment,
so it is unsuitable for routine recovery. Ordinary recovery remains
blocked by quarantine; unattended cold recovery is not qualified.
Preflight reports an unqualified capability matrix instead of automatically
probing a new app/CLI version while quarantined. Disk reads and an already
live broker remain available.
`driver_status.uiAutomation` reports the current policy. The file is read on
each UI entry; malformed or incomplete quarantine records fail closed.
Release requires an explicit `{ "blocked": false }` record after physical
recovery and native-helper teardown are qualified. Physical recovery alone
did not prevent recurrence. Refresh old MCP connections before relying on this
guard. This limits this driver, not other chats using Computer Use.
Tier C runs in a private stdio worker, serialized across callers, without
restarting the shared Codex daemon. It returns private evidence and execution
metrics. Its bounded worker instructions forbid shell, memory reads and
recursive bridge/CLI calls; the cold-recovery test observed zero shell calls.
UI wake recovery requires an empty composer, native text paste (never
setValue or per-character input), exact readback before one Return, and
independent broker liveness after the structured send outcome. Never overwrite a user's draft or retry a send
whose outcome is unknown.

During the incident, a separate native-only qualification scope can use a
current live broker and an existing registry-proven scratch fixture:
`node scripts/live-v2.mjs --live --broker-only --session local_<fixture>`.
`--restore-fixture` permits native unarchive of that same owned fixture.
This scope cannot create/import/open sessions, use input automation or raise
permissions. It checks durable delivery, native controls, tool-free generation
queue/interrupt behavior and archive cleanup. It does not qualify UI recovery,
focus restoration, physical typing or all desktop operations.

An input-free live scope can additionally qualify one new synthetic CLI
bootstrap/import and independently verify restored focus:
`node scripts/live-v2.mjs --live --input-free`. It retains quarantine and
requires a current live broker before every operation. Its structural allowlist
binds the exact private scratch folder and fixed bootstrap authorization
for subsequent synthetic broker messages, bounded bootstrap configuration,
recipient and owned jobs; no arbitrary bootstrap prompt, permission changes,
user-session navigation, broker recovery or Computer Use is permitted. Native
filter audits run before and after, including failure, and all eleven named
checks must pass on unchanged source. This qualifies import/native controls;
it does not qualify input automation or unattended cold recovery.

## 1. Rules

1. **Verify on disk, never the UI.** Every write op re-reads the app's own
   session records (`verified: true/false` in results). Treat `false` as a
   failure. Screenshots and chat claims are not verification.
2. **Focus is Taylor's.** Navigating ops (create, fork, open, unarchive,
   broker revival) take a fresh snapshot of the main window's session and the
   frontmost app right before they navigate, and restore both afterwards
   (`focus: "restore"`, the default) — unless Taylor moved in the meantime, in
   which case they leave it alone. Use `focus: "show"` only when Taylor asked
   to see the result. Batch work so the window flickers once.
3. **Archive, don't delete.** `delete_sessions` always shows Taylor one
   approval card, in every permission mode, by design. Never click that card
   (or any approval card) yourself, by computer use or otherwise. Queue
   candidates with `delete_sessions {queue: true}` and present the queue in
   one batch (`from_queue: true`) when Taylor asks. If the delete was handed
   back and you made the call yourself, run `delete_sessions {cleanup_only:
   true}` afterwards to remove the CLI files the app leaves behind.
4. **Projects are gated.** `archive_project` is a dry run unless
   `dry_run: false`, and refuses anything but scratch folders, the driver's
   own folders and folders it created, unless Taylor explicitly approved
   `override: true` for that folder.
5. **Self-archive ends your conversation.** `archive_session` on your own
   session requires `confirm_self: true`.
6. **Never write the app's files.** The app holds its state in memory and
   rewrites them; the driver only reads them.
7. **Bypass comes from the pool, never from a workaround.** An import can
   never be bypass and a raise always shows Taylor a card. `create_session`
   therefore hands out a parked session from the bypass pool: one Taylor
   already put in bypass, finished, cleared and archived. Never click the
   card, edit a record, or drive the UI to get bypass another way. Putting a
   session in Taylor's configured default mode this way is not a raise.

## 2. Tiers

| Tier | Mechanism | Latency | Ops |
|------|-----------|---------|-----|
| A | disk reads, bundled CLI bootstrap turn, `claude://` deep links | 0–5 s | list/get/live sessions, window_state, create, fork, open, unarchive (driver-created) |
| B | the app's own `ccd_*` tools, run by the driver's **broker** session (or by you, if you are a desktop session) | ~8–20 s via broker | rename (locks title), pin/unpin, archive, unarchive (native), model/effort/permission mode, send_message, groups, delete, precise window layout |
| C | Codex Computer Use through codex-bridge | 20–60 s, visible | broker revival when the app will not warm-spawn it, window management |

**If you are a Claude desktop session** (you have `mcp__ccd_*` tools), Tier B
ops return `handedBack: true` with the exact `ccd_*` calls to make yourself;
make them, then verify with `get_session`. Pass `via_broker: true` to force
the broker instead.

**The broker** is the already-approved Haiku session `claude-driver-broker`.
Native pressure can evict an unprotected idle process much sooner than the
ordinary idle timeout. V6's native maintenance job is intended to protect it;
consult fresh `broker_status` evidence. UI recovery remains quarantined. Explicit
warm-only recovery can succeed when the governor has headroom and otherwise
refuses without keyboard fallback. A dead broker therefore needs recovery
before native controls are available.

## 3. Choosing an op

- New session with a task: `create_session {folder, title, first_message}`.
  Add `require_pool:true` with `permission_mode:"bypassPermissions"` when the
  harness needs a previously approved member and cannot accept an import
  fallback. An empty pool fails before navigation or optional group creation.
  Pool folder selection treats a symlink and its canonical path as one folder.
  With Taylor's default (bypass) it claims a pool session: title locked,
  model (default Opus 5.5) and effort (default high) set, the task sent as
  `first_message`, no bootstrap turn. `via: "pool"` in the result; verify
  `permissionMode` with `get_session`. The pool is per folder: a claim only
  takes a session parked in the folder asked for.
- No pool session for that folder: the result says `permissionGap` and `verified: false`; the
  session was imported in acceptEdits. Report it, raise it with
  `set_session_config` (Taylor's card) and refill the pool.
- Finished session (PRs merged or closed, nothing held for Taylor):
  `pool_release {session}` instead of only archiving. First call sends the
  recycle message (the session unbinds its PR and clears itself); call again
  when it is idle to retitle and archive it. A session may answer
  "recycle declined: …": leave it, archive it as before, tell Taylor why.
- `pool_status` shows ready counts per folder; `{suggest: true}` lists
  archived bypass sessions with only merged or closed PRs. Prefer sessions an
  agent created for a PR over Taylor's own conversations.
- Other modes or no folder: `create_session {permission_mode | no_project}`
  imports (bootstrap turn + deep link); non-bypass modes survive the import.
- Continue from an existing session's context: `fork_session`.
- Tell a running session something: `send_message`.
- Tidy up: `archive_session` (per session) or `archive_project` (folder,
  gated). Undo with `unarchive_session`.
- What is Taylor looking at: `window_state` (cheap) or `{precise: true}`.
- Health: `driver_status`; broken mechanisms show in the capability matrix.

## 4. Session references

`local_<uuid>` (desktop id), a bare uuid (desktop or CLI id), an exact title
(refused if ambiguous), or `"self"` for the desktop session hosting you.

## 5. When something surprises you

Check `driver_memory_query` and curated `driver_learnings` first. Record a
new technical lesson with `driver_memory_record` and sanitized evidence.
It stays a candidate until re-verified and promoted into `docs/findings.md`.
The legacy `driver_record_learning` writes that same shared memory;
`driver_learnings` includes historical pending entries for compatibility.
