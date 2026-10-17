## Foreground native receipt session binding — October 17

Previous turn: progress (human-started epoch and connected MCP verification).
Read-only legacy receipt audit reproduced an independent synthetic defect:
foreground dispatch checkpoint plus a matching sidechain native call/result
incorrectly settled a receipt. Collector now rejects all sidechain records and
malformed sidechain flags, and runtime observers bind every checkpoint/call/result
to the exact expected CLI session. Missing/foreign session IDs cannot settle.
No old receipt is fabricated or replayed; no historical result was overwritten.
Evidence: diagnostics/native-receipt-binding-2026-10-17.json.15focused collector
tests and6broker tests pass. First full pressure failed3broker fixture checks:
synthetic journal rows omitted real sessionId; fixture corrected to include exact
CLI identity. Failure preserved: pressure/v2-2026-10-17T16-00-29-276Z.json.
Final unchanged-source pressure passes:
pressure/v2-2026-10-17T16-00-56-183Z.json. Both current filtered harnesses pass:
pressure/harness-v2-claude-2026-10-17T16-00-12-178Z.json and
pressure/harness-v2-codex-2026-10-17T16-00-12-178Z.json.
Current build 9fb58c9fd9fc4081ad2f0fa13e188e067b077c687e0095dfff51c2286462abd6. Connected MCP still
loads64c8563f and now correctly reports restartRequired:true; fresh processes
used for current checks. Prior connected native proof remains bound to its old
build, not silently promoted. Read-only native journal cursor binding verified;
no new broker serving/native mutation qualification claimed. Legacy22unknowns
remain; handoff unsettled. Sealed runtime and current native epoch mismatch
unchanged. No restart, wake, settings/quarantine change or refused-stop retry.
Next changed-condition step: exact historical foreground receipt evidence review
or independently admitted native control qualification; preserve unknowns without
replay and reconnect MCP before using changed code through that connector.

## Human-started new epoch and connected MCP verified — October 17

Taylor reported done after the requested ready message in Claude Desktop.
Independently observed existing target local_74c54e49-972e-4dac-adfa-d23e01316119
live/idle PID20499, start Sat Oct17 15:48:23UTC, desktop entrypoint, CLI2.1.299.
Installed app2.42304.0/CLI2.1.299 unchanged. Fresh public durable direct send has
exact native receipt and exact causal POST_READY_OK reply without tools:
diagnostics/post-ready-2026-10-17.json. Target returned idle.
Actual connected Codex MCP driver_status now reports runtimeBuild==sourceBuild
64c8563f7be1cda864fdf4b37d527f35de93ae7f5185dbde6f59b3aca037b480,
restartRequired:false. A native send was submitted through this chat's actual
MCP, reattached from fresh CLI to same job, then waited/observed through MCP.
Job j83995b4eeed3446a80fe1e40bed42322 completed; exact native user receipt and
causal MCP_NATIVE_OK_20261017 terminal reply verified, no tools or duplicate job.
Evidence: diagnostics/connected-mcp-native-2026-10-17.json. This closes the stale
connected-MCP gap for the explicit direct route on this build/epoch only.
Current source fingerprint matches passing full pressure
pressure/v2-2026-10-16T00-18-48-528Z.json; no redundant synthetic/model retest.
Historical cold-start failure remains failed: this recovery required a direct
human message, so autonomous cold recovery is NOT qualified. Prior blocked audit
is superseded by changed native state; goal active, new blocked-audit count0.
Fresh legacy broker audit: a unique owned live/idle worker is present, PID79060
start Fri Oct16 14:54:25UTC. Its sealed dependency evidence reports native-process-
epoch-mismatch; templateCurrent:false, waiter/batch admission unverified and
residency list not fresh.22unknowns remain and handoff is unsettled. No broker restart/wake, old effect replay, native mutation refusal
retry, permission or quarantine change. Watcher remains paused; Codex bridge
fixes parked. Next work: current native control admission and autonomous startup
architecture, preserving the recorded controller refusal and unknown effects.

## Cold-start source admission review — October 15

Previous goal turn: progress (authorized app restart revealed offline refusal and
missing peer startup). Bounded installed source now confirms separate APIs:
LocalSessions.setFocusedSession changes focus/preconnects SSH; warmSession calls
manager warmSession(...,{fromPage:true}). Manager warm entry refuses unconfirmed
imports, stoppedUntilPersonSends, hosted-state restrictions and crash-loop gates,
then checks transcript/trust/auth and start ownership. None may be bypassed.
canAutoResume reports stopped-until-person-sends, import-confirm, parked crash-loop
or stale-auth refusal. This is source evidence, not a current native canAutoResume
result or proof of which gate caused this scratch failure. Allowlisted persisted
scratch flags were absent; do not interpret absent as clear/false.
Evidence: diagnostics/native-cold-start-review-2026-10-15.json. No app/internal
IPC executed, settings changed, restart repeated, native control retried or prompt
spoofed. Both scratch records remain unarchived with no current native worker.
The native controller's earlier cross-chat mutation refusal is also preserved.
Concrete changed-condition gate: Taylor can open the existing Claude Desktop chat
claude-driver-interrupt-scratch-2026-10-15 and send a short ready message there;
then current exact peer/versions and one harmless direct receipt/reply can be
requalified. Codex cannot type that message while input quarantine is retained.
An independently verified supported native warm-start route respecting admission
could also unblock; current code has not established one. Legacy broker remains
observer-owned/offline with22unknown effects; ordinary recovery cannot clear them.
No new source change; prior current pressure/harness evidence retained. Next work
should change this startup condition or qualify a supported route, not repeat
unchanged opens/restarts, add unrelated helpers, or reinterpret navigation as ready.

