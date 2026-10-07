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

## Shared native service read transaction — October 7, 12:24 Eastern

broker_service_read {service_id, session_id, experimental:true, timeout_sec?}
now uses caller-held broker lock, bounded enrollment/ready/bytes/baseline/epoch
preflight, existing lifecycle enqueue and exact pickup, fresh presend validation,
one durable peer preparation and one delivery invocation. Bounded polling reviews
captured result and publishes standard receipt, returning settlement metadata only.
Finally cancellation preserves dispatched uncertainty; failures expose request ID
when published and never retry. No module installation, wake, restart or permission
change. Existing receiver must already be loaded and owned; retired trial refuses.
Tests cover successful ordering, abort before publication/after claim/presend,
uncertain send and missing-response deadline, each published request cancelled and
at most one send. Full pressure v2-2026-10-07T16-23-00-440Z passed1/1
in8575ms, sourceChanged:false. Source path not yet actual-native verified; next
fresh guarded enrollment and public shared operation trial, preserving old trial.
Broad v2 goal and native unload proof remain open; no human action required.

## Host native service admission candidate — October 7, 12:22 Eastern

admitNativeServiceRead pure preflight verifies exact owned readiness, idle native
epoch, sealed pinned integrity/build, installed versions, fixed baseline/module
hash sets and absent STOP/arms before returning one get_session target and bounded
expiry. Timeout1..60s clipped to service deadline; less than1s remaining refuses.
No evidence mutation, queue claim, delivery or release authority. Prepublication
refusal is retrySafe only because no request was enqueued; do not apply that flag
to later uncertain sends. Caller must hold broker lock and freshly revalidate at
publication/delivery boundaries. Tests cover success/expiry clipping, busy/reused
PID/start, corrupt bytes/baseline, controls, wrong version/target and deadline.
Full pressure v2-2026-10-07T16-21-28-122Z passed1/1 in11332ms,
sourceChanged:false. Not yet wired to public request submission or installed.
Next connect preflight to enrollment reader, serialized lifecycle enqueue/claim,
one durable prepared delivery, bounded response wait and cancellation/reconciliation.
No human action required; Codex bridge/1Password remain separate.

## Receiver STOP and diagnostic interlock — October 7, 12:21 Eastern

Reusable receiver source checks STOP, stop-rescue-arm.json and mechanical-probe.json
before writing intent/checkpoint and again after checkpoint before MCP read. Owned
triggers are consumed as service-read-stopped; controls are never cleared, retries
remain one-use refused and no model input is queued. This supplements rather than
replaces the authoritative native admission gate; races after the check remain
subject to gate validation. Tests cover each control already present and appearing
while checkpoint runs, proving0 MCP calls and unchanged control ownership.
Full pressure v2-2026-10-07T16-20-23-692Z passed1/1 in8600ms,
sourceChanged:false. Source only, not installed/native-validated this revision.
Historical native serving trial remains separate. Host production queue/enrollment,
release handoff, native unload/absence and broader steering still require work.

## Native receiver concurrency and expiry boundary — October 7, 12:19 Eastern

Receiver now reserves a single active callback before awaits. A different concurrent
owned request is consumed as service-read-busy and one-use reserved; it cannot
replace shared checkpoint during native read or become model input. Host must
serialize admitted sends; busy consumption never authorizes automatic replay.
Tests hold checkpoint in flight while a second request arrives and prove only
one checkpoint/read, duplicate refusal and no queue. Another test advances clock
past service deadline after checkpoint, proving no MCP call and no retry.
Full pressure v2-2026-10-07T16-18-35-448Z passed1/1 in9241ms, sourceChanged:false.
Installed native validator accepted updated generated bytes; staged only, no load
or sends. Historical two-read native trial bytes remain preserved separately and
are not evidence of this new guard. Production queue/enrollment/control integration,
scoped native unload, release handoff and full cross-harness qualification remain.

## Late checkpoint reader verified — October 7, 12:18 Eastern

readNativeCompletedCheck selects exact request/index0/generation retained evidence
and reports request-scoped vs legacy-shared source. Shared fallback only when
scoped record is absent; linked/unavailable, malformed, oversized, wrong request,
wrong generation or noncompleted evidence refuses. Reusable reconciliation uses
this reader and reports checkpointSource in metadata. Existing admission review
still independently checks pointer/build/bootstrap/ancestry/slot and result target.
Synthetic filesystem test publishes first retained checkpoint, overwrites shared
entry with second request, then verifies first remains usable. Exact legacy path
and corrupt-presence refusal proved. Full pressure
v2-2026-10-07T16-17-29-784Z passed1/1 in19919ms, sourceChanged:false.
Source only; no live release/permissions/module change or native send. Safe handoff
still constrained by unresolved historical effects and maintenance proof; do not
force release to deploy retention. Next service ownership/admission/control integration
can continue independently of that handoff and native unload investigation.

## Per-request completed checkpoint retention candidate — October 7, 12:17 Eastern

Source sealed bootstrap now retains broker-check-<request>-<index>-g<generation>
.completed.json in addition to shared entry. Atomic hard-link publication refuses
unsafe IDs/index/generation, symlinks and conflicting records. Legitimate nested
cached/direct bootstrap completion preserves the earliest identical observation
(ignore only a later at timestamp), retaining all other identity/ancestry fields.
Selection is never retained as completion; retention never creates dispatch or
native admission. Reusable host reconciliation prefers exact generation-scoped
record, refuses corrupt presence and falls back only on absence for legacy runtime.

Initial full pressure16:15:22 failed on duplicate nested completion; preserved.
Focused release retry also failed before correction. Corrected retention full
pressure v2-2026-10-07T16-16-17-716Z passed1/1 in9107ms, sourceChanged:false;
final host reader integration focused tests passed. Live sealed runtime unchanged;
this retention requires a separately qualified safe deployment, not in-place edits.
Legacy running runtime still needs immediate settlement/snapshot before next helper.
Native unload and production service integration remain open. No human action needed.

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

## Host reusable result reconciliation — October 7, 12:13 Eastern

reconcileNativeServiceResult(serviceId, requestId) reads bounded no-follow enrollment
and native evidence, regenerates loaded module bytes, verifies original broker
PID/start/build/version and both baseline hashes, then reviews per-request evidence
under the request lock. Publishes one native-peer-service-result lifecycle receipt;
identical receipts are idempotent, conflicting receipts refuse. Destination must
be the exact owned broker results path, including when host state env is overridden.
Control history remains unchanged; missing/changed/retired module refuses. Errors
are sanitized so JSON parser detail cannot leak private content. No sends/replays.
Shared broker_service_result_reconcile operation requires explicit experimental
opt-in and returns metadata only. Contract tests cover invalid IDs/missing enrollment
and sanitize failures. Full pressure v2-2026-10-07T16-12-30-619Z passed1/1
in10123ms, sourceChanged:false; final destination guard focused tests pass.
No native install this turn. Actual two successive admitted reads through one
loaded receiver and idempotent publication are next; settle each before another
request replaces shared helper entry. Native unload and broad v2 controls remain
unqualified. No human action required.

## Reusable receiver per-request evidence review — October 7, 12:12 Eastern

screenNativeServiceResult now correlates exact service readiness/intent/result
schemas with one protocol7 get_session request, sealed native helper ancestry,
pointer generation/bootstrap, consumed native admission and dispatched slot.
Reuses screenNativePeerAdmission and exact metadata payload screening through
in-memory structural adapters; no report artifact or control history is fabricated.
ReceiptVerified means correlated evidence only, standardLifecycleSettlementAssessed
remainsfalse until host publication. Native error payload returns a failed result.
Late historical review after service expiry is permitted if the response arrived
inside both request/service deadlines; this does not authorize new dispatch.
Tests prove evidence unchanged, successful/error outcomes, foreign/ambiguous/late
responses, overwritten helper identity, admission generation drift and missing slot
refusal. Full pressure v2-2026-10-07T16-11-15-037Z passed1/1 in9303ms,
sourceChanged:false. SOURCE ONLY, no module install/native sends this turn.
Next host enrollment/owned byte+epoch checks and locked standard receipt publication,
then actual successive reads through one receiver load. Before each next read,
settle/snapshot its predecessor because sealed broker-check entry is shared.

## Native service readiness and validator — October 7, 12:10 Eastern

Reusable candidate records owned session.start readiness once, with fixed build,
service identity, window/capacity and zero native/model calls. Host screen rejects
foreign identity/build, extra keys, malformed chronology, future or expired proof
and call-count drift. Readiness remains distinct from live epoch verification,
serving, admission, result receipt and quiescence.
Installed Claude plugin validator accepted generated receiver bytes (app2.26454.0,
CLI2.1.289). Private staged package and validation record preserved at
pressure/native-service-stage-8dd77b889f8bd2f84e6c4eb1c7a523ff; not installed or
loaded, no sends. Five focused service tests pass; full pressure
v2-2026-10-07T16-09-42-489Z passed1/1 in8489ms, sourceChanged:false.
Next integrate per-request evidence and lifecycle result publication, then guarded
actual successive reads in one native load. No human action required. Expired
validation enrollment must not be used for dispatch; generate fresh owned window.

## Reusable native receiver candidate — October 7, 12:09 Eastern

buildNativePeerServicePackage now emits one bounded receiver for multiple exact
rpeer request IDs, reusing the sealed broker-check checkpoint and public native
MCP call. Fixed owned broker/build/token, maximum128 attempts and one-hour lifetime;
peer input can supply only request identity. Target/op come from sealed checkpoint.
Every owned-prefix peer trigger is consumed even malformed/refused, and attempt
reservation precedes awaits. Durable intent prevents reload replay after missing
result. Native result remains private; no standard receipt publication yet.
Synthetic tests prove two distinct reads through one receiver, concurrent duplicate
suppression, capacity refusal, human-input pass-through, durable reload protection,
cancelled/expired/wrong-operation/malformed checkpoint refusal and generation bounds.
Full pressure v2-2026-10-07T16-08-30-238Z passed1/1 in8460ms, sourceChanged:false.
SOURCE CANDIDATE ONLY: not native-validated, installed or loaded. Still needs owned
readiness/epoch evidence, request enrollment and result reconciliation integration,
actual successive reads, native expiry/unload proof and complete service controls.
Do not count candidate tests as native persistent-serving qualification.

## Callback metadata identity checked — October 7, 12:07 Eastern

Result screening now requires successful get_session content to parse as an
object describing the exact admitted target sessionId, with boolean isArchived
and isRunning and boolean pinned when present. This matches existing native batch
metadata semantics; transport success or an envelope target label alone cannot
settle a foreign response. Native error content still settles as failed rather
than being misclassified as successful metadata. Tests cover foreign/malformed
payloads and text blocks split at a JSON whitespace boundary.
Historical captured89c94ec9 payload privately passes this stricter contract;
no fresh admission assessed, no replay or retired module reload. Full pressure
v2-2026-10-07T16-06-50-655Z passed1/1 in8444ms, sourceChanged:false. This closes a
result validation gap; persistent service integration and native unload proof
remain open and are not implied by this check.

## Shared callback settlement interface — October 7, 12:05 Eastern

Shared OPS now exposes broker_peer_result_reconcile {id, experimental:true} to
CLI/MCP callers. It publishes only a verified existing captured native result;
no send, execution, replay, module installation or permission change. Marked
readOnly:false because it publishes a local lifecycle receipt. Retired modules
remain refused; do not reload the retired successful enrollment to retest.
Pure result screening now rejects missing inputs and invalid time bounds cleanly.
Contract tests prove opt-in and invalid enrollment refusal before evidence access.
Full pressure v2-2026-10-07T16-05-24-105Z passed1/1 in8560ms, sourceChanged:false.
Guide updated. Persistent reusable serving and native unload proof remain open;
this interface alone does not qualify either or complete the broad v2 goal.

## Native callback lifecycle receipt settled — October 7, 12:01 Eastern

Result-channel enrollment89c94ec9-32c9-466d-8313-5c4ddfe9439f passed native validator
and ran one admitted read through existing lifecycle exact claim and sealed native
check. ReportSHAd4e34786b715e9aa096911535a75719f8812fa38918219d1f85d4e303f953316
records nativeCallReturned:true/resultWasError:false. Private callback result file
is1192 bytes, one text block; parsed sessionId matches exact intended fixture.
No private native content entered the diagnostic report/transcript.

New buildNativePeerResultPackage preserves v0.6 builder and adds v0.7 local response
capture. screenNativePeerResult refuses identity/chronology/content/admission drift.
reconcileNativePeerResult performs bounded no-follow owned evidence reads, verifies
copied/generated bytes, native epoch/runtime/baseline and exact helper/admission,
then publishes one standard native result under request lock. Initial review used
an invalid262144 reader bound; preserved failure, corrected65536, reused captured
response without replay. First publish completed; second returned published:false.
inspectRequest now state:completed, receiptVerified:true, retrySafe:false; historical
controlState:outcome_unknown remains unchanged. The admission screen separately
reports standardLifecycleSettlementAssessed:false; review adds actual lifecycle.
CLI native-peer-result-reconcile.mjs accepts one exact UUID and never sends/replays.

Full pressure v2-2026-10-07T15-57-00-583Z passed1/1 in8430ms before native trial.
Final response/review integration full pressure v2-2026-10-07T15-59-50-974Z passed
1/1 in8473ms, sourceChanged:false. Synthetic successful/error tool responses and
forged/malformed evidence paths pass. Shared service memory records narrow result.

Reviewed evidence snapshot native-peer-independent-review-89c94ec9...json preserved
before retirement. Exact result module moved atomically outside watched directory
to pressure/native-peer-retired-89c94ec9...; all3 hashes preserved, broker epoch and
settings/policy unchanged, no armed controls. Retirement record deliberately says
nativeUnloadObserved:false/hookAbsenceQualified:false. Other modules untouched.
After retirement current-source probe review/reconciliation refuses absent active
copied bytes; use preserved review for historical proof, standard inspectRequest
for settled receipt. Do not reload or resend to manufacture current-state proof.
Native unload/absence observation and generic persistent service integration remain
next; broad cross-harness steering/residency/rollback/unknown-effects audit stays open.

## Admitted native read returned — October 7, 11:54 Eastern

Actual enrollment5dfe5ee5-ead7-47d9-90bd-29316a9d803a used a distinct admitted
module, passed installed validator and produced owned readiness. Host lifecycle
API enqueue + pickupPending({requestId}) claimed only rpeer5dfe5ee5ead747d990bd29316a9d803a
under broker lock. Native mod called public $.tool.call({tool:"Bash",command,...})
with exact sealed broker-check helper, then positional native MCP get_session.
No runtime, settings, policy or permissions changed; no general waiter needed.
Helper completed with nativeBinding ancestorVerified:true, original PID71262/start,
build4af08654 and generation6. Actual native-admission-rpeer...-0.json records
one plugin toolUseId at15:49:31.170Z; report started15:49:30.908Z, completed
15:49:31.181Z, nativeCallReturned:true, resultWasError:false, modelCallsRequested:0.
Exact report SHAd5d0ceb501b2731204a507ab8ee7c198c751386ba85825ceac4741298ee91d59.
Native journal has no new model-turn rows for this callback; do not invent native
journal receipts. Standard lifecycle control is outcome_unknown/dispatched[0]
after cleanup cancellation; do not rewrite it as completed from report alone.

Read-only review supports exact admitted module/config/source bytes and correlates
request, completed helper, native admission, report and current runtime pointer
(generation/bootstrap/activation/epoch). Legacy sealed helper lacks index; unique
single read matches existing gate semantics, while ambiguous batches still refuse.
It yields singleReadAdmissionObserved:true but standardLifecycleSettled:false,
nativeGateQualified:false, releaseAuthorized:false. Independent private review
and shared service recordMemory preserve narrow observed success.

Installed public tool wrapper executed with synthetic input proves object API;
generated admitted-package tests refuse denied/malformed/wrong-target/extra-key
checkpoint output before read and consume retries. Full pressure
v2-2026-10-07T15-48-51-105Z passed1/1 in8570ms before native trial;
v2-2026-10-07T15-53-10-841Z passed1/1 in8326ms after review integration,
sourceChanged:false. Final pointer-correlation refinement passed focused tests
and actual review. Native scoped unload/absence proof remains next, alongside
safe result channel integration; modules are passive one-use, not retired yet.
Do not replay the prior token/request or weaken the existing dispatch gate.

## Exact service pickup candidate — October 7, 11:46 Eastern

Previous turn was progress: autonomous native read reached verified dispatch
refusal. Existing admission requires completed sealed broker-check helper,
ancestor-bound native process, one exact operation/args and atomic native use.
Do not fabricate entry/control files or loosen gate to qualify positive read.

Candidate pickupPending({requestId}) now filters before metadata/read/claim,
retaining existing lock/cancellation/expiry handling. broker-wait accepts exact
--request-id plus bounded --max-sec. Stop hook command adaptation admits only
fixed-order exact request selector and1..60s budget, preserves them when redirecting
to sealed source and forbids them for broker-check. Focused concurrency and actual
waiter-process tests prove foreign pending/expired work untouched and malformed
identity rejected before pickup. Existing adapter/gate tests pass. Full pressure
v2-2026-10-07T15-45-51-623Z passed1/1 in8581ms, sourceChanged:false.
This is SOURCE ONLY, not active runtime deployment. Native Bash API wrapper must
be independently verified before composing mod waiter/check/read. A safe sealed
handoff is needed for the new waiter selector; do not mutate pinned bytes or live
policy in place. Broad v2 serving, steering, residency/rollback and cleanup still
need their independent evidence. Claude inference remains rate-limited; native
non-inference work can continue without Taylor.

## Autonomous native execution observed — October 7, 11:42 Eastern

