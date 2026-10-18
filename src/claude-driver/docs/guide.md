# claude-driver guide (for any harness)

claude-driver drives Taylor's Claude desktop app from Claude Code, Codex,
Cursor, OpenCode or a script. This is the usage contract; the README has the
mechanisms and evidence.

Current audit (October17): fresh Claude/Codex MCP metadata reads, scoped archive/
wake and durable cold recovery are qualified on their exact owned scratch targets.
General rename/pin/config/groups still use legacy Tier B, whose broker is live
but not resident serving. Historical native batch/concurrent control and direct
queue/stop evidence does not qualify the complete current live suite. All four
harness registrations are present; attached cached MCP and Cursor/OpenCode
execution remain separate gates. See [v2-qualification.md](v2-qualification.md).
No quarantine, native consent or legacy admission bypass is authorized.

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

A direct MCP-hook candidate now has actual native Stop-event read proof: one
metadata read and two distinct reads in one event returned genuine CLI journal
hook-result attachments. Each event still used one short model turn as trigger.
Temporary settings were restored; this is not a persistent public transport.
Opt-in causal observation includes only attachment IDs/parents. Result UUIDs
identify receipts; native toolUseID/hookEventId is shared by the Stop event.
Native commandless errors bind only to the event, never a tool/operation. The
installed matcher collapses identical definitions within one event, but repeated
events still run again; it is not durable request deduplication. FileChanged's
callback drops successful tool output, so activation alone is not a result path.
Ordinary request admission refuses pending diagnostics before publication; exact
idle-epoch expired cleanup has isolated proof. Settings alone do not activate a
warm FileChanged watcher, and the existing mutation admission contract must not
be assumed to cover direct hooks. See [mechanical-native-route.md](mechanical-native-route.md).
Keep using the current request lifecycle; generic native mutation hooks remain
unqualified.

## V2 control interface

For a scoped recovery controller, prepare an independent receiver with
`archive_target:<exact scratch UUID>`. Preparation seals the distinct owned idle
bypass target and its PID/start epoch into that generation; it cannot retarget.
`broker_service_archive` requires durable submission, that controller, the target
generation already stopped and files-retired with no unresolved attempts, and its
verified empty native family receipt. It dispatches one fixed native archive call
through the ordinary permission hook. The parent holds the target's global
activation lock through the worker and postcondition review; the current selector
must still name the exact retired generation/epoch. Old history cannot authorize
archive of a same-process successor. Settlement requires both the native receipt
and independent persisted archive/PID-absence observation, which is retained for
historical review even after the target reopens. It never deletes, elevates
permissions, restarts an app or retries uncertain work. One exact native scratch
archive and original PID absence are qualified. Reopening restored its record but
did not produce a new native peer, so cold recovery remains unqualified.

`broker_service_status {session,service_id,offline:true}` is a read-only inventory
of the exact retained installed generation after affirmative predecessor PID
absence. It is exclusive with historical mode. It rechecks PID absence and source
pointer, verifies sealed source/settings/selector and reviews original attempts;
unresolved work stays unresolved. It can use the retained generation locator when
the app record disappeared. It never restarts, signals, installs STOP, retires
files or permits replay. Readiness in this mode is explicitly historical. PID
absence does not establish crash cause or prove no successor process exists.

`broker_service_quiesce` and `broker_service_retire` also accept explicit
`offline:true` for an independent generation. These mutation paths additionally
refuse any observed live peer for the same host session, including a new epoch.
They recheck process absence around effects, preserve STOP and original attempts,
and refuse retirement until every attempt is terminal. They never kill a process,
replay unknown work or resume the receiver. Positive actual crash retirement is
still unqualified; the live-refusal boundary has been tested without file changes.

`broker_service_family {session,service_id,experimental:true}` must be submitted
through `driver_submit`. It makes exactly one independent-receiver native
`list_sessions {linked:true,include_archived:true,limit:100}` call through the
ordinary checkpoint/permission path, and returns settlement metadata. It never
uses the legacy broker or sends a model instruction. Inspect the retained native
result for bounded metadata; the caller is excluded. A full100-row result is
potentially truncated and cannot qualify lifecycle scope. The exact native empty
success text is supported; other non-JSON responses remain unresolved. Family
evidence, ownership review, archive authority and physical process exit are
separate checks. No automatic archive/restart follows this operation.

`broker_read_batch {sessions, experimental:true, timeout_sec}` is an opt-in
deterministic native metadata route. It accepts1–8 exact `local_<uuid>` IDs and
executes only `ccd_session_mgmt/get_session`; duplicate IDs share one native
read and attachment receipt. Results retain the caller's input order. Missing
native `pinned` is returned as null (unknown), never inferred false. Unexpected
fields, session conversations and arbitrary tool arguments are excluded.

Each batch uses one short tool-free broker model turn to trigger a finite native
Stop-hook configuration. The hooks call metadata tools without model selection.
This operation is therefore not advertised as a read-only MCP action: it writes
an owned broker diagnostic turn and temporarily changes service-local settings,
then restores their exact bytes. It does not alter target session metadata.
Use `driver_submit` with an idempotency key for durable ownership across harness
disconnects; `driver_wait`/`driver_job` inspect the same job without replay.
The experimental route is scoped to reviewed app2.26454.0/CLI2.1.289 and requires
the intact idle unarmed broker. Settings restoration, native ancestry, exact
per-target attachment receipts and a fresh host finish are completion gates.

`broker_read_status {id}` returns bounded durable phase, owner state and cleanup
bookkeeping without inference. Durable jobs publish `native-read:<id>:<phase>`
progress. The timeout includes queue admission and setup; cancellation during
setup can restore settings without publishing a diagnostic turn.
`broker_read_recover {id, experimental:true}` explicitly restores one exact
expired owned metadata transaction in its original intact idle broker epoch.
It requires unchanged settings and does not wake, replay or complete the original
job. Recovery has actual owned Node worker-loss proof; general native broker recovery
remains separate. Cleanup is independent from an unknown execution outcome.

`broker_service_read {service_id, session_id, experimental:true, timeout_sec?}`
performs one metadata read through an already loaded verified native receiver.
Uses the shared lifecycle, serial broker lock and durable attempt budget; default20s, maximum60s, clipped
to the service window. Returns settlement metadata only. Never installs, wakes,
restarts or retries. On uncertain failure inspect the returned request ID before
further action. Cancellation preserves dispatched uncertainty. `cleanupPending:true` means local
cancellation bookkeeping failed; it preserves a verified result or original
unresolved phase and never authorizes replay.

`broker_service_result_reconcile {service_id, request_id, experimental:true}`
settles one captured read from the reusable receiver. Requires unchanged loaded
module, broker epoch and baseline plus exact per-request native admission. It
publishes a local standard receipt, returns settlement metadata and never replays.
New qualified runtimes retain request-scoped helper checkpoints for late review;
reconciliation reports `checkpointSource`. The currently running legacy runtime
still requires settlement before another read replaces its shared checkpoint.
The receiver is still a candidate until actual native serving is verified.

`broker_peer_result_reconcile {id, experimental:true}` publishes a standard
lifecycle receipt from one existing admitted native callback enrollment. The ID
is the enrollment UUID, not the request ID. This operation verifies the captured
response, exact admission, original epoch and active module bytes, then returns
settlement metadata without exposing response content. Successful metadata must
describe the exact admitted session, with valid archive/running flags; transport
success alone does not settle a read. It never sends or replays.
It writes a local receipt, so it is not marked read-only. Missing or retired module
bytes refuse; historical control outcomes remain unchanged. This experimental
operation does not install a module or qualify persistent native serving.

`broker_read_reconcile {id, experimental:true}` recovers original metadata
results after exact restoration, using bounded native receipts and an independent
host-finish observation. It produces no model turn or read replay and leaves the
original job outcome unchanged. Results are historical at receipt time
(`metadataCurrent:false`), not a current-state query. Missing/duplicated receipts,
foreign turns, wrong ancestry/witness, changed native epoch or settings refuse.
An older-source idle receipt may be consumed without qualifying completion; one
fresh control observation is allowed once that subscription is fully settled.
Unresolved publication never retries. `cache_ms:0` disables received-notice cache.
Actual owned worker-loss and cross-harness receipt reconciliation have passed;
full sustained serving, guarded mutation and broker recovery remain separate.

Cancellation ends caller waiting; already-published metadata reads may still
finish. Cleanup uses one bounded native idle observation without another wake.
If the epoch stays busy/changes, the owned descriptor remains pending and
ordinary request admission refuses it until safe expiry restoration. Do not
interpret a failed batch as missing native execution or blindly clear ownership.
This does not change mutation admission, historical outcomes, deployment gates
or sustained serving qualification. Direct hooks do not inherit the existing
native effect gate; no mutation tool can be selected through this API.