## Controlled app restart: offline refusal passed, cold peer startup failed — October 15

Previous turn: progress (native cancellation). Taylor explicitly authorized
Claude Desktop quit/restart. Held shared broker-revive lock through one graceful
AppleEvent quit and reopen to serialize observer recovery. No OS/session kill,
keyboard injection, permission/auth change or broker wake. Durable intent marks
this as intentional termination; do not infer crash/governor eviction from exits.
Exact app and scratch peer absence observed after quit. A new direct send refused
peer_unqualified before arming any ledger. App reopened, but open_session with
focus restoration did not start the disposable scratch native peer within30s.
Retained failure: diagnostics/direct-app-restart-2026-10-15.json. No uncertain
message was retried and no post-restart inference prompt was sent.
Added optional open_session.wait_native_sec(0–30/default0), observing exact
desktop peer/session/cwd/process identity inside navigation before restoration.
It returns nativeProcess verified identity only, servingVerified:false and
inferenceVerified:false; timeout/cancel is explicit while focus can restore.
Three helper tests and full final-source pressure pass:
pressure/v2-2026-10-16T00-18-48-528Z.json. Both filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-18-34-138Z.json and
pressure/harness-v2-codex-2026-10-16T00-18-34-138Z.json.
Changed-condition native follow-up waited30s before restoring focus and ALSO
returned native-peer-timeout. This disproves focus restoration delay as sufficient
explanation. Chat navigation is not a warm-start guarantee on current installed
app2.42304.0/CLI2.1.299. Preserve both observations; no second restart performed.
App is reopened; scratch record intact/unarchived but native worker offline.
Legacy broker remains offline with22unknown effects and handoff unsettled.
Next changed-condition step: inspect installed cold-start/deep-link semantics and
existing input-free startup mechanisms without bypassing quarantine, controller
refusal, native permission gates or observer recovery ownership. Live native
controls, persistent serving, cold recovery and residency remain unqualified.

## Native direct cancellation boundaries passed — October 15

Previous turn: progress (two-target concurrency). Current-source owned scratch
trial validates both boundaries through actual durable public jobs. A controlled
recipient lock kept first job waiting before admission; cancellation produced
cancelled with no direct ledger, and same-key reattachment retained that job.
A bounded500-integer workload then held the real recipient busy. Follow-up was
durably armed once and caller cancellation left its job outcome_unknown. The
exact native user receipt arrived AFTER cancellation, followed by exact causal
terminal reply. One native receipt only; same-key job reattachment never replayed.
peer_send_status reconciled late receipt to received while original job remained
outcome_unknown. No tools; exact native epoch unchanged. Final cleanup records
recipient idle. Evidence: diagnostics/native-cancellation-2026-10-15.json, runtime
4262b079933b2f38a26b8ca746f626701f46c266297249c12041d444512beb0a.
This qualifies cancellation bookkeeping and late native direct receipt observation
for this bounded fixture. Cancellation does not stop recipient inference or undo
published work. The preserved unknown job is not an unresolved legacy broker
mutation; its direct ledger has exact received proof and causal reply. Do not
rewrite historical job state or retry with a new identity.
No source change, broker wake/recovery, OS process kill, permission change or
refused native control retry. Current synthetic/harness evidence still applies.
Next changed-condition step: current native lifecycle/dependency and recovery
qualification under the existing admission gates; native controller cross-chat
mutation refusal and legacy22unknowns remain authoritative.

## Two-target native direct concurrency passed — October 15

Previous goal turn: progress (descriptor-bound observations). Current-source
public durable peer-direct trial submitted6 jobs concurrently across the2 owned
scratch chats,3 per target. All6 jobs completed with unique exact native user
receipts and exact causal terminal replies. Every original idempotency key was
reattached and retained its job ID; no duplicate job/publication/reply observed.
Both exact native PID/start epochs unchanged; no tools. Final records show both
targets idle/unarchived. Evidence:
diagnostics/direct-concurrency-2026-10-15.json, runtime
4262b079933b2f38a26b8ca746f626701f46c266297249c12041d444512beb0a.
Submit latency109–377ms; first receipt per target563/628ms; queued receipts
4994–11310ms; causal replies3134–12859ms; total13955ms. These measured values
qualify only this bounded6-message/2-recipient workload, not sustained throughput,
fairness, broker serving, interruption, recovery, native mutations or residency.
No source change, app restart, permission change, refused-stop retry, old broker
replay or Codex bridge modification. Required current-source synthetic/harness
proof from the previous turn remains applicable; no redundant inference retest.
Next changed-condition step: exact native direct lifecycle cancellation/reattach
qualification or trusted existing native control admission, preserving controller
refusal. Legacy broker22unknowns and cold recovery/residency remain open.

