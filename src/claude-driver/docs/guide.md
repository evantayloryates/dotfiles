# claude-driver guide (for any harness)

claude-driver drives Taylor's Claude desktop app from Claude Code, Codex,
Cursor, OpenCode or a script. This is the usage contract; the README has the
mechanisms and evidence.

## V2 control interface

Use `driver_submit {operation, arguments, idempotency_key, timeout_sec}`
for work that must survive client disconnection. It immediately returns a
job ID. Reuse the same key and arguments to reattach; changing the arguments
with the same key is an error. Titles and `self` bind to a session ID at
submission; later renames cannot change the recipient. Detached workers
retain the desktop caller identity and its self-protection gates.
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
and assistant-only; thinking and tool inputs/results are excluded. Cursors
reset when the underlying transcript changes. A cleared/new session gets a
pending cursor that captures its first transcript when it appears.
`create_session.observationCursor` is captured before `first_message`; use
that cursor even when the reply finishes before creation returns. A new
cursor after creation would intentionally skip the already-written reply.
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
JS reset; retiring the helper removed them. Physical recovery and explicit
thread-close/native-helper teardown qualification remain pending. The service
audits helper-owned Claude keyboard filters before and after each UI lease,
including cancellation/failure. Surviving filters or an unavailable audit
quarantine further UI work; the driver does not kill shared helper processes.
When enabled, the service's private `ui-quarantine.json` blocks Tier C before
loading Computer Use, dead-broker recovery before navigation, new/forced
broker initialization, probes and full `live-v2.mjs --live` runs.
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

**The broker** is a Haiku session titled `claude-driver-broker` in the
`claude-driver` sidebar group, running in bypassPermissions. The app reaps its
process after 30 min idle; the driver revives it automatically (focus it so
the app warm-spawns it; if the app's CLI governor is at cap, Codex types a
wake line into it). First op after idle is therefore slower.

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