`broker_idle {timeout_sec, not_before, cache_ms}` observes only the configured
live desktop broker through its reviewed native host idle protocol. It uses no
model inference, keyboard input or recovery. Concurrent harnesses share one
durable epoch-bound observation; pending subscriptions are joined rather than
republished. `timeout_sec` is 0.1–30 seconds; `cache_ms` is 0–3000 milliseconds
(default1000). `not_before` is an optional Unix millisecond timestamp used to
distinguish an old finish timestamp from a newer host completion.

`verified` binds the notice to native PID/UID, nonce, process epoch and source;
`freshTurnCompletion` alone does not causally identify an arbitrary request.
Use native request/reply ancestry to prove its actual result. Host idle does not
prove full queue quiescence, sustained serving or effect settlement, and this
operation always returns `quiescenceVerified:false` and `releaseAuthorized:false`.
After durable publication, the private detached listener belongs to the service
and survives caller cancellation, timeout or process exit. `callerWait` reports
`completed`, `cancelled` or `timed_out`; ending a wait does not cancel the native
subscription. Another harness joins its pending record and adopts the eventual
private mailbox receipt. The listener exits after delivery or its bounded12-hour
wait and removes its owned socket. A dead/malformed listener still retains
uncertain native debt until reviewed expiry; no public force-clear is provided.
This helper does not keep the native broker resident or recover it.

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

### Service and scratch chat permission requirement

Taylor requires `bypassPermissions` for narrowly scoped bridge service and native
scratch chats (standing instruction, October 17). Routine authorized bridge work
must not repeatedly ask for approval. Keep exact chat, operation and test limits;
bypass mode does not remove human-input protections or authorize other work chats.

Provision these chats with `permission_mode:"bypassPermissions"` and
`require_pool:true` in their exact scoped folder. Use the existing approved pool;
an empty pool is a provisioning failure, not permission to import an acceptEdits
service. Verify `get_session.permissionMode` before sending the first workload
and again after recreation or recovery. A `permissionGap`, `verified:false`, or
any mode below bypass leaves the service unready. Do not send its workload.

Taylor has explicitly authorized raising the existing bridge scratch chats with
`set_session_config`. Verify the persisted mode after the supported operation.
If it refuses or presents a human permission card, preserve that gate and report
the exact remaining action; do not edit app records, click approval cards, weaken
Stop-rescue admission or silently continue in acceptEdits. Global/repo default
mode alone is insufficient evidence for an existing chat. Synthetic negative
fixtures may retain the lower mode required by their test.


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

`broker_service_enroll {experimental:true, lifetime_sec?, max_requests?}` prepares
and publishes a receiver only into the previously consented exact native session.
Lifetime is 60–3600 seconds, capacity 1–128 requests (defaults 300 and 8).
It validates native package/epoch/baselines and waits up to 30 seconds for readiness.
An existing module refuses enrollment; uncertain publication must be inspected,
not retried. Readiness alone does not prove serving. This remains experimental;
no live shared-enrollment qualification yet.

`broker_service_status {service_id}` reads bounded ownership, readiness and existing
request settlement metadata without late-result reconciliation writes.
`broker_service_retire {service_id, experimental:true}` requires expiry, exact idle
native epoch, unchanged approved baselines/controls and no unresolved attempts.
It preserves the exact module outside the watched folder using exclusive rename;
filesystem retirement does not establish native unload. Changed/foreign bytes,
linked directories, extra files or uncertain request results refuse retirement.

For the pinned 2.1.289 epoch, Claude-generated type/config artifacts are accepted
only at six exact paths with reviewed SHA256 hashes. They are preserved with the
module; changed declarations or additional executable files refuse retirement.
CLI enrollment/read/expiry/retirement was verified October 7; native unload remains
unqualified, and MCP transport qualification is separate.

Actual stdio MCP2025-06-18 enrollment/two reads/status/expiry/retirement passed in
an isolated client/server against the owned native session on October7. Early
retirement refused; both results settled. This does not qualify the already running
installed connector or native unload, and no configured server was restarted.

Enrollment optionally accepts `marker:true` and `observe_retired_service_id`.
The native variant registers its own unique lifecycle command and records only
own/prior marker presence from native command inventory. Observing a prior ID
requires that exact marked service already be expired and retired with all attempts
settled. `broker_service_marker_review {service_id}` reviews this evidence without
sending or executing commands. Marker removal alone does not qualify hook unload.

Marked startup uses a single session.start handler and observes native inventory
once after a250ms clock callback, allowing host command refresh. Marker review
checks name/source/runtime owner/root/registration separately. Native command
removal passed via CLI/MCP on October7. Installed source removes command registrations
before waiting for outstanding dispatches, so environment/hook unload remains a
separate gate. Historical status can recognize an independently verified successor
in the shared path without confusing its ownership with retired module bytes.

Experimental resource disposal fixture: `broker_service_enroll` accepts
`resource_probe:true` only with `marker:true` and `lifetime_sec` from60 through120.
The child independently expires30seconds after service expiry. Enrollment readiness
does not prove child launch, disposal or full serving. Strict metadata screening
distinguishes intentional signal exits from self-deadline; independent kernel and
retirement evidence remains required. This variant is not yet live-qualified.

`broker_service_resource_review` is a read-only shared CLI/MCP operation with
`service_id` and `evidence_report` (fixed `native-resource-trial-<13 digits>.json`
filename under the service pressure directory). It binds retained process evidence,
current exact broker epoch, owned retired files and fresh PID absence. A qualified
result covers only the exact stream child after retirement; general hook/environment
unload and release authorization remain separate and false. Actual fresh stdio MCP
and CLI are verified; the installed connector has not been restarted or qualified.

Read cancellation before publication reserves no durable capacity. Reservation
and enqueue occur synchronously after the final cancellation check. Once that
publication boundary is crossed, partial writes remain uncertain: capacity stays
reserved, cleanup is attempted, and callers must inspect rather than retry.

Experimental `broker_service_enroll` option `control_check:true` loads v0.4.0
with a cancellation-control snapshot after checkpoint admission and before native
MCP dispatch. Invalid or cancelled controls refuse the call. A cancellation marker
is evidence to review, not a settled receipt. Cancellation arriving after the final
snapshot can still race the call; callers must preserve uncertainty. This opt-in
has passed native validation, fixture races and a live positive read/retirement
trial. Live cancellation race and negative settlement remain unqualified.

## Usage-exhausted operating boundary — October 7

Taylor reports Claude inference quota exhausted. No free/local inference provider
has been configured and independently verified for this bridge. Native mod
callbacks are deterministic execution, not alternative model inference. Preserve
this distinction in status and handback: broker process alive, mod loaded, native
read receipt verified and inference available are separate claims.

Existing original-epoch native reads, actual fresh stdio lifecycle, positive
control-file checks and exact streamed-child disposition already provide narrow
zero-model evidence. Do not repeat those trials solely because inference is
unavailable. Preserve failed original probes; they do not qualify the corrected
call path. All live evidence remains bound to its recorded build and epoch.

Continue bounded source review, meaningful synthetic fixes and historical receipt
review when a specific unresolved question exists. Do not send model prompts,
retry quota failures, switch providers/models, wake/restart the broker or change
permissions to seek capacity. Revalidate exact owned epoch before any subsequent
native operation. A new native negative cancellation trial needs independent
outcome/settlement evidence first; a cancellation marker or missing result alone
cannot safely retire an unresolved request.

Remaining release gates: general receiver/environment unload; persistent serving
and queue ownership; installed connector/current filtered harness integration;
guarded mutation and executing-effect cancellation; sustained residency/governor
and cold recovery; distinct-build rollback; reconciliation of 17 historical
uncertain effects; safe runtime handoff and deployment of retained checkpoints.
Quota restoration enables inference-dependent harness checks only; it does not
close these other gates. No human action is requested now. If no specific safe
experiment or source defect is identified, stop active probing rather than churn;
the report watcher continues its pending-evidence-only contract.

Host native-service reads recheck the original published request deadline just
before delivery. Expiry during claim/revalidation prevents send, preserves the
request identity and capacity, and attempts cancellation cleanup.

## Action-specific health eligibility

Shared action_health(type) supports local, desktop, native-sidecar and inference.
Local requires no app/broker/model. Desktop observes exact app executable; it
does not require broker residency or quota. Native-sidecar requires app, owned
broker liveness, pinned integrity and serving evidence, but not inference.
Inference currently requires app and verified inference availability; the checker
never makes a model call, so availability remains unknown absent a future
independently bound provider observation. Unknown required facts refuse eligibility.

This is advisory preflight, not authorization or an execution receipt; existing
native effect gates remain authoritative. Route selection must reflect the actual
implementation: a direct backend action and its model-bearing broker fallback may
need different checks. Mapping all actions and enforcing those branch-specific
checks remains unfinished. No generic read/write-label policy is safe. App absence
is tested synthetically; an actual quit trial remains pending because the existing
observer may wake the broker and confound the controlled outage.


### Lifecycle evidence