## Descriptor-bound transcript observations — October 15

Previous turn: progress (bounded causal tool receipt IDs). Shared observer now
opens its journal O_NOFOLLOW/O_NONBLOCK and validates owned regular-file identity
through fstat on the exact descriptor supplying bytes. It no longer stats one
path and reopens a potentially replaced target. Cursor dev/inode/offset checks
use that descriptor; bounded reads detect premature EOF/truncation and reject
non-growing metadata replacement during reading. Normal append growth remains
valid; missing transcript pending cursors are unchanged. No FIFO can block read.
Focused45 checks pass including final-symlink, directory, FIFO and replaced-inode
refusals; original partial-line, truncation, Unicode/privacy and pending context
checks continue passing. Full final-source pressure passes:
pressure/v2-2026-10-16T00-13-20-714Z.json. Fresh current public observer retains
exact native call/result pairing on the owned scratch journal without inference:
diagnostics/native-observation-file-identity-2026-10-15.json.
Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-13-06-746Z.json and
pressure/harness-v2-codex-2026-10-16T00-13-06-746Z.json.
Controller mutation refusal remains authoritative; no new message, permission
change, recovery, restart or old request replay. Both scratch chats retained idle.
Next changed-condition work: current-source native lifecycle/recovery boundaries
and serving qualification, without substituting peer prompts for refused control
authority. Full interruption, residency, cold recovery and22unknowns remain open.

## Bounded native tool-call/result observation — October 15

Previous turn: progress (native metadata read and preserved controller refusal).
Shared session_events/session_wait include_causality now includes metadata-only
toolCalls{id,name} and toolResults{toolUseId,isError}. IDs/names are bounded;
64-block caps and malformed identifiers explicitly mark truncation/incompleteness.
Missing native error flag stays null, never inferred success. Arguments, result
bodies, thinking and user text remain excluded. Default observation unchanged.
New fixture proves pairing, opt-in privacy, nullable error and overflow/invalid-ID
flags. Focused44 checks passed before final metadata-incomplete flag; full
final-source pressure passes: pressure/v2-2026-10-16T00-11-59-476Z.json.
Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-11-46-346Z.json and
pressure/harness-v2-codex-2026-10-16T00-11-46-347Z.json.
Current public observer independently pairs the retained native scratch read's
actual toolu_01MgVHUvin97S86zFJseEW9M call/result without a new model prompt.
Evidence: diagnostics/native-tool-observation-2026-10-15.json.
Correlation is not semantic effect proof; exact arguments/result/state remain
separate gates. Controller stop refusal is preserved and not retried. Both
disposable scratch chats are retained; target workload completed and idle.
Next changed-condition work: leverage these paired IDs for bounded causal native
receipt observation while keeping mutation authorization/refusal authoritative.
Full native interruption/recovery/residency remains open; watcher stays paused.

## Native scratch controller read passed; interruption refused — October 15

Previous turn: progress (installed stop-handler contract). Existing scratch
local_c0a18601-5a57-44d0-94ac-2fed3719e7ca successfully discovered and called
mcp__ccd_session_mgmt__get_session for itself. Exact native tool-use arguments,
matching tool-result ID/target and causal terminal acknowledgment verified from
bounded owned journal. ToolSearch discovery observed; no substituted shell or
filesystem tool. Evidence: diagnostics/scratch-native-tool-read-2026-10-15.json.
Created second disposable target through create_session with acceptEdits/Haiku5.5:
local_74c54e49-972e-4dac-adfa-d23e01316119, title
claude-driver-interrupt-scratch-2026-10-15, cwd probe/interrupt-2026-10-15.
Disk verified; immediate focus restoration recorded. Native PID44866 was busy
generating bounded1200 integers when controller received one exact stop request.
Controller refused peer-delivered authority before any native stop tool call.
This is a preserved native model authorization refusal, not successful interrupt,
transport failure or evidence the stop API is unavailable. No retry/forged human
authority, alternate control, permission change or native process kill attempted.
Evidence: diagnostics/scratch-native-interrupt-2026-10-15.json.
Target naturally completed its final marker and is now independently idle.
Replacement was never sent. Target retained unarchived for next legitimate test;
no active workload remains. Native cross-session mutation through this controller
requires direct human instruction in that Claude chat; ordinary peer authority
cannot be assumed from metadata read success. Broad goal remains active with
other independent implementation work available; no new approval request here.
Next changed-condition step: inspect existing trusted native service admission
for a scratch-only controller path, preserving this refusal and all existing
permission gates. Legacy broker22unknowns remain pending; no wake/replay/handoff.
Current source unchanged; prior pressure/harness proof retained without repeated
model tests. Watcher remains paused; Codex bridge fixes remain parked.