Corrected enrollment12c9eac8-1ed4-4d6c-a155-085ded4fe78f produced readiness,
one prepared direct delivery, durable intent and completed report. Exact report
SHA28aef26fa05e6870a95592b8519eec5a1f33114c58ce2e280ec0808d03866e57.
Read-only review passes exact epoch, sealed runtime, versions, baseline/copied
hashes and absent controls. Report nativeCallReturned:false and fixed category
broker-dispatch-gate-refusal. Independently read exact live policy script:
its SHA matches policy and its PreToolUse denial contains the exact categorized
checkpoint-refusal text. This is evidence of native pipeline refusal without
an authorized dispatch checkpoint, not positive execution or overall gate
qualification; all report qualification flags stay false. Do not weaken gate.
Next: integrate the peer probe with existing legitimate service dispatch admission
rather than fabricate checkpoint files; prove allowed read and scoped cleanup.
No human slash invocation was required for this native probe run.

Prior2b4f992a expired with absent intent/report and exact token journal queued;
private expiry record preserves model-attempt uncertainty and prohibits replay.
Detector113429 SHA351cf62d8bd2fef1832ade06f571405cb6070547d0800b557551c96832dbce49
references rmuy9ph4h-68adc1: control now expired, dispatched[]; result cancelled.
Detector113531 SHAb450a493c1318bf3561ba694519e8e510e9c1659e9ac4ab2f27d12d52ffbbda0
same PID/start live: historical liveness-returned means cleared work, no restart.
Existing source fix already distinguishes that transition. No recovery wake.

## Peer envelope mismatch corrected — October 7, 11:40 Eastern

Fresh enrollment2b4f992a-3c57-4e7e-b9d8-4b2653780311 passed installed validator,
produced native readiness and had one prepared direct delivery. Owned journal
correlates exact private token to queue-operation15:35:38.621Z and user15:35:38.633Z.
No durable native intent or report appeared. This delivery passed to the queue;
transport return did not qualify native execution. Preserve send evidence and
never resend this token. Do not claim zero model attempts from configured zero.
Installed xkn retains envelopes without hopChain; receive adapter previously
compared bare token only. Candidate now accepts only its exact direct transport
wrapper in addition to bare token, and refuses changed sender/mode/suffix.
Focused adapter/package/installed-envelope tests pass. Installed old module has
not been replaced by corrected bytes yet; reconcile expiry before new identity.

Pressure v2-2026-10-07T15-38-55-755Z failed4/5, unchanged source: native-idle
post-publication cancellation fixture sometimes cancelled during lock acquisition.
Fixture now starts cancellation after publication and gives deadline/mailbox
adequate separation. All8 focused idle tests pass. Full unchanged-source rerun
v2-2026-10-07T15-39-39-141Z passed1/1. Preserve failed run as evidence.

## Detector overlap reconciled — October 7, 11:30 Eastern

Follow-up report112944 SHAa3a407fd74f8a18830187a3f0244e529bfbdf8065fb50379ab1499a97564db77
labels live state liveness-returned, but same PID/start and expired unclaimed work
prove no process recovery in this episode. Candidate detectorTransition now uses
unserved-work-cleared for this transition and observation-restored for other
non-offline faults; only prior offline earns liveness-returned. Focused detector
tests pass. This source change is not activation proof for the running detector;
historical reports retain their original reason and are independently interpreted.

New detector report claude-detector-20261007T112812-0400-627e54fa0a32-5a4a3176
SHA30ef7eb73a1f516406c79deaf99edb495151e3d3d3379f62c98480a3b2e50d76
records idle unclaimed request rmuy9hkls-33c367 in original PID71262/start epoch.
Current detector source requires pending/unexpired/unclaimed control older than
15s for this observation. Exact request created15:27:46.579Z, expiry1791386954381;
control and result now expired, control dispatched:[]; original broker still
live and idle. This is a serving failure observation, not crash/readiness proof.
Recovery not attempted by detector; no duplicate observer wake performed.
New peer preparation saw a transient armed control and stopped before replacement
or send; only a private validated staging package was produced. Preserve that
refusal rather than treating disappearing control as evidence it never existed.

## Current filtered harness evidence — October 7, 11:28 Eastern

Claude synthetic filtered run15:26:38 completed all nine workflow/config checks
but FAILED unchanged-source: review command was edited during execution. Preserve
harness-v2-claude-2026-10-07T15-26-38-816Z.json as failed, not a current-source pass.
After checkpointing, unchanged-source rerun15:27:48 was rejected before fixture
calls by native rate_limit_event, seven_day utilization1 and status rejected.
Reset1791709200 is October11,05:00 Eastern. Preserve its failed report. No further
Claude inference retry while rejected. Runner now distinguishes harness_rate_limited
from generic contract failure using the native event, not guessed stderr text.
Busy original broker epoch still prevents an immediate native trigger; zero-
inference source/evidence work remains available. Codex bridge fixes stay parked.

## Autonomous trigger route — October 7, 11:09 Eastern

Read-only native-peer-probe-review.mjs <exact UUID> now combines bounded
no-follow evidence reads, fixed path/configuration validation, regenerated staged
module hashes, readiness/intent/report chronology and native epoch/settings/
inventory/controls checks. Missing report returns pending:false before state
inspection. Strict screen tests pass; reports remain unacknowledged and all
qualification flags false pending independent native review. Expired enrollment
is reconciled privately with no send/intent/report, same epoch; broker remains
busy. Do not start a fresh enrollment until idle admission is available.

Native enrollment ea986488-1b62-4f3d-9b45-7b165d8506a5 was copied passively.
Initial native validator rejected $ passed to factory-returned run; failed bytes
are preserved privately. Flattened top-level runReadProbe passes actual installed
validator and generated-byte tests; same epoch/settings hashes checked before
replacement. Exact native readiness arrived at15:19:10.389Z, zero native/model
calls. Attempted delivery preflight then found original broker PID71262 busy and
refused BEFORE any send preparation or bytes. Private admission-refusal evidence
records absent intent/report/send, fixed deadline1791386548847. No trigger was
sent, no native read occurred, no permission gate qualified. Do not extend or
replay this enrollment; reconcile expiry before preparing a distinct attempt.

Follow-on staged enrollment composes receive.js and probe.js. Owned session.start
writes a fixed readiness receipt only once and requests zero native/model calls.
Durable probe records intent before exact positional get_session, refuses prior
intent/report, rechecks deadline after intent write, preserves uncertain outcomes
and emits no private tool/error content. Recognized identity/clock/run failures
remain consumed. Six focused checks pass; full pressure round passed in8435ms,
sourceChanged:false, v2-2026-10-07T15-15-19-694Z.json. Readiness is not permission
or execution qualification. Nothing has been installed or sent. Native bundling,
exact epoch/load evidence and independent result screening remain next.
GitHub repeatedly rejects master pushes with Internal Server Error; candidate
commits remain local until push succeeds. This does not require Taylor to act.

The manual slash-command step is not established as requiring a person.
Installed peer receiver ze explicitly sets skipSlashCommands:true, so sending
the slash text cannot invoke the registered command. Before queueing it calls
session.receive; a consumed mod delivery returns before the prompt queue.
Exact installed receiver test covers both branches with synthetic dependencies.
Initial test omitted Rm in its harness and failed; corrected harness passes.

Staged candidates/native-peer-trigger/receive.js supplies an exact 128-bit token,
peer-only origin, owner/directory/deadline checks and one-use consumption.
Two focused tests pass, including concurrent delivery and unrelated message
pass-through. No installation, native delivery or model turn occurred. This
route is a candidate for autonomous execution, not native qualification; next
integrate durable intent/report and exact loaded-state evidence before delivery.
Earlier blocked status depended on a chosen manual path, not proved human need.

## Regression and admission checks — October 7, 10:54 Eastern

Full pressure-v2 round passed in 8346ms with sourceChanged:false; evidence is
v2-2026-10-07T14-53-54-252Z.json under the private pressure directory.
Installed admission contract passed all 20 checks on runtime19ff7f54. These
exercise installed adapters with synthetic hook/session dependencies, not live
gate execution. Its original staged-candidate checks cover lifecycle behavior;
they do not validate the corrected public MCP signature. The separate v0.4.0
installed-wrapper test provides that synthetic coverage. Native hook ordering,
actual admission and scoped unload remain unqualified. Corrected report screen
still returns pending:false; this is pre-invocation absence, not a failed attempt
or a live execution wait. Neither of the first two attempts counts toward the
corrected API probe's validation.

## Concrete public API bug corrected — October 7, 10:50 Eastern

Installed public wrapper gk takes call(server, tool, args), not the single object
accepted by internal ZOt. Both v0.2.0/v0.3.0 candidates used the wrong public
signature. Exact wrapper reproduction shows their object becomes server and tool
becomes undefined. Earlier synthetic tests skipped this wrapper; failure retained.
No native gate denial is proved by either attempt. Runtime transport preserves
error.message in a fixed object, so error wrapping is not established as cause.

Separate desktop-bridge-native-api-probe v0.4.0 now uses positional API with ID
7a8c9749-49fc-4894-9756-5f321bcc7c77 and command claude-driver-native-read-check.
Installed in already-consented broker mod folder exclusively; original candidates
and durable intents untouched. Registration has no automatic effects. New exact
installed-wrapper/candidate concurrency test passes; ten adapter checks pass on
4880f4d3 at14:50:33. CLI validator passes (author metadata warning only). Its strict
native-mod-api-probe-review.mjs returns pending:false until new evidence arrives.
Native menu/load proof and corrected command execution remain pending. No claim
of gate enforcement, release or completion. Taylor invokes once only if the new
command appears in native slash menu, same claude-driver-broker chat.

## Installed binding contract — October 7, 10:48 Eastern

Previous turn was progress (new diagnostic receipt and missing refusal branch).
Exact installed Hu guard now runs in synthetic contract: unbound throws before
native dispatch and bound identity is retained. All nine adapter checks passed
14:48:31, hostac1dd7aa. No native error cause is inferred from that reproduction.
Both completed native attempts remain non-retryable; no active wait handle or
pending user command is invented. Continue source/error-transport investigation;
do not count pre-invocation absence checks as post-attempt blockers.

## New diagnostic evidence — October 7, 10:44 Eastern

Taylor invoked the v0.3.0 registered native command. Report SHA256
76adade8908b64c379fdacab36a820b0e9bab5be64b578da81cf438b9246dbbf passes
strict report/intent/copy/metadata/runtime/settings checks. Started14:44:45.573Z,
ended14:44:45.574Z, MCP did not return; failureCategory unidentified-exception.
No assistant record occurs in the exact command execution interval. Screenshot
and report do NOT prove gate denial; the broker assistant's claim is unsupported.
The prior pre-invocation absence checks do not count against this attempt, as
Taylor explicitly corrected. This is progress, not a blocked turn.

Installed bound-session guard Hu has another known exception path: no session
bound in process, absent from the v0.3.0 category matcher. Prepared helper now
handles this exact message plus primitive string rejections and unavailable
MCP API. Focused tests cover these forms. Live v0.3.0 is untouched, preserving
its hashes and exhausted intent. This source finding is not proof of the native
cause. Both reports remain pending until original denial/error evidence can be
bound; no repeated invocation, permission change or release. Next investigate
native error transport before designing any further explicit attempt.

## Blocked audit — distinct diagnostic outcome absent

Three consecutive goal continuations checked the exact v0.3.0 report through
native-mod-diagnostic-review.mjs; all returned pending:false. These turns are
NO PROGRESS, not verified waits: no active diagnostic execution handle is known.
The pending human slash-command request in claude-driver-broker remains the
next native step. No original probe replay, duplicate wake or new command send
was attempted. Mark goal blocked until actual invocation/registration failure
or a new exact report arrives. All preparation/tests are checkpointed; bridge
release, actual permission gate and scoped unload remain unqualified.

## Diagnostic report screen ready — October 7

Previous turn was progress (distinct candidate installed). Current turn adds
native-mod-diagnostic-review.mjs, reusing bounded no-follow reader and exact
schema/state screen with a fixed v0.3.0 experiment. No report is present yet;
review returns pending:false without native inspection or writes. Eleven focused
checks pass, covering old schema compatibility and new category/hash/identity/
intent/extra-field refusals. No native load, gate, model or unload qualification
is inferred. Existing report stays unresolved and original intent preserved.
Use this exact screen upon new diagnostic report before independent native
review. Do not repeat the pending human command request or invoke it as text.

## Distinct adapter diagnostic installed — October 7

Previous turn was progress (fixed private diagnostics and adapter checks).
Separate desktop-bridge-native-diagnostic v0.3.0 is now copied exclusively into
the already-consented owned broker dev-mod folder. It registers only
claude-driver-native-read-diagnostic; no automatic MCP/model/timer activity.
Probe ID94701894-fc71-4dfa-943e-f5a1cc3fc8b8 has distinct intent/report paths.
Original v0.2.0 bytes and intent were untouched; no original attempt replay.
Three focused tests pass: fixed private categories, passive registration with
concurrent one-attempt bound, and foreign/prior/write-failure refusal. Installed
CLI plugin validate passes with author-attribution warning only.
Copied hashes: manifest3c7204482709c2db48151475e82f44d0dd8af2c53061acc5554b0fce2e6c3ea7,
hooks448e29b17c4ce3ee767d3caf0ff9e35b5501b1cfb3b59952e7b7625744bbf070,
module409fe3a6a4207e7a7ec9a2f29d4440425c7b1ce1e650896b2b9dd3908873959e.
Copy is not load proof. Taylor should invoke once ONLY if it appears as a native
slash command in the same claude-driver-broker chat. Categories retain false
gateQualified/releaseAuthorized and require independent denial ancestry.
Next review distinct bounded report with exact schema/hash, owned command
journal, settings/runtime/fixture checks; preserve original unresolved report.

## Diagnostic preparation — October 7, 10:39 Eastern

Previous goal turn was progress: native local command evidence changed the
frontier from activation to adapter failure. Current installed adapter contract
passed all eight checks at14:39:28 on hostc235c5cf/app2.26454.0/CLI2.1.289.
The pipeline has multiple exception paths before/after permission evaluation.
Prepared candidates/native-mod-probe/diagnostic-failure.js maps exact adapter
protocol error fragments to fixed sanitized categories; synthetic privacy and
hostile-getter checks pass. It is not imported by the live probe and changes
neither existing bytes nor repeat protection. Original report remains pending.
Next integrate a distinct bounded diagnostic identity and strict report schema,
qualify it synthetically, then establish exact supported invocation without
replaying the original probe. A category alone remains weaker than original
native denial ancestry and must never automatically qualify release.

## Latest frontier — native slash command executed October 7, 10:37 Eastern

Taylor approved hot reload and invoked the registered command once. Owned native
journal records session-local dev-mod consent, human command ancestry and a
local_command result at 14:37:06.863Z, CLI 2.1.289, expected broker cwd/UUID.
No assistant record exists in that execution interval. Screening binds report
SHA256 790b4c221d0c82e196d58978160c58083fbf201a09286d4c36470acb877194ca;
report/intent consistency, copied hashes, original runtime/settings/source and
same metadata epoch pass. Kernel PID 71262 remains the original October 6
23:24:51 Eastern process. Native command registration/execution is demonstrated.

MCP call threw in 2ms; nativeCallReturned:false. Its exception is deliberately
suppressed, and there is no original gate-denial witness in the command journal.
Do NOT infer PreToolUse coverage: adapter source also rejects missing/unbound
MCP tools before permission evaluation. Permission-gate qualification and scoped
unload remain open. Report stays pending with this durable blocker; preserve
intent and never repeat this probe ID. No live code/settings/process changes.
Next autonomous work: locate bounded original adapter/denial evidence, or prepare
a distinct diagnostic with fixed sanitized failure categories before a new
explicit attempt. Taylor need not send anything again while this is investigated.

## Latest frontier — copied probe, registration investigation

Taylor completed installation in the owned broker. Three installed probe files
match the prepared candidate hashes, but the slash command is absent. The owned
installation journal shows no loader consent/reload result. Earlier absent-file
blocker entries below are historical and superseded.

Installed CLI 2.1.289 expansion of `${CLAUDE_DEV_MODS_DIR}` calls Fo(), activating
the warm watcher. The hard-coded bootstrap omitted plugin-authoring skill
loading. This is a supported activation hypothesis; live refusal cause remains
unproven. Corrected scoped recovery prompt is in native-mod-bootstrap-prompt.md.
No live files, permissions, consent state, apps or session processes changed.
Next: supported skill activation plus identical-byte native save, human-only
consent if offered; independently verify load and slash registration before
probe invocation. Preserve failures; no model fallback or repeated probe.

## Latest frontier — October 7, 06:45 Eastern — native activation blocker

Three consecutive goal turns have now revalidated the SAME genuine blocker:
Taylor's required person-only scoped native mod activation remains pending.
Exact destination, intent and completed report are absent; review helper returns
pending:false. No active probe handle exists. These turns are NO PROGRESS, not
verified waits; private pressure/native-mod-activation-blocker-audit.json records
the three checks. Mark the goal blocked after this checkpoint is committed/pushed.
No further bridge work can qualify the native route without that human action.

The async request and [prepared prompt](native-mod-bootstrap-prompt.md) already
cover the needed action in the existing claude-driver-broker chat. Do not repeat
the ask, impersonate consent, send another wake or invent static work to avoid
the blocked state. Source checkpoint6958c8c and final hostc235c5cf remain validated;
this checkpoint changes documentation only. Nothing is complete or released.

On actual user completion/new exact evidence, revalidate the native epoch/app/
settings/candidate copies, run the bounded screening helper and independently
verify loaded plugin, native gate/model/command/fixture/unload. Preserve all
uncertain effects. Watcher/observer recovery ownership and input quarantine remain
unchanged; this is a blocker, not a user-requested pause. Codex-driver/1Password
stay separate. A later explicit resume starts a fresh blocked audit.

## Previous frontier — October 7, 06:43 Eastern

Goal ACTIVE. Previous turn and this turn made progress. Human native activation
is still pending; no exact probe report has arrived. Existing legacy detector
reports remain pending with their prior blockers, without repeated content review.
No plugin copy/load/wake/model call, native session effect or report acknowledgment.