Fresh driver processes append metadata-only events to
`/Users/taylor/src/github/dotfiles/src/claude-driver/.runtime/state/lifecycle/YYYY-MM-DD.jsonl`
(UTC dates). Operation IDs pair start/end/error; a start without completion is
incomplete evidence, not proof of a crash. Request enqueue IDs link to durable
broker receipts. Status/failure/admission snapshots distinguish missing workers,
archive state, epoch mismatch and serving readiness. Recovery and detector events
record their boundaries. Loaded build and versions are recorded at operation level.
No argument bodies, raw errors, transcripts, socket keys or tool results are copied.
Logging failures never replace operation failures. Each daily file has an 8 MiB
budget (concurrent appenders may exceed it by a few records); exhausted files stop
accepting events. Files are not automatically deleted. This is request-time logging,
not an always-on crash recorder: unloaded detectors and old MCP processes produce
no new instrumentation. Reconnect MCP to load changed source; sealed broker code
is not modified by this host instrumentation.


Passive native lifecycle capture uses a durable inode/byte/session cursor and reads
at most 256 KiB from Claude main.log per invocation. Run
`node src/claude-driver/scripts/capture-native-lifecycle.mjs` for one passive capture.
The current-source detector also invokes it on each tick, even if health is unchanged.
Only exact owned query exits and governor eviction intentions are retained; raw
log lines stay out of artifacts. Evidence hashes support duplicate reconciliation
if a collector fails after append but before checkpoint. Partial final lines wait
for the next poll. Rotation, truncation, initial-tail-only and budget gaps are explicit;
app-local wall-clock timestamps retain their timezone ambiguity. This does not
attribute a crash, app update, user quit or intentional termination. No continuous
capture is claimed until the current collector is installed and observed running.


Continuous passive capture: `com.taylor.claude-driver-lifecycle` runs the current
`scripts/lifecycle-monitor.mjs`
every 30 seconds through launchd. It observes exact owned broker metadata, app
process presence, installed versions and bounded native log changes. It never
wakes an app, sends a message, starts inference, changes permissions or recovers
a broker. Unchanged ticks are silent. `.runtime/state/lifecycle-monitor.json`
records last tick, append/checkpoint status and coverage gaps; a stale last tick
is a monitoring failure, not service health. The job exits between ticks, so
launchd `not running` with successful exits is normal. The report watcher and
legacy detector retain their existing paused/unloaded state. Launchd output can
contain inherited credentials: filter status fields before returning any output.


Nested broker lifecycle events inherit their enclosing driver operation ID through
async context, including across concurrent requests; direct broker calls outside
runOp may have no operation ID. An offline worker reports
`native-process-unavailable`; `native-process-epoch-mismatch` means a live worker
does not match the activation identity. Neither establishes serving readiness or
authorizes epoch renewal. Historical sealed releases keep their original behavior.


`broker_recovery_status` returns broker identity and a bounded durable-request audit
(maximum1024 request files). Complete coverage and zero unresolved requests are
necessary for handoff, not authorization or serving readiness. Late native receipt
reconciliation may persist a correlated receipt; it never dispatches/replays work.
Inspection failures retain exact request IDs and sanitized error categories. A
budget-exhausted or unavailable inventory always refuses settlement. An existing
cancel/expiry marker alone never settles an uncertain native effect.


If historical receipt collection refuses source identity, inspection may still
report retrySafe for an expired/cancelled pure read with no helper dispatch. It
also returns receiptObservation.available:false and category:outcome_unknown;
this is not a receipt or proof that the read never ran. Mutations, pending work
and any recorded dispatch retain their refusal. No cursor is rebound or replayed.


`peer-wake-prepared` records direct peer msgId/worker epoch/priority before the
preparation callback or socket write. `peer-wake-returned` records transport return,
with executionVerified:false. These events inherit operation/request correlation
when called through the broker; neither is a native acceptance or serving receipt.
No socket paths, authentication keys, frames or message bodies are logged.


Native broker `live` observations require a unique owned peer record with matching
PID/start epoch and CLI session ID. `nativeProcessEvidence` explains refusal;
stale or duplicate metadata cannot establish processAlive/serving health. Legacy
nonnative process observations are labelled separately. Source/adapter tests on a
new CLI version do not qualify peer transport; its version allowlist remains an
independent, fail-closed boundary.

Stop verification requires explicit idle on the same verified native PID/start
and CLI session identity. A missing worker, changed epoch or unfamiliar status
is unverified and prevents interrupt steering from sending a replacement.

Residency evidence reconciles bounded exact-session journals at logical and
canonical cwd paths after native migration. Conflicting copies fail closed.
Finding a maintenance list receipt still requires matching app acknowledgment
and a current native epoch before residency is reported verified.

Recovery audits retain control state when historical receipt observation is
unavailable, but keep the outcome unknown and unsafe to retry. Strict request
inspection still refuses that evidence gap; diagnostic visibility grants no
replay, handoff or release authority.

Direct peer transport revalidates process epoch, CLI identity, version/protocol
and socket identity after its preparation callback, before sending. A changed
recipient refuses without a fallback sender. This is transport hardening; public
send_message continues to use the native broker route.

The unexposed peer receipt reader binds an incremental journal cursor to the
recipient epoch and accepts only an exact future native peer user record. It
returns metadata with applied:false. Public sending does not use this candidate
until durable send uncertainty and MCP/job integration are qualified.

The candidate peer send ledger durably arms one publication identity before
socket writing. Reattachment can reconcile a native receipt but never grants a
second publication. Unknown state stays unsafe to replay; received records retain
applied:false. This candidate is not yet wired into public send_message.

The internal direct-recipient candidate composes exact peer identity, durable
single-publication state and native receipt observation. It refuses broker/caller
and archived targets, preserves post-arm uncertainty, and reports received with
applied:false only after an exact receipt. Public sending remains unchanged until
MCP/job integration and separate native qualification.

## Experimental direct-recipient route

In a fresh claude-driver MCP connection, call `send_message` with explicit
`transport:"peer-direct"`, a stable `operation_id`, the exact recipient session
and the authorized message. The CLI accepts the same named arguments. Default
transport remains the native broker route. Direct transport requires an already
live qualified native peer; it never wakes the app/broker, changes permissions,
uses immediate priority or starts an inference fallback. Do not combine it with
`via_broker`. `receipt_timeout_sec` is0.1–60, default15 seconds.

For durable work, submit that same operation and arguments through `driver_submit`
and keep its idempotency key as well as the direct `operation_id`. Disconnecting
the MCP client does not cancel the detached worker. Reattach to the existing job;
do not create a different operation ID to retry an uncertain publication.

`delivery:"received"`, `verified:true` and `experimental:true` qualify only the
exact native user receipt. `applied:false` explicitly leaves application/model
completion unverified. Observe the recipient response separately. If publication
is cancelled, times out or loses its receipt, retain outcome_unknown and use
`peer_send_status {operation_id:"the-same-id"}`. This read-only native observation
can persist a late receipt without resending. It never grants retry authority
or rewrites an already uncertain driver job as completed. A repeated send with
identical direct operation identity can reconcile; a conflicting payload refuses.

Current proof covers private synthetic sockets/journals, actual MCP clients and
detached jobs, plus native CLI2.1.299 composed durable direct receipt and causal
DIRECT_ROUTE_OK reply. A bounded busy queue trial completed its original response
before the follow-up receipt/reply. These narrow trials do not establish full native
serving, controls, residency or recovery. Older candidate notes describe the
staged implementation before this experimental opt-in was exposed.

Peer-direct receipt_timeout_sec is one absolute budget including outer session
admission, metadata/preparation and socket waiting. It is not restarted after a
lock wait. An exhausted budget that prevents state inspection can conservatively
return outcome_unknown; this never grants replay authority.

`steer_session` now accepts the same explicit experimental direct options for
`mode:"queue"`: `transport:"peer-direct"`, stable `operation_id`, and optional
`receipt_timeout_sec`. The absolute budget includes outer control admission.
It returns `steeringMode:"queue"`, `stopped:false`, `delivery:"received"` only
with an exact native user receipt, and `applied:false`. Use causal observations
for model completion. Direct queue identity reattachment never resends.
Direct interrupt and any direct/via_broker combination refuse before effects;
interrupt continues to require the native stop route. Default transport is unchanged.
A native2.1.299 scratch trial verified busy submission followed by complete first
response and exact follow-up response through durable steer_session.

Native stop requires both a recognized exact-target accepted receipt and same-epoch
idle. Declined/unfamiliar receipts refuse replacement even if idle appears later.
Reconnect-pending stop remains outcome_unknown/retrySafe:false; no replacement
is sent. An already-idle receipt returns stopped:false and verified idle, rather
than claiming an interrupted turn.

With `include_causality:true`, observations include bounded `toolCalls` entries
(`id`, `name`) and `toolResults` entries (`toolUseId`, `isError`). Match a result
ID to its native call on the same parent chain. Arguments and result bodies stay
private. `isError:null` means the journal omitted a boolean error flag; it is not
success. Each list is limited to64 blocks. `toolMetadataTruncated:true` marks an
overflow, and `toolMetadataIncomplete:true` marks invalid/omitted identifiers.
These identifiers prove correlation only. Validate operation arguments, native
result semantics and persisted state separately before claiming an effect.