## Installed stop-handler contract qualification — October 15

Previous turn: progress (recognized native stop receipts). Added reproducible
scripts/native-stop-contract-v2.mjs executing only the exact reviewed installed
stop tool handler in a VM with synthetic manager/telemetry. All8 checks pass:
human-answer waiting refuses before interrupt; held user message produces declined
success envelope; reconnecting host remains requested; accepted agent interrupt
produces exact positive receipt; idle, starting, archived and self cases do not
invoke interrupt. Calls bind exact target and agent trigger. Evidence:
pressure/native-stop-contract-2026-10-16T00-08-24-329Z.json.
Installed handler chunk SHA f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff
is required; drift fails rather than guessing minified source. No live app IPC,
permission broker changes, messages, process signals or native controls occurred.
Further source tracing finds app manager interruptSession(...,agent) uses actual
query.interrupt(), preserves held user input, reports reconnect-pending, and may
fall back to native stop on missing SDK acknowledgment. Peer priority is not an
equivalent control interface and must not bypass these protections.
Next changed-condition step: prepare an exact owned scratch native-tool controller
trial through existing app tool machinery, with current native admission/receipt
proof and no replay of old broker requests. Offline legacy broker and22unknown
effects remain open; general recovery/handoff gates are unchanged.

Current full pressure passes unchanged source: pressure/v2-2026-10-16T00-08-47-099Z.json.
Both final-source filtered harnesses pass: pressure/harness-v2-claude-2026-10-16T00-08-33-361Z.json
and pressure/harness-v2-codex-2026-10-16T00-08-33-361Z.json.


## Native stop receipt refusal guard — October 15

Previous turn: progress (direct queue steering). Bounded installed desktop source
review found successful stop_session envelopes can mean user-input refusal,
starting/no turn, or reconnect-pending. Idle observed later cannot prove those
stops executed. Current stop_session now requires a recognized exact-target
receipt before same-epoch idle verification. Declined/unfamiliar receipts refuse
replacement; reconnect-pending reports outcome_unknown/retrySafe:false without
replacement. Already-idle returns stopped:false while retaining verified idle.
Steering no longer reports an already-idle recipient as an interrupted turn.
Evidence: diagnostics/stop-native-receipt-review-2026-10-15.json, installed chunk
.vite/build/index.chunk-B5tintml.js SHA f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff.
Parser positives/negative/foreign/malformed/error receipts pass. Actual synthetic
MCP regression models later idle after declined native receipt and proves no
replacement; pending reconnect is likewise unknown. Full pressure passes:
pressure/v2-2026-10-16T00-07-07-226Z.json. Both final-source filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-06-52-458Z.json and
pressure/harness-v2-codex-2026-10-16T00-06-53-637Z.json.
No native interruption trial, app restart, permission change or broker recovery
performed. Next changed-condition step remains a current native control route:
review desktop interruptSession dispatch/control transport; preserve pending
human-message protection rather than substituting OS signals or peer priority.
Broker22unknowns and residency/recovery remain open; watcher stays paused.

## Explicit direct queue steering — October 15

Previous goal turn: progress (native ordinary busy queue proof). Public
steer_session(mode:queue) now accepts explicit transport:peer-direct with stable
operation_id and receipt_timeout_sec. It reuses the guarded durable direct runner
and one absolute outer-admission/receipt deadline. Exact native receipt returns
received/applied:false/stopped:false; default native route is unchanged. Direct
interrupt and direct/via_broker combinations refuse before effects. Native stop
remains required for interrupt; no version/control gate was weakened.
New synthetic tests prove one publication/reattachment, refusal before effect and
outer-lock deadline. Focused11/11 and full isolated pressure pass unchanged source:
pressure/v2-2026-10-16T00-04-46-713Z.json. Both current filtered harnesses pass:
pressure/harness-v2-claude-2026-10-16T00-04-53-712Z.json and
pressure/harness-v2-codex-2026-10-16T00-04-54-910Z.json.
Actual durable public steer_session scratch trial passes: second job submitted
while busy before first completion, exact250-integer first causal reply then exact
follow-up causal reply, no tools. Evidence:
diagnostics/direct-steer-queue-trial-2026-10-15.json.
Fresh recovery audit still reports offline broker, intact sealed package,449
requests/22unknown and settledForHandoff:false. No recovery or replay attempted.
Next changed-condition work: inspect installed current native stop/control API
independently of the offline broker, then prepare a bounded scratch interruption
trial only through a verified route. Broad control/residency/recovery remain open.
Watcher stays paused; no input injection, permission changes or Codex bridge fixes.

## Native ordinary direct queue qualification — October 15