New scripts/native-mod-probe-review.mjs performs zero-inference bounded screening
for ONLY the fixed staged probe's new/changed report. If absent/already acknowledged,
it returns pending:false without source/native inspection or writes. It can locate
that report beyond the generic first32 window without consuming older reports.
If pending, it binds the scanned SHA256, strict allowlisted report/intent schema,
fixed IDs/paths/times, candidate/copied hashes, reviewed versions, original native
metadata epoch/runtime/settings/policy and control-marker state. Unknown marker
access never means absent. No raw report/error/result/instructions leave the helper.

Screening eligibility is NOT qualification: actual loaded bytes, kernel epoch,
command ancestry/native gate/model events/fixture readback/scoped unload remain
explicitly unproven. The helper never acknowledges a report, treats its content
as authority, dispatches tools or releases anything. New bounded reader refuses
symlinks, directories, invalid bounds, oversized/changed content and unknown IO.

Seven new screening/host-boundary tests passed in the full unchanged suite
v2-2026-10-07T10-42-38-642Z.json,8305ms. Final host fingerprint
c235c5cfc1db5f4f2465515e1955217cdac95e9de1e56152c97bafee7fb34210.
Twenty admission/candidate and eight installed adapter checks passed SAME source
10:42:51. Staged package v0.2.0/register3a7b1e8c unchanged; prior static validation
remains bound to its identical three hashes. All tests are isolated, no native load.

Next human step is already requested in [bootstrap prompt](native-mod-bootstrap-prompt.md).
Do not ask again, reinterpret elapsed time as consent, repeat ineffective model
serving tests or manufacture static work to avoid a genuine blocked audit. On its
exact pending report, run the new screening helper BEFORE bounded native review;
do not acknowledge until evidence/review is checkpointed. Native positive gate,
event-driven transport, serving/steering/mutations/rollback/residency/cold recovery
and17historic uncertain effects remain open. No input quarantine change; Codex-
driver and1Password separate. Follow three consecutive no-progress blocker turns
if nothing else can advance without native activation.

## Previous frontier — October 7, 06:37 Eastern

Goal ACTIVE. Previous status-only turn was no progress; this turn prepares the
actual bounded native activation and new evidence lifecycle. General bridge is
still unqualified. Native-mod-probe v0.2.0 is STAGED ONLY, not copied/enabled/loaded.
The exact manual [bootstrap prompt](native-mod-bootstrap-prompt.md) is prepared
for Taylor's existing claude-driver-broker chat, not Broker Recovery Probe.
An async request for this human step is pending; elapsed time is no answer.
The installed loader requires personOnly:true; no keyboard, consent impersonation,
global installation, permission change, context reset or competing wake.

One explicit no-argument command records fixed sanitized intent before reading
only the existing archived fixture, then publishes a bounded .report.json in
the requested temp_reports inbox. Keep gateQualified/releaseAuthorized false.
Intent survives completed or failed reporting; module concurrency and reload
refusal prevent accidental repeated reads in the tested scope. fs.write is NOT
exclusive/atomic: this is no general cross-process admission/idempotency proof.
No automatic model call, timer, message, read or evidence write on registration.

Bundled static validation10:34:00 passed. Manifest da9d8573, hooks ac225d37,
register3a7b1e8c; exact full hashes in bootstrap prompt and validation report.
Twenty installed admission/candidate lifecycle checks passed10:33:40 on
2006bc0e9634d77795de675b831c806f10728f6ca502a7f65eed12e059c59446;
eight adapter checks passed10:35:33 SAME source. Full isolated suite passed
unchanged8365ms10:35:41. No live mod, native gate or zero-model command proof.

Read-only preactivation review10:36:33 verifies sessionId/local and native CLI
UUID35b3ba48-f02e-48de-bfbb-925192d90de1, same broker71262/start03:24:51 UTC,
idle/intact4af/gen6, original settingsd66115ff/policy7a8ce57a. No STOP/arm/
diagnostic, destination/intent/report absent, actual inbox directory not a link.
Initial review import used nonexistent brokerStatus and failed before execution;
corrected to the current public runOp read path. Preserve that setup failure.

Next independently verify native copied/loaded hashes and exact process/command
ancestry, actual negative PreToolUse denial, native model-turn count and original
settings/fixture before acknowledging any new report. Output/exception alone is
not gate proof. Establish scoped unload before enrollment, then positive native
admission and deterministic event-driven execution. Do not rerun the same probe
by deleting intent, repeat model-selected serving failures or infer safe release.
All17historic uncertain effects remain unknown/nonretryable. Input quarantine ON;
local30s detector/hourly observer do not pace active testing. Codex-driver and
1Password remain separate. If the human action stays pending, record a real
blocker and follow the three-consecutive-no-progress audit, not synthetic busywork.

## Previous frontier — October 7, 06:24 Eastern

Goal ACTIVE. Previous turn progress; this turn yields additional admission and
activation evidence, without native effects. General bridge remains unqualified.
New mod-admission-contract-v2.mjs passed14 checks on2f4be7f3, report10:23:59:
exact installed denial/error/cancellation/ordinary callback/reducer functions,
peer controls, person-only warm consent and staged scope/redaction. Existing
8adapter checks passed on SAME source10:24:06; full isolated suite unchanged
passed8435ms10:24:15. Candidate remains staged; no plugin loaded/model turn.

Important ordering boundary: raw local kVn deny-then-allow ends allow; served
branch retains deny. Actual Uat function-hook reducer retains deny in all six
orders and after blocking error. This is synthetic upstream evidence, NOT a
native bypass or proof live mod chain traverses the reducer. Native qualification
must bind loaded effective hooks/ordering/fallback and original request receipts.

Exact owned native activation review10:24:42:71262/start03:24:51 UTC idle/intact
4af, original settingsd66115ff/policy7a8ce57a, no STOP/arm. Only named Unix socket
observed is peer inbox; this does not exclude all unnamed/other control channels.
Installed peer does NOT route reload_plugins SDK requests or run_command controls.
Warm loader asks personOnly:true and refuses unbound context; no consent answer
or load attempted. Do not try SDK frames on the peer socket, spoof user text,
write consent metadata or globally install/reset/restart as a workaround.

Next establish genuine supported scoped mod activation/invocation/unload (human
consent where platform requires), or improve an existing serving mechanism with
evidence that changes its failure behavior. Avoid unchanged model-probe repeats.
Candidate is exact broker/archived-fixture/read-only; all17historic effects remain
unknown/nonretryable. No lifting quarantine or Codex-driver/1Password work.
See mechanical-native-route.md for evidence and the still-open native gates.

## Previous frontier — October 7, 06:18 Eastern

Goal ACTIVE. General bridge serving/mutations/steering remain unqualified.
Latest route discovery: exact installed mods MCP adapter ZOt -> eU -> ordinary
W1 tool pipeline with bound session canUseTool callback. Eight isolated adapter
checks passed on host ebef4abc, report mod-tool-contract-10:14:49. Native gate
execution, plugin loading and model turns are absent; source linkage is not
native admission proof. Agent hooks inherit tools/50turn budget/dontAsk, so no
live agent hook or subagent was launched.

New candidates/native-mod-probe package is STAGED ONLY: exact broker SID/cwd,
one explicit read-only archived-fixture command, no timer/model/permission
changes. Static bundled CLI2.1.289 validation PASSED10:18:27. Initial failed
10:16:15 reserved claude- manifest name retained; renamed desktop-bridge-native-
probe with author. Separate candidate file hashes in validation report.
Next establish supported scoped loading/command/unload WITHOUT keyboard/global
installation/context reset, then actual negative and positive native admission,
zero-inference causal receipts and serving lifecycle pressure. Do not count the
staged package or synthetic adapter checks as live serving qualification.

Fresh broker status06:18: same PID71262/start03:24:51 UTC, idle/intact4af/gen6.
No current waiter, indexed batch admission or quiet hook; residency protection
list stale. Metadata lifecycle/reconciliation proofs below remain valid for their
recorded source. General release still blocked by17historic uncertain effects;
never replay/settle them speculatively. Input quarantine remains ON. Local30s
zero-inference detection and hourly Claude fallback do not pace active testing.
Full current-source isolated suite passed unchanged in8367ms,
v2-2026-10-07T10-18-38-778Z.json (ebef4abc). No native plugin was loaded.
No user action needed. Codex-driver fixes and1Password stay separate.
See mechanical-native-route.md for precise candidate bounds and evidence.

## Previous frontier — October 7, 06:10 Eastern

Goal ACTIVE, this turn makes verified crash-lifecycle progress. General-use
bridge serving/mutations/steering and recovery remain experimental/unqualified.

Actual native-read-service-2026-10-07T10-04-41-602Z.json PASSED on1bad0d6d:
verified new exact owned Node job worker65607/start10:04:41 UTC/command/job,
then SIGKILL only that worker after publication. Never touched native broker.
Jobj6b4e5064c2ef4bb78f23a3de3c9efff1 remained outcome_unknown/worker_lost;
same-key reattachment twice returned SAME unknown job without replay. Batch
cf279394-0225-43cd-898a-3b36039398e0 reported owner gone and cleanup pending.
After original20s expiry, public broker_read_recover restored exact original
settings/policy with no wake/model turn. Original phase published and job outcome
were preserved. Exactly one native user turn; both MCP clients exited0/stderr0.
Full unchanged1bad preflight passed in8407ms, v2-10:04:37 report.

New public read-only broker_read_reconcile recovers historical metadata only:
bounded256KiB original own journal inode/cursor, exact original peer root,
complete distinct native attachments, Stop witness, restored settings, original
intact idle native epoch and subsequent kernel-verified host finish. It never
replays metadata reads, overwrites original outcome or claims current metadata,
full queue quiescence or release. Separate sanitized reconciliation artifact.
Pure tests reject missing/duplicate/unrelated receipts, foreign turns, wrong
root/witness, assistant tools, sidechains and compaction; private fields excluded.

First native MCP reconciliation on a4a12a4d FAILED (10:07:21 report): adopted
f9f68a7a older-source idle receipt, sourceChangedtrue and finish before new reads.
Original failure retained. Independent review
native-read-reconciliation-idle-failure-review-2026-10-07.json binds its SHA256,
owned idle observation and service error ledger. Direct diagnostic reviews then
succeeded with fresh zero-inference controls, without replay/model calls.
Final code allows ONE fresh idle observation only after consumed older-source
idle notice in unchanged epoch; unresolved publication remains blocked. Fixed
cache_ms:0 same-millisecond reuse; focused frozen-clock regression proves no reuse.

Actual native-read-service-2026-10-07T10-09-25-960Z.json PASSED on current
4e1a391b4123baf2cf5d8b8eae01e627d711d057a328af32d1a158181a35912f: actual MCP recovered both original native reads from1bad
without new user/model turns; matching receipts d5e989e9 and11121e67, event
1337d4c0, fresh host observationd611c96f. MetadataCurrentfalse, replayfalse,
inferenceTurns0, original jobstillunknown. Both clients exited0/stderr0; original
settings unchanged/no descriptor; same broker71262/start03:24:51 UTC.
Final full unchanged suite passed in8418ms, v2-2026-10-07T10-09-10-470Z.json.
Earlier worker-loss native proof and current reconciliation proof are distinct.
The new one-refresh branch has focused eligibility/idle-cache tests; no native
recreation of an older-source pending mailbox was required for the final proof.

Next resume the full goal: operational fence/indexed handoff and sustained
serving, then guarded mutations/steering under load, rollback, natural governor
pressure and cold recovery. Metadata-only recovery does not settle17historic
unknown effects, qualify generic direct mutation hooks or authorize handoff.
The lost metadata worker's original unknown job is also preserved; receipts are
available in its separate batch reconciliation, not an automatic job rewrite.
No user action needed. Quarantine ON; local30s detector/hourly fallback remain.
Codex-driver fixes and1Password stay separate.

## Previous frontier — October 7, 06:03 Eastern

Goal ACTIVE; general-use bridge remains experimental. Actual cancellation report
native-read-service-2026-10-07T09-56-12-334Z.json passed on e1b79a7d:
prepublication and queued cancellation settled in307ms/312ms, postpublication
cancellation in3502ms including bounded cleanup. All three same-key reattachments
returned original cancelled jobs without replay. Exactly one native diagnostic
turn occurred; original settings/policy restored, same broker PID71262/start
03:24:51 UTC, both actual MCP clients exited0/stderr0. Cancelled reads may finish;
this proves no mutation reversal or general serving readiness.

Current sourceee8c9f67862edad15807e6d07f678c65b0232e8d21d27482ab9754e2738eb34e adds bounded broker_read_status, phase progress,
overall admission/setup timeout and explicit broker_read_recover. Recovery is
zero-inference: exact expired owned metadata transaction, original intact idle
epoch and unchanged settings only; no wake/replay and original batch/job outcome
retained. Owner death requires kernel ESRCH; unavailable ps remains unknown.
Isolated tests cover expiry, changed epoch, busy/integrity/STOP refusal, foreign
target ownership, exact byte restoration and original published outcome retained.
An initial synthetic fixture omitted required PreToolUse hooks; failure preserved
in native-read-recovery-fixture-failure-2026-10-07.json, corrected before full run.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T10-03-29-410Z.json (8401ms). This later source has NOT passed a new
native recovery/worker-loss test. Cancellation native proof belongs to e1b79a7d.
Next deliberately lose only a freshly launched exact owned Node job worker,
verify unknown durable outcome/no idempotent replay and pending ownership, wait
finite expiry, then qualify explicit cleanup without another model turn. Never
kill native app/session processes or infer receipt/completion from cleanup.

Fresh read-only status06:03: broker71262 idle/intact, original settingsd66115ff
and policy7a8ce57a, no diagnostic/STOP/arm. Input quarantine remains ON. General
sustained serving, guarded mutations/steering under load, indexed handoff,
rollback, natural governor pressure and cold recovery remain open. All17historic
uncertain effects stay unknown/nonretryable. Local30s detection and hourly Claude
fallback do not pace testing; no user action needed. Codex-driver/1Password separate.

## Previous frontier — October 7, 05:51 Eastern

Goal ACTIVE; previous turn made observation progress, this turn proves a real
shared deterministic metadata execution path. General bridge readiness remains
unqualified. Opt-in CLI/MCP `broker_read_batch` accepts1–8 exact session IDs,
coalesces duplicates, installs only finite get_session hooks, requires genuine
native attachments/ancestry/host finish and restores exact settings. No target
mutations, keyboard/UI, new chats, model/auth/permission changes or recovery.
Existing durable driver_submit/jobs provide cross-harness ownership; metadata
results exclude unexpected/private fields. The operation is not marked readOnly:
it uses one owned diagnostic turn and temporary service-local settings.

Actual native-read-service-2026-10-07T09-51-15-467Z.json PASSED on current host
77441d1d: two MCP harnesses concurrently submitted one idempotency key for three
reads (fixture/broker/fixture), obtaining jobja5533bc537204c17b2b3ecfa59077116.
Publisher exited0 before completion. Remaining harness received completed job
in5130ms, two distinct native attachments for two targets, same receipt reused
for duplicate fixture and verified archived/pinned readback where present.
One short Haiku turn triggered the batch; native tools/collection used no model
selection/inference. Native host finish and exact settings restoration verified.
Idempotent late reattach returned SAME completed job, no replay; both launchers
exited0/stderr0. Batch evidence native-reads/dcfcc96a-7e49-4d0a-b8b5-05bc0855fb9e.json.

Original native-read-service-2026-10-07T09-48-45-674Z.json and failed job
j9f4947abf4f94b98bad9fde5936eead6 remain FAILED on bf1fc3e5. Native calls succeeded;
validator wrongly required pinned, which the exact SDK exporter serializes from
optional isStarred. Corrected parser preserves omitted pinned as unknown/null.
native-read-service-reconciliation-2026-10-07.json independently binds both
actual attachments, peer root, fresh host finish and original restored hashes,
without native read/model replay. Review source77441d1d, native sourcebf1fc3e5.
The later NEW batch above exercises completion/reattachment gates never reached
in the failed run; it is not a replay of its failed idempotency key.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-51-04-672Z.json (8496ms). Tests cover exact/bounded IDs, duplicate
coalescing, non-metadata refusal, missing broker/cancellation, per-target receipt
mapping/privacy, omitted-field semantics and exact temporary-hook restoration.
Initial isolated preflight category failure was corrected before native testing.
Cancellation after publication and lost-worker cleanup still need strategic
native pressure; busy/changed epochs leave durable diagnostic ownership for
existing safe expiry recovery instead of unsafe restoration or repeated wakes.

Source inspection confirms direct SDK hook calls bypass our assistant PreToolUse
effect gate; generic mutation routing is deliberately NOT enabled. Native idle
and metadata reads do not settle all17 historic unknown effects or authorize
release/handoff. Active dependencies4af/gen6, installed core7e388b8f retained;
original settingsd66115ff/policy7a8ce57a restored. Broker epochPID71262/start
03:24:51 UTC remains intact; no foreground waiter or quiet serving proof.
Quarantine ON, no STOP or pending diagnostic after successful batch.

Next pressure the new execution lifecycle's cancellation/concurrency/expiry and
failure cleanup, then resolve guarded mutation serving, steering under load,
safe indexed handoff, rollback and cold recovery. This metadata path is an
additional execution strategy, not a replacement for the full original goal.
Local30s detector/hourly Claude fallback unchanged; no user action required.
Codex-driver and1Password remain separate.

## Previous frontier — October 7, 05:41 Eastern

Goal ACTIVE; previous turn and this turn made concrete observation progress.
General serving/handoff remains unqualified. Fixed a real lifecycle gap: the
native idle listener now belongs to the service after durable publication,
surviving cancellation, wait timeout and publisher process exit. A bounded
private mailbox preserves the eventual kernel-verified notice for another
harness. Only one helper/subscription belongs to an epoch at a time; callers
wait outside its lock, with inexpensive file checks before reconciliation.
Private authenticated frames remain pipe-only; no key is recorded or printed.