Transcript observation opens an owned regular file without following a final
symlink and validates cursor identity on that same descriptor. Nonregular,
linked, replaced or shortened transcripts fail with `cursor_reset`; a FIFO
cannot block the reader. Ordinary append growth remains observable. Missing
transcripts retain the existing pending-cursor behavior. Never reuse reset
ancestry as receipt proof.

`open_session {session, focus:"restore", wait_native_sec:30}` optionally observes
an exact owned desktop peer before restoring focus. The wait is0–30 seconds;
default0 preserves existing navigation behavior. `nativeProcess.verified` means
matching CLI/session/cwd/process identity only; serving and inference remain
unverified. Timeout or cancellation returns an explicit unverified reason while
allowing focus restoration. This observer never sends, starts a CLI, or recovers
a broker. Opening a chat alone did not warm-start its native worker after the
controlled app restart on app2.42304.0/CLI2.1.299; do not treat navigation as readiness.

Native broker receipt collection accepts only foreground records from the exact
CLI session bound by its observation cursor. Sidechains, malformed sidechain
flags, and missing/foreign CLI session identity cannot settle checkpoints or
results. This does not grant replay or resolve historical unknown effects.

### Independent receiver result reconciliation (experimental)

From the calling harness, use `broker_service_result_reconcile` with `experimental:true`, the original `service_id` and `request_id`, and an explicit receiver `session` UUID. Wrap it in `driver_submit` with a stable idempotency key to survive client disconnects, then use `driver_wait` or `driver_job`. This is a tool/API operation, not a message to paste into Claude. Omitting `session` retains the legacy enrollment route. The independent route derives its namespace from the receiver record and verifies the live native epoch, sealed source, installed module, policy and correlated evidence. It never sends or replays the request; an existing result must match exactly. Current qualification is app2.42304.0/CLI2.1.299. This does not enroll a receiver or qualify recovery.

### Independent receiver reads (experimental)

From the calling harness, use `broker_service_read` with `session` set to the receiver UUID, `session_id` set to the metadata target UUID, the existing `service_id`, and `experimental:true`. Submit through `driver_submit` with a stable key; reattach with the same key. The receiver must already have verified readiness and matching native policy audit in its bounded namespace. The operation enqueues/claims one get_session request, sends once, verifies native admission/result and publishes settlement. No enrollment, wake, restart or permission override is implicit. A lost worker requires original-request reconciliation; never resubmit uncertain work under a new identity. Native request identity is derived from durable job identity; direct non-job calls retain a durable generated identity. The corrected job-derived ID mapping has been verified on a fresh native read.

### Independent receiver status

Call `broker_service_status` from the invoking harness with explicit receiver `session` and `service_id`; omit `session` for the legacy route. This reads bounded ownership/source/epoch and reservation metadata only. `readinessObserved` and `nativePolicyObserved` describe retained evidence, while `servingQualified:false` preserves the distinction from a new successful operation. `unreservedSlots` describes the durable host budget, not proof of available native capacity. Unqualified context never triggers recovery.


`broker_service_prepare {session, experimental:true, lifetime_sec?, max_requests?}`
stages and native-validates an independent service candidate in a fresh private
namespace for a driver-owned idle bypass scratch receiver. Use driver_submit with
an idempotency key. Defaults are 300 seconds and eight requests; bounds are
60–3600 seconds and 1–128 requests. Preparation is durable but does not install,
activate, change settings, send, wake or prove readiness. Inspect the original
service namespace after interruption rather than resubmitting a new identity.

Exact helper dispatch:false callbacks may produce immutable no-dispatch receipts.
These prove only the scoped callback observation after strict evidence screening;
retirement and lifecycle settlement still require independent helper, admission,
control, source and native epoch review.

Independent service status also inventories reserved IDs and owned native intents.
`settledRequestIds` requires full historical native evidence and an exact existing
standard published result. `unresolvedRequestIds` includes missing or malformed
evidence; `callbackRefusalRequestIds` is a subset requiring further review.
`terminalAttemptReviewComplete` describes this bounded inventory only;
`retirementAuthorized` and `scopedUnloadQualified` remain false. Status never
rewrites receipts or controls, and expiration never resolves uncertainty.


`broker_service_activate {session, service_id, experimental:true}` installs a
previously prepared generation only on an empty driver-owned idle bypass scratch
receiver. Existing receiver settings, module, broker state or activation ledger
refuse. Use a durable job and retain its original identity. Before/after phases
record policy, pointer, settings and module publication; interrupted or failed
activation requires inspection, never a blind retry or automatic rollback.
Installation does not prove native loading, readiness, policy loading or serving.
Human hot-reload consent remains independent and cannot be answered by this API.

Optional `stable_hook:true` installs the sealed generation's standalone receiver
entry and exact selector before publishing hook settings. For turnover, an existing
stable selector must resolve to an independently verified files-retired predecessor
with its own STOP and no unresolved attempts, on the same native epoch. Anchor and
settings hashes must match exactly. The old selector is exclusively retained in
its generation before the new one is published; anchor/settings are not rewritten.
Unrelated or partial state refuses and requires inspection. The
settings command is independent of generation; selector and policy bind the exact
private state, source, bootstrap, native epoch and anchor/settings hashes. The
entry verifies bounded owned files, full sealed inventory and actual ancestry,
then forwards only to the fixed handler, preserving its request/STOP/admission
checks. Install/readiness never substitutes for an actual native policy audit.
One actual same-epoch turnover has qualified native reads without another model
boundary. This does not establish automatic renewal, cold recovery or app restart
recovery. Do not manually replace selectors or clear predecessor STOP.

`broker_service_read_current {session,session_id,experimental:true,timeout_sec?,queue_timeout_sec?}`
selects the current owned stable generation for one metadata read. Use a durable
parent job. It validates the target before maintenance and checkpoints at most one
renewal, one policy probe and one read. Each effect uses a distinct real durable
child job with a retained deterministic submission key, so probe/read request IDs
cannot collide. Parent reattachment never replays children. A renewal uses bounded
3600second/32slot successor configuration and includes its own policy probe.
STOP/input/busy/unknown or repeated maintenance recommendation stops rather than
looping. Selection changes stop before read; underlying operations still enforce
current admission. No daemon, model wake, restart or permission change. Parent
cancellation does not establish child cancellation: inspect recorded child job IDs
before any continuation; queued/running children may still finish independently.
Route admission defaults60seconds, configurable1-120seconds. Before-admission
queue timeout/cancellation reports admitted:false, dispatched:false, retrySafe:true;
no child was started. Once admitted, child uncertainty retains retrySafe:false.
An actual5second-bound queue failure during renewal is preserved; the changed
60second-bound test completed all3readers, including7.72seconds waiting behind
renewal. This is bounded backpressure, not an unlimited queue/latency guarantee.
Parent timing includes queue and child overhead.

`broker_service_plan {session,service_id,read_timeout_sec?}` is read-only routing
policy for the currently selected stable generation. It verifies selector equality
before/after live status and returns read/renew/probe/wait/stop/inspect. Owned STOP
and unresolved attempts take priority over capacity or expiry. Historical, missing,
malformed or changed-generation evidence never enables recovery. Native input/busy
or unobserved loading waits. A90second lifetime margin or exhausted capacity
recommends renewal; missing policy audit recommends a probe only when another slot
remains for a read. These are recommendations, not effects, authorization or a
scheduler; actual read/renew/probe operations revalidate their own gates. A read plan
is not a persisted receipt, positive serving proof or latency guarantee.

`broker_service_renew {session,service_id,experimental:true,lifetime_sec?,max_requests?}`
requires `driver_submit`: its durable job ID determines the successor generation.
It prepares first, then stops and terminally reviews the predecessor, preserves its
module/selector, activates on unchanged stable settings, waits up to30seconds for observed readiness,
runs one durable negative policy probe, then verifies read admission.
Each step checkpoints before/after; one receiver renewal lock serializes renewal
jobs. Existing lifecycle locks still protect individual steps. Epoch or selector
changes refuse. Reattach the original job/key; failures or interruption require
inspection, never a new job to replay an uncertain phase. This is a one-shot
controller operation, not a daemon or automatic resumption mechanism. It sends no
model message and does not restart apps or change permissions. Returned readiness
is an observation at verification time; installation never establishes serving.
Renewal now consumes one permanent successor slot for its policy probe and requires
max_requests>=2. The probe request derives from the same renewal job identity; no
second child job or fresh retry identity is created. The final policy-qualified
checkpoint requires fresh readiness, actual policy audit, terminal attempts, no
STOP/expiry and at least one unused slot. readAdmissionQualified describes these
point-in-time gates; servingQualified stays false until a separate positive read.