Previous goal turn: progress (composed native direct receipt/reply). Existing
scratch PID98986/start Thu Oct15 23:20:48UTC, CLI2.1.299 remained the target.
Two durable public peer-direct jobs completed. Follow-up job was created while
get_session reported busy and before the first terminal response timestamp.
The first exact causal reply contains all250 integers plus the fresh final marker;
only afterward the follow-up native user receipt and exact causal terminal reply
appear. No tools. Evidence: diagnostics/direct-queue-trial-2026-10-15.json,
including durable job times, exact native message IDs and bounded event ancestry.
This qualifies ordinary next-priority direct delivery without interrupting this
bounded workload. It does not qualify steer_session, native stop, broker controls,
queue fairness under sustained load or current immediate-priority routing.
Taylor authorizes routine bridge testing and Claude Desktop restarts as needed;
old one-message approval limitations below are historical and superseded.
Next changed-condition step: inspect current installed stop/control mechanisms
and broker recovery admission; do not promote2.1.299 immediate/idle controls from
this ordinary queue trial. Watcher remains paused; old unknowns are not replayed.

## Composed native direct-route qualification passed — October 15

Taylor explicitly approved DIRECT_ROUTE_OK and routine bridge testing, including
Claude Desktop quit/restart as needed; ask only for high-risk or definitively
disruptive actions. Earlier additional-message approval blockers below are superseded.
Existing scratch local_c0a18601-5a57-44d0-94ac-2fed3719e7ca remained live/idle
before submission. Fresh public driver_submit job jea110c3793f64c439aa7945a816925cb
completed with exact native user receipt 7edf5e39-b555-4eda-b84a-772f9dd09568, peer message
7beefa4f-8be9-41e9-ae0b-bd170da2473c. Causal attachment ancestry leads to terminal assistant
59942b8e-48e4-456f-b56c-c91bfe4f1bbb: exact DIRECT_ROUTE_OK, end_turn, no tools.
Runtime build 89b82ac96eb6480483b99efbf6bc686125e873a152b2766f13b94a6971c984f9; existing CLI2.1.299.
Evidence: diagnostics/direct-native-qualification-plan-2026-10-15.json.
No duplicate submission, broker wake, restart, permission change or input injection.
This qualifies this native composed direct send only; controls, residency, cold
recovery and historical unknown effects remain open. Watcher remains paused.
Next changed-condition experiment: scratch-only native queue/control qualification
with exact causal receipts; reconcile observer ownership before broker recovery.

## Host expiry before native delivery — October 7

Source audit found request expiry can pass while claim/revalidation awaits. Added
original published request deadline check immediately before the single send.
Expired requests retain identity/capacity and receive cancellation cleanup, with
no delivery or replay. Boundary tests expire during both claim and revalidation;
all six transaction tests pass. Full pressure v2-2026-10-07T17-35-07-996Z passed
1/1 in9044ms/sourceChanged:false. No native operation or inference requested.
This closes host pre-send expiry only; expiry after delivery remains uncertain
and requires receipt reconciliation. Full release gates remain open.

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

## October7 native command retirement observation

Own marker positive inbb9648563cbf178fe2aedaae8d1a9722; after its retirement, successor
bb827ec4c9c1c5b388ec5bd54a4627eb native inventory recorded previous marker absent and
own marker present with name/source/owner/root/registration checks. Corrected
CLI/MCP metadata-only review passed and successor retired without reads or sends.
Source-derived test shows command removal precedes deferred environment unload.
Therefore native command removal is verified, but receiver/environment absence
and scoped unload remain unqualified. Failures (duplicate registration, premature
inventory and historical successor ownership ambiguity) preserved and corrected.

## October 7 actual shared MCP lifecycle

Actual stdio MCP2025-06-18 enrollment/read/status/expiry/retirement trial passed for
service79e4123ffcf33a477ade016e021a06f6. Two native metadata receipts settled; early
retirement refused. Evidence is private pressure/native-service-mcp-lifecycle-79e4123ffcf33a477ade016e021a06f6.json.
Filesystem retirement verified independently through MCP status. Scoped native unload,
installed connector transport, guarded mutation, sustained residency and the full v2
qualification matrix remain unproven. This narrow transport pass does not close them.

## Shared native API and CLI trial completed — October 7, 12:26 Eastern

Fresh enrollment33d74fbfaaf5db2b9100bb3743100d49 native-validated updated receiver
and observed readiness. First public CLI attempt refused before enqueue: policy
script27279 bytes exceeded default16384 evidence reader. Preserved failure trial;
corrected policy hash reader bound65536. Transaction errors now include fixed phase,
published request ID and prepublication retrySafe metadata; no private error text.
Then actual nativeServiceRead API request rpeer7040e814315a45b79b2d9213ebc522cd
and separate public CLI request rpeer2d661cd9f215408eb4e67977756f62f3 completed
through one loaded receiver. Both standard receipts verified, lifecycleState:completed,
retrySafe:false, checkpointSource:legacy-shared, releaseAuthorized:false. No uncertain
send replay. Safe retirement16:25:41.389Z preserved module bytes, original epoch,
baselines and absent controls. nativeUnloadObserved:false/hookAbsenceQualified:false.
Private native-service-public-trial failure and public-settlement record retained.
Full pressure v2-2026-10-07T16-25-50-529Z passed1/1 in9074ms,
sourceChanged:false. Actual MCP transport and production enrollment automation are
not qualified by API/CLI success. Broad goal stays active: native unload, queue/service
ownership, guarded mutations/steering/residency/rollback and unknown-effects audit.
No human action required; retired enrollment must not be reloaded/replayed.