Actual native-idle-service-2026-10-07T09-40-03-014Z.json passed two independent
MCP clients on sourceb050504c in1166ms. Stronger native-idle-service-
2026-10-07T09-40-47-165Z.json passed on current source2b8697ed in1170ms:
CLI publisher returned pending/timed_out and exited0 before receipt; two MCP
harnesses adopted that SAME observation c1ca72aa-799f-4c82-b4da-d7ae9903f92d,
verified the native reply and consumed one private mailbox. No model events,
app/UI action, recovery, settings/auth/permission changes or new chats. Both
MCP launchers exited0/stderr0. Listener removed, mailbox consumed, helper37750.
Already-idle timestamp correctly remains stale; fresh completion proof still
belongs to the earlier09:32:14 sourcecbef2bce, not this changed transport.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-41-00-098Z.json (8336ms). New tests prove cancellation/deadline
adoption, nonce/linked-mailbox refusal, publisher pipe closure before ACK and
actual isolated publisher process death before reply. An initial isolated lock
regression is preserved in native-idle-detached-development-failure-2026-10-07.json
(original source fingerprint not recorded), then corrected; no native effects.
Helpers exit after notice or bounded12h wait; unknown publication/dead-helper
debt still cannot blindly retry. Service helper survival is NOT native broker
residency, full queue quiescence, request success or release authorization.

Exact broker PID71262/start03:24:51 UTC remains idle/intact on active4af/gen6.
No current foreground waiter or quiet enrollment; quarantine ON, no STOP.
All17 historical effects remain unknown/nonretryable and handoff gates unchanged.
Next work is sustained serving and safe operational fence/indexed handoff, not
more repetition of already-idle signaling. Native hook diagnostic reads are a
proven deterministic execution candidate, but generic guarded mutation routing,
current steering/cancellation under load, rollback and cold recovery are open.
Fast local30s detection/hourly Claude fallback remain unchanged; no user action
needed. Keep Codex-driver and1Password work separate.

## Previous frontier — October 7, 05:34 Eastern

Goal ACTIVE; concrete observation progress, general serving/handoff unqualified.
Public CLI/MCP `broker_idle` now provides a durable service-owned native host
observer. Concurrent harnesses share one epoch-bound publication and cached
receipt. Unknown publication/cancellation persists subscription debt rather
than retrying; proved no-write may retry, and reviewed native12h expiry permits
a new observation. Private helper cleanup never kills the native broker.

Actual current MCP harnesses passed both modes: native-idle-service-
2026-10-07T09-31-04-547Z.json on source6e49b9ac verifies one shared already-idle
observation in1073ms with zero user/assistant events and stale completion=false.
native-idle-service-2026-10-07T09-32-14-381Z.json on sourcecbef2bce verifies a
fresh completion in4538ms: one short tool-free diagnostic model turn, actual
peer/reply ancestry, matching kernel PID/UID/nonce and one shared observation
cebb5ebd-409a-4dc9-84ad-85a170549f6a. Both clients report fresh completion=true;
all owned MCP launchers exit0/stderr0, subscriptions consumed/listeners removed.
Observation itself uses zero inference; the fresh diagnostic uses one turn.

Current source88495da2 passed the full isolated suite unchanged in
v2-2026-10-07T09-34-28-074Z.json. The only executable-source change after the
fresh native proof is its script comment explaining the two modes. Keep these
source-qualified reports distinct. Cancellation, pending joins, expiry, corrupt
and linked lease refusal, stale/fresh boundaries and public schema bounds have
isolated proof. Service memory records bounded metadata, never private IPC keys.
An initial test accidentally recorded12 synthetic observations in live service
memory. Original rows were preserved and explicitly corrected as synthetic in
native-idle-synthetic-memory-correction-2026-10-07.json; tests now isolate state.
Those rows are not native evidence.

Host idle remains weaker than internal queue quiescence, causal tool success,
historical effect settlement or release authority. API always denies quiescence
and release claims. All17 historic unknown effects remain unknown/nonretryable.
No operational fence or indexed handoff was authorized by this signal. Native
broker PID71262/start03:24:51 UTC remains idle/intact on active4af/gen6 with
dependency integritytrue, but nativePathsVerified:false and no verified waiter.

Next qualify a safe operational fence/indexed handoff, then sustained serving,
current controls/steering/cancellation, rollback and cold recovery. Do not repeat
idle publication after uncertain delivery or race the observer's recovery.
Local30s detector/hourly Claude fallback remains; hourly fallback does not pace
tests. Codex inbox ticks remain inference-bearing. No user action required;
input quarantine stays ON, Codex-driver fixes and1Password remain separate.

## Previous frontier — October 7, 05:21 Eastern

Goal ACTIVE. Previous turn was progress; this turn establishes a genuine native
zero-inference post-turn HOST signal. General serving/handoff remains unqualified.

Installed peer protocol supports control:notify_when_idle with correlated
peer_idle_notice. Headless code mounts the publisher on real sessionState
idle/running transitions; registration logs but does not enqueue a model prompt.
peer-idle-contract-2026-10-07T09-16-38-124Z.json passes6 exact installed mechanics
checks with synthetic dependencies: debounce750ms, queue/approval holdback,
same-PID/address refresh,12h expiry, one-shot consume and exit classification.
Original09:16:18 harness failure (missing extracted F announcer) is preserved.

Actual owned native subscriptions passed at09:18:31,09:20:20 and09:21:51 UTC.
Latest native-peer-idle-2026-10-07T09-21-51-906Z.json runs on source11f4c411,
listener hashf78deebc, exact broker PID71262/start03:24:51 UTC and app/CLI versions.
Each receives a matching nonce/from-address notice from kernel-verified native
PID/UID in about0.9s, with zero observed user/assistant events. No model turn,
auth/permission changes, session registration, key publication or app/UI action.
Existing receiver peer key is consumed privately; reply credentials come from
macOS SOL_LOCAL/LOCAL_PEERPID and getpeereid, not a claimed frame PID.

All replies have finishedAt1791363709797,4ms after the actual09:01 export receipt.
This is the broker's LAST finished host turn, not a newly completed request.
Already-idle notices can carry an old completion timestamp or none. The signal
is not a full internal queue snapshot, causal tool receipt, effect settlement
or release authority. All17 unknown effects and handoff gates remain unchanged.

New one-shot listener/payload preparation are reusable service internals; the
pressure command remains bound to this exact broker epoch, not a public generic
tool. IPC tests cover PID/nonce/address/state/time refusal, detail redaction and
SIGTERM cleanup. Listener cancellation explicitly does not cancel the native
subscription; timeout can leave one until notice or native12h expiry. No blind
repeat after timeout. All actual notices above consumed their subscriptions;
all listeners removed and no native processes killed.

Python helpers now participate in host and sealed-bootstrap fingerprints.
Full suite first caught inconsistent bootstrap enumeration; original failed
v2-2026-10-07T09-20-30-134Z.json remains. Corrected current source passed the full
isolated suite unchanged in v2-2026-10-07T09-21-48-232Z.json and then the actual
native control test above. Active dependency release remains4af/gen6/integritytrue.

Next make this a durable, bounded cross-harness observer with pending-subscription
ownership, cancellation/expiry and stale-timestamp semantics. Qualify actual
fresh busy-to-idle notification once on an owned diagnostic turn, bind it to
native ancestry, then combine with safe operational fence/indexed handoff.
Do not substitute a host idle notification for queue quiescence or clear old
unknowns. Full controls/steering, sustained serving and recovery remain open.
Broker idle/intact but no verified waiter, quiet OFF/quarantine ON, original
settings/policy intact; local30s detector/hourly fallback unchanged. No user
action required; Codex-driver and 1Password remain separate.

## Previous frontier — October 7, 05:10 Eastern

Goal ACTIVE. This turn makes concrete observation/strategy progress; no native
turns, settings changes, recovery or IPC were used. General-use readiness remains
unqualified. The previous native broker snapshot checkpoint was progress too.

native-idle-contract-2026-10-07T09-09-13-745Z.json passes6 executable checks
against exact installed app2.26454.0 sourceb7c512ce/CLI2.1.289 with synthetic
state/dependencies. The app's HC idle predicate is not complete quiescence:
- pending echoes at age120000ms block; at120001ms they remain queued but are
  ignored. Expired interrupt markers can be ignored; a feature flag can also
  ignore fresh interruption. No feature flags were inspected or changed live.
- HC does not itself gate isRunning, nextCycleUuid, deferredSends,
  awaitingTurnResultSince, tool activity or activeBackgroundTasks.
- Explicit last-result boundary, pendingCycle, fresh echo, held steer, input
  and non-expired interrupt cases behave as the exact source predicate defines.
  This is installed-function execution, not a live post-turn observation.

The exact export projection was executed too: absent maps/queues encode null,
awaitingTurnResult uses true-or-null, background tasks export as a map. The
sanitizer now counts map keys without returning keys/values and uses null-as-
absent semantics only with the reviewed full source SHA. Missing fields and
unknown builds remain refused/unknown; undefined boundaries remain unknown.
Both source reader and privacy/identity/schema edge tests pass. Native export
probe verifies the installed source hash before choosing this interpretation.

native-broker-snapshot-projection-2026-10-07.json independently reprojects the
existing09:01 export, verifying its archive hash and exact metadata, without
another native inference turn or altering original failed reports. Corrected
queueStateComplete:true, but idleCandidate:false: actual result/boundary/idle
flags are false. releaseAuthorized remains false. This is historical Stop-time
evidence, not current post-turn quiescence. All17 unknown effects stay intact.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-10-02-473Z.json. Shared service memory records source contract
and reprojection evidence. Broker PID71262/start03:24:51 UTC idle/intact, no
verified waiter, original settings restored, quiet OFF/quarantine ON, no
diagnostic owner or handoff STOP. Local30s detector/hourly fallback unchanged;
Codex inbox still inference-bearing. Next qualify an actual post-turn observer
and trigger/result path together; HC or visible idle alone cannot fence old
work or authorize indexed handoff. Sustained controls/steering and recovery
remain required. No user action needed; Codex-driver/1Password stay separate.

## Previous frontier — October 7, 05:06 Eastern

Goal ACTIVE. Diagnostic native broker export now has independent receipt/archive
proof. General-use bridge readiness remains unqualified: exact broker PID71262
is idle/intact but has no verified request waiter. Original settings restored;
quarantine ON, no owned handoff STOP. No user action is required for this checkpoint.

native-hook-export-2026-10-07T09-01-45-570Z.json remains FAILED on source49c1811d.
The native export succeeded; observer required a SID in the return, but actual
self-export returns only a filename. Independent bounded journal identity/hash,
real attachment ancestry, stdout hash, exact filename and archive hash reconcile
in native-broker-snapshot-reconciliation-2026-10-07.json. Exact broker/CLI ZIP
metadata and Stop witness were verified by the original probe. The archive is
private service evidence, never committed or printed. Corrected filename parser
requires one candidate; exact hook/log/ZIP identity checks remain mandatory.
Corrected code has isolated proof, not a fresh native run. No repeat inference
was used solely to fix the observer; original failure is preserved.

The Stop-time snapshot reported isRunning:false while cliProvablyIdle:false,
cliLastTurnMessageWasResult:false and cliAtTurnBoundaryHint:false. Visible idle
is insufficient for a safe handoff. New sanitizer returns only bounded flags,
counts and marker presence, treats missing/null queue fields conservatively,
and always denies release authorization. Installed source encodes some absent
internal fields as null; version-specific interpretation remains to qualify.
No release gate or historical outcome was changed. All17 unknown mutations stay
unknown/nonretryable. No generic mutation hook or persistent FileChanged enrolled.

Full current-source isolated suite passed unchanged in
v2-2026-10-07T09-06-33-704Z.json. Native snapshot proof belongs to49c1811d,
not this later corrected observer source. Shared service evidence/memory updated.
One short no-tools native turn was used for export; reconciliation/tests use no
inference. Local30s detector/hourly observer fallback unchanged; Codex inbox is
still inference-bearing. Next qualify trigger AND result channel together,
post-turn quiescence and safe indexed handoff, then current controls/steering,
sustained serving, rollback and cold recovery. Codex/1Password remain separate.

## Previous frontier — October 7, 04:57 Eastern

Goal ACTIVE; previous turn made progress, this turn adds actual native edge
observations and changes the event-only strategy. Current host
bdb7a0d330271d93e18df14d84ccff003cbafad580e4741268d3a9138d8ee23f passed
its full isolated suite unchanged in v2-2026-10-07T08-57-20-303Z.json. Later
collector changes have isolated proof, not a new current-source native pass.

One short native no-tools turn on a2cd9974 configured two identical fixture
reads plus an unavailable MCP context. Original native-hook-export-
2026-10-07T08-50-42-263Z.json remains FAILED: the expected two read receipts and
command-bound error were wrong assumptions. Actual bounded/hash-validated journal
contains one real get_session receipt and one commandless error, both in the
same Stop event. native-hook-read-edges-independent-2026-10-07.json preserves
metadata; native-hook-read-edges-reconciliation-2026-10-07.json records the
corrected interpretation without rewriting the original report or replaying.
Fixture archived/unpinned/not live; settings and policy restored exactly.

Important installed/native distinctions:
- hook-contract-2026-10-07T08-57-11-072Z.json passes26 exact installed-function
  cases with synthetic dependencies and zero native writes/inference. The
  original08:48:56 extraction failure is preserved; the corrected extractor
  executes the full comma-expression startup guard rather than an invented if.
- Actual matcher deduplicates identical MCP definitions within ONE event. Its
  key ignores timeout and distinguishes JSON input key order. Repeated events
  still invoke again; this is not canonical durable request deduplication.
- Commandless hook errors retain only native event identity. Collector now
  records native-hook-event-error/commandBound:false, with bounded private
  stderr hash, never a fabricated operation/tool receipt. Proved attachments
  extend private batch ancestry to avoid a race with the preceding public scan.
- SessionStart output can seed an already initialized watcher; Stop output
  cannot. Cancellation prevents seeding. Startup skips REMOTE workspace; local
  setup calls initialize. Local cwd alone is not live initialization proof.
- Actual FileChanged callback DROPS successful tool output, forwarding only
  failures/system messages. Thus activating a file watcher alone would not
  deliver a useful generic result channel. Native FileChanged activation and
  independent result persistence remain unqualified. No watcher was installed.

Settled live epoch remains PID71262/start03:24:51 UTC, idle/intact, active4af/gen6,
installed7e388b8f, original settingsd66115ff/policy7a8ce57a, quiet OFF, quarantine
ON, no diagnostic owner or owned handoff STOP. No keyboard/UI, apps/processes,
models/auth/permissions or other chats were touched. One native inference turn
was used for the edge probe; all added engine checks and reconciliation were
zero-inference. All17 unknown mutations and legacy report blockers remain intact.

Next: select/qualify trigger AND result channel together, rather than enrolling
an inert FileChanged candidate. Investigate whether an owned native export's
internal queue/idle metadata can support a real STOP-barrier quiescence proof
and safe indexed handoff, without assigning causal outcomes to old unknowns.
Direct Stop-hook reads remain a verified diagnostic/fallback candidate, using
one short trigger turn per batch. Generic hook mutations still require actual
ownership/expiry/cancel/duplicate admission at invocation; parallel hooks cannot
be treated as ordered guards. Full current controls/steering, sustained serving,
rollback and cold recovery remain required. Observer owns offline recovery;
local30s detector/hourly fallback unchanged, Codex inbox still inference-bearing.
No user action is required. Codex-driver fixes and 1Password remain separate.

## Previous frontier — October 7, 04:44 Eastern

Goal ACTIVE. Direct native Stop-hook reads now have actual desktop result proof;
general-use readiness remains unqualified. Current host
5be50395f084c1dc4da142ecad6098cb8bb62a57f51a4a0b2f28d9573f2325a1 passed
its full isolated suite unchanged in v2-2026-10-07T08-44-38-415Z.json.
Later diagnostic cleanup/admission amendments have isolated proof; native probes
ran on their separately recorded source candidates, not this final source.

Native breakthrough under <state>/pressure:
- native-hook-export-2026-10-07T08-30-00-721Z.json remains FAILED. Its observer
  omitted metadata attachment ancestry. Independent fixed-range journal/hash
  review now proves the actual direct export succeeded without assistant tool
  selection. native-hook-export-reconciliation-2026-10-07.json links the original
  peer, terminal chain, real hook-success attachment, native export filename and
  captured archive SHAe0d896d7. The earlier guessed-filename comparison was invalid;
  preserve that artifact and the original failed report, rather than rewriting.
- native-hook-export-2026-10-07T08-35-35-106Z.json PASSED on c74317f0: direct
  get_session on the exact archived fixture, real Stop hook-result attachment,
  no assistant tools, nonce-bound peer/witness and exact settings restoration.
- native-hook-export-2026-10-07T08-37-41-302Z.json PASSED on bbb33c19: two fixed
  get_session reads (fixture and broker) in one Stop event, about3.6s from probe
  start including1.5s settings wait. Both result attachments and distinct target
  metadata verified. Each probe used one short no-tools model turn as trigger;
  hook tool execution and observation used no inference. This is not a completely
  inference-free trigger transport or a general throughput guarantee.
- Both batch results share native toolUseID. It identifies the Stop event,
  not an operation slot. Collector now names it hookEventId and identifies each
  result by its attachment UUID. Historical reports' hookRunId label is retained
  as historical data, not a unique-operation identity.

CLI journal hook-success attachments are a real result channel, despite the
separate default SDK hook_response filter. Opt-in session_events causality now
includes attachment IDs/parents without attachment contents. Direct hooks are
not assistant tool-use receipts; native error attachments can represent failure
before invocation and cannot alone prove that a tool was called.