`broker_service_policy_probe {session,service_id,experimental:true,timeout_sec?}`
is the durable negative qualification path. Submit through `driver_submit`; its job
ID determines exactly one missing request ID. It holds the private read lifecycle
lock, verifies installed source/epoch/readiness/no STOP, consumes one permanent slot,
records before-send metadata and delivers once. No protocol request/control is
created and no native MCP request is authorized. Success requires the exact existing
terminal missing-request screen: actual policy audit, completed bound helper,
refusal marker and absence of request/control/admission/results. It proves this
negative path only; use a separately authorized public read for positive serving
proof. Same-key job reattachment never resends. Timeout, worker loss or cancellation
preserves the original request/slot/evidence; inspect status and original attempt,
never issue a fresh key to retry uncertainty. No permission decision is synthesized.

Independent status reports `activationPhaseObserved` from a strictly matched
checkpoint and `activationEffectsAssessed:false`; a phase never proves the next
or previous effect. `nativeInputRequired` describes a verified live waiting peer,
not the cause of its prompt. Inspect the exact native chat; model prose, bypass
mode and successful loader-tool return never establish consent or readiness.

Independent status includes bounded `loaderNotificationObserved`, `loaderOutcome`
and optional `loaderObservedAt` from the exact native session journal. Outcomes
loaded/held/unbound/failed/declined/unanswered/off describe native notifications;
unknown means no matched notification in the retained window, unavailable means
the journal could not be stably inspected. Neither proves generation readiness,
consent authority, serving or unload. Readiness still needs the generation-bound
native receipt. This diagnostic never dispatches, retries or changes consent.

`terminalRefusalRequestIds` identifies only independently reviewed missing-request
invalid_request callbacks: exact source/epoch/helper/policy observations and
confirmed absence of protocol/effect records. It is separate from published
`settledRequestIds`. Other refusal reasons stay unresolved. Status remains read-only;
terminal review neither writes synthetic native results nor authorizes retirement.
Quiescence and concurrent admission must be addressed before a later transition.


`broker_service_quiesce {session, service_id, experimental:true}` stops one
independent generation under the same lifecycle lock as full native reads. It
waits for the existing transaction, verifies owned idle context, writes a durable
intent and exclusive generation-bound STOP, then revalidates and reviews attempts.
Use driver_submit with a stable key. Foreign STOP or interrupted partial work must
be inspected; STOP is never automatically cleared. `quiescent:true` requires all
inventoried attempts terminal, but never proves native unload or process retirement.
Status reports STOP presence separately from a matching generation marker. New
public reads refuse before private request publication while STOP remains.


`broker_service_retire` takes optional `session` for an independent generation.
That path requires verified quiescence and own STOP, rechecks terminal attempts
under the read lifecycle lock, and exclusively moves the exact runtime module plus
bounded non-executable tooling to private retired storage. It retains settings,
STOP and all evidence. Unknown paths, links and changed runtime bytes refuse.
Filesystem retirement does not prove native unload or process retirement.
Status and receipt reconciliation can explicitly verify retired source/inventory
while the same native epoch remains available; ordinary reads cannot use it.
Omitting `session` keeps the existing legacy expiry-based retirement behavior.


For retained evidence after a receiver crash or app update, request
`broker_service_status {session, service_id, historical:true}`. This is explicit,
read-only retired-source inspection. It never calls current version/peer observers,
assesses native readiness, publishes receipts, dispatches or recovers. It reports
`verificationMode:historical-retired`, `nativeEpochAssessed:false` and native status
not-assessed. A verified retirement ledger and preserved retired source are required; current watched state is not assessed. Legacy routing refuses this mode. The existing
app session record is still needed to resolve receiver cwd; deletion recovery
requires a future independently owned generation index.


Independent preparation now retains a bounded owned generation locator before
staging effects; verified retirement can retain a locator for older generations.
Historical status resolves that locator without the app session record and then
independently verifies preserved ownership/source. A locator never proves service
creation, readiness, native effect or recovery authority. Missing locators may use
legacy app-record resolution; malformed or conflicting existing locators refuse.
This preserves evidence lookup if the app record disappears, without deleting,
recreating or silently switching the user’s chat.


To free the shared settings path after independent module retirement, explicitly
request `broker_service_retire {session, service_id, retire_settings:true,
experimental:true}`. It verifies current ownership and preserves exact original
bytes in the retired namespace, using exclusive movement rather than overwrite.
The receiver activation lock prevents cooperating activation races. STOP and all
receipts remain. Interrupted settings movement is inspected/finalized from exact
retained bytes; it never triggers automatic restoration over successor settings.
Historical status verifies retained settings and ignores current watched-module
state, so predecessor evidence remains inspectable alongside an active successor.
Then the existing empty-receiver activation path can install a prepared generation;
loading, settings boundary and serving must still be independently qualified.


Real headless MCP qualification is separate from synthetic harness-v2:
`node scripts/harness-native-service.mjs --live --harness codex --model <configured-model> --session <receiver> --service-id <generation> --target <approved-scratch>`
(or --harness claude without --model). It requires current readiness/policy/idle
and one unreserved native slot, then permits only one exact identified metadata
job through a strict proxy. Calls with changed identity/target/tools refuse.
The same harness/receiver/service/target cannot be rerun after its persistent claim;
inspect original contract and durable job after disconnect or failure. Never spend
a new identity merely to retry unknown work. Reports distinguish native contract
verification from strict model output formatting; format failures remain failed.
Fresh-client success does not refresh a long-lived harness's cached MCP schema.


Current2.1.299 module `settings.read` is a read-only snapshot adapter, not an
established native hook-refresh API. Isolated execution proves its provider and
clone behavior only; real settings adoption still needs native evidence. The API
returns env/helper fields without redaction, so any future native observation must
select only bounded owned hook metadata and never log the full settings object.

### Fresh MCP contract for current-route reads

`scripts/harness-native-service.mjs --live --current-route --harness claude|codex
--session <owned receiver> --service-id <expected selected generation> --target
<owned metadata target>` qualifies the current-route API through a fresh canonical
stdio MCP launcher. Codex also requires `--model <configured model>`. It preflights
an exact healthy read-only plan, exposes only guide/status/exact submission/waits,
and permanently claims the harness/receiver/service/target/mode tuple before launch.
The model submits the same parent identity twice; the retained read child supplies
the native request ID. Qualification requires matching selected service and ONLY a
read child, no maintenance, no external tools/config/source changes or native model
turn. Inspect original contract/jobs after failure; never regenerate identity to
replay. Direct-read contracts and their historical failures/claims stay distinct.
This fresh-client proof does not refresh an already cached MCP in an existing chat.

Actual native current-route qualification covers capacity exhaustion, a reader
queued beyond5seconds behind renewal, and a real expired60second generation with
unusedcapacity. In each case exactly one qualified renewal precedes one metadata
read, with preserved predecessor history and no native model turn. These are
same-process, on-demand paths; they do not establish app/cold/crash/deleted-session
recovery or an unattended daemon. A retained successful job is historical evidence,
not current readiness; use current status/plan for the present selected generation.

### Native lifecycle surface audit

Run `node src/claude-driver/scripts/mod-lifecycle-surface-299.mjs --session <owned receiver>`
for a bounded declaration-only report tied to currentCLI2.1.299, selected receiver,
owned generated type hashes and unchanged read context. It performs no lifecycle
call. Current declarations distinguish turn stop (session stays open/idle) from
archive (declared process stop with possible family/worktree effects). No direct
process-exit session method is declared; this does not rule out another native
mechanism. Deletion always retains its human approval card. Before actual cold
experiments, independently qualify target ownership/family/worktree scope and the
exact control path. Never infer physical exit/recovery from this report or a
successful stop/retirement send.

Explicit `broker_service_activate {...,stable_hook:true,cold_rebind:true}` admits a
prepared replacement on a verified NEW native epoch only after exact predecessor
history is files-retired, owned STOP matches and all attempts are terminal. The
predecessor PID must be absent in two scoped process observations; a live/reused
PID or observation error refuses. Same-process turnover keeps its existing epoch
requirement; cold mode is never implicit. Anchor/settings stay exact and old selector
is retained. This option does not restart/open the app, raise permissions, answer
native consent, prove module loading or repair unretired/unresolved crash state.
Cold admission is synthetic-tested; actual cold activation is still unqualified.


### Sealed target preservation during receiver renewal

Renewal copies an optional archive target only from a verified installed predecessor
in the same native process epoch, with a complete terminal attempt review and no
unresolved request IDs. The target session, cwd, original PID and process start
remain identical; a cold target does not require a live peer merely to preserve
this existing capability. This does not authorize dispatch: the operation's native
admission, target generation and postcondition checks still apply. Ordinary
receivers retain no archive capability. New and inherited targets cannot be
combined. Status exposes only this bounded target metadata, never the receiver token.


### Fixed cold-target wake experiment

`broker_service_wake_target` accepts the same exact sealed controller/target,
retired target generation and empty-family receipt references as scoped archive.
It additionally requires the original PID absent, no observed current target peer,
an unarchived bypass record and unchanged stopped/retired terminal selector.
The target activation lock spans the request; preflight is repeated before the
single send. The only admitted native call is `send_message` with the fixed
instruction to reply COLD_RECEIVER_READY without tools or changes. No arbitrary
message or `_consent` argument is admitted. Native consent/trust gates remain.