## Two native reads through one receiver load — October 7, 12:14 Eastern

Actual service enrollmentf71b9ffa70726f19ccadbc64c68673e5 passed installed native
validator, loaded once and produced owned readiness. Original PID71262/start,
sealed4af08654 runtime, app2.26454.0/CLI2.1.289, settings/policy hashes and controls
validated before install and each send. Existing lifecycle enqueue+exact pickup
under broker lock admitted two sequential get_session reads of existing fixture.
Requests rpeer5beb480e85bc4eab966c858ef9bdfb48 and
rpeer0c36aca1b8f94b31946a75839da739cd each captured private native content, passed
exact request/checkpoint/admission/metadata review and published standard lifecycle
receipt. Both inspectRequest state:completed/receiptVerified:true/retrySafe:false.
Each second reconciliation published:false. Each predecessor reviewed/snapshotted
before next helper overwrote shared entry. No repeated uncertain send or model call.
Private native-service-trial/review/send/enrollment artifacts preserve evidence.

At16:13:58.218Z guarded exact module retirement moved the service directory outside
watch folder, all3 hashes preserved, same epoch/idle/baselines and absent controls.
Retirement journal window has0 rows/0 model rows; this alone is not unload proof.
nativeUnloadObserved:false/hookAbsenceQualified:false. Other modules unchanged.
No permissions/auth/runtime/maintenance jobs changed. Do not reload or replay this
trial to manufacture current proof; active-byte reconciliation now refuses retirement.
This verifies two narrow admitted reads in one load, not production persistent
serving, full cross-harness integration, quiescence, guarded mutations or native
unload. Next address shared helper evidence retention for late reconciliation and
production service admission/enrollment/control integration. No human action required.

## October 7, 12:01 Eastern: native callback milestone

Autonomous negative gate refusal and one admitted native read are observed in the
original broker epoch. A follow-on private response channel settled its standard
request receipt and verified target identity without a model turn being requested.
Idempotent reconciliation preserves control history. The completed result module
is archived; native unload/absence remains unverified. These are narrow proofs,
not overall v2 completion. Current source pressure1/1 passed16:00Z; full cross-harness
qualification, generic serving/steering, safe mutations, residency/cold recovery,
distinct rollback and historical unknown effects remain open. Claude inference
checks are rejected by the weekly limit; Codex bridge changes remain parked.
See resume.md for exact evidence IDs/hashes and failed-reader-bound preservation.

## October 7, 10:54 Eastern checkpoint

Native mod activation is now observed: Taylor enabled session hot reloading and
the original probe command appeared and ran. Both original native attempts
failed before a returned MCP result and do not establish permission enforcement.
Their public MCP call signature was wrong; preserved failures do not count as
validation attempts for the corrected candidate.

Separate v0.4.0 uses the installed public call(server, tool, args) wrapper.
Corrected-wrapper tests cover exact native arguments, concurrent one-attempt
dispatch, foreign ownership and prior intent/report refusal. Full isolated
regression passed unchanged, and all 20 installed admission checks passed with
synthetic inputs. None proves corrected native execution, positive/negative
admission, sustained serving or unload. Exact corrected report remains absent.
Its next native step is the registered claude-driver-native-read-check command
in the existing claude-driver-broker session, once only. No live invocation
handle is known, so report absence is not a verified wait or failed attempt.

Full release remains unqualified: current-source serving and guarded mutations,
steering/handoff, distinct-build rollback, residency/cold recovery and settlement
of the 17 historical uncertain effects remain separate gates. Source-specific
historical passes below must not be promoted to present release evidence.
Scoped probe retirement requirements are in mechanical-native-route.md.

## October 7, 06:10 Eastern checkpoint

Actual owned Node worker-loss pressure passed on1bad0d6d: durable unknown outcome,
no idempotent replay, correct pending ownership and exact expiry cleanup with no
additional model turn/native process kill. Current4e1a391b MCP receipt
reconciliation recovered both original metadata results with zero inference and
no read replay, retaining the original unknown job and historical metadata label.
Final unchanged full suite passed in8418ms. Original stale-source idle-adoption
failure retained and independently reviewed; one safe refresh allowed only after
consumed older-source notice, never unresolved subscription debt. General
serving/guarded mutations/steering/handoff/rollback/cold recovery remain open.
See resume.md for exact artifacts, source boundaries and next frontier.

## October 7, 06:03 Eastern checkpoint

Actual three-case native cancellation pressure passed on e1b79a7d: cancellation
before publication, while queued and after publication; exact settings restored,
one diagnostic turn and no replay on reattachment. Current source adds bounded
batch phase/status and explicit zero-inference expired cleanup preserving the
original outcome. Full isolated suite passed unchanged in8401ms; live worker-loss
and cleanup qualification is next, not yet passed. General serving/mutations,
steering, handoff, rollback and cold recovery remain open. Exact evidence/source
boundaries are in resume.md.