Temporary probes preserve the core Stop/PreToolUse hooks and original settings/
policy bytes. Ordinary request admission refuses a pending diagnostic before
publication. Expired abandoned settings can restore only under the broker lock,
in the exact idle intact native epoch, with no STOP/arm/quiet owner and matching
bytes. Synthetic recovery tests pass; no live crash/kill injection was performed.
No generic native mutation hook or persistent FileChanged hook is deployed.

Settled live state: exact broker PID71262/start03:24:51 UTC idle, integrity true;
active4af08654/gen6, installed7e388b8f/handler6d10c509 unchanged. Original settings
SHA d66115ff and policy SHA7a8ce57a restored; no mechanical-probe owner remains.
Fixture local_fc1e5eab remains archived/unpinned/not live. Quiet OFF, quarantine
ON, no verified waiter/owned handoff STOP. No apps restarted, inputs injected,
models/permissions/auth changed, new chats or competing recovery attempted.

Next: qualify an actual event-only FileChanged activation/result path in this
native epoch, then duplicate/deadline/cancellation behavior and safe mutation
admission. A natural SessionStart/watch-path update is a candidate, not native
proof; do not force compaction/reset/restart. Retain safe STOP-barrier/indexed
handoff and rollback as separate gates. Full current steering, sustained serving
and cold recovery remain open. All17 historical mutations stay unknown and
nonretryable; legacy reports remain pending with durable blockers. Local30s
zero-inference detection/hourly observer fallback are unchanged; Codex inbox
still consumes inference. No user action is required. Codex/1Password separate.

## Previous frontier — October 7, 04:23 Eastern

Goal ACTIVE. Installed-engine research and executable contracts changed the
next native probe strategy; this turn made NO desktop/native settings changes,
model turns or recovery attempts. General-use readiness remains unqualified.
Current host560fc1440aeb5fd07badfecfcb0f4ab19fe97e9c02734b56fdfcd8583417a9a9
passed the full isolated suite unchanged in v2-2026-10-07T08-22-22-179Z.json.
Installed hook7e388b8f, dependency4af08654/gen6, compact2 and quiet OFF remain
unchanged. Exact broker PID71262/start03:24:51 UTC remains idle, integrity true,
no verified foreground waiter and no owned handoff STOP. Settings contain only
Stop/PreToolUse; no direct MCP hook candidate was installed.

New source contracts under <state>/pressure:
- hook-contract-2026-10-07T08-22-12-618Z.json:18 checks execute exact installed
  2.1.289 MCP runner, interpolation, file-watcher lifecycle and SDK result
  emission functions with synthetic dependencies. Connected hooks directly
  call tools without model selection. Missing/pending connections, budget,
  withholding and errors are exercised. FileChanged does not wait for pending
  connection. Script hooks explicitly throw unavailable in this installed build.
- Actual watcher lifecycle requires initialization or explicit watch-path update;
  settings addition after empty startup does not create a watcher. Registered
  settings changes dispose it. Repeated events invoke twice; no durable duplicate
  suppression. Default SDK response filtering does not emit Stop/FileChanged
  results; live all-events enrollment was NOT inspected/changed. These are
  installed functions with fake clients/watchers, NOT live activation/dispatch.
- peer-contract-2026-10-07T08-22-12-959Z.json:9 existing receiver/auth/envelope/
  dispatch cases still pass after sharing bounded installed-source extraction.
  Unsupported SDK control frames remain unhandled in the actual receiver.
- desktop-native-route-source-2026-10-07.json fingerprints the inspected app
  CCD SDK proxy and session wiring chunks; no general external native caller
  API or permission/result path is established by that source inspection.

See mechanical-native-route.md for evidence, limitations and the next read-only
probe requirements. Do not install a generic mutation hook: current runner
has no service PreToolUse call inside its extracted function; upstream host
enforcement remains unqualified. A command event marker is not a native tool
result, and the old assistant-tool receipt collector cannot fabricate one.
Next establish genuine native activation, connected context and correlated
results without restarting/resetting/injecting input or widening logging/auth.
Natural lifecycle events may help, but writing settings alone cannot qualify
them. Safe owned STOP-barrier operational disposition/indexed handoff remains
a separate frontier; all17 unknown mutations stay unknown/nonretryable. Preserve
legacy inbox blockers and observer offline-recovery ownership. No user action
is required. Codex-driver fixes and 1Password stay separate.

## Previous frontier — October 7, 04:04 Eastern

Goal ACTIVE. This turn made qualification/observation improvements and exposed
real native serving failures; it did NOT qualify controls or general-use readiness.
Keep input quarantine, broker epoch/model/permissions and observer ownership.
No new chats, app restart, context reset, blind replay or competing recovery.

Current host46f0962972854e07f514a5425fd3162e5535de9c64254e8949092294fed6bacc.
Full isolated suite passed unchanged in v2-2026-10-07T08-03-15-746Z.json.
Installed hook7e388b8f and active dependencies4af08654/bootstrapeb5cb750/gen6
remain unchanged; compact feedback2 enrolled, quiet OFF. Native tests below ran
on earlier host candidates; final46f has isolated proof, not a new native pass.

Qualification changes:
- session_events/session_wait accept opt-in include_causality. They expose only
  bounded parentId/peerMessageId/sidechain metadata and metadata-only ancestors.
  User text, thinking, tool inputs/results and peer sender fields stay private.
  Malformed ID/time/stop-reason objects cannot leak through those metadata fields.
- Every live run generates fresh128-bit nonce markers. Tool-free reply checks
  require exactly one native peer turn matching the send's messageId, an actual
  descendant terminal reply, exact current-run marker, no tools/truncation or
  sidechain. A foreign user branch or missing/reset ancestry cannot pass. Repeated
  envelopes of one UUID count as one logical reply. This is correlation, not a
  security/identity boundary or arbitrary task-success oracle.
- Restore now runs inside the reporting/finally boundary, using brokerRequest's
  actual native receipt contract and waiting for on-disk active state. Cleanup
  records observed baseline separately from unresolved native request outcomes.
  Title/effort/model/permission/pin readback is verified. Attempt metadata keeps
  independent concurrent successes/failures and IDs without prompts/tool output.
- --controls-only with --control-mode batch|concurrent|both reduces native test
  cost and excludes recipient generation. Its separate memory topic cannot
  establish full native qualification.

Preserved native outcomes under <state>/pressure:
- live-v2-2026-10-07T07-54-32-317Z.json (f55e4735) FAILED on a newly introduced
  incorrect brokerOp receiptSource assertion. Actual unarchive receipt succeeded.
  Early cleanup saw the old archived value before native persistence and falsely
  reported a restored baseline. Preserve that failure; correction in
  native-fixture-restore-reconciliation-2026-10-07.json records a NEW explicit
  desired-state archive, native verification and later archived/unpinned readback.
  The incorrect wrapper assertion is fixed; never treat its early snapshot as
  settlement or overwrite the original report.
- live-v2-2026-10-07T07-56-15-969Z.json (74a753ea) FAILED. Unarchive, concurrent
  title and pin had actual native success receipts. Effort request
  rmuxtdyht-8a0575 consumed compact continuation2, which actually landed, but
  its causal branch ended with zero tools. It remains outcome_unknown,
  retrySafe:false/controlState:cancelled. Cleanup title+effort, unpin and archive
  were new desired-state operations with actual native receipts. Original failed
  run remains failed. native-controls-failure-independent-2026-10-07.json retains
  every scoped request/receipt/native tool ID and exact causal refusal evidence.
- live-v2-2026-10-07T07-59-08-337Z.json (6d8c9bc4) FAILED before batch controls.
  Restore rmuxtgmmz-30510d also consumed/received compact2 and ended with zero
  tools; outcome_unknown/retrySafe:false/cancelled. No controls batch ran.
  native-batch-restore-failure-independent-2026-10-07.json preserves evidence.
  The fixture is currently archived/unpinned/not live, with original locked title,
  low effort, Haiku model and acceptEdits. This desired-state readback does not
  settle an uncertain restore. No replay or extra wake was attempted.

Context evidence is scoped, not inferred from model prose. Both failed terminals
claimed compression/resumption, but no actual native compact_boundary occurred
in their bounded journal ranges. native-controls-context-evidence-2026-10-07.json
verifies API input totals172540 and182328 for the exact terminal UUIDs. This is
large context evidence, not proof of a hard context failure, disabled compaction,
a queued resumption or crash. Selected compaction-related keys were absent in
~/.claude.json, global settings and broker settings; native process env was not
read. No manual compaction/reset/configuration change occurred.

Official current Claude hook documentation confirms command-hook timeout/launch
failure may continue through normal permission flow. This independently supports
the conservative retry contract, but is NOT native fault-injection qualification
of bundledCLI2.1.289. See native-effect-admission.md for the primary source link.

Original15 unknown mutations plus these2 unreceipted mutations remain unresolved;
current-state cleanup does not retire them. Legacy inbox reports021323/021456/
023210 remain pending, unchanged, with durable blockers. Broker PID71262 is live,
idle, integrity true, no owned handoff STOP and no verified waiter at checkpoint.

Next: investigate context-pressure serving and a deterministic native execution
route using bounded read-only installed-engine/primary documentation evidence.
Do not retry effects or call /clear,/compact, kill/restart or change model/auth.
Use fresh causal tokens before any recipient steering run; keep workload and
number of native attempts bounded because Claude usage is low. Establish owned
STOP-barrier quiescence and safe indexed handoff/rollback without rewriting
historical unknowns. Sustained residency, steering, cold recovery and event-only
inference remain open. Local detector30s is zero-inference; hourly observer is
fallback; Codex inbox ticks still infer. No user action is required at this checkpoint.

## Previous frontier — October 7, 03:49 Eastern

Goal ACTIVE: native batched reads, three concurrent read clients and one real
foreground pickup passed. Still NOT general-use ready. Preserve keyboard/CUA
quarantine, native PID/model/permissions and observer ownership. No new chats,
app restart, blind replay or competing recovery; Codex/1Password remain separate.

Current host c969500cfb9ec4ff5ec71dc3ea79bc883ad650b0511bafdaff8857bc58f5186e.
Installed hook7e388b8f08aac1a2b0fcc35f1a7ea6ea176663b628730e35089bc60517d4980a,
handler6d10c509e82c44a36eef0d54988e112263664e89a5021b5097f9fb98c03decb2,
settingsd66115ffaba3cc0c723795ad4ffcee692e464e6afc8e921c3d50dafc4bc78b74.
Compact feedbackVersion2 remains explicitly enrolled; quiet remains OFF.
Dependencies4af08654/bootstrapeb5cb750/generation6 remain unchanged on exact
broker local_35b3ba48-f02e-48de-bfbb-925192d90de1/PID71262/start
Wed Oct7 03:24:51 2026 UTC. Host has later failure-path amendments than this
installed package; those have isolated proof and one actual foreground read.

New pressure evidence under <state>/pressure:
- native-compact-read-sequence-2026-10-07T07-35-24-753Z.json: distinct-target
  two-operation batch passed13.672s on unchangede48a3790. Existing owned fixture
  stayed archived/unpinned/not live; no unrelated chats, permissions or model.
- native-compact-read-sequence-2026-10-07T07-36-24-118Z.json: three concurrent
  clients passed on unchangede48a3790. End-to-end10.896s/27.040s/44.696s; each
  broker service time about10.5s. Kernel serialization/finishing-turn admission
  add real queue cost. These measurements do not establish fairness guarantees
  or high sustained throughput. Each unique request/receipt/gate ID matched.
- native-compact-read-sequence-2026-10-07T07-41-28-274Z.json: final batch guard
  candidate7e388b8f passed two distinct reads12.472s. Native admission IDs and
  independent fixture state verified in native-batch-contention-independent-
 2026-10-07.json. All five audited tool IDs across concurrency/final batch unique.
- native-duplicate-batch-pre-enqueue-2026-10-07.json: current native metadata
  confirms active helper has no operation index. Identical operation slots were
  refused locally with broker_ambiguous_batch/retrySafe:true and unchanged
  request directory: no wake/model call or native effect. Distinct slots remain
  allowed. Indexed capability requires actual completed current-epoch helper
  evidence; newer host code/staged index support alone cannot enable it.
- Native foreground helper3777/start07:44:09 was independently live in the
  broker ancestry, selected sealed4af/gen6 and writing fresh waiting heartbeats.
  native-current-host-resident-pickup-2026-10-07.json: currentc969 host read
  rmuxt0eh1-a9a047 completed5.458s via resident with real native receipt/matching
  admission and no wake metadata/progress delivery. No explicit peer wake or
  Stop continuation was required. After serving, readiness was revoked on
  working/completion; later broker was idle without a waiter. This is one real
  warm pickup, NOT proof that the model consistently stays in its loop or of
  sustained residency/governor protection. Do not infer readiness from busy.

New safety/efficiency fixes:
- Reject repeated identical native operation slots before enqueue when deployed
  indexed checkpoints are not independently proved. Do not split/replay a batch
  automatically; batches remain non-atomic. Synthetic compatibility retained.
- Lock timeout/abort and other failures before publication explicitly report
  dispatched:false/retrySafe:true without a request ID. Actual held-kernel-lock
  tests prove no request/socket message for contention deadline and abort.
- Publication precedes notice/progress setup. A callback/local I/O failure there
  now cancels the exact durable request, disarms only its arm, returns its ID and
  preserves native mutation outcome_unknown/retrySafe:false. Pure undispatched
  cancelled reads retain narrower retry semantics. A known receipt is available
  for inspection, not permission to replay; client failures get a named category.
  Actual client subprocess/socket tests cover progress failure after publication
  for both reads and gated native mutations. No historical control was rewritten.

Final full isolated suite passed unchangedc969 in
v2-2026-10-07T07-44-58-309Z.json. Native batching/concurrency on earlier candidates
and actual currentc969 foreground serving are separate evidence; none proves
all controls, steering, cold recovery or rollback. Read-only probe now supports
explicit sequence/concurrent/batch modes and bounded1..5 requests. It records
end-to-end wall time, actual90s deadline, operation success and distinct source/
hook/dependency fingerprints without raw tool output.

All15 historical mutations and legacy reports021323/021456/023210 remain pending
with existing durable blockers; no replay/ack/gate bypass. Complete fixed-range
historical audit is still causalOutcome:unknown/retrySafe:false, despite absence
of unmatched calls in that range. Local detector30s/zero-inference and hourly
observer fallback remain; scheduled Codex inbox ticks still infer.

Next: qualify reversible controls and unique-nonce recipient steering on the
existing owned fixture, restoring its archived/unpinned baseline. Follow public
archived-session guards; do not bypass them with raw calls. Old reply tokens
cannot qualify a new run; use fresh request/recipient causal evidence. Inspect
platform hook fault behavior and establish actual owned STOP-barrier quiescence
before changing deployment admission for historical unknowns. Safe indexed
handoff/rollback, sustained loop/residency, natural governor pressure, unattended
cold recovery, compact/quiet combination and event-triggered inference remain
open. No user input is required for this checkpoint.

## Previous frontier — October 7, 03:33 Eastern

Goal ACTIVE: compact native continuation now has repeatable read evidence, but
NOT general-use ready. Preserve input quarantine, current native process/model/
permissions, observer ownership and historical uncertainty. No new chats,
keyboard/CUA, app restart, blind replay or competing offline recovery.

Same broker local_35b3ba48-f02e-48de-bfbb-925192d90de1/PID71262/start
Wed Oct7 03:24:51 2026 UTC is independently idle with integrity true and no
handoff STOP after testing. Active dependencies4af08654/bootstrapeb5cb750/gen6
remain unchanged; quiet waiting remains OFF and no actual waiting helper is
claimed. Current host and installed hook package:
954ccca6042f8afff01da2587080a0cceb6d3c8f5bc85901e3ef183c527541ac.
Handler6d10c509e82c44a36eef0d54988e112263664e89a5021b5097f9fb98c03decb2;
settingsf1f133b3e74d0a843bb22aeeb9f1460e5b6a956a5a04e3d13a22ae364555ac1c.
Installed feedbackVersion2 is an explicit service-local candidate. Version1 is
still the default for new installs; no global mode/model/auth change occurred.

New execution experiment:
- Fixed compact feedback names the pending ID, asks for Read ./CLAUDE.md as
  its next action, then the documented maintenance/tool/wait/check sequence.
  It is under half the previous directive's length and carries no operation
  arguments. Exact per-ID/peer/epoch consumption records bind feedbackVersion;
  collectors accept only the fixed text of that consumed version. Unknown
  versions refuse. Compact and optional quiet waiting cannot be combined yet.
- native-compact-read-sequence-2026-10-07T07-26-04-397Z.json: two reads passed
 12.879s/11.057s on loaded/installed52702ce0. Independent journal replay proved
  BOTH compact continuations landed and then used tools. Later independent
  receipt/admission inspection verified success, exact gate tool IDs and gen6.
  Host audit code was added later; do not conflate that later source with527.
- Native follow-on07-28-11-461Z FAILED: first read12.905s passed; second
  rmuxsd9rd-e01269 exceeded its30s deadline. Unlike earlier no-tools failures,
  compact continuation DID execute CronList/ToolSearch/wait. Native automatic
  context compaction crossed the deadline, resetting parent UUID ancestry.
  Checkpoint returned dispatch:false/cancelled at07:29:19.812Z; a later native
  get_session attempt was denied by actual PreToolUse at07:29:20.046Z. No
  admission marker or correlated success receipt exists for that request.
  Preserve native-compact-follow-on-failure-forensics-2026-10-07.json and
  native-compact-expiry-gate-proof-2026-10-07.json. Do not call it recovered
  serving or weaken expiry because the model continued. Compaction was native,
  not an agent-requested context reset. Broker returned idle without intervention.
- Post-compaction standard90s-budget sequence07-31-22-114Z PASSED three reads
 12.377s/10.753s/10.852s on unchanged954ccca6. This is stronger sequential read
  evidence, not a latency guarantee. Every op.ok, native receipt and exact gate
  ID/gen6 independently verified in native-compact-post-compaction-independent-
 2026-10-07.json. The probe now requires operation success, not just transport
  receipt existence, and records its actual deadline. Original short-deadline
  failure remains failed. No second wakes, new chats, model changes or recovery.