A native error receipt can settle a failed attempt without a retry; it does not
become unknown merely because it failed. A successful native receipt still does
not prove applied reply, new process or serving readiness. Observe those
independently before cold rebind. Reconcile uncertain attempts by their existing
request ID. An explicit undelivered workspace-trust refusal requires the native
human trust/startup flow; do not write trust state, fabricate consent or repeat
sends while that condition is unchanged.


Native qualification on October 17: intentional archive and PID exit followed by
human workspace-trust startup, cold rebind to a new native PID/start, negative
policy probe, actual native metadata read and both real-MCP harnesses passed.
Stable hook/settings hashes remained identical and retired selector was retained.
This proves post-trust cold rebind; automatic cold wake and crash recovery remain
separate acceptance gates. Test worker startup waits are bounded and reject
terminal workers so a source-change failure cannot hang pressure evidence forever.


After the one-time human trust approval, a second scoped native cycle on the same
scratch completed archive/physical exit/unarchive/one native wake/new-process
observation/tool-free fixed reply/cold rebind/native policy and metadata reads,
with both fresh MCP harnesses passing. This is one observed post-trust recovery
cycle. The steps were explicitly coordinated using durable child jobs; unattended
supervision, arbitrary crashes/app restarts and deleted-session replacement are
not established by this result. A new target epoch requires a newly sealed
controller capability; old capabilities are never silently retargeted.


### Durable sealed-target recovery

Submit `broker_service_recover` using `driver_submit`, with exact controller
`session`/`service_id`, target `session_id`/`target_service_id`, and
`experimental:true`. Default cold mode requires an absent original PID, no current
target peer and `family_request_id` pointing to an already-qualified empty native
family receipt. Existing retired terminal source is preserved; installed offline
source uses the existing offline quiesce/retire gates. The target must remain an
owned bypass scratch in the same probe scope and the controller must already be
sealed to that exact target epoch. A live target is refused in cold mode.

`cycle:true` explicitly requests an intentional scratch recovery test: fresh
family, quiesce/retire, native archive/verified exit, unarchive, one fixed wake,
independent new process and tool-free reply, cold rebind, readiness, policy probe,
native read and final stable-settings checks. One actual public cycle passed in
20.864seconds with ten retained child jobs; repeated identical submissions reused
the original parent without changing its ledger. Default cold entry from an already-retired absent target also passed once
in14.222seconds with six children; live cold-mode refused before creating children.
Offline-installed crash recovery remains separately unproven. This operation is not an unattended supervisor.

Parent checkpoints and original child IDs survive failure/cancellation. Reattach
with the same idempotency key or inspect the parent and children; this observes
state and does not resume or replay an interrupted effect. A human trust gate
stays a human gate. A failed native delivery is retained as failed; uncertain
outcomes stay uncertain. Recovery refuses to archive/retire its own Claude caller.
No global app restart, process kill, delete, trust/permission change or legacy
broker wake is part of this operation.


Default cold mode native evidence on the current source: a live target was refused
before child creation and stayed idle/ready; after a separately verified intentional
archive and process exit, one cold parent preserved retired history, unarchived,
woke, observed the new native process and fixed reply, cold-rebound, probed policy
and read natively. Both recovered-receiver MCP harnesses passed. A repeated same-key
submission reused the original parent without changing its ledger. This does not
establish unexplained-crash or global app-restart recovery.


### Experimental independent metadata controls

Prepare an owned idle bypass controller using `broker_service_prepare` with explicit
`metadata_target` `{sessionId,cwd,pid,procStart}`. This is mutually exclusive with
`archive_target`; neither role silently acquires the other. Activate and observe
native readiness/policy using the existing independent-service workflow.
Submit `broker_service_control` through `driver_submit` with controller `session`,
`service_id`, exact target `session_id`, `operation`, typed `value`, and
`experimental:true`. Supported operations: `set_session_title` (nonempty title,
max200characters), `set_pinned` (boolean), `set_session_effort`
(low/medium/high/xhigh/max), and set_session_model only with the separate explicit
model capability described below. No permission-mode/consent or arbitrary tools.
The global target activation lock serializes cooperating callers; one request has
one native effect and independent persisted postcondition evidence. Reattach the
same durable job after uncertainty; never replay with a new identity. Prior
unresolved attempts refuse further metadata dispatch. Restoration is another
explicit effect, and immutable historical snapshots retain earlier proof.

This does not change generic rename/config routes. New sealed releases require `nativeMetadataTargetVersion:1` in manifest,
runtime pointer and native policy. The configured policy target, request binding,
live peer and independently inspected PID/start must match at native PreToolUse
before admission is consumed. Admission retains the exact target observation;
settlement requires it as well as the persisted postcondition. Older controllers
refuse metadata writes before publication and require explicit renewal. The hook
is an admission-time observation, not an atomic native API precondition: the app
API accepts a session ID and provides no PID/start conditional mutation. A restart
after the hook returns can still invalidate post-effect verification. Keep this
experimental and limited to the explicitly owned scratch fixture. A successful send or native
acknowledgment alone never settles the requested state change.

### Public metadata operations through an enrolled controller

Use `rename_session`, `pin_session`, or `set_session_config` with an explicit
`metadata_controller` containing the exact enrolled controller session ID. Submit
through `driver_submit`; the parent requires its durable job identity. The route
selects that controller's current stable generation and requires native readiness,
policy, enough capacity/deadline for the entire batch and its sealed exact target.
No discovery across work chats, automatic enrollment/renewal or legacy fallback.

For example, `set_session_config` arguments are
`{session:"local_<target UUID>",metadata_controller:"local_<controller UUID>",title:"Locked title",pinned:false,effort:"high"}`.
This route supports title, pin and effort, plus model only when its controller
was explicitly granted model control. Model requests on an ungranted controller,
and any permission_mode or via_broker mixing, reject before a child is submitted. Omitting `metadata_controller` preserves the existing route.

The parent holds the existing public recipient-control lock and applies fields
in title, pin, model (when requested), effort order, with a separate durable native child and persisted
postcondition per field. Other low-level independent controls retain their own
per-effect locks; this is not an atomic multi-field transaction. The parent
rechecks controller selection/target epoch between fields and verifies the final
aggregate state. Cancellation, a failed/unknown child or final mismatch stops
later fields and retains the parent ledger, exact child jobs and completed fields.
Reattach the same parent job. Never replay the whole batch after a partial effect;
inspect retained children and reconcile uncertainty first. No automatic rollback.

### Explicit public-mutation MCP qualification

`harness-native-service.mjs --live --metadata-config --harness claude|codex`
with exact `--session <controller> --service-id <generation> --target <scratch>`
uses the existing filtered MCP proxy for exactly one public set_session_config
parent. Codex also requires the configured `--model`. It changes title, pin and
effort in the enrolled owned scratch; its private contract retains baseline and
requested values. Separate persistent claim identities prevent disconnected reruns.
No direct tools, extra fields, new idempotency keys or arbitrary calls are allowed.

The verifier requires two identical submissions/same parent, three distinct exact
child receipts, derived request IDs, native postconditions, aggregate independent
state readback, unchanged source/global configuration and no model turns in either
scratch. Target transcript metadata can append bytes; complete bounded event
observation distinguishes those records from user/assistant turns. Cursors and
sanitized observation are retained for audit. Incomplete observation cannot pass.

This live harness deliberately leaves the verified changed fixture for its owner
to reconcile and restore through a separate durable request. Read the original
parent and children first after any failure or disconnect; never rerun the harness
to infer outcome. A failed report stays failed, with any retrospective review saved
separately. Restore only known settled fields; unknown effects require reconciliation.

### Default metadata routing for explicitly enrolled targets

`broker_service_enroll_metadata {session:<controller>,session_id:<target>,experimental:true}`
validates an already-installed, ready native metadata controller and its exact
owned idle target, then retains an immutable enrollment. It requests no native
effects. Repeating the same enrollment is idempotent; a changed epoch or conflicting
controller refuses without replacing the existing evidence.

After enrollment, ordinary durable rename_session, pin_session and
set_session_config calls for that target select the controller automatically.
No controller argument is needed. Targets without enrollment retain the prior
route. Enrolled targets never fall back to the legacy broker when stale, ambiguous,
unavailable, expired, uncertain or asked for unsupported model/permission fields.
An explicit metadata_controller still chooses that exact controller directly.

The index reads only the exact target's owned bounded enrollment directory, never
work-chat contents. Multiple entries, malformed rows and unsafe filesystem entries
refuse selection. The native policy, current generation, target epoch and receipt
checks remain authoritative after selection. Renewals preserving the exact target
can keep enrollment. Target epoch changes require the controlled rebind transition below; silent
retargeting is deliberately refused, not auto-recovered.
Use --metadata-config --enrolled-route with the live native harness to qualify
this argument-free route under its separate one-shot claim mode.


### Controlled metadata enrollment rebind after recovery