## October 7, 05:51 Eastern checkpoint

Opt-in `broker_read_batch` now has actual current-source cross-harness native
proof: one durable idempotent job survives publisher exit, three requested
metadata reads coalesce into two native calls, exact attachment receipts and
fresh host finish gate completion, settings restore and late reattachment
returns the same completed job without replay. Native5130ms, one short trigger
turn, no model tool selection. Host77441d1d also passed its unchanged full
isolated suite. Original pinned-field validator failure remains failed with
independent native-success reconciliation. Missing native pinned stays unknown.
Cancellation/fault/expiry pressure and generic guarded mutation execution remain
open. Public metadata strategy does not narrow the full original goal.
Service-owned native idle observation survives harness exit with zero inference;
actual two-harness adoption passed earlier on2b8697ed. General-use serving,
steering, handoff and recovery are still unqualified. See resume.md for exact
artifact and source distinctions.

## October 7, 04:57 Eastern checkpoint

Native duplicate/failure pressure exposed incorrect diagnostic expectations:
identical hook definitions collapse within an event, while error attachments
can omit command. Original failed run remains failed with independent metadata
reconciliation. Event-only errors cannot prove a particular tool ran. Installed
26-case checks establish SessionStart/watch lifecycle and FileChanged's discarded
success output; activation alone cannot deliver a generic result transport.
Finalbdb7a0d3 passed the unchanged full isolated suite. The native edge probe ran
on a2cd9974, not the later collector. Generic mutation hooks remain unqualified.

## October 7, 04:44 Eastern checkpoint

Actual native direct Stop-hook get_session and a two-target metadata batch passed
with genuine CLI hook-result attachments, no assistant tool selection and exact
settings restoration. One short model turn triggered each event; no persistent
FileChanged or generic mutation route is qualified. Original export-observer
failure remains failed with independent native-success reconciliation. Later
cleanup/admission amendments passed the full isolated suite on5be50395, not a
new native pass. See resume.md for source-specific evidence and remaining gates.

## October 7, 04:21 Eastern checkpoint

The installed2.1.289 MCP hook runner, interpolation, file-watcher lifecycle and
SDK response filter passed18 isolated cases with synthetic dependencies, zero
inference and no native settings changes. A direct connected hook calls tools
without model selection, but settings alone do not activate a warm watcher,
duplicate events repeat calls, and default SDK result emission is limited.
No native hook dispatch/admission/result path is qualified or deployed. See
[mechanical-native-route.md](mechanical-native-route.md) for the actual proof and
native probe requirements. The existing peer contract still passes after sharing
the bounded extractor; current full isolated source suite also passes unchanged.

## October 7, 04:04 Eastern checkpoint

Final host46f09629 has a passing unchanged full isolated report
v2-2026-10-07T08-03-15-746Z.json. New native controls tests on earlier candidates
FAILED:74a753ea's concurrent effort and6d8c9bc4's restore both received compact2
but ended without tool calls. The follow-on batch was never reached. Earlier
read passes do not override these failures. Source/hook/dependency fingerprints
remain distinct; see resume.md for exact IDs/artifacts and pending dispositions.

Every live run now uses fresh128-bit reply tokens and exact native peer/terminal
ancestry, not old reply strings. Opt-in metadata includes hidden ancestors but
no hidden content. Controls-only modes record a separate narrow topic; they
cannot qualify full steering. Restore failures enter reporting/cleanup, and each
concurrent attempt retains its own request/status metadata. Cleanup distinguishes
an observed desired state from unresolved request outcomes. The first newly
introduced wrapper assertion failure and its misleading transient cleanup are
preserved alongside explicit later reconciliation. No native retry, keyboard
input, context reset, model/auth change or competing recovery occurred.

# Claude-driver v2 qualification

Latest audit: October15,19:37 Eastern. Overall qualification remains false.
Current source702a4b61 passes366 isolated checks and both filtered headless
harness contracts. The connected Codex-chat MCP loads6e0fd19f and reports
restartRequired:true; use fresh CLI/current filtered harness for engineering.
The native broker is offline; sealed generation6 remains intact but bound to
old PID71262. No current waiter, batch admission or residency proof exists.
Evidence: STATE_DIR/diagnostics/v2-requirements-audit-2026-10-15.json.