Final full isolated suite passed on unchanged954ccca6 in
v2-2026-10-07T07-31-03-240Z.json. Tests cover actual concurrent command-hook
single consumption, compact/legacy version binding, arbitrary-version refusal,
policy enrollment/quiet incompatibility and historical evidence bounds.

New read-only historical audit scans a COMPLETE fixed range of the exact owned
journal, not a tail sample:5992307bytes/4334records for15 uncertain requests in
native-historical-effect-complete-range-2026-10-07.json. It hashes the range,
checks inode/owner/cursor/line/total bounds and emits tool IDs/results metadata
only. All matching tool calls in that range have results; zero exact matching
send invocations. Identical archive/pin calls can belong to another request.
Neither matching results nor absence proves original causality or absence of
queued future effects. All15 requests remain outcome_unknown/retrySafe:false;
release handoff is still refused. The auditor does not write receipts/control.

Next: expand compact candidate beyond reads to current-source controlled
mutation/cancellation, native concurrency and sustained steering qualification.
Resolve dependency-upgrade quiescence with an actual owned STOP barrier and
mechanically validated historical disposition that preserves causal unknowns;
never bypass the existing gate on desired-state readback alone. Quiet/compact
combination, distinct-build rollback, natural governor pressure, unattended cold
recovery and fully event-triggered inference remain open. Keep detector30s/
zero-inference and hourly observer fallback; Codex inbox ticks still infer.
Report scanner still only lists unchanged legacy021323/021456/023210; preserve
pending blockers. No user input is needed at this checkpoint.

## Previous frontier — October 7, 03:22 Eastern

Goal ACTIVE: working core interface, reliability hardening, NOT general-use
ready. Preserve keyboard/paste quarantine, native PID, permissions/model and
observer ownership. No competing recovery, replay, new chats or app restart.
Codex/1Password work stay separate. No user input needed for this checkpoint.

Current read-only broker check: local_35b3ba48-f02e-48de-bfbb-925192d90de1,
PID71262/start Wed Oct7 03:24:51 2026 UTC, idle, integrity true, no handoff STOP.
There is no verified current foreground waiter and quiet enrollment is OFF.
Dependency4af08654/bootstrapeb5cb750/generation6 remains active. Installed hook
404a085e0c7a6ecc8f7829a22f0ad1e415099f1b40d50eb9e1f059b7457e6290,
handlerabbf3c152a4397b5609a6f7bfb7a9d0a602b1f3daa87959a477ea47f37982993,
settings27b3730a20fb790a6eccc9f7b45b85cf388337e4bc9e4173bf6564de8d6ee1ad.
Current host candidate 8a6c7b6f640709d0bcde3d912209275642a847ada2560a93e50cf46e8c969db0 has later continuation-collector and
malformed-pointer fixes; it has isolated/replay proof, not a new native turn.
CLI2.1.289/app2.26454.0 remain the inspected versions.

New improvements:
- Native working/rearming heartbeats no longer prove a pickup channel. Verify
  selected sealed waiter entry, current epoch/build/generation, real helper
  PID/start/PPID ancestry, fresh waiting heartbeat and no completion marker.
  Legacy process timestamps have one-second precision; this is scoped liveness
  evidence, not protection against a hostile owner. Quiet proof stays separate.
- Before enqueue, wait for that actual channel or a stable idle boundary. Busy
  turn expiry/cancellation/epoch drift refuse before a durable request or send.
  Synthetic/non-native heartbeat compatibility is explicitly weaker and retained.
- Each ordinary pulse names its durable request: claude-driver request <id> v7.
  Generic wake/drain v6 aliases remain for recovery. Exact arm ID and actual
  queued protocol are required; no new chats, model change or operation payload.
- Receipt collection follows only the exact fixed native isMeta Stop feedback,
  backed by per-request/peer/current-epoch consumption and causal UUID ancestry.
  Initial end_turn waits for the owned hook decision or bounded continuation.
  Metadata alone never creates a receipt; foreign/human/late/forged feedback
  cannot join the chain. One wake/rescue budget and uncertainty guards remain.

Native evidence remains FAILED overall:
- native-turn-boundary-read-sequence-2026-10-07T07-08-22-187Z.json:
  first read11.998s passed, second expired30s. Its generic wake had NO native
  records since cursor; socket return was not intake proof. Preserve forensics.
- native-request-pulse-read-sequence-2026-10-07T07-14-50-012Z.json:
  first read13.772s passed with real receipt; second rmuxrw3em-e78c3a was
  unclaimed and cancelled/broker_not_serving. Exact request pulse DID land and
  one Stop continuation DID persist, but both turns ended with zero tools.
  Cancellation was AFTER the continued end_turn; premature cancellation was not
  this failure's cause. No dedup root-cause claim is justified by this trial.
- native-owned-continuation-collector-replay-2026-10-07.json: new host collector
  replayed the bounded original journal with unchanged inode/cursor and correctly
  bound the continued terminal, zero tool calls/no receipt. No inference/UI write.

Initial native-only residency change broke nine synthetic MCP cases; failures
v2-2026-10-07T07-06-00-550Z.json and 07-06-24-212Z.json are preserved. Compatibility
was fixed, full isolated suite passed07-08-11-325Z and final v7 pulse07-14-04-985Z.
Current continuation candidate passed07-21-11-631Z; final malformed-pointer check
passed the full unchanged-source suite in v2-2026-10-07T07-21-37-014Z.json.
All artifacts are under <state>/pressure.

Read-only installed receiver inspection and isolated VM probes show that the
inspected peer inbox handles user/known control actions; SDK turn_handoff RPC
is unhandled on this transport. peer-contract-2026-10-07T07-06-18-488Z.json passed
nine scoped checks with no native sends. SDK schema existence does not establish
an external direct-dispatch API. No attaching/spoofing stdio or app mutation.

Fifteen legacy enqueued mutations remain outcome_unknown/retrySafe:false.
native-historical-effect-current-state-audit-2026-10-07.json confirms their three
owned target fixtures are archived/unpinned/not live; exact old send text is
absent from its bounded recipient journal. That does NOT prove no queued/late
send or settle original causality. Keep release handoff refused; do not fabricate
receipts or replay. A future mechanically validated STOP-barrier operational
retirement strategy must preserve causal uncertainty and be reviewed/tested
before changing admission. It is a candidate, not implemented or qualified.

Report scan still lists only unchanged legacy021323/021456/023210; reuse their
durable blocker notes, no ack/repeated analysis. Local detector remains30s with
zero inference; hourly Claude observer is recovery fallback, not test pacing.
Codex report inbox ticks remain inference-bearing. General native steering,
sustained sequential execution, distinct-build rollback, natural governor
pressure, unattended cold recovery and event-triggered inference remain open.
Next: dependable execution dispatch and justified historical-effect settlement,
then current-source full native qualification. More identical prompts/polling
alone do not solve observed no-tools execution. Preserve failed outcomes.

## Previous frontier — October 7, 02:57 Eastern

Goal ACTIVE. Working native prototype, reliability hardening, NOT general-use
ready. Keep input quarantine, current native PID/permissions/model and observer
ownership. No keyboard/CUA, app restart, session process kill, context reset,
new chats, blind replay or competing recovery. Codex/1Password work stay separate.

Current broker remains local_35b3ba48-f02e-48de-bfbb-925192d90de1,
PID71262/start Wed Oct7 03:24:51 2026 UTC, dependency4af08654/generation6,
CLI2.1.289/app2.26454.0. Integrity/current-epoch entries verified. Hook package
35e9c23325a37cdad4b4b57e60f72114a4837f08ba38ed9efe2ad4b5e08ce677 is installed
with quiet waiting DISABLED after clean experimental expiry. Handler hash
 ee8c649e59324d64704e265d95095649d8384d45406340cb524985053e48dd33;
settings hash d8c8edfc0207bcb2cdbc5132a4bf6b091c32153f642464b9f97dae5dcadee9ff.
Host candidate has a later strict quiet-policy shape amendment; distinguish its
isolated proof from this installed/native-tested package. No release handoff.

Verified progress:
- Fixed continuation wording scopes the one-rescue budget to EACH request ID.
  Historical assistant statements about an exhausted lifecycle do not authorize
  STOP or terminate the service. This is a cue, not a guarantee of execution.
- One native batch read/archive completed15.635s with both admission IDs/native
  receipts; independent metadata confirms the existing owned fixture archived.
  `native-request-budget-batched-cleanup-2026-10-07T06-43-44-349Z.json` passed.
  Earlier uncertain archive attempts remain uncertain; desired state does not
  prove which old request caused an effect.
- Sequential ordinary reads still failed on the second request:
  `native-request-budget-sequential-2026-10-07T06-45-03-456Z.json`.
  Detector024454/024525 match rmuxqsph8-d35958, expired read, retrySafe:true,
  no receipt. Later liveness is queued-metadata clearance, NOT crash diagnosis
  or recovered serving. Review: `native-request-budget-detector-review-2026-10-07.json`.

Opt-in bounded mechanical Stop-hook POC is now implemented. Service-local policy
allows1000–60000ms; default off, PreToolUse timeout remains5s. It verifies native
identity/ancestry/version, current dependency pointer, actual policy/handler/
settings bytes, exact owned peer wake or consumed fixed isMeta feedback. An
exclusive helper owns bounded readiness metadata; actual helper PID/start/
ancestry, pointer and TTL are independently checked by clients. It polls only
one durable request notice with no idle model calls, copies no operation data
into feedback, and shares the same one-rescue-per-ID consumption file. Different
request IDs may continue a continued hook; the same ID cannot. STOP, policy drift
and expiry terminate waiting; handoff settlement retains its separate path.
A dead helper can leave an exclusive owner marker: readiness then fails, but
automatic stale-marker reaping is intentionally not implemented. Reconcile that
owned marker before re-enrollment; never infer readiness from a file alone.

Native experiment FAILED execution reliability:
- `native-quiet-read-burst-2026-10-07T06-55-03-695Z.json`: first get_session
  passed12.226s with a real receipt; second rmuxr6hdm-4d4631 expired30s.
- Mechanical continuation consumed at06:55:22.497Z and EXACT feedback persisted
  at06:55:22.500Z. Claude ended with no tool calls, then stated it was processing
  the request. Native helper48445 really waited afterward, but that proves only
  signaling/liveness. It does NOT prove the model executed the directive.
  See `native-quiet-continuation-forensics-2026-10-07.json` and matching
  `native-quiet-second-read-forensics-2026-10-07.json`.
- Quiet helper exited on its60s bound; owner absent/nativeidle independently
  checked before disabling quiet enrollment at06:56:40Z. No replay or kill.
  `native-quiet-experiment-settlement-2026-10-07.json`.

Isolated safety/contract tests passed on the native-trial candidate in
`v2-2026-10-07T06-54-39-457Z.json`. New actual subprocess tests cover no idle
feedback, exclusive ownership, distinct continued requests, cancellation,
expiry, STOP, policy drift, foreign human messages, helper death/epoch/TTL and
handoff settlement. Final strict-shape amendment passed the complete isolated suite on unchanged
source in `v2-2026-10-07T06-58-16-840Z.json`; these tests do not establish native
general-use readiness.

Next: focus on dependable execution dispatch. A purely mechanical signal can
reach the native context while the model still ends without tools. More polling
or identical wakes do not resolve this. Bound future experiments, preserve the
failed requests and independently verify actual dispatch/tool receipts. A
read-only app/CLI source inspection found in-process SDK MCP routing but no
external tools/call route in the inspected peer inbox; that is a scoped negative
observation, not proof no supported direct route exists. Do not attach to/spoof
parent stdio or alter the app. General steering, sustained latency, distinct-build
rollback, natural governor pressure and unattended cold recovery stay open.

Fast sensing remains the local zero-inference30s detector. Hourly Claude observer
is fallback only; active testing does not wait for it. Codex report inbox30s still
uses inference. Old reports021323/021456/023210 and15 historical mutations remain
pending with durable blockers; no blind replays. Archive cleanup is settled for
the fixture, not for those original causal outcomes. The old frontier below is
historical; in particular its unarchived fixture statement is superseded.

## Previous frontier — October 7, 02:35 Eastern

Goal ACTIVE. Working native prototype, not general-use readiness. The latest
full native suite FAILED; isolated/API passes are not native reliability proof.
Use current CLI/fresh MCP. Input automation remains quarantined; no app restart,
session process kill, context reset, model/auth/permission change or observer send.

Critical failure: rmuxpt37w-d5e587's helper returned dispatch:false/cancelled
at06:17:40.736Z, but Claude invoked the exact archive at06:17:41.324Z and the
owned fixture became archived. The old retrySafe:true claim was false. Preserve
`native-late-cleanup-forensics-2026-10-07.json`. Current inspection/errors report
outcome_unknown/retrySafe:false for every enqueued native mutation lacking a
correlated receipt, even with a recorded gate policy. Pure reads/pre-enqueue
refusals retain narrower safe retry semantics. Jobs propagate uncertainty.

The service-owned PreToolUse hook now gates actual mcp__ccd_* calls using native
SID/PID/start/cwd/version/ancestry, immutable current template, completed epoch
checkpoint, live request/index/canonical arguments, deadline/cancel/STOP and
recorded installed handler/settings hashes. Exclusive per-slot consumption binds
the native tool_use_id. No permission allow or inference hook. Malformed and
oversized PreToolUse input explicitly denies; bad Stop input stays quiet.
Platform hook timeout/runner failure remains a limit; policy presence alone is
not absence-of-effect proof. See [native-effect-admission.md](native-effect-admission.md).

Host/installed hook package e8b16514fc567713cc27b3f70d59337198b45ca4214a13d67e2bbaedb0d24895;
handler SHA2561ff90b8a72c68fbf45f7fccbd822b82404a727ee7b0966ab33f35fcd7c827644;
settings hash aa4e16a164c1a3dc8f0f5faea5ae59de6f59c2d123211606720c5d480a93b9fc.
Dependency package remains4af08654459f514c1e0d76f0071b54ddb6e22e1805bbb7db101a632d0a387912,
bootstrap eb5cb750e09080502b44a970dc3b18ef083ecb4beb9fdc0d3e4bb1c1acfa3492,
generation6; same broker PID71262/start Wed Oct7 03:24:51 2026 UTC,
CLI2.1.289/app2.26454.0/Haiku. Completed current dependency entry paths verified.
The new entry-index field is staged, not active; old entries admit unique slots only.

Evidence under <state>/pressure:
- Three unchanged-source isolated rounds on f824ce6c:
  `v2-2026-10-07T06-30-13-847Z.json`; final bounded-input e8b16514 passed one
  whole isolated round in `v2-2026-10-07T06-33-46-072Z.json`.
- Actual filtered Codex and Claude each passed10 API checks on f824ce6c:
  `harness-v2-codex-2026-10-07T06-30-28-082Z.json` and matching claude report.
  These predate the final input amendment; they perform no desktop effects.
- Native positive f824 gate: rmuxqala7-546ad7 completed12.430s, admission ID
  matched actual native receipt, same PID/gen6:
  `native-effect-gate-final-positive-2026-10-07T06-30-40-618Z.json`.
- Cancellation AFTER helper checkpoint produced a real native PreToolUse denial:
  rmuxq2or2-a1bd76, `native-effect-gate-negative-independent-2026-10-07.json`.
  This proves the earlier installed gate, not final provenance/input amendments.
- Final e8 bounded-input gate native read rmuxqg51n-4654bf passed13.174s, exact
  admission ID/native receipt matched. Its following desired-state archive
  rmuxqgf9k-b8cd4c expired45s and remains outcome_unknown/retrySafe:false:
  `native-bounded-gate-final-check-2026-10-07T06-35-45-388Z.json`. The whole
  cleanup report is FAILED despite the successful read; no replay.
- Earlier9-check native pass05:58 preserved. Later4af full run FAILED concurrency:
  `live-v2-2026-10-07T06-12-06-435Z.json`. Final f824 full run FAILED initial
  serving and cleanup: `live-v2-2026-10-07T06-31-26-193Z.json`.
  rmuxqbu92-490ff0 consumed one rescue, then continued Stop ended without tools;
  rmuxqc2c7-c5ba43 expired. Both now outcome_unknown/retrySafe:false. Forensics:
  `native-gated-wake-terminal-forensics-2026-10-07.json` and
  `native-gated-full-failure-review-2026-10-07.json`. No repeated wake/replay.
- Same PID survived180s, but pressureEvents=0, so natural-pressure gate FAILED:
  `residency-v2-2026-10-07T06-12-32-846Z.json`.

Idle-only immediate routing bypasses a blocked installed receiver chain in VM
and completed stable native reads; peer UUIDs now persist before bytes. Repeated
handoffs/concurrency still failed. This is not a proven native root cause or full
serving strategy. Preserve release-cycle06:00, idle-cue06:02 and immediate06:08
failures. Do not mutate old sealed snapshots or infer readiness from activation.
Quiet Stop-hook waiting is documented, not implemented or native-qualified.

Detector stays sealed5dfbbdc6/zero-inference/30s; hourly Claude observer is fallback,
not sensing cadence. Codex inbox30s ticks still use inference. Ten report reviews
are in `native-effect-detector-review-2026-10-07.json`. Reports021323/021456/023210 stay
pending: legacy set_pinned/archive effects lack native settlement. Reuse that
durable review instead of repeating unchanged analysis; no replay or competing
observer wake. Seven read/liveness reports may be acked by exact scanned hash after
repository checkpoint. Native liveness return is not serving/crash-cause proof.

Next: reconcile owned fixture cleanup and prior uncertain native effects before
another full run/handoff. Strengthen deterministic wake-to-serving: one-shot
rescue can still be ignored. Current-source steering, distinct-build rollback,
sustained latency, natural governor pressure and unattended cold recovery remain
open. Keep Codex/1Password work separate.