Inspect `broker_service_metadata_binding {session:<target>}` to get the exact
current enrollment and enrollmentSha256. After scoped recovery, prepare/activate
and verify a controller explicitly sealed to the new target epoch. Then submit
`broker_service_rebind_metadata` with controller `session`, target `session_id`,
`expected_enrollment_sha256` and `experimental:true`. The same controller/session/
folders must remain; PID and start time must change, and the old PID must be absent
(not merely missing peer metadata). Reused/present old PIDs refuse admission.

Enrollment and rebind writers share one target lock. Rebind requires current ready
native capability and a matching expected old digest; it retains the old row under
metadata-controller-history before atomic active-row replacement. Immediately before
publication it rechecks native qualification, the expected digest and old PID
absence. A lost compare-and-swap never overwrites a competing winner. Readers may
refuse a transient/unqualified enrollment; they never fall back to another authority.

The binding operation requests no native effects and does not restart processes,
change permissions or prove unattended recovery. After interruption inspect the
active binding, retained history and original job; history alone does not prove
publication. Reattach the same durable job rather than forcing a stale digest or
erasing the index. Verify a fresh ordinary metadata operation against the new epoch.

### Explicit model capability for enrolled metadata controllers

Preparing a NEW metadata controller with `metadata_model_control:true` and an
explicit `metadata_target` seals model selection into that generation. This is
not granted to existing title/pin/effort controllers by a host upgrade. Renewals
preserve the verified predecessor's grant; archive controllers cannot acquire it.
The native callback and PreToolUse policy both require the explicit model flag.

With that grant, ordinary durable set_session_config supports `model` alongside
title, pin and effort. Without it, a model-containing batch refuses before any
child, including an otherwise valid title change. Permission-mode and legacy-route
mixing remain refused. Use full model IDs from the app picker; aliases are rejected
and the app remains authoritative for which IDs it currently offers. Successful
settlement requires the exact persisted model plus native target admission and an
immutable receipt-bound postcondition. A native acknowledgment alone is insufficient.

Model changes apply from the next turn. Configuration verification does not prove
that an inference turn used the model. `harness-native-service --metadata-config
--enrolled-route --target-model <full model ID>` uses a separate one-shot model
contract, verifies four distinct native child receipts and an independently changed
model, and still requires no model turn in either scratch. Restore the baseline
through a separate reconciled durable request before running the next harness.

### Enrolled native sending (October 17)

A NEW exact-target controller may opt into `metadata_send_control:true`.
For an explicitly enrolled recipient, ordinary durable `send_message` selects
that controller; optional `controller_session` binds it explicitly. Old roles
without the capability refuse before dispatch. No silent legacy fallback occurs.
The callback admits only its sealed recipient epoch, known idle/working/busy/running
state, registered owned scratch and bypass mode; metadata edits still require idle.

`nativeAccepted:true`, `delivery` and `messageId` verify native API acceptance.
`applied:false` stays false: inspect the recipient separately. Current Claude
host-injected peer messages omit the returned message ID in the target journal.
Causal observation exposes `nativeHostPeer` sender/body digest metadata; bounded
exact-body/sender and reply-lineage matching is correlation, not UUID linkage or
general task completion. Actual Claude/Codex fresh MCP send contracts passed18checks
each on host3669f135; busy/queue lifecycle and generic stop/steer remain unqualified.

### Enrolled native stop (October 17)

A NEW controller may seal `metadata_stop_control:true`; this is separate from
send/model grants. Durable `stop_session` on its enrolled recipient requires a
recognized native receipt and same-process idle observation. Pending reconnection
or changed/unknown epoch stays unresolved and does not permit replacement.
Native stop preserves existing queued messages. Actual CLI idle and running Bash
sleep tests passed on sealed506797c3. Stop-specific MCP coverage remains pending.
Enrolled `steer_session mode:interrupt` now records distinct deterministic native
stop/replacement phase identities under its durable parent. Both grants, capacity
and epochs are checked before effects; a pending stop or missing same-epoch idle
observation prevents replacement. Inspect retained route phases on partial failure.
Busy tool-free model interruption and replacement passed CLI; both actual MCP
clients mechanically verified the route, with preserved harness final-format
failures caused by an obsolete prompt. Earlier Bash sleep fixtures were policy
refusals, not subprocess interruption proof. No queued-work discard is promised.

### Read-only review of completed native contracts

`node scripts/review-native-service.mjs --harness claude|codex --contract <exact original contract.json>`
(Codex also requires `--model <configured model>`.) This diagnostic grants only
guide plus one exact completed job wait. It cannot submit or repeat native work.
Owner validates the original completed operation fingerprint and verifies original
job/route/contract/trace bytes stay unchanged. Claude returns a provider-schema
status; Codex uses an exact final marker. Failed original runs remain failed.
Acceptance of historical evidence is separate from current native readiness.

### Existing enrolled fixture live profile

`node scripts/live-v2.mjs --live --input-free --enrolled --session <owned target> --controller <enrolled controller>`

This explicit profile requires 16 available slots, an idle owned bypass target,
ready exact controller with send/stop grants and a sufficient deadline. It creates
no chat and restores baseline settings. Its 11 checks cover current durable native
controls, cancellation, busy queue and interrupt/replacement behavior plus input
audits. Creation/focus and archive cleanup remain excluded, so a pass does not
qualify the default full live scope. A terminal reply is followed by a separate
same-epoch idle wait before idle-only metadata controls. Sender/body/ancestry proof
for host injection is separate from returned message-ID correlation.

### Focus readback

`open_session` reports `navigationVerified` separately from `focusVerified` and
`focusDisposition`. Restore mode confirms both the previous main session and
foreground bundle. Missing snapshots or failed activation remain unconfirmed.
If the user selects a different main session while navigation settles, restoration
leaves both that selection and the foreground app alone. Existing focus action
strings remain available; `(not confirmed)` indicates missing proof.

### On-demand controller maintenance for enrolled controls

Durable enrolled metadata/send/stop/interrupt requests now check the budget and
lifetime margin for the whole operation. A healthy exact controller proceeds
directly. Low margin triggers one recorded renewal child; a missing policy audit
may trigger one bounded negative probe. The successor must preserve controller
and target epochs plus every existing model/send/stop grant, with no unresolved
attempts. Native input, ownership changes or unknown effects prevent progression.
Results expose `maintenanceJobId` when maintenance occurred. Inspect that original
child on failure; do not retry under a new identity. This maintains an existing
live controller and does not promise recovery after process or app loss.

### Recovery roles and independent residency observation

Cold recovery now derives the replacement role from verified terminal historical
policy, preserving its exact target and model/send/stop grants. Changed targets,
policy disagreement or unresolved effects refuse. Success requires final role
preservation as well as settings, readiness and a native read. This path now has native one-shot cold recovery and exact standby rebind evidence
on the owned scratch pair, plus automatic recovery/rebind/send qualification.

`node scripts/residency-v2.mjs --live --session <controller> --service-id <generation> --duration-sec 240`
observes an existing independent controller without native writes or wakes.
An idle-survival result without observed natural pressure remains pressure-
unqualified. It does not establish Cron protection, app-restart recovery or
always-on availability. Source, epoch and budget must remain unchanged.

### Standby recovery planning

`broker_service_standby_plan` takes exact standby session/service, primary
session/service and a retained empty-family request ID. It reads current native
and historical evidence and returns eligibility only. `wait: primary-live` forbids
cold recovery; changed generations, unknown effects, STOP, stale family proof or
unqualified standby fail closed. Missing peer state never establishes a crash.
Request-triggered cold routing requires an explicitly enabled exact enrollment.
Generation renewal must refresh retained family proof before cold recovery.

### Durable standby enrollment

`broker_service_enroll_standby` binds exact live standby/primary generations and a
verified terminal empty-family receipt. Existing bindings are immutable without an
exact `expected_enrollment_sha256`; refresh preserves both native epochs and keeps
the prior bytes in history. `broker_service_standby_status` inspects the retained
binding without effects. Enrollment defaults to automatic recovery disabled.
Explicit `automatic_recovery:true` opts into request-triggered recovery; changing
an existing choice requires the exact prior digest. Renewal preserves that choice.
The exact deployed scratch binding now enables request-triggered recovery after
native one-shot recovery/rebind and automatic send qualification. This requires
a surviving qualified standby and persisted native trust; app quit or loss of both
controllers remains unqualified.