| Requirement | Current authoritative evidence | Remaining gate |
|---|---|---|
| Common CLI/MCP interface | Both current-source filtered Claude and configured Codex gpt-6-sol harness contracts pass | Current chat MCP reconnection; native desktop caller handback and Cursor authentication remain separate |
| Durable lifecycle | Synthetic detached-worker, idempotency, disconnect, wait and cancellation contracts pass | Current-source native recipient and effects under sustained use |
| Native delivery | Dedicated scratch2.1.299 composed durable direct receipt/DIRECT_ROUTE_OK and busy queue exact causal replies; ordinary next-priority gate qualified | Full send_message broker route, queue/steering and model compliance under load; no immediate/idle-control version promotion |
| Native controls | Historical control/mutation passes remain historical; current same-epoch stop guard covered synthetically | Current-source positive/negative native controls, concurrency and distinct-target batch |
| Native effect guard | Checkpoint/cancel/expiry and unknown-outcome synthetic boundaries pass | Current native cancellation/fault/timeout and independently applied effect readback |
| Uncertainty containment |449 requests:408 completed,10 failed,9 safely undispatched pure reads,22 unknown; unknowns stay unsafe to retry | Independent receipt/effect reconciliation before handoff; empty dispatch ledger is insufficient |
| Deployment and rollback | Sealed generation6 inventory passes read-only integrity through both state paths | Current native epoch admission, dependency receipts and distinct-build rollback; no repin/restart while unresolved |
| Mechanical quiet signal | Current isolated boundaries pass; historical continuation receipts retained | Current native helper execution, ancestry/expiry and reliable serving; receipt alone insufficient |
| Deterministic MCP hook/native-mod candidates | Source/admission tests pass; two failed native-mod reports reviewed and retained | Current loaded bytes, kernel epoch, event activation, duplicate/cancel admission, safe mutations and scoped unload |
| Residency and recovery | Migrated maintenance receipts now visible; current broker offline | Fresh current-epoch CronList plus app acknowledgment, natural governor pressure, cold recovery and native teardown |
| Detection and efficiency | Passive30s lifecycle LaunchAgent installed; zero-model unchanged ticks; four unresolved reports remain | Event-triggered Codex inference and sustained native serving latency/throughput; inbox watcher remains paused |
| Evidence and service memory | Fingerprinted pressure/harness artifacts; static native refusal reasons; per-hash reviews and shared candidate memory | Promote native claims only with independent current receipts; preserve reported versus verified failures |
| Human input scope | Quarantine retained; no keyboard injection, app restart, session kill or auth changes | Native resource teardown and separate physical-input qualification |
| Creation, pool and groups | Current one scratch import exists/focus restored; intended bypass mismatch correctly unverified; historical pool/group successes retained | Current-source complete create/pool/group suite and independently persisted settings/cleanup |

Current source evidence hashes and versions are recorded in the private audit.
The eleven input-free live-v2 gates remain unproven on the current release:
input-resource-audit-before; create-and-restore-focus; durable-submit-and-recipient-reply;
cancellation-before-native-dispatch; three-concurrent-native-controls;
batched-native-controls; queue-is-not-interrupt; interrupt-then-replacement-is-applied;
single-native-recipient-replies; cleanup-archive; input-resource-audit-after.
Taylor now authorizes routine scratch bridge qualification and Claude Desktop
restarts as needed; high-risk or definitively disruptive actions still require review. Residency's maintenance acknowledgment and
same-broker-survives-native-idle gates additionally require natural governor
pressure; absence of pressure cannot pass that requirement.

The following mechanism notes describe historical candidate/epoch evidence.
They do not override the current matrix above.

Installed hook7e388b8f keeps compact feedbackVersion2 enrolled and quiet disabled.
Historical hostc969 had later publication-failure handling, fully isolated-tested
and one actual5.458s foreground native read. Currentbdb7a0d3 has a passing full
isolated suite; narrow native direct-hook reads passed on earlier recorded
c743/bbb candidates. Generic mutation dispatch remains unqualified. Batched/concurrent native reads
passed on their recorded candidates. A30s expiry under native compaction remains
a failed serving case with independently verified late native gate denial. Active dependencies remain4af08654, generation6. These identities are
separate; an installed candidate or successful send is not full readiness.
The fixture is now archived, superseding earlier failed cleanup's current-state
claim; preserve the original failed/uncertain outcomes. No new fixture or model
change was used. Native trial read-only artifacts are listed in resume.md.

## Historical and broader mechanism evidence

| Requirement | Verified evidence | Practical limit |
|---|---|---|
| Common CLI/MCP interface | Actual Claude Haiku and Codex gpt-6.1-sol harnesses each passed ten filtered API checks | Cursor CLI needs human login; native desktop callers' handback not separately qualified |
| Durable ownership | Detached workers survive client disconnection; idempotent reattach creates one worker and one recipient reply; historical native submit returned in 9 ms | Submission latency differs from recipient response latency |
| Cancellation | Historical lock cancellation and new actual native denial after checkpoint; cancellation after dispatch:false once failed before the gate | Helper checkpoint absence cannot establish no effect; native mutations require reconciliation |
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

Exact owned stream-child disposition is now independently reviewed for
service d19dab280cc657366bd4dacbdf8d56ff: unchanged native epoch, exact command
and ancestor observations before retirement, SIGTERM143 exit542ms afterward
before child deadline, and fresh PID absence. This qualifies only that resource
disposition; general hook/environment unload, serving and release remain open.

Cancellation propagation through actual shared stdio MCP and the production read
transaction is verified with private fixture stores: before-publication cancellation
consumes no capacity; after one simulated send it preserves uncertainty/capacity,
cleans up once and never retries. Native effect cancellation remains unqualified.