At02:36 Eastern the fixture local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 is
unarchived with an idle native process23791/start Wed Oct7 06:32:29 2026 UTC.
The broker remains71262 with no STOP/arm and verified current dependency entries.
Do not kill either process or call cleanup settled. Use the retained failed
cleanup evidence before any new deliberate desired-state action; no message replay.

## Previous frontier — October 7, 01:56 Eastern

The goal remains active: usable native control prototype, reliability hardening
in progress, not general-use readiness. Fast detection is the zero-inference
30-second local detector; the hourly Claude observer is fallback recovery.
The Codex inbox still makes inference calls on scheduled ticks. Active testing
does not wait for either observer schedule.

Native controls on the existing owned fixture passed after unarchiving it:
three settings in one request took 9.787s; three concurrent controls took21.079s;
independent readback and archived/unpinned cleanup passed. Evidence:
`native-valid-controls-2026-10-07T05-44-09-200Z.json`. The preceding archived
attempt produced a partial title effect before native pin/effort refusal; retain
`native-batched-controls-2026-10-07T05-42-01-109Z.json`. The host now rejects
known archived pin/effort prerequisites before dispatching any batch operation.

Deployment exposed a real stale-entry boundary: generation4 activation to
`dd307695157f992db0e01659bcaf6d9421f5dfb88203b948333cbc8c36944bd1`
with bootstrap `eb5cb750e09080502b44a970dc3b18ef083ecb4beb9fdc0d3e4bb1c1acfa3492`
kept PID71262/start Wed Oct7 03:24:51 2026 UTC and cleared the owned STOP.
Native maintenance cleanup succeeded. Claude subsequently invoked OLD sealed
3bfc scripts from context, bypassing the new entry admission. Integrity is true,
but native dependency qualification remains entry-evidence-mismatch. Do not
alter old sealed snapshots or count pointer activation as native deployment.
Evidence: `native-epoch-handoff-2026-10-07T05-47-40-871Z.json` and
`native-entry-paths-post-handoff-2026-10-07.json`.

A candidate broker-scoped PreToolUse command adapter redirects only exact
known wait/check invocations to the current sealed release. It validates the
native SID/PID/start/cwd/version/ancestry and immutable script hash, refuses
shell composition/background/unknown commands, and supplies updatedInput
without a permission allow decision. Actual subprocess tests cover foreign
identity, modified/writable script bytes and shell syntax; 12 focused cases
pass. This adapter is NOT installed or native-qualified. Installed Stop-only
hook remains dd307695; host candidate is
`78d937dcc327985999e8099241127037fd772d10a04d7e458954e432a77d2434`.
Three unchanged-source isolated rounds passed in
`v2-2026-10-07T05-56-01-765Z.json`. The latest actual Codex filtered10-check
pass is dd307695 in `harness-v2-codex-2026-10-07T05-48-56-472Z.json`;
Claude filtered proofs are older. Do not promote them to the new host build.

The first post-handoff request rmuxorta2-e8d52a expired without dispatch;
no native acceptance was established. A later stable-window read rmuxov0j8-55bb8f
hit its15s deadline after dispatch, then independently reconciled to a completed
native receipt. Keep its outcome_unknown/retrySafe:false control state and do
not replay. Evidence: `native-late-epoch-reconciliation-2026-10-07.json`.
Detector014828/014858 report hashes respectively
`0c085d50453936ab4e943be528212398d7cceb2d5cb764a4afcf3032ec5176d8` and
`6d5378b09b4a31a7bcbcee86057f9350c36088c62ed74c7722cfa1c0af999d7b`
match that earlier expired episode. Their liveness-returned event establishes
queued metadata becoming absent, not a crash cause or recovered serving.
Current narrow broker status again shows foreground waiting, unchanged PID,
no STOP, and app-acknowledged native maintenance job2a2c851b/list05:50:26Z.
This is a point-in-time observation, not sustained pressure qualification.

Earlier44.7s native latency included a40.773s auto-compaction boundary near
191457 preTokens; see `native-client-latency-breakdown-2026-10-07.json`.
No context reset was performed. Batching and receiver-direct signaling reduce
avoidable turns, but sustained latency is not qualified.

Next: upgrade the service-owned hook after admission, qualify two native read-only
requests with completed current-generation wait/check observations, then rerun
the full broker-only suite on existing fixture
local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 with restoration/cleanup. Full steering,
different-build rollback, sustained latency/natural governor pressure and
unattended cold recovery remain open. No input/quarantine/auth changes, app
restart, session process kill or competing observer wake is authorized. Codex
and 1Password fixes remain separate. Checkpoint review before acknowledging the
two exact report hashes; preserve every failed and uncertain native result.

## Previous frontier — October 7, 01:41 Eastern

The goal remains active. Fast sensing is the installed zero-inference 30-second
local detector; the Claude observer's hourly job is fallback recovery, not the
detection cadence. Codex's report inbox still uses inference on 30-second ticks.
There is no event-triggered observer message or automatic cold recovery wired.

Native serving improved this turn: a service-scoped command Stop hook supplied
one bounded continuation after an exact owned peer wake ended without tools.
The receiver's installed 2.1.289 source and exact native receipt proved it adds
fixed prefix/suffix text around the envelope. The initial hook's bare-envelope
check therefore could not accept the actual stored wake; do not infer from that
failure alone that settings were unloaded. The corrected hook recognizes only
the exact installed framing, native peer msg_id, broker session/cwd/PID/start,
real process ancestry, short-lived pending undispatched request, and no STOP.
It ignores human messages, continued hooks, cancellation/expiry and unknown
versions. Atomic exclusive consumption permits one rescue per request, even
under concurrent invocations. No prompt/agent hook, model change or input used.

The ordinary client arms its exact peer UUID BEFORE socket bytes, sends one
wake with no inference sender/fallback, then disarms on settlement. Installed
policy and settings hashes plus sealed handler package must match. A changed
policy fails closed. The command hook remains installed only in the approved
broker's own .claude/settings.json; no global settings, permissions or auth
changed. It is a bounded per-request serving strategy, not proven residency.

Current host source: 1a3630389cdd14cca115bf31a15f70190b15c130fa07b30430b402b752f2ba26.
Installed hook package: aaa0992c97287486e16dbc1502f0235ee1095fd587ac37c84c1c350234cb7d6d;
handler SHA256 5f7ba49b85b5610410c48ad3acd172091437991f98c172d6a853d93860b028f5.
Active broker dependency build remains 3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b,
bootstrap 7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4,
generation 3, same PID71262/start Wed Oct 7 03:24:51 2026 UTC. No handoff STOP.
Do not conflate host, hook package and broker dependency pin.

Evidence in <state>/pressure:
- native-stop-rescue-2026-10-07T05-30-36-723Z.json: initial FAILED hook trial,
  accepted wake/no tools, request rmuxo5m6t-cae19c expired undispatched.
- native-stop-rescue-2026-10-07T05-33-27-200Z.json: corrected hook invoked,
  one rescue, native dispatch/checkpoint/archive receipt. Original ok:false
  immediate metadata readback is preserved; do not replay the operation.
- stop-rescue-independent-readback-2026-10-07.json: independent later
  isArchived=true and exact cwd verified for local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14.
  The old fixture is now cleaned up. Original request rmuxo99pm-a3dc30 completed.
- native-stop-rescue-client-2026-10-07T05-36-01-033Z.json: ordinary aaa0992c
  client passed a native get_session operation in44.716s, one peer wake/rescue,
  native-tool-result receipt and unchanged PID/auth. This is not a low-latency
  or full native-controls qualification. After settlement the model again idled.
- v2-2026-10-07T05-36-28-189Z.json: three unchanged-source aaa0992c isolated rounds.
- harness-v2-codex-2026-10-07T05-37-15-771Z.json: ten actual filtered Codex checks
  passed on aaa0992c, private synthetic stores/global configuration unchanged.

Current source also fixes pinned-entry provenance: activation records procStart,
wait/check validate the real native ancestry and emit epoch-bound observations;
foreign/current-candidate paths cannot claim an active release's work. Explicit
malformed epochs refuse. Legacy absent epochs preserve integrity but show
activation-epoch-unbound and dependencyPathsObserved:false. The active old pin
is legacy/unbound, so a future settled handoff is required for current-epoch
native release qualification. Seventeen release cases passed. No handoff occurred.

Forced exit truncated captured output: baseline256KiB helper lost three quarters;
actual public CLI baseline emitted65536 bytes of a270343-byte UTF-8 JSON result,
then exited0. Helpers and CLI now complete naturally, preserving full parseable
output. Reports entry-stdout-exit-reproduction-2026-10-07.json and
cli-stdout-exit-reproduction-2026-10-07.json preserve these comparisons.
A private test cleanup initially failed on sealed directories; corrected cleanup
unseals only its own temporary candidate before removal. No native failure erased.

Two detector inbox reports013111/013142 were independently reviewed: the first
observed the deliberately pending first trial, the second followed its expiry;
neither establishes a crash or serving recovery. Their exact hash review is in
stop-rescue-independent-readback-2026-10-07.json. Acknowledge only after checkpoint.

Final current-host checks after the CLI correction passed: three unchanged-source
rounds in v2-2026-10-07T05-39-19-699Z.json and ten actual filtered Codex checks
in harness-v2-codex-2026-10-07T05-38-56-434Z.json. Claude filtered harness checks
remain older; no additional Claude harness inference consumed this turn.

Next: qualify batched/concurrent native controls on owned fixtures. Before claiming
full current pin readiness, settle maintenance cleanup under an owned STOP,
activate an epoch-bound candidate without replacing PID/auth, and independently
verify completed native wait/check observations. Distinct-build rollback, natural
governor pressure, sustained latency and unattended cold recovery remain open.
Do not repeat unbounded wakes, create competing recovery observers, initialize
CUA/keys/pastes, lift quarantine, restart apps or change auth. Codex-driver and
1Password work remain separate. A prepared observer-model comparison is awaiting
human authorization; do not forward it or change that chat/model unapproved,
and reconcile the restored serving state before considering it necessary.

## Previous frontier — October 7,01:00 Eastern

Progress this turn: source-qualified deterministic peer transport, an installed
zero-inference 30-second detector, and a native-verified guard that prevents
repeated inference wakes after the broker ends without tools. The goal is active
and incomplete, not blocked/no-progress. The user wants fast signaling without
hourly detection delays; active work never waits for the observer's hourly job.

Host build: `16a95ad1b4468111154b985c7a759a9082d414c5c31632d44238dfe77a0eac93`.
Active broker build remains `3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`,
bootstrap `7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4`,
generation 3; same PID 71262/start `Wed Oct  7 03:24:51 2026`. No STOP remains.
The 30s detector runs its separate sealed 5dfbbdc6 package; this did not activate
a new broker dependency package. Workspace entry shim remains mutable. Completed
entry records/native receipt proved delegation, but exact current-process entry
provenance and rollback across distinct builds remain unqualified.

Transport 2.1.289 is now reviewed in VERIFIED_CLI. Seven installed receiver VM
checks passed in peer-contract-2026-10-07T04-43-32-185Z.json; initial extractor
failure is retained. Exact native peer msg_ids independently accepted in 155–159 ms;
no sender Claude inference turn. Version environment override removed; unknown
explicit-direct versions, invalid/private-mode/symlink keys, ambiguous or changed
PID epochs and malformed envelopes fail closed. Partial/uncertain writes never
fall through to another sender. Peer record reads use owned no-follow FDs.

Serving is still FAILED. Native reread(v8) was ignored; generic v7, named request v7,
then exact compatible v6 all ended without tools. Original 25/30 s expiries and
full-suite failure remain recorded, not counted as passes. A current ordinary
compatible direct client produced one correlated native end_turn with zero
calls; the guard cancelled pending work with broker_not_serving in 3353 ms, one
receiver turn, zero sender turns. Evidence: native-wake-end-turn-guard-2026-10-07.json.
Exact msg_id and UUID ancestry are used, never model prose. Other user branches,
sidechains and actual tool activity do not prove refusal; a checkpointed native
result wins. Three isolated rounds passed on 5dfbbdc6 in
v2-2026-10-07T05-00-48-265Z.json. A final progress-message-only correction
now says awaiting native serving evidence instead of asserting loop entry. One
full round passed unchanged 16a95ad1 source in
v2-2026-10-07T05-05-01-304Z.json. The native guard proof is on 5dfbbdc6; this
minor host change does not promote a full current native control pass. Actual filtered harness passes are older than
these host changes and must not qualify the current fingerprint.

Fixture local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 remains unarchived. All cleanup
requests are independently cancelled/expired before dispatch and retrySafe:
rmuxmikjs-994346, rmuxmjx67-3a93fa, rmuxmyift-8e9115, rmuxn2qt8-bd1e31.
Do not create another fixture or repeat full native suites until a justified
model/serving strategy changes. Sender-free wakes now work; further repeated
wakes alone have no supported improvement hypothesis.

Detector installed as com.taylor.claude-driver-detector,30s StartInterval,
sealed target in src/launchd/com.taylor.claude-driver-detector.plist. Reads only
owned broker/session/peer/control/request metadata; no keys or transcripts.
STOP suppresses events, idle alone is normal, fault transitions confirm after 2 s,
unchanged episodes deduplicate, reused PID epochs are events. Ten live read-only
samples mean 4.961 ms/max 8.556 ms; nine private cases passed including the atomic
report→hash scan→exact ack flow. It emitted the real pending unserved request
rmuxmyift-8e9115 at 04:57:28Z, then liveness-only at 04:57:58Z after expiry.
Those events do not establish crash cause or recovered serving. Review record:
detector-inbox-review-2026-10-07.json. Acknowledge exact filenames/hashes only
after commit/push checkpoint.

Observer schedule independently verified in native receipts: deleted owned
337cb675 at 04:42:03.979Z; created/listed exact hourly23 * * * * job ae838cf8 at
04:42:04.523/05.427Z, prompt claude-driver observer tick v1. Native cron expires
in 7 days/session closure. Fast detector reports feed the existing30s Codex inbox;
these scheduled Codex runs still invoke inference. No event-triggered Claude
observer send is connected; its hourly job is fallback recovery. Do not claim
hourly checks are the detection cadence or that native recovery is now event-only.
Last broker maintenance list04:37:33Z/job d7319422 is stale after 12 min; this is not
proof of job absence, protection, crash or governor eviction.

Next: mechanically bind pinned-entry proof to the exact current native epoch;
compare a justified native model or bounded one-request relay strategy against
retained Haiku no-tool end_turns before another full suite. Any observer native
control change/message needs human authorization for that chat; prepare a
compact one-time plan rather than reintroducing frequent inference polling.
Do not clear context, spoof native APIs, create replacement chats, start CUA,
lift input quarantine, restart apps, kill session processes or change auth.
Observer owns offline restarts; Codex-driver and 1Password work remain separate.

A broad launchctl print exposed inherited secrets in tool output. Subsequent
checks capture output privately and extract only state/runs/exit/interval fields.
Do not repeat environment dumps, copy values into reports, or read credentials.
Credential rotation remains necessary, outside this bridge change; no auth
mutation or rotation was performed.

## Previous frontier — October 7, 00:42 Eastern

A sealed broker dependency pin is active: build
`3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`,
bootstrap `7e62795266806cbd4435f68cc83f424e5299fe2ddd6e3f524babd1c7c39f5af4`,
generation 3; fresh host source
`04d6d6b381cf8610485cfc1ee1688f72f94cc6dcf6a42a9e5998c0545a7f099e`.
Controlled STOP/handoffs preserved broker PID 71262 and existing authorization.
First direct-path handoff FAILED: a native Read of updated CLAUDE.md was followed
by workspace Bash commands. Preserve release-native-paths-2026-10-07.json.
The corrected cached-command shim validates a separately sealed built-ins-only
bootstrap, which validates/imports the immutable wait/check dependency snapshot.
Completed entry records plus correlated native read receipt prove this path;
release-sealed-dependencies-2026-10-07.json passed in17.323s, original PID,
exact native maintenance job d7319422 and app recognition. Workspace entry shims
remain the minimal startup boundary; do not describe a matching instruction file
or selected entry as completed native execution. Subsequent workspace edits do
not automatically advance the active release. Invalid pointer, hashes, writable
files, symlinks and an owned deployment STOP fail closed in fresh clients.

Nine release cases plus the new build-binding qualification case passed;
five complete isolated rounds and both real filtered harnesses passed on host
04d6d6b3. Native full input-free report
live-v2-2026-10-07T04-37-49-840Z.json FAILED: initial reply/cancel passed, then
Haiku ended turns with 'Broker running' without serving the next request.
Repeated compatible wakes did not correct this. The owned test runner was
cancelled (not the native broker process) to stop further repetitive usage.
Input resource audit stayed zero and quarantine remains active. Fixture
local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14 remains unarchived after cancelled
cleanup; reconcile native dispatches and archive it safely before another full
suite. Do not repeat costly full suites until loop fidelity/wake delivery has
changed. Read-only native smoke does not qualify current full controls.

Next: finish that owned fixture cleanup with bounded recovery, mechanically
fence deployment/provenance to the exact native process, and compare a justified
transport/model improvement against the retained Haiku end-turn failures. A
new candidate snapshot has not been activated; rollback across different builds
and natural governor pressure/cold recovery remain unqualified. Do not clear
context, create replacement chats, lift input quarantine, terminate native
sessions, change auth or compete with the commissioned observer. The user has
requested a low-usage observer follow-up prompt; do not send it to another chat
or assume it was applied. Latest broker live/idle, no owned STOP remains.

# Claude-driver continuity — 2026-10-06

## October 7 continuation — helper and waiter pressure iteration

Current runtime `3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b`;
app 2.26454.0 / CLI 2.1.289, same approved broker PID 71262. The preceding
turn was progress, not a blocked/no-progress turn. The goal remains active.