`broker_service_recover_enrolled` is an experimental durable one-shot operation
requiring the exact binding digest. It and enabled control routing require actual
original-process absence, no current peer, no unresolved effects, qualified sealed
standby and the retained empty-family proof. Checks repeat before publishing one
stable recovery child. No live primary archive, app restart or permission change
is implied. Inspect the original parent/child after uncertainty; never replay it.
Recovered control results expose `coldRecoveryJobId` and `standbyRebindRequired`.
A new primary epoch does not automatically update the standby's sealed authority.
Use experimental durable `broker_service_rebind_standby` with the original
`recovery_parent_job_id` and exact old `expected_enrollment_sha256`. It accepts only
completed enrolled-recovery and native child receipts matching that binding. It
reuses generation preparation, quiescence, retirement, stable-hook activation and
native policy qualification to reseal the same standby process for the recovered
primary. It captures a fresh primary family receipt, then replaces the binding by
CAS, retaining old bytes and the automatic-recovery choice. Both processes must
remain the exact owned idle epochs throughout. It never wakes a process or
repurposes another session. Failed/uncertain phases stop without replay. This
rebind implementation has synthetic and native-refusal evidence; the successful
native path remains unqualified until an actual cold recovery supplies its proof. These paths do not establish
unattended recovery from app quit or loss of both controllers.

For explicitly enabled automatic routing, the original control request composes
cold recovery and rebind before renewed control admission. The scheduled cold
child remains `coldRecoveryJobId`; the rebind uses a deterministic durable
`standbyRebindContextId` (a native context, not another scheduled driver job).
Its before/after checkpoints remain in the original recovery ledger. The caller
holds the primary route lock; this internal rebind retains that lock instead of
recursively taking it, while still taking the standby generation-turnover lock.
Any unknown recovery/rebind/checkpoint stops control dispatch. Successful results
report `standbyRebindRequired:false` only after exact rebind verification; manual
cold recovery still reports true until its separate rebind completes. This
composition is implemented but automatic routing remains disabled in the current
scratch enrollment pending successful native cold/rebind qualification.

Primary renewal captures a fresh family receipt and refreshes an enrolled binding.
It needs capacity for policy, family and a later operation. A failed standby
revalidation leaves the old binding stale and returns `standbyRefreshQualified:false`;
unknown family effects stop progression. Old generation receipts never become new
recovery authority. A changed native epoch requires a separate proven rebind.


Standby generation renewal also refreshes the exact bindings that name that
standby. It inventories at most 128 owned binding files, retains each prior digest
before turnover, and reports per-primary `standbyEnrollmentRefreshes`. The normal
same-epoch CAS and native scope qualification still apply; it does not retarget a
PID or carry a retired generation as authority. A failed refresh leaves the prior
binding stale and reports `qualified:false`. Normal reciprocal refresh requires a qualified live primary. The internal cold
admission path can instead refresh an exact existing binding after independently
proving the original primary absent. It requires the old digest and retained
primary epoch; it cannot create an absent-primary enrollment or change either
native process identity. That absent-primary path remains natively unqualified.


Before cold admission, an expired, low-margin or exhausted standby may require
one same-process generation renewal. The internal planner may return
`renew-standby` only after checking actual original-primary absence, exact sealed
scope, terminal retained family and zero unknown effects. This is not cold
eligibility and causes no effects by itself. Live or still-present primaries,
STOP markers, changed identities and unknown effects never grant this renewal.
The original recovery parent records a deterministic `standbyRenewContextId`
before renewal, retains the old digest, checks the renewed binding and rechecks
cold admission before submitting its one recovery child. A failed/uncertain
renewal, CAS or checkpoint stops the original request. The current enrollment
remains disabled until this complete native path is qualified.


Independent cold recovery restores an archived imported scratch through
`unarchive_session {import_only:true}`. If that link mechanism is unavailable or
its record readback does not verify, recovery stops with
`unarchive_import_unverified`; it never falls back to reviving the legacy broker.
Generic callers retain their existing fallback unless they explicitly opt out.
An automated scoped archive requires quiescence and retired source, so it tests
intentional STOP handling, not an accidental archive of an installed service.
The latter native test requires a manual archive of the exact dedicated primary;
never weaken the archive guard or manufacture a crash to label that case passed.


Verified native delivery failures now expose bounded `nativeFailure` metadata for
an exact target-bound `workspace_trust_required` / `undelivered` result, including
the native message ID and `humanActionRequired:true`. It grants no retry or trust
authority. Unknown, foreign, malformed or merely quoted failures are not assigned
that diagnosis. Recovery parents retain the failure category and metadata.

After an original verified undelivered workspace-trust refusal and a human start,
explicit `broker_service_rebind_standby` may take
`human_assisted_primary_service_id`. It requires the original failed parent and
native child/wake IDs, independently verified failure receipt, exact current new
primary epoch, preserved prior role/settings/anchor and current readiness/policy.
If the old standby was retired, the receipt is checked against its verified
terminal historical generation and original native tool ID. Uncertain or unrelated
failures never qualify. This path reports human-assisted restoration only and
retains the original failure; automatic cold recovery never selects it.

### Import-started cold recovery

A trusted deep-link unarchive can start the target process itself. Recovery now
checks that new owned idle epoch against the original completed import-only child
and its timing, with the old PID absent. That path skips redundant wake/reply but
still requires the restored service readiness, policy and native-read contract.
The normal wake path retains its absence guard. A failed historical attempt is
never replayed or rewritten as successful; explicit continuation uses `broker_service_continue_imported` with the failed
`original_recovery_parent_job_id`, exact `expected_enrollment_sha256` and
`experimental:true`, submitted durably. It validates completed original import
stages and a terminal wake preparation refusal with no publication. A persistent
one-use claim prevents another continuation of the same original child. Only
remaining restoration stages run; the failed jobs remain failed. Standby rebind
uses the new completed continuation parent. This does not enable automatic recovery.

### Independent service health snapshots

`service_health {session, service_id}` observes only that exact independent
receiver and writes bounded metadata diagnostics. Both arguments are required
together; omitting both retains legacy broker diagnostics. The snapshot separates
native epoch/readiness/policy, capacity, expiry and unresolved count from inference
availability. Observed read admission is evidence only and never authorizes an
operation, wake or recovery. Prompts, raw results, paths and exception text are
excluded. An old legacy broker snapshot does not describe the independent pair.

### Ordinary native chats: unarchive and pin

An explicitly enrolled independent session-management receiver now handles public
`unarchive_session` and `pin_session` calls for ordinary Claude Code chats. Targets
do not need to be driver scratch sessions, have a running process, or use bypass
permissions. The driver binds each target to its exact saved session/CLI identity,
folder and account-store hash, and verifies the saved result after the native call.
The receiver remains an owned, qualified service with an explicit sealed
`session_management_control:true` grant. This grants only native unarchive and pin;
it does not grant arbitrary messages, permission changes, archive or deletion.

Use the ordinary public operations through `driver_submit`, then `driver_wait`:

```json
{"operation":"unarchive_session","arguments":{"session":"local_<exact UUID>","focus":"restore"},"idempotency_key":"<stable workflow key>:unarchive","timeout_sec":120}
```

After that job completes with `verified:true`, submit `pin_session` with
`{"session":"local_<exact UUID>","pinned":true}` and its own stable key. Reattach
the same job after a disconnect. If the native outcome is unresolved, inspect its
retained `requestId`/`serviceId` and use receipt reconciliation; do not replay under
a new key. A configured management controller refuses on stale/unqualified state
rather than falling back to the legacy broker. `import_only:true` still excludes
this native route. Existing fixed scratch metadata enrollments keep their route.

`focus:"restore"` on this native metadata path compares fresh before/after focus
observations. `focusObservation.observationScope:"before-after-endpoints"` means
only those two observations matched; it does not prove uninterrupted focus or a
full window layout. A changed or unavailable observation is unconfirmed and does
not authorize restoring an unattributed view. Explicit `focus:"show"` opens the
successfully unarchived chat and checks the normal navigation result.

Service maintenance: enable the grant during explicit `broker_service_prepare` or
`broker_service_renew` with `session_management_control:true`, then enroll that
qualified receiver with `broker_service_enroll_session_management`, `session` and
`experimental:true`. Enrollment performs no native effects and does not change
an existing fixed target. Renewal and guarded cold recovery preserve the grant.
Only one exact enrolled controller is selected; this is not arbitrary discovery.

### Both controllers absent: read-only bootstrap planning

`broker_service_pair_bootstrap_plan` takes the exact primary `session` and
`expected_enrollment_sha256`. It checks only that retained pair and returns wait
if either controller survives. A `bootstrapPreparationEligible:true` result is
not startup, import, serving or replay permission; it only qualifies prerequisites
for the experimental durable transaction below. It performs no recovery effects. Missing records,
changed versions/roles/selection, reused PIDs, unknown effects and intentional STOP
refuse. See `docs/pair-bootstrap.md` for the mechanism evidence and remaining
executor requirements. Do not stop a live controller to satisfy this planner.


`broker_service_bootstrap_pair` is the experimental durable executor for the exact
pair plan. Submit it with driver_submit, `session`, `expected_enrollment_sha256`,
`experimental:true` and an adequate whole-job timeout (for example360seconds).
It refuses before effects if any actor survives. It does not yet run automatically
on public operations. This path has synthetic transaction and live refusal proof;
native outage qualification remains pending. If an import does not produce a
verified native epoch, inspect the original root/children. Do not submit a new root
or replay the import; changed-condition continuation is still an implementation
frontier. Human trust and hot-reload gates remain intact.