Private tests reproduced seven failures in the original eight-case helper/socket
suite: a request's wake outlived its deadline, abort left a SIGTERM-resistant
helper alive, exited-helper output pipes extended the budget, and partial direct
frames/abort could fall through to another LLM send. The driver now shares the
remaining request budget with delivery, supervises only its own freshly launched
CLI child (TERM then KILL after250ms), settles cancellation after direct child
exit, and closes inherited readers without signalling descendants. A follow-up
fixture reproduced a synthetic late dispatch during cleanup; abort intent now
cancels the durable request concurrently with cleanup. Cancelled/expired synthetic
receipts remain cancellation errors with correct undispatched retry safety.
Actual native receipts still win a completed race; dispatch uncertainty is retained.

The intermediate native run failed. Its recipient interpreted automated stop as
human intervention and refused the peer replacement. Separately the broker ran
`broker-check ... && broker-wait ... > /dev/null &`, violating the standing
foreground rule. That hidden waiter claimed cleanup request rmuxlc7uv-e3ba0c;
the model's visible wait instead returned IDLE. The request expired without any
dispatch. A subsequent independently reconciled cleanup verified the fixture
local_a2e766c5-7566-42b3-8e50-3995cc200729 archived. Preserve this failure, never
claim the old native pass proves this branch reliable.

Mechanical waiter admission now rejects discarded/device stdout before a claim,
validates0–540s budgets, accepts native captured stdout in an owned regular file,
and holds a single kernel lock across the whole wait and pickup. Controls record
the picking PID for future diagnosis. The first pipe-only guard was too strict
for real native Bash output; that failed45s warm test and native refusals remain
recorded. Corrected regular capture warm activation received a native-tool receipt
in37.780s while preserving PID 71262 (three compatible wakes, one request/checkpoint).
This corrects the observed discard/duplicate-waiter cases; it does not prove that
arbitrary background captures reach the model or qualify direct wire on2.1.289.

The new disposable fixture bootstrap states the specific planned automated stop
and replacement up front. Actual human instructions still override it; unrelated
peer work remains unauthorized. The previously refused chat was archived and was
not sent replacement attempts. This is prospective scope clarification, not an
instruction to ignore a human stop. Current-source native input-free qualification passed all eleven checks with
zero input filters, exact replacement reply after the planned stop, one reply
per send and archived cleanup. Five isolated rounds passed124 cases each
(620 total); both actual filtered harnesses passed ten; four current installed
code governor scenarios passed in isolation. Native initial delivery/reply7.321s,
submit179ms, concurrent controls52.379s, batch38.011s and interruption28.026s
are measurements, not guarantees. Frequent peer-LLM re-wakes increased latency.
The broker often ends its turn despite the standing residency instructions;
transport/model fidelity remains a real reliability/efficiency frontier.

Reports under /Users/taylor/.local/state/claude-driver/pressure/:

- cli-budget-reproduction-2026-10-07.json and three retained baseline logs.
- native-hidden-waiter-2026-10-07.json: exact native violating command and refusal.
- live-v2-2026-10-07T04-09-18-109Z.json: failed native run, retained.
- waiter-guard-warm-2026-10-07.json: over-strict capture guard failure, retained.
- waiter-guard-capture-corrected-2026-10-07.json: corrected warm native receipt.
- live-v2-2026-10-07T04-18-49-103Z.json: eleven current native checks passed.
- waiter-native-maintenance-2026-10-07.json: IDLE04:21:15.157Z then
  CronList04:21:16.619Z on current source, reusing922e4a9e and PID 71262.
- governor-contract-2026-10-07T04-22-16-667Z.json: four isolated installed cases.
- v2-2026-10-07T04-19-29-815Z.json: five current isolated rounds.
- harness-v2-{claude,codex}-2026-10-07T04-18-49-090Z.json: current real filtered checks.

Two new observer reports (001827 and001927) independently corroborated the
capture-guard outage and recovery. Their build strings are explanatory text, not
fingerprints; source/native records were checked independently. Exact hashes and
review are in observer-guard-review-2026-10-07.json. Reports001827/001927 were acknowledged by exact scanned hashes after checkpoint
20004b9. A further002308 report corroborated unsolicited end_turns while the
broker stays live/cron-protected, making repeated client wakes necessary. Its
unique end_turn samples/template hash were independently verified in
observer-loop-drift-review-2026-10-07.json; counts/causal context-poisoning claims
are not promoted. Report002308 was acknowledged by its exact scanned hash after checkpoint
fa47c17; eight unique streamed assistant messages with terminal end_turn were
verified, without adopting causal context-poisoning claims. The observer is currently live/idle PID68416 and sent
no competing wake. The current source still directs native Bash into mutable
working-tree files. **Next priority: immutable qualified runtime staging and
pinned live wait/check paths before further source experiments.** Validate
snapshot hashes, current-versus-active build, controlled native handoff and
rollback without an app restart, auth changes or session termination. Do not
blindly apply the report's suggested context-clear or trigger changes.

A qualified snapshot is now staged (not active) at
`/Users/taylor/.local/state/claude-driver/releases/3bfc51e7b06c4aec8ac81b5f7ec28eb77f2e1507cf03379e7f468eee22afa98b/`.
`release.json` records hashes for57 source/doc files, native/filter/isolated
qualification references and two isolated smoke checks. Its build fingerprint
matches the workspace exactly; files/directories are sealed read-only. Live
instructions still reference workspace scripts. Do not treat this snapshot as
an installed host MCP launcher or a verified native handoff. Before further
runtime edits, settle the exact owned broker via its graceful STOP protocol,
reconcile pending dispatches and preserve PID/auth/job provenance; stage/test
activation logic privately, then qualify pinned paths and rollback without
external process termination. The existing observer must not compete with a
live warm handoff. Preserve all intermediate failures and exact source hashes.

After deployment isolation, qualify current-version deterministic peer wake
transport and/or compare broker model fidelity to reduce wake overhead and loop
violations. Real natural pressure and unattended cold recovery remain distinct,
unproven requirements. Do not manufacture OS pressure or kill desktop/user
session processes. Observer owns offline recovery; input quarantine stays active,
and this chat's old MCP still needs refresh. Both new scratch fixtures in
this continuation are archived; previous-turn fixtures remain parked.

## Previous settled frontier — historical

## Resumed work — latest frontier

Taylor resumed the goal on October 6 at 23:38 Eastern. Current runtime:
`d1cce7ed831d4298c0988a9e2728ff24347d3960db245cce857c8da18a3c8988`; app 2.26454.0 / CLI 2.1.289.
The approved broker remains PID 71262, session
`local_35b3ba48-f02e-48de-bfbb-925192d90de1`. Controlled graceful STOP and
warm handoffs preserved that process; no app restart or keyboard automation
was used. Current protocol is v7, with exact compatible `claude-driver wake v6`
and `claude-driver drain v6` aliases. Native sender names are routing metadata,
not authentication. Operations still come only from durable requests/checkpoints.

Two retained failures drove this iteration. First, the original IDLE branch
omitted CronList. V7 explicitly lists/reuses the exact job before its next wait.
The waiter also bounds its deadline by the last native list plus nine minutes,
including across intervening requests, and returns IDLE before claiming pending
work when that budget is due. The twelve-minute evidence freshness guard remains.
Second, a real v7 wake read the standing file then returned `ignored`. The accepted
v6 alias entered the updated loop on the same PID; ordinary clients now use that
compatible activation while queued requests keep protocol v7. No ambiguous send
was blindly replayed. Original failures and intermediate-source results remain
under `<state>/pressure/`.

The final-source native input-free suite passed all eleven checks: creation/import
and independently verified focus restoration, durable reply, cancellation,
concurrent and batched controls, busy queue, interruption/replacement, exactly
one reply per send and archived cleanup. Both input audits found zero filters;
quarantine remains active. Five isolated rounds passed 111 tests each (555 total),
and actual Claude Haiku/Codex gpt-6.1-sol each passed ten filtered synthetic checks.
Four isolated scenarios exercised the installed governor code without native OS
pressure. Normal-client warm activation had a correlated native receipt after
20.489 seconds; native submit measured 169 ms in the final suite. These are
observations, not latency guarantees or cold-recovery proof.

One intermediate-source native IDLE at 03:52:17.280Z was followed by CronList
at 03:52:18.832Z and rewait at 03:52:20.377Z, reusing job e969f887 despite
intervening controls. The final source then recreated/listed job 922e4a9e at
03:54:05.471Z / 03:54:06.819Z. Final-source IDLE at 04:03:06.882Z was followed by CronList at
04:03:09.251Z and the next wait at 04:03:10.919Z, reusing 922e4a9e
without another CronCreate. The ten-minute read-only observation retained
PID 71262 and fresh protection throughout, unchanged source and zero input
filters before/after. No natural governor pressure occurred; its overall
`ok:false` explicitly preserves that missing requirement, while idle survival
and native maintenance reconciliation passed.

Actual automatic compaction at 03:43:47.157Z reduced 188436 to 13857 tokens.
The native controls above passed after that compaction; this does not guarantee
standing-protocol retention through arbitrary future compactions. Do not clear
broker context or kill its process as routine recovery.

This chat's connected MCP reports driver `1a83e53`, API 2, runtime
`32a4b1193203c235dd0ed63876c4231d7783d6e3999e11b1792da32b213b8780`,
and lacks sourceBuild/restartRequired. It is outside qualification; use the
current CLI or a freshly connected MCP and verify current fingerprints.
Missing freshness fields in an older server do not establish safe write behavior.

The observer is live with its own five-minute job 337cb675; the Codex inbox
watcher is configured every thirty seconds and scans metadata first. Offline
recovery belongs to that observer; do not send competing cold wakes. Reports
234015 and 234531 were independently reviewed and acknowledged by exact scanned
hash after commit/push checkpoint e865a5a; the inbox is empty. A stale exited app query without relaunch, unattended recovery after
app closure/restart or cron expiry, actual natural pressure and safe keyboard
helper teardown remain unqualified. UI fallback stays disabled. The goal is now active (verified through get_goal), including automatic
continuations; do not mark it complete while the remaining reliability gaps persist.

Final-source reports under `/Users/taylor/.local/state/claude-driver/pressure/`:

- `v2-2026-10-07T03-54-01-092Z.json`: 555 isolated passes, unchanged source.
- `harness-v2-{claude,codex}-2026-10-07T03-53-19-256Z.json`: ten each.
- `governor-contract-2026-10-07T03-54-52-058Z.json`: four isolated scenarios.
- `live-v2-2026-10-07T03-54-52-074Z.json`: eleven current native passes.
- `residency-v2-2026-10-07T03-54-52-060Z.json`: ten-minute idle survival and
  fresh evidence passed; natural pressure absent, overall qualification false.
- `native-idle-v7-final-2026-10-07.json`: exact final IDLE/list/rewait receipts,
  same job/PID and no duplicate creation.
- `client-warm-handoff-2026-10-07.json`: ordinary client activation/receipt.
- `warm-wake-reproduction-2026-10-07.json`: real ignored v7 wake and failed
  synthetic baseline; corrected compatible client wake.
- `wait-budget-reproduction-2026-10-07.json`: actual waiter baseline claimed
  queued work before an expired deadline; corrected IDLE/STOP ordering.
- `v7-handoff-2026-10-07.json`: intermediate-source native IDLE/list/rewait.
- `observer-followup-review-2026-10-07.json`: report hashes and factual review.

## Earlier October 6 checkpoint — historical

Taylor resumed this work on 2026-10-06. Input automation remains quarantined.
The independent observer's first report was reviewed on October 6 at 23:27
Eastern: `claude-broker-20261006T232546-0400.report.json`, SHA256
`105e318b33d2114a515baf59c0574920528de25573ebd10158b7c91855ae0bae`.
The exact approved broker is now running as PID 71262, started at 23:24:51
Eastern. Its native create/list receipts and app acknowledgment independently
confirm maintenance job `3651b2a5`. The observer is the verified existing
`Broker Recovery Probe`, session `local_c98bc9eb-466e-4237-b199-ad4435bce111`,
with its own native five-minute job `337cb675` and persisted observer-v1.json.
Do not compete with its restart attempts or send another wake.

The earlier exit143 followed the intentional termination test, not a verified
spontaneous crash or governor eviction. Native logs independently confirm
Claude quit for an automatic update at 22:51:50 Eastern and relaunched at
22:52:00. The observer's successful native wake occurred after that relaunch;
it does not prove native-send recovery from the earlier stale-query state
without an app restart. Do not use external PID termination as routine recovery.
Current-source native controls and natural-pressure survival remain pending.

Current-source read-only report `residency-v2-2026-10-07T03-28-00-424Z.json`
observed the same PID for eight minutes, with zero input filters before/after,
unchanged source and no native writes. No natural governor pressure occurred;
overall `ok:false` preserves that missing requirement. The native trace also
exposed an omitted CronList after the first IDLE at 03:34:06.557Z, before the
next wait at 03:34:08.879Z. The last list remained 03:24:59.974Z, so its
evidence becomes stale at twelve minutes unless refreshed. This is not proof
of job deletion or eviction. Preserve `native-idle-rearm-2026-10-07.json` and
the [isolated protocol candidate](broker-idle-rearm-candidate.md). Do not load
it into the current broker during this restricted heartbeat. Current native
controls/import, loading that candidate and actual pressure survival remain
separate qualification work. The first observer report's factual review is
complete; these remaining goal requirements are durably checkpointed here.

Current runtime fingerprint:
`e959aec1f4983f78c833ff4e6370e016d5a3bb561fc7002082d147cb81d0817a`.
On this source, five fresh isolated rounds passed (105 cases each), actual Claude
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

Three further pressure boundaries were reproduced and fixed without native
writes: a second worker could reclaim a running job; a queued job could execute
on changed source; and a control could pass its entry check then cross a source
change while waiting for its recipient lock. Workers now claim only queued
unstarted jobs, retain the claimant PID, and bind startup to the submitting
runtime fingerprint. Unknown/mismatched provenance fails before dispatch.
Controls recheck after lock acquisition. Reattaching an old key never launches
another worker; a known-undispatched stale job needs deliberate new submission
on current source. Synthetic reproduction evidence is retained in
`worker-boundaries-reproduction-2026-10-07.json`; the original failures are not
counted as passes. Current-source native qualification remains pending.

A further crash/pause experiment reproduced overlapping callbacks in the old
age-reclaimed directory reaper. The current outer kernel flock now holds through
that recovery path. Node retains its inherited descriptor after an isolated
`/usr/bin/python3` stdlib helper exits; all current clients serialize through it.
Four regressions cover paused live reaper exclusion, actual holder SIGKILL,
queued cancellation and helper failure without directory-only fallback. The
initial crash fixture exited on an unfulfilled top-level await before it could
be killed; that fixture failure was corrected with a live event-loop handle,
then the actual holder death was verified. The old directory guard is retained
for compatibility; old MCP clients remain outside current qualification until
refreshed. Never unlink/age-reclaim persistent `locks/*.mutex` files: replacing
the inode can split a live lock. No 1Password source, credential, app process or
input helper changed. Ten synthetic durable submits during concurrent checks
measured p50 56.30 ms / p95 63.66 ms; this is not native response latency or an SLA.

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

- `v2-2026-10-07T03-16-48-625Z.json`: five isolated rounds passed, unchanged source.
- `harness-v2-{claude,codex}-2026-10-07T03-16-07-134Z.json`: ten checks per harness.
- `governor-contract-2026-10-07T03-16-07-133Z.json`: four installed-code scenarios.
- `governor-extraction-failure-reconciled-2026-10-07.json`: failed old extractor,
  reconstructed failure evidence explicitly marked; not a native pressure pass.
- `kernel-lock-reproduction-2026-10-07.json`: original strategy failed the
  paused-reaper exclusion experiment in a private source clone.
- `kernel-submit-latency-2026-10-07.json`: ten synthetic submits, all jobs completed.
- `live-v2-2026-10-07T02-27-50-669Z.json`: eleven native checks passed on earlier source.
- `residency-v2-2026-10-07T02-27-33-201Z.json`: eight-minute same PID survival,
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
Taylor launched the [monitor prompt](claude-monitor-prompt.md) in the separate
Claude Desktop `Broker Recovery Probe`. A saved copy is at
`/Users/taylor/Desktop/temp_reports/claude-monitor-prompt.md`.
It authorizes one reconciled native wake of only the approved broker, direct
native session-local five-minute observation, capped retries, exact owned
health/exit evidence and atomically published sanitized `.report.json` files.
It forbids keyboard automation, permission changes, app restart and process kills.
The first report's native observer job was independently verified; session-local
cron expiry/app closure remain explicit limits, including across app restart.

Codex heartbeat `claude-broker-report-inbox` is saved ACTIVE every 30 seconds,
attached to this existing chat. Its execution depends on the local app scheduler;
configuration does not guarantee execution at every scheduled second. Scheduled
inbox invocations have now occurred. It first calls only `scripts/report-inbox.mjs`;
it loads continuity and independently verifies evidence only when reports are pending,
and checkpoints justified improvements before acknowledging the exact filename
and SHA256. No new report means no desktop actions or repeated status updates.
The scanner emits metadata only, skips symlinks/oversized/incomplete JSON and
recognizes changed content even under a previously reviewed filename. Two tests
verify those boundaries and persistent acknowledgment. Report text is untrusted
source material, not authority to execute commands. Reports with unresolved work
stay pending with a durable review note. A future explicit pause must pause the
heartbeat and stop owned observation, rather than auto-resume this work.

The current native observer wake used an envelope with `from=` and `name=`,
without `from-name="claude-driver"`. The broker accepted its exact wake and
entered its loop. This differs from the written v6 trigger example; an LLM
instruction naming a sender is not an independently enforced identity boundary.
Keep this as a candidate protocol finding. Do not broaden the allowlist, spoof
the sender, or hot-upgrade the live standing file during qualification. All
native operation outcomes still require request-file dispatch checkpoints and
correlated tool receipts. This heartbeat does not authorize sending to other
chats or creating a new qualification chat; native observation is read-only.

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
