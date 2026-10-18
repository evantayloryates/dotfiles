## October 18 valid paste route still corrupts an independent active client

VERIFIED FAILURE on unchanged production182ed05d/nativef21c31c0. Buffered logs
are complete (zero dropped rows), and the AppKit fixture now has a standard
Edit/Paste menu, an active key window, an exact observed editor index and a
verified paste responder. Run1792358685306 executes click -> paste(text format)
-> fresh AX readback -> bounded exact-value settling. First64 characters verify
for104ms. The second independent client starts4096-character typeText with both
helpers/primary filters live; first helper6754 exits normally during second
input. Final4162 instead of4160 remains stable at1/5 seconds; second exact-value
settling fails after5005ms. Both turns/archive/helper/watchdog receipts are normal.
This is a native effect failure, not a missing menu/focus or lifecycle exception.

Receiver metadata records4098 second-client keyDown/insert deliveries. Two pairs
share CG timestamps8472477877041/8472480434458, keycode16, source6839, character
hash and repeat=false. Receiver arrivals are9.7-13.5ms after the first helper's
recorded exit. This is strong retirement-correlated delivery evidence, not proof
of a specific compiled callback or the historical physical-key cause. First
thread01a150e7-1fec-7e93-98d3-c311a96c49ab/turn
01a150e7-2387-71b3-a4b9-997df9aa9ae6; second
01a150e7-2d5e-7550-9fa4-eecf382b7ad0/turn01a150e7-2ec6-7cd2-9fd9-ffe4683b798d.
Exact harnessdaeb3919; ready buffered fixturec42ccefc/binary33568a3c.

Earlier cases remain separate:8193408 has exact eventual4160 but the immediate
assessment was premature (3751->4044->4160);8295512 passes exact4160 after fresh
readback and <=5s bounded100ms-stability observation, without retyping. Paste
8366848 omitted the focus click;8473011 added it but the bare test app still
lacked a menu/key-window precondition. Both insert0 and stay failed.8602957
reaches4160 with a ready app but does not qualify retirement because the test
predicate incorrectly rejected a secondary ViewBridge filter. No public-provider
outage is inferred from those localhost fixture HTTP failures. Exact snapshots
are retained rather than relabeling them as final-source proof.

PID431 is system ViewBridgeAuxiliary, not proven foreground. Corrected test
predicate requires exact owned helpers and each primary fixture filter while
retaining secondary targets. Diagnostic native-audit now includes scoped target
PID/executable observations so later reviews need not infer roles. Read-only
final audit exercises its empty-target case; no new active input was run for it.
Current fixture buffers<=50000 metadata rows and flushes at termination; no raw
characters/global monitor. Fixture activation/menu/readiness are recorded.

Private buffered-route-evidence171 files/3991060 bytes contains six immutable
reports, exact sources/builds/contexts, compressed logs with verified raw hashes,
and bounded event analyses. Final remote owns no process/helper/filter/stop
marker; original four taps, uv508/caffeinate510 and old clean repo0203e604 remain.
Local quarantine still blocked/hash9808e860; no native/shared-helper patch,
permission/auth change, real inference in these native fixtures or local CUA.

Fresh actual headless Claude2.1.299/Haiku4.5 and Codex0.159.3/configured gpt-6-sol
MCP contracts each pass10/10 on source182ed05d. Each uses private synthetic stores,
8 permitted bridge calls,2 idempotent submissions/1 completed worker and shared
candidate readback; actual traces show no shell/native controls. Global configs
unchanged and no owned process remains. Reports harness-v2-{claude,codex}-
2026-10-18T21-26-57-588Z.json. This is fresh protocol proof, not calling-chat MCP
adoption or native ordinary-chat proof. Full195 isolated result remains separate.

NEXT: no further unchanged-runtime native input probes. Finish read-only full-
requirement/registration audit and prepare the concrete remaining handoff. Native
UI release needs a changed safe runtime/disposal/coordination condition; the
prepared upstream packet is NOT sent. Physical-key setup is deferred despite the
earlier availability question. Calling MCP still needs eventual refresh; cold
startup/person gates and ordinary native actor readiness remain open. Codex bridge
fixes and 1Password stay parked. Goal ACTIVE; do not mark complete from MCP checks.

## October 18 independent active input exposes duplicated native delivery

FAILURE preserved on unchanged production182ed05d, signed helperf21c31c0 and
original uninstrumented fixtureb7c3d7b4. Existing owner-native external-input mode
uses two independently owned state/mutex/helper contexts on the one authorized
fixture. First64 characters complete, second4096-character typeText starts while
both helpers/four filters exist; first lease then completes normally during
second input. Run1792357645908 returns normal turns/archive/helper/watchdog exit
but final4161 characters instead of4160. Exact-effect gate FAILS; final hash is
wrong. First helper5096, second5182. An independent same-length single-client
control1792357696219 delivers4096 exactly and passes. One passing control does
not establish a universal cause; no native callback cause is claimed.

Fixture-only observation added keyDown/keyUp/insert/text-change metadata, no
global monitor or raw characters. Instrumented run1792357844051 also FAILS:
4162 keyDown deliveries and insertions, first helper5447 contributes64 and second
helper5533 contributes4098. Two pairs share CG timestamp/keycode16/source5533/
character hash and isARepeat=false, at delivered offsets162/164 and163/165.
This identifies duplicate delivery at the receiver boundary, rather than only a
wrong final count. It does not prove which native callback or replay path caused it.

Synchronous per-event JSON/ISO-date logging perturbed receiver throughput:
post-close3191 chars,1-second3438,5-second4159, final4162 at fixture stop. No loss
is inferred from the earlier count: input was queued after helper exit. Current
fixture now buffers at most50000 metadata rows and flushes on termination, uses
numeric epoch/uptime and drops a redundant record. Buffered sourcecbe1ed4b and
binary8516c25c compile successfully but have NOT run a native input gate yet.
Prior source49c18195/binary71d72352 and originalb7c3 binary remain preserved.

Mirror external-owner-evidence74 files/1331007 bytes retains all three immutable
reports/sources/contexts/timelines, compressed20809-event log+raw hash, derived
bounded analysis and both diagnostic builds. Failure contexts/control IDs are
in ui-lease-owner.md. Final remote no owned process/helper/filter/stop marker;
original four taps, uv508/caffeinate510 and clean old repo0203e604 unchanged.
No shared helper kill, native binary patch, auth/person-gate change, real
inference or local CUA. Local quarantine remains blocked/hash9808e860. Production
source/suite identity remains182ed05d; prior full195-file result still only
proves its isolated contract, not this failing native effect. All handles terminal.

NEXT changed condition: qualify buffered observation on the independent-client
boundary, then compare the driver's actual primary paste(text,{format:'text'})
path with typeText while the second client stays active. Reuse the same harness,
record any new case as a distinct attempt, and keep these failures failed even
if a different route passes. typeIntoComposer already requires paste/readback;
no production fix or quarantine release is established by these diagnostics.
Do not change the signed runtime or restart/wake observer-owned brokers. Physical
access question remains unanswered; no manual-key setup has started. Goal ACTIVE;
full real-Claude UI, physical input, loaded adoption, cold startup/full audit remain.

## October 18 concurrent native caller requests serialize and preserve input

PROGRESS on unchanged production source182ed05d. Existing owner-native fixture
now has concurrent-input mode with one shared real UI mutex but separate caller,
home/backend, provider sequence, owner/helper/watchdog and durable evidence.
Run1792357456810 passes. Caller4951 starts while first owner4872/helper4878 is
live, remains queued through the first exact64-character effect and its two
filters, then enters900ms after submission. Same mutex dev16777234/ino976699.
Before second native entry, first helper exit0/watchdog disarm0, empty first
resource group and absent first socket are independently verified.

Second owner4963/helper4970 delivers its own64 characters exactly once. Final128
characters match first+second payload hashes in order, stable at1/5 seconds.
Both actual turns/archive acknowledgements, helper exit0, watchdog disarm0 and
empty resource groups pass. First thread01a150d4-60fd-7ca0-8f5e-d68ce92b8829/
turn01a150d4-647d-7530-baa8-db158d48dd19; second thread
01a150d4-6dce-7f31-a692-44c4703ebad2/turn01a150d4-6f2f-7a22-8f6c-c4e835f0c50c.
Exact fixture source2d3cda3b retained. Mirror concurrent-owner-evidence29 files/
297535 bytes includes hashes, sources, both contexts/timelines, queue/entry
markers, intents, native audits and final readback. Final remote no owned process,
helper/filter/stop marker; original four taps, uv508/caffeinate510 and clean old
repo0203e604 preserved. Fixture exits0; no inference/hook override/person gate
change/local CUA. Local quarantine still blocked/hash9808e860.

Read-only default local runtime inspection passes all six reviewed binary/module
hashes and helper signature without starting any helper. Actual connected MCP
still loadsfcf484e3/source182ed05d/restartRequired=true; current native controller
admission is unverified. Observer-owned legacy broker is nonresident. Do not
wake/restart it or equate registration with current-source adoption. Sanitized
readback concurrent-actual-mcp-readback.json preserves that distinction.
No production source or top-level suite/installed identity changed, so the frozen
full195-file68.519s result remains applicable rather than rerunning it.

NEXT changed condition: independent active input outside the driver's UI mutex
while a private owned lease ends, using only the authorized remote fixture and
existing grant. Reuse the public client/private-helper isolation harness; verify
one helper's teardown preserves the other's active context and exact input.
Concurrent driver requests are serialized; do not present this as two independent
native injectors or physical-key proof. A question asks whether Taylor has
physical access to Theo Air; its answer remains required before any manual-key
setup. Continue independent authorized preparation meanwhile. Full real-Claude
focus/send, physical/external input, local quarantine release, loaded adoption,
cold startup and the remaining completion audit stay open. Goal ACTIVE.

## October 18 active native input and partial-input cancellation pass

PROGRESS on unchanged production source182ed05d. Extended existing remote owner
fixture; no production/helper/shared Codex change and no full-suite repetition.
Normal owner-native-1792357253765 delivers64 characters exactly once, verifies
two options0/mask7168 filters owned by helper4626 (fixture4614 and secondary
ViewBridge target431), then actual turn/archive, helper exit0 and watchdog4623
disarm/exit0. Exact text hash stays unchanged through1/5 seconds after close.
Thread01a150d1-4783-7c90-a7bf-3428ce163ea7,
turn01a150d1-4b0e-7a42-9573-6ab960f7e43a.

Cancellation owner-native-1792357268408 submits4096 synthetic characters once.
With tool result outstanding, an independent current fixture read verifies97
characters matching the submitted prefix and two filters owned by helper4739.
SIGUSR1 reaches only caller4731's test adapter/AbortController; production lease
cancellation runs normally. Final fixture retains109 prefix characters; original
caller returns cancelled/code1 and host/archive remain false. Helper4739 exits
normally0, watchdog4736 disarms/exits0, group/socket/filter cleanup is verified.
Prefix/hash stays unchanged through1/5 seconds. No rollback or replay is claimed.
Thread01a150d1-80af-7443-bf6f-3b3295fc975d,
turn01a150d1-8430-73d3-8f2c-ffbe61b86e11. The monitor refuses cancellation without
pending partial-effect/filter evidence; a too-fast operation would stay failed
as an unqualified in-flight gate. These tests are not physical-key proof.

Exact remote harness snapshots differ by cancellation-proof strengthening:
normal f6668c8c; cancellation6f38c56e. A later test-only tool title correction
makes future input logs accurate; it does not relabel the retained run sources.
Private input-owner-evidence mirror30 files/266665 bytes retains hashes, actual
contexts/timelines, intents, source snapshots, audits and final readback.
Final remote no owned process/helper/filter/stop marker; original four taps,
uv508/caffeinate510 and clean old repo0203e604 preserved. Both fixtures stop
normally0. Existing exact fixture grant; no hook override/auth/permission change
or local CUA. Local quarantine remains blocked/hash9808e860. Source/sibling hashes
unchanged; reuse frozen full195-file68.519s proof. All handles terminal.

NEXT changed condition: two concurrent caller requests sharing the actual UI
mutex, with separate operation/evidence directories. Verify serialization at
native input boundaries, each exact effect once, and that first teardown does
not poison the successor. Reuse this deterministic owner/native fixture; do not
create a parallel bridge or repeat the full suite for nested fixture-only edits.
This covers driver callers; simultaneous external/physical input, full Claude
focus/send, local quarantine release, loaded adoption, cold startup and remaining
completion-audit requirements are still open. Goal ACTIVE.

## October 18 checked watchdog recovers caller/owner loss

PROGRESS: source182ed05d014324dafdf933a3b132ec0d8423f8c70d5ea502ce511dd76e7221f6.
A live watchdog starts before the native helper, in the same private group with
another copy of the inherited mutex. It verifies current creator/group/fd
identity before readiness. Creator IPC EOF triggers peer/socket retirement and
an independent input audit while retaining the mutex. It never uses old PID
records to authorize a reap. Original interrupted work remains failed/unknown;
normal native exit is explicitly unverified. Normal disarm waits for peers.

Seventy-five focused checks pass: single controller failures, all pairwise
losses, invalid watchdog identity, startup/cancel/refusal, unknown residue,
unrelated sentinel and distinct successor lease. First assertion failure is
retained in watchdog-first.log: a killed caller could not create its expected
result file; actual double-owner retirement/successor had passed already.
Corrected watchdog-focused.log passes. Final full195-file suite passes once
68.519s with source/suite/installed identity frozen:
pressure/v2-2026-10-18T20-58-45-590Z.json.

Remote normal owner-native-1792357050383 passes fresh exact read-only fixture,
actual turn/archive, helper4375 normal exit0 and watchdog4372 disarm/exit0.
Thread01a150ce-2d15-77f3-8959-1e19fd7a67b1,
turn01a150ce-309c-7953-9ded-2203a5f82c83. Remote double-loss1792357057583 verifies
live group/watch readiness, stops caller4471, kills owner4473 then caller4471.
Watchdog4476 automatically retires peers/socket, audits input and exits; an
independent same-mutex acquisition succeeds. Original host/archive=false,
normal native exit unverified. Thread01a150ce-4920-7201-8253-267ec42bc19a,
turn01a150ce-4cbf-7b12-88ac-3306fb9ee554. Both use final source182ed05d.

Mirror watchdog-evidence:26 files/226292 bytes, hashes/exact sources/contexts.
Final remote no owned process/helper/filter/stop marker; original four taps,
uv508/caffeinate510 and clean old repo0203e604 preserved. Local quarantine still
blocked/hash9808e860. No typing/model inference/hook override/auth/permission
change/local CUA. Shared Codex and 1Password remain parked. All handles terminal.

NEXT changed condition: qualify this complete owner/watchdog composition with
one bounded real input operation in the existing remote disposable fixture,
then cancellation while native input is active using deterministic provider
control and independent input-state/tap evidence. Reuse existing remote-input
harnesses and exact grant, preserve failures/uncertain request without replay;
no new typing or full suite per small edit. Read existing input qualification
before implementation. All-three-controller loss remains fenced; do not chase
an unbounded controller chain or claim universal recovery. Full computerUse
focus/send/real Claude, physical-input, concurrent input, local quarantine
release, loaded adoption, cold startup and the full goal audit remain open.
Goal ACTIVE; no human action or app restart requested at this checkpoint.

## October 18: input investigation reproduces a false cleanup success

Taylor authorized investigating the input defect with UI disabled. Current
read-only tap audit found no active helper keyboard filters targeting Claude;
the October 6 two-filter/reset-survival/helper-retirement evidence remains a
stale-filter hypothesis, not full native callback or current-binary proof.
Installed desktop26.1013.31256/build20586, helper26.1013.1001501/build1001501;
current helper is desktop-owned outside the private lease process group.
Reviewed shipped client uses shared native IPC and has no public scoped-filter
dispose method in the inspected files. No native client method was invoked.

An isolated actual UI worker falsely exited0/reported threadArchived when its
archive RPC failed with text containing ` archived.`. Failed proof preserved in
pressure/input-investigation-20261018/ambiguous-archive-response.log. The worker
now consumes a strict structured acknowledgement from the existing bridge;
refusal/lost acknowledgement retains original mapping and reports unverified,
never retries. Disconnection cannot silently skip cleanup. Legacy public close
behavior preserved; unrelated Codex bridge fixes remain parked. Receipt does
not claim native input release; independent filter post-audit still required.

Focused12 PASS; final full191 PASS44.9sec, source/suite/installed identity frozen:
pressure/v2-2026-10-18T18-58-16-228Z.json, source5d15b13f. Final targeted filters0,
quarantine hash unchanged, reviewed source/dependency hashes unchanged. No CUA,
keyboard/native IPC, permission/auth/quarantine change, app/helper termination,
new chat or native profile. Full report docs/input-defect-investigation.md.
Loaded MCP remainsfcf4/source5d15/restartRequiredtrue; no repeated restart request.
Physical input/filter teardown and unattended cold startup remain unqualified.
Goal ACTIVE after user authorization; no test worker or cleanup pending.

Actual loaded MCP now reports runtimeBuild==sourceBuild fcf484e3 and
restartRequiredfalse. The same MCP reads the retained project parent and two
archive children completed with exact native receipts; ProDevs remains
unarchived+pinned. Both existing actors retain original live idle epochs and
unexpired readiness/policy observations with no STOP or unresolved requests.
Primary is fcf4, standby remains df52. Generic servingQualified remains false;
these observations are scoped preconditions, not universal serving authority.
No native effects/test rerun or failed-action replay. Private proof:
pressure/actual-mcp-adoption-fcf4-20261018.json. The loaded-client gate is closed;
full always-on/cold-start, natural pressure and person/UI gates remain explicit
in completion-audit.md. Actual goal resumed ACTIVE; no further restart request.

## October 18: project request contexts are not recovery parent jobs

A derived per-session project context identifies a native request but is not an
actual scheduler record. Controller-record recovery continuations must be able
to independently inspect their exact parent job and private argument hash. Project
archives now submit real durable archive_session children, retaining logical
contextId, actual childJobId and native requestId separately. The existing
restoration child runner is shared rather than duplicating scheduling/retry code.
Intent precedes submit; handle precedes observation; uncertainty never resubmits
and prevents later project targets. Parent cancellation can leave a child active;
inspect its original handle before further action.

Current fcf484e3: full191 frozen PASS; actual Claude/Codex harnesses10/10 each;
two-target native project batch passed exact child jobs/receipts and restored
archived baselines without folder deletion. Prior ordinary12 remains sourcedf52.
The new full-scope completion-audit.md preserves original requirements, partial
fresh-import permission proof, human/platform gates and pending loaded Codex MCP
adoption. No universal always-on claim is made. Exact evidence/handles: resume.md.

## October 18: freeze recipients before queuing or repairing the controller

Source df52d791 stores a sanitized action snapshot at durable submission,
never on idempotent reattachment. Preserve that PID/start or observed no-peer
state through worker admission, ordinary record recovery and both continuation
forms, maintenance, native send admission and receipt evidence. Busy sends can
queue; interrupt replacement still requires original-epoch idle. Raw job intent
hashing must happen before message redaction. A redacted message placeholder is
not the submitted intent. Missing snapshots or changed routing/identity refuse.
Same-process turn changes and guard-to-SDK races are not atomic guarantees.

Full190 isolated files passed with frozen source+suite+installed identity. Fresh
Claude/Codex harnesses each10/10 and current native ordinary12 passed. ProDevs
same-state pin also passed through the actual ordinary route, with no test
message. Final reciprocal roles are current-source, idle, unexpired, ready and
policy-qualified with no unresolved requests; fixture baseline restored. Evidence
and exact handles: resume.md top and pressure/ordinary-action-final-readback-
20261018.json. Loaded desktop MCP still e9dd31e4 and correctly requires restart;
do not present fresh harness/CLI proof as loaded-client adoption. New automatic
record-loss positive effects remain simulated; historical human-assisted native
deleted-record proof retains its separate source and person gates.

## October 18 ordinary admission composes exact native pair-readiness continuation

Previous goal turn was progress: 6ecadbf added post-import metadata suffix and
pending-root health. Current source 6d0a911facac74b379cb9c4e29bb7102bd638038e6fb31d48f1d2a133e900ee2
now composes the EXISTING reviewed failed-before-readiness-primary continuation.
Ordinary checkpoint reads remain bounded to original owner, optional post-import
metadata suffix, and at most one pair-readiness metadata suffix. Metadata parents
must independently be failed with target-undispatched pending proof. Exact original
pair child must be failed/restored_pair_unresolved at before-readiness-primary;
other/unknown/later phases cannot enter this route. Health/status exposes
pairReadinessInspectionEligible and candidate job only for separate inspection;
no native calls or effects are added to health.

New ordinary-pair-readiness adapter delegates native prefix validation to
readPairReadinessCheckpoint (actual original pair/restoration jobs and all actual
preparation/quiescence/retirement/primaryactivation children) and current native
qualification to inspectPairReadinessContinuation. It ties source/epochs/roles/
restoration/enrollment back to the exact failed ordinary lineage and checks new
caller account/identity/intent/grants/version/source/self exclusions. Existing
native continuation claim is observed and reported rather than duplicated.
Readiness/grant/child/claim refusal creates no new metadata suffix claim.

One separate pair-continuation-claims/<originalPairJob>.json/new metadata root
retains original generation owner, ordinary roots/parents and failed native root.
Only child broker_service_continue_restored_pair is submitted; existing native
executor skips preparation/retirement/import/primaryactivation. Its exact result
and both actors are independently verified. Shared verifyOrdinaryRecoveredPair
accepts only checkpoint-qualified exact preparedBuild, exposes nativeBuild /
currentSourceMatches / sourceMaintenanceRequired. Older sealed native packages
are never relabeled current; subsequent normal ordinary maintenance still must
renew to current host source before target dispatch. Original target is never
replayed. One claimed readiness suffix remains retained after uncertainty; no
repeat child, claim reassignment or unbounded retry chain.

Focused41 PASS incl real ordinary/native checkpoint readers/private claims/jobs,
old and current prepared-source cases, concurrent callers, closed eligibility,
changed grants/actual child, existing native claim, unknown continuation observation
and unchanged original root bytes. Positive native availability/effects are
simulated; native qualifier/executor adapters retain their separate test scopes.
Initial focused -1/-2 caught a real extraction regression: shared verifier used
out-of-scope args; corrected it to frozen binding.sessionId. Failures retained in
pressure/ordinary-pair-readiness-focused-{1,2}-20261018.log. Final -5 log PASS.
New private failure entries retain sanitized JS error name (ReferenceError etc),
category and timestamp without error text/stack/prompts, improving future diagnosis.
Full188 PASS40.5sec/frozen source+suite+installed identity/sourceChangedfalse:
pressure/v2-2026-10-18T17-57-49-370Z.json; log
pressure/ordinary-pair-readiness-full-20261018.log. No new live loss/restart/message,
permission/UI change, current-client reload, filtered harness or native12 test.
Historical actual native deletion/continuation source5ee, harnessf13 and loaded
MCP/native12 source796 remain separate evidence, not current automatic-route proof.

NEXT: integrate record-loss send/stop/interrupt admission with appropriate frozen
recipient epoch/intent and preserve uncertain target outcomes. Then strategic final
harness/client adoption/native qualification and cleanup; keep full original brief
scope/ordinary chats such as ProDevs. Prepared leases must still satisfy reviewed
margins; expiry/unknown/later-prefix cases are not universally qualified. Cold-app
all-Code-processes-absent startup still lacks changed supported ingress; do not
repeat unchanged outage. Goalactive; no person action pending and no live test
worker or task-owned cleanup remaining. Working/recovered disposable pairs and
observer broker untouched; Codex bridge and1Password remain separate.

## October 18 post-import ordinary recovery suffix and pending health visibility

Previous goal turn was progress: e2c7fd7 integrated single-attempt metadata record
recovery. Current source caf129d871ef1093c2fdfa31c2d8362e544b755574043d06c77c25306dcb79a0
adds exact post-import suffix adoption. New ordinary-record-checkpoint reads only
one original generation claim/root and at most one separate continuation claim/root.
It independently binds original/current metadata parents to exact intent hashes,
operations/target identities, original restoration submission/actual child, any
pair submission/actual job, and rechecks roots/claims/jobs after asynchronous reads.
Unknown/active parents, mismatched actual arguments, unpublished journals and
already-attempted pairs never qualify another suffix.

A later durable metadata request may continue ONLY after original parent failed
with ordinary_controller_record_recovery_pending/target-undispatched proof and
its actual restoration child completed. Native restored-pair plan must independently
qualify before suffix ownership; unchanged closed gates create no new journals.
Separate continuation-claims/<originalMetadataJob>.json and new metadata-parent
root preserve original generation claim, failed root/parent and restoration child.
Shared finishOrdinaryRecordRecovery skips seed/import/retirement. It re-observes
original restoration proof and suffix readiness before one pair child, then uses
existing both-actor account/bypass/source/epoch/policy/enrollment verification.
Concurrent callers serialize one suffix; a lock waiter observes the new CAS
generation instead of replaying the old prefix. Original target is never replayed;
new caller's normal metadata admission happens only after qualified maintenance.
One claimed suffix is retained on further failure/re-gating; no unbounded retry
chain. Failed/uncertain pair prefixes still need existing explicit exact continuations.

New read-only broker_service_controller_record_status {session:<exact enrolled
controller>} reports original/current parent handles, phase/root hash and actual
child states without snapshots, transcript text, native reads or effects. Health
checks pending generation ownership BEFORE live service inspection, including
when the imported record has reappeared at Dont ask. It reports
record-recovery-pending and no admitted operations rather than hiding the gate.
Current CLI actual new API reports configuredfalse for working controller; CLI
runtime==sourcecaf129d8. driver_status still sees original working primary alive,
unresolved0/source-maintenance-required and nativeEffects0. No service renewal,
MCP reload, new messages/UI/permissions/app restart or native loss test performed.

Focused28 PASS incl post-consent suffix, lost-observation now-completed child
adoption, immutable original bytes, concurrent callers, actual job/intent/race
refusal, restored-record pending health and claimed failed suffix no-repeat.
Initial focused27/28 failure was synthetic pair job missing actual args; corrected
fixture to include scheduler-equivalent args, verifier unchanged. Preserved
pressure/ordinary-record-continuation-focused-2-20261018.log; final -3 log PASS.
Full188 PASS39.5sec/frozen source+suite+installed identity/sourceChangedfalse:
pressure/v2-2026-10-18T17-48-48-285Z.json. Full log
pressure/ordinary-record-continuation-full-20261018.log. Positive native effects in
new adapter tests remain simulated. No repeated filtered harness or ordinary12 at
this interim gate: historical actual harnessf13, loaded-MCP/native12 source796 and
human-assisted native deletion source5ee packages remain distinct scopes.

NEXT: integrate automatic supported failed-pair readiness continuation without
replaying prefix; extend record-loss admission to send/stop/interrupt only with
appropriate frozen target epoch/intent, then final client/harness adoption/native
qualification and cleanup. Keep original brief scope, ordinary chats/ProDevs and
always-on limitations explicit. Cold-app all-Code-processes-absent startup still
has no changed supported ingress; do not repeat unchanged outage test. Goalactive,
no person action pending, no live test worker or cleanup remaining. Working and
recovered disposable pairs, observer broker, Codex bridge and1Password unchanged.

## October 18 ordinary metadata admission composes single-attempt record recovery

Previous goal turn was progress: published5e3dc64 added distinct missing-record
errors and exact read-only health inspection hints. Current source
fd1217aa965a1efb6a92349d97e8c7adab5d18f2503b55f2bc0ec9a22758c35b now integrates
recovery into durable rename/pin/config/archive and broker-needed unarchive.
Admission remains after successful TierA/no-op and explicit-controller branches,
inside the target control lock. Send/stop/interrupt retain their original paths;
no claims that epoch-bound intent is yet frozen across this new record-loss path.

New ordinary-record-recovery adapter guards original automatic pair, primary cwd,
immutable account/recovery identity, target binding, scoped grants, source/version,
cancellation and self/reciprocal-target exclusion. Independently qualified retained
transcript import or all-transcript-absent seed is selected BEFORE one generation
claim; never fallback after an attempted restoration. Private roots under
ordinary-record-recoveries/<parent>.json and claims/<originalService>.json retain
intent hash, target binding, phases, exact child submissions/handles and failures.
Child submission intent precedes scheduler call; unconfirmed/unknown results block
later effects. Record proof independently reads original parent, root/claim and
actual quiesce/retire child jobs and rechecks origin after awaits.

Only qualified restored-pair plan proceeds to one reactivation child. Independent
final evidence checks same original account/target binding, actual actor bypass/
unarchived identity, both selected current-source/native idle epochs/readiness/
policy/noSTOP/no unknowns, required grants and final enrollment CAS. Recovery
itself never dispatches original target; only after verification does normal
operation run, returning controllerRecordRecovery as separate maintenance evidence.
Native consent/epoch waits return ordinary_controller_record_recovery_pending
with original recovery parent, restoration kind/job/root SHA and any pair child.
Claim remains after import recreates saved record. Later metadata requests inspect
same owner rather than start another seed/import; explicit continuation currently
required to clear/adopt pending lineage. No claim reassignment or failed-root edits.

Focused26 PASS incl shared sequence, real production adapter/private ledger/locks,
positive and gated compositions, child observation loss, duplicate-after-import,
foreign account/grants/disabled pair, actual-child tamper, final permissions/source/
account/selection races. Actual public durable pin worker in isolated app/state
refused missing ownership with no legacy fallback or target writes; same submission
reattached to original failed job. Positive native calls/statuses remain simulated.
Full188 PASS38.9sec/frozen source+test+installed identity/sourceChangedfalse:
pressure/v2-2026-10-18T17-40-09-560Z.json. Logs
pressure/ordinary-record-recovery-focused-{1,2,3,4}-20261018.log and
pressure/ordinary-record-recovery-full-20261018.log. No native loss/ordinary12 or
extra filtered harness repetition at this interim gate. Last native explicit
human-assisted deletion n=1 still source5ee packages; last actual harnessf13,
loaded-MCP/native12 source796 scopes remain separate. Global working pair, ProDevs,
recovered disposable pair, observer broker, app permissions and UI untouched.

NEXT: pressure-test concurrent callers and explicit adoption/continuation of this
pending recovery lineage after person gates, preserving original claim/root/actual
child proof and never replaying target. Add read-only pending-root status for health
when record already reappeared; integrate send/stop/interrupt only with frozen
appropriate epoch intent. Then one final client adoption/native qualification and
cleanup gate. Unattended all-Code-processes-absent startup still lacks a changed
supported ingress; do not repeat unchanged appquit tests. Goal active; no human
action pending, live shell/job or task-owned cleanup left. Codex bridge/1Password
remain separate.

## October 18 ordinary controller loss diagnostics and desktop CLI ingress audit

Current source 3bb05efd460950b3da825109cfe7ee9d8f2085f7fe3ae66bbf3912705cc864ff.
Ordinary calls now distinguish a missing saved controller record with category
session_management_controller_record_missing before target dispatch; no legacy
fallback, restoration, process-absence inference or replay. driver_status reports
record-restoration-required and offers an exact read-only missing-record plan only
when original automatic pair, primary cwd, retained recovery identity and current
account hash match. Rechecks record/enrollment/pair/identity/account and refuses
races, foreign identity, disabled pair and absent evidence. Health does not inspect
transcripts, discover substitutes, wake actors or execute recovery. Normal deleted
controller restoration is still explicit experimental work, not automatic routing.

Focused27 PASS. Initial26/27 failure was the test providing a stable replacement
enrollment on every read rather than an actual race; corrected fixture, production
guards unchanged. Preserved sanitized failure metadata in
pressure/missing-controller-initial-focused-failure-20261018.json.
Full187 PASS40.4sec, frozen source/sourceChangedfalse:
pressure/v2-2026-10-18T17-32-57-742Z.json. No extra filtered harness/native12 rerun:
last harness f13 and native12/loaded-MCP796 evidence stays source-scoped.

Read-only installed app+bundledCLI2.1.299 static6 PASS:
pressure/native-deeplink-contract-2026-10-18T17-31-56-704Z.json. Exact hashed CLI
route/launcher/opener fragments prove --desktop --resume builds the SAME
claude://resume?session=UUID import/navigation link already audited. Official
https://code.claude.com/docs/en/cli-reference and /docs/en/desktop confirm no prompt
or additional execution flags accepted. This supplies no changed supported startup
condition, so no appquit/deeplink experiment repeated. No source execution from
extracted fragments, UI automation, native message, permission or auth changes.

Current-source CLI driver_status verifies live ordinary controller originalPID87665,
readiness+policy true, unresolved0, noSTOP; original796 source/expired lease means
source-maintenance-required, not a new crash. Global binding unchanged. Loaded
Codex MCP last e9dd predates this host; final adoption remains separate. Recovered
deletion fixture pair remains retained; no new native mutations or cleanup.

NEXT: integrate the qualified retained-identity record-loss path with ordinary
request admission and durable recovery orchestration, preserving exact original
account/role and target intent, existing claims/failed roots and person-owned native
permission/trust/loader gates. Do not silently replay a target or an uncertain
bootstrap/import. All-process-absent startup still needs a genuinely different
supported ingress; do not repeat unchanged tests. Final loaded-client adoption,
ordinary profile and cleanup remain planned gates. Goal active, no human action
pending and no live test/worker handle. Codex bridge/1Password stay separate.

## October 18 native deleted-record pair recovery completed with retained history

Taylor completed recovered hot-reload consent. Independent primary successor
status verifiedloaded/readinesstrue/nativeInputfalse, samePID41342/start17:16:23UTC.
Added exact failed-before-readiness-primary checkpoint verifier: original failed
parent/root/hash/claim, ordered13phase prefix and actual completed preparation/
survivor-quiescence/retirement/primaryactivation jobs. Refuses ambiguous/later
work, uncertain child, settings retirement and changed source/identity/grants.
Separate continuation claim and journal retain original failed pair claim/root;
remaining sequence skips preparation, retirement, import and primaryactivation.

Production continuation verifies current exact bypass idle actors, original
settings/role/metadata/enrollment, installedprimary readiness/noSTOP/no unknowns,
historical-retired standby and its exact sealed candidate in its own service
namespace. Read-only candidate subprocess avoids global release namespace mixups.
Prepared packages remain source5ee1ea07; current host continuation source
f13af418d01f4f3d507554a453e3eb15556b24d40493b58bc756a06bf541dfa4.
Enrollment transition proof independently verifies both reactivation parent chains,
original restoration/seeded continuation chains, actual old and new child jobs,
original idempotency ownership, prepared source and unchanged claims after async
reads. New explicit broker_service_pair_continuation_plan and durable experimental
broker_service_continue_restored_pair; status kindpair reports originalJobId.

Focused25 PASS incl existing adapter/refusal/enrollment gates;13 PASS overlapping
new chain tests verify production adapter skips completed native effects, separate
claim collision, exact suffix phases and originalchild tampering refusal at CAS.
First integration failure was test harness reading original job during new CAS;
preserved failure, corrected test to inspect actual supplied continuation ID.
Actual read-only original checkpoint6e80819f... and current role/native/candidate
plan qualified. One actual continuationjf71af09a078f47cb9c77c20bdc23da51 COMPLETED
20.5sec, original prepared primarye6959ee1 and standby45ac0aba reused. Primary/
standby policy probes9aaaabf8/5ad9b649, standbyactivationc43f7503, reciprocal native
reads/family and enrollment CAS completed; no prefix/import replay. New enrollment
1cd3649ee62093d78564a3070564f23c4309c4cc07efce0c7866f8e61cff4483 automatictrue.
Independent final statuses both liveverified/readiness+policytrue/unexpired/
noSTOP/unresolved[], primaryPID41342 and standbyPID23690. Original seed failure
rootbff9ca42 and pair failure root6e80819f byte-hashes unchanged. Working ordinary
controller binding3f6a.../ecd2... unchanged; ProDevs still unarchived, no messages.
Private deleted-service-native-fixture-20261018.json finalRecoveryReadback.

This qualifies ONE HUMAN-ASSISTED native deletion/reconstruction/reciprocal
reactivation with original UUID/account/cwd, without deleted history replay. It
does not qualify unattended recreation/permission/hot-reload consent or cold-app
startup. No automatic ordinary route invokes experimental deletion rebuild yet.
Full187 frozen-source PASS1/1,42.5sec/sourceChangedfalse:
pressure/v2-2026-10-18T17-26-22-292Z.json. Fresh actual filtered Claude/Codex harnesses onf13 PASS10/10 each,22.6/18.5sec,
source/config unchanged; pressure/harness-v2-{claude,codex}-2026-10-18T17-26-35-859Z.json. No native12 repetition after this change.

NEXT: audit full original brief/DoD against current evidence, including unattended
all-Code-processes-absent ingress, normal-chat routing, public entrypoints, cleanup
and fresh loaded-client scope. Preserve actual human consent boundaries, prior
failed/unknown work, legacy observer ownership and Codex/1Password separation.
Goalactive. Disposable recovered pair deliberately retained ready for further
qualified use; no cleanup yet. No human action pending. Native jobs terminal.

## October 18 recovered bypass confirmed; pair activation reached native loader gate

Taylor supplied Desktop ref-1/ref-2 images showing actual Don't ask label and
mode menu without that entry before selecting bypass. Source service-rebuild-seed
explicitly requests dontAsk for no-tools/no-MCP seed; imported native record kept
that mode. This is NOT bypass: official Claude permissions docs state actions
which would prompt are denied, preapproved/no-approval actions can run. Our seed
also disabled tools/MCPs independently. Do not describe all imports as universally
acceptEdits: regular creation and this seeded import have distinct actual outcomes.
Verified same restoredUUIDaf930615 now savedbypassPermissions, idle newPID41342/
startSunOct18 17:16:23UTC/desktop2.1.299. Startup cause remains unassessed.

Exact seeded pair plan qualified original continuationj38a7... and restored
primary epoch plus unchanged standby23690. One durable pair reactivation
jd64da9d75f294eb7868a201b40bbb634/source5ee1ea07 executed:
prepare-primaryje6959ee1ad45444b924620f713d06631,
prepare-standbyj45ac0aba1e424f00be90a3cb6ff7b58e,
quiesce-survivorj6e99e46383b3434f8becaa8bddbbb7d4,
retire-survivorj4ac6515c6f1b4c50a394e43c70889b58,
activate-primaryj0b6e3a3f871a476ebe7cbd07fe591e28 all COMPLETED.
Original standby generation filesretired with STOP; settings preserved.
Primary successor e6959ee1 installed/new epoch, standby successor45ac0aba prepared
NOT activated. ParentFAILED before-readiness-primary, precise retained failure
independent_service_readiness_timeout. Native loader had not initialized; source
and prepared roles remained unchanged. No policy/read/family/enrollment CAS or
import repetition, and no serving/always-on claim. Failed root/claim preserved.

After confirming actual failed parent, captured fresh recovered-session event
cursor then one explicit loader Skill entryj383eaeaa2c374a27818abb9ddf174e1b,
exact peer native user receipt. Current successor statusverifiedtrue/readinessfalse/
nativeInputRequiredtrue; request slots0. Async person action: Claude Code exact
recovered title, IF Enable hot reloading for this session? choose Enable for this
session and Submit. Native consent is separate from bypass; do not resend loader
or answer card. Private deleted-service-native-fixture-20261018.json retains all.

NEXT: after native loader consent, inspect same installed primary readiness and
exact original pair child results. Implement an explicit safe continuation of this
failed pair prefix (original root/claim preserved). Do NOT resubmit whole pair
reactivation: its restoration claim is already consumed and survivor retired.
New continuation must independently attest original failed parent/root/hash,
completed prepare/quiesce/retire/activate children and exact native source/epochs/
settings/roles, adopt existing primary successor and prepared standby without
repeating effects, then policy-primary, standbyactivation/readiness/policy,
reciprocal reads/family and qualified enrollment CAS. Preserve original child
idempotency/source lineage in transition proof; current-source continuation may
need to read sealed original5ee1ea07 packages without pretending they are newly
compiled. Refuse unknown partial prefix, source/account/epoch/selector drift and
competing continuation; never release/reassign original restoration claim.
Working broker pair and ProDevs untouched; no live pair/loader worker remains.
Goal active, Codex bridge parked. No suite rerun: no runtime edits this turn.

## October 18 explicit seeded continuation restored the deleted service record

Implemented broker_service_seed_continuation_plan and durable experimental
broker_service_continue_seeded_record for exact failed after-retire roots with
bootstrapfalse/importfalse. Validates immutable original root/hash/generation
claim, failed original parent/arguments/source, independent completed retirement
child receipts, current retired STOP/account/role/selector/UUID absence. Separate
continuation-claims retains generation claim unchanged; new root copies verified
retirement prefix and references original hash. One new bootstrap/import intent
journal; no retirement repetition or uncertain-effect retry. Any seed/import
intent, forged/missing/unknown child, version/source/account/role drift or duplicate
continuation refuses. Original failed job and bytes remain unchanged.

Normalized seeded proof now independently verifies origin parent/root/claim and
actual original children before accepting continuation result; native readiness
and pair enrollment readers use that verifier and reread after asynchronous work.
Read-only restoration status kindseeded distinguishes continuation parent and
reports originalJobId without exposing prompts/raw snapshots. Same existing kind
seeded required explicitly; ordinary routing still does not auto-rebuild.
Focused16 PASS: real private root/claim/journal/planner/adapter and fake native/CLI
only; successful acceptEdits/bypass outcomes, normalized proof->native mode gate,
bootstrap result-loss after artifact write, duplicate attempts, forged origins and
changed actual retirement receipt refuse. No original claim reassignment.

Actual originalje56f3ebcd2ab46c5a80e292429c8f7df/rootSHA
bff9ca42367101a9d641614bffba796c04521c6dcb1d7bdd62a0ed6fbe69047d qualified.
One new continuationj38a7cd1760f6421b8df54b3c862c525d COMPLETED9.1sec on
source5ee1ea075972e7fc961b35584ec30db96f9d470f1cce92fcda69edba61698736.
Minimal no-tools/no-MCP bootstrap and one import recreated sameUUIDaf930615,
same account/cwd/Haiku, actual saved modedontAsk/unarchived. Title now
claude-driver recovered service af930615. Independent record readback matches;
no native peer. Bootstrap/import each once, no history replay/service/serving claim.
Original failed retirement root retained, standby and ordinary serving pair untouched.
Private deleted-service-native-fixture-20261018.json retains actual result/readback.
Actual restored_pair_plan consumes seeded continuation proof and returnswait/
person-permission-required, not blanket inspection failure.

Async person action: In Claude Code open claude-driver recovered service af930615,
select Bypass permissions, send ready. Then inspect same identity/new native epoch
and exact reciprocal survivor; use restored_pair_plan and one claimed pair
reactivation only after eligibility. No repeated seed, import or loader send.
Full186 frozen-source suite PASS1/1,48.7sec/sourceChangedfalse, report
pressure/v2-2026-10-18T17-16-28-494Z.json; private
pressure/seeded-continuation-20261018.log. No live suite process remains. Native reciprocal service restoration and
all-processes-absent automatic startup remain unqualified. Goal active; no live
recovery worker, new record intentionally retained. Codex bridge parked.

## October 18 actual native deletion: transcript reaped; durable integration fixes

App2.42304.0/CLI2.1.299 native deletion of the task-owned primary removed its
saved record, exact native process and all CLI UUID transcript/side artifacts.
Independent bounded metadata inventory across363 project dirs; no contents read.
Previously qualified reciprocal native pair retained exact account/role enrollment;
no working ordinary controller or ProDevs change. Evidence private
state/deleted-service-native-fixture-20261018.json.

Actual public durable rebuild exposed scheduler record resolution before execution.
Exact UUID recovery ops and explicit offline quiesce/retire now preserve literal
identity at submission; their retained-evidence workers still enforce ownership.
Aliases refuse, ordinary/live operations still require saved records. Regression
uses real detached workers in isolated app/state/project stores, preserves terminal
ownership refusals and idempotent same-job reattachment.

Actual rootje56f3ebcd2ab46c5a80e292429c8f7df completed offline stop/retirement,
then failedafter-retire with bootstrapfalse/importfalse because delivered status
inspection disabled retired contexts in offline mode. Fixed both initial/repeated
read-only context reads to allow sealed retired evidence while requiring exact
oldPID absence/STOP/module/settings/history. Real filesystem test now exercises
offline status after module retirement and after settings retirement; altered STOP
refuses. Actual original retired plan qualifies after fix. Failure/root/claim and
completed children preserved, no rebuild replay. Positive native reconstruction
is still unqualified; safe explicit continuation from verified pre-bootstrap
checkpoint is next work. CLI seed flag proof alone is not deleted-service recovery.

## October 18 actual headless seed CLI and fresh harness gate

One actual bundled CLI2.1.299 contract, task-created UUID2043db15-e320-468b-8a8d-24079d85bd1a
and unique probe folder, fixed no-tools/no-MCP/setting-sources-empty/dontAsk/max-turns1
seed arguments. PASS1.7sec: exit0, JSONis_errorfalse, exact UUID/marker, num_turns1,
permission_denials0, private transcript metadata verified; no desktop record or
import. No fabricated original missing-service ownership was used: scope is CLI
flags/seed artifact only, not deleted-record recovery. Report
pressure/seed-cli-contract-20261018.json. Verified no prior UUID artifacts before
launch; afterward removed only task-created transcript/new project directory and
empty task probe folder. Remaining CLI artifacts0, desktop record absent. Sanitized
evidence retained. No desktop session/process/permission mutation or messages.

Fresh actual filtered Claude/Codex10/10 each on sourcee9dd31e4,24.1/16.7sec,
harness-v2-{claude,codex}-2026-10-18T07-30-17-964Z.json. Globalconfigs/source unchanged.
Full185 gate remains same e9dd31e4. Last actual cached MCP/native12 source79619016
is historical for seed feature; no repeated refresh or native12 after each helper.

Next concrete gate: stage a disposable two-session native recovery fixture, preserve
working controller pair and ProDevs, then native person-owned permission/trust/hot
reload/deletion cards only where actually required. Do not delete serving actors,
spoof consent, overwrite app records or call a headless seed a restored service.
Actual record+transcript delete/rebuild/native-role proof still missing, as is
supported unattended all-Code-processes-absent startup. Goal active; no live jobs
or cleanup pending. Codex bridge remains parked.

## October 18 installed delete contract changes recovery frontier

Read-only exact current app2.42304.0/CLI2.1.299 source audit contradicts any blanket
assumption that CLI transcripts always survive native deletion. Exact CFJssAFf
SHAabff2bf8cd6fa8d3d18964636ebaa6034e93997a9eea16a8802eaec0f759c9b7:
teardown deletion collects local transcript IDs when userInitiated or imported,
excludes others' claims, then calls release/reap. Reap guards require writer/record/
claim/liveness safety and realpath match before removal. Thus eligible native
deletes CAN remove transcript and UUID side directory; not every deletion must.
Historical Sept29 transcript-survival observation is not current universal policy.

Private exact-source static5 PASS, zero native effects:
pressure/native-delete-transcript-contract-20261018.json, double-read source hash
plus teardown/release/guard fragment digests. No full bundle execution, live record
or transcript contents, auth, native deletion/card or process changes. Evidence
runner remained private runtime artifact; sealed source79619016 unchanged, so
loaded-client/full180/native12 qualification is not invalidated by documentation.

Existing missing-service plan already requires exact surviving transcript metadata
and safely refuses missing/linked/changed files (isolated coverage). It covers
missing saved records WITH retained transcripts, not all native deletion loss.
Next substantial frontier: controlled same-role fresh service provisioning when
both record AND transcript are gone, or an explicitly retained minimal service
seed, anchored to immutable account/role policy and native consent without history
replay or app-file edits. Must preserve STOP/human consent and avoid resurrecting
intentional retired services. Live disposable native delete/card proof still
required; do not delete current serving pair to manufacture evidence. Also keep
unattended all-process-absent startup gap distinct. Goal active; no live job or
cleanup pending. Codex bridge remains parked.

## October 18 restarted MCP adopted; final native ordinary12 passed

Taylor restarted Codex. Actual this-chat MCP runtime==source79619016d6fa309f9619ba89606049a3d8aa34f9b1d7f8dd30ca78b6f1d73e5f,
restartRequiredfalse. Original processes survived >2h45m, leases expired. First
final native profile REFUSED before any native request on insufficient controller
lease margin: pressure/live-v2-2026-10-18T07-16-14-368Z.json preserved (input audits
pass, adoption gate failure). No blind repetition.

Changed condition: actual refreshed-MCP pinfalse no-op jd64e49b64320419e98c750979501ddec
COMPLETED18.7sec with native receipt. Maintenancej3f6a8668ea6e40038f3c18d6ad1db0e4
renewed primary AND expired standby; no old failed request replay. Focus endpoints
changed Finder->Browser; correctly left untouched/cause unassessed, not falsely
claimed restored. Same primaryPID87665/start04:25:46 and standbyPID89119/start04:26:26.
New primaryservice3f6a8668ea6e40038f3c18d6ad1db0e4, standbyserviceecd2b479649546fea130bcb22a459887.
Both build79619016/readiness/nativePolicytrue, unexpired/no STOP/unresolved[].

Then final public CLI probe --input-free --controller c0a... --session8f1... --live
PASS12/12, sourceBefore==sourceAfter79619016:
pressure/live-v2-2026-10-18T07-16-45-048Z.json. Covers causal reply/durable reuse,
pre-dispatch cancellation, concurrent3 controls, batched metadata, queue retention,
interrupt/replacement, unique replies, baseline restoration, filters0/quarantinetrue.
Reply proof uses native sender/body/cursor/ancestry; returned UUID link remains
false, not misrepresented. Independent final-native-adopted-readback-20261018.json
confirms exact tooltitle/Haiku5.5/high/bypass/unarchived/unpinned baseline and both
current-generation status. Actual MCP post-status currentSourceMatchestrue,
pairGenerationMatchestrue/admissionobserved, no restart required.

Actual refreshed-MCP read confirms exact ProDevs437775cb unarchived/pinned; no
messages or repeated state mutation. Loaded-client and final ordinary native
qualification gates CLOSED on recorded source. Full180/fresh harnesses already
same source. Remaining full-objective gaps: actual positive native deleted-record
restoration/reactivation and supported unattended all-Code-processes-absent startup;
no deletion or unchanged appquit test performed. No whole-interface/UI/window
claim. Goal active; no live job/process/cleanup pending. Codex bridge remains parked.

## October 18 bounded recovery status operation

Added broker_service_restoration_status {root_job_id,kind:record|pair}: exact
private owned bounded journal/hash/phase/source and independent scheduler parent/
child states with sanitized categories. No snapshots/transcript/error prose, no
scan, import, native inspection or retry authority. Before-submit handle absent
is submission-unconfirmed, never inferred queued or safe. Changed journal, wrong
parent/child operation and malformed handles refuse. Original failed parent and
later child state remain separate observations. Guide/README document reattachment.

Focused status/driver4 PASS. Actual current CLI read of preserved negative
j5a46920be3d144dc859a018ff2404b56 verifies parent failed, phasecreated, children{},
importAttemptedfalse, recordRestoredfalse, retrySafefalse; original journal hash
73f4783d8e3a235375a9e105c95fd077abbfd6fb28492c448e89ff1259c6d3d0 retained.
No native effects or old-request replay. Last full178/current harness/native gate
predates reader/status changes, so remains source-scoped. Next consolidate source
and close remaining actual-native/loaded-client/platform gates; no destructive
loss test or unchanged outage repeat. Goal active; no live job/cleanup pending.
Codex bridge work remains parked.

## October 18 recovery proof audit and current evidence boundaries

Audit found async restored-pair transition proof re-read both roots but omitted
final exclusive-claim bytes and active parent identity. Reader now independently
requires the exact running broker_service_reactivate_restored_pair job, matching
runtime/root/plan/experimental arguments; rechecks parent and claim after child
reads. Claim drift, parent terminal/wrong operation and differing durable child
receipts refuse. Shared test fixture retains original root/claim identity.
Focused proof-reader/root/transition/production-integration/enrollment15 PASS.
No native or full-suite repeat for this targeted correction.

Last consolidated source0c8a57a5:178 files PASS37.2sec, fresh Claude/Codex10/10,
actual CLI native ordinary no-op PASS after primary source renewal. This predates
above reader correction. Actual loaded MCP still18ef; standby healthy18ef, primary
0c8a, no unresolved attempts at last observation. README corrected stale statement
that loaded MCP matches current host. Native success is not deleted-record proof.

Original scope audit remains open: all four registrations recorded, two fresh
execution harnesses pass; Cursor auth-gated and OpenCode execution unavailable.
Input-free preflight/probe cover ordinary scope only; full UI/window paths remain
quarantined. Named-folder/no-folder creation/fork/pool evidence is historical and
must be source-scoped separately from native ordinary12. Actual missing-record
restoration/reactivation and unattended all-process-absent startup are unqualified;
no destructive loss test or unchanged appquit repeat authorized/performed here.
Current host/client final gate still required. These gaps are not waived by the
new recovery code or fixture counts. Goal active; next close remaining recovery
readback coverage and current-source documentation before settled final client
refresh/native suite. No live job or cleanup pending; Codex bridge stays parked.

## October 18 consolidated gate exposed/fixed sealed package capacity

Full suite168 files on stable source FAILED9 (747/756 pass), original report
pressure/v2-2026-10-18T05-41-27-426Z.json retained. Root cause: current release
inventory260 files/2,919,829bytes crossed hard-coded256-file maximum, no oversized
file. Growing valid source was misreported as corruption. Initial staging fix
cleared original staging errors but targeted36 left5 sealed-bootstrap failures:
self-contained runtime-entry had duplicate256 cap. That failure is preserved in
turn evidence; do not count initial partial fix as qualified.

Stager and self-contained bootstrap now agree on512 files,16MiB aggregate and
unchanged4MiB/file. Bootstrap manifest additionally bounded1MiB before JSON read.
All per-file hashes, immutable/sealed mode, owner, symlink/path/epoch/settings
checks remain. Aggregate byte cap tightens previously absent total-byte bound.
Bound failures have fixed diagnostic reason/limit metadata, no file content.
Parity and actual filesystem boundary tests enforce both copies stay matched;
bootstrap still imports no mutable dependencies before admission.

Targeted release/bootstrap/state-binding24 PASS. Full corrected suite169 files
PASS1/1 round63.3sec, sourceChangedfalse, buildca823ee42c193c2657791c65e141c88903663d9f57b9b74a5264f10724e8ab2d,
report pressure/v2-2026-10-18T05-44-01-236Z.json. Private bounded output
pressure/release-budget-consolidated-20261018.log. No native receiver deployment,
renewal, message, app restart, deletion/import or full native profile.

Next: exact original restored-record proof/native readiness, then role-preserving
service reactivation with reciprocal target verification. Last actual loaded-MCP/
native source18ef is historical relative to currenthostca823; use current CLI
while developing and defer refresh to final settled gate. Goal active; no live
jobs/cleanup pending. Native loss/permission/startup gates still unqualified.

## October 18 filesystem restoration qualified; retirement ordering corrected

Added isolated filesystem fixture covering real saved-record lookup, enrollment,
immutable identity, exact account/transcript metadata, claims and durable root
ledger. Native offline status/lifecycle and importer are explicitly mocked; it
never writes real Claude app state or dispatches a deep link. Tests recreate only
task-created fixture records. Bypass/Accept-edits outcomes, missing/symlinked
transcript and wrong-account recreation with retained uncertain import claim PASS.

Integration exposed required ordering: retire original generation WHILE old actor
is independently absent, before import may start successor. Restoration root now
claims, verifies offline quiescence/retirement via durable one-use child jobs,
retains original identity/selection/pair snapshot, then repeats account/transcript/
absence review against its exact retired generation/STOP before one import.
Generic plan still refuses STOP/retired history; private owning-root review alone
admits offline-retired/files-retired with exact stopMarkerMatchesGeneration. It
cannot authorize service activation or permission raise. Unknown/failed child
preserves handles and prevents all later effects; no automatic import replay.

Plan/restoration/filesystem14 PASS; adjacent quiescence/activation/continuation/
identity16 PASS. Final original-snapshot filesystem3 PASS. Source code checks
passed, no whole suite repeated this interim gate. No live chat lost, imported,
retired, renewed or messaged. Earlier real negative request remains no-import.
Positive real native deleted-chat recovery remains UNQUALIFIED.

Next: exact-root continuation for partial retirement/import and restored-native
readiness, then reuse role-preserving activation/rebind with BOTH reciprocal
native targets verified. Do not treat recordRestored as service restoration or
activate against stale counterpart epoch. Native Accept-edits/initial trust/hot
reload cards stay human; do not synthesize approval. Existing current actors do
not have new identity snapshots until qualified preparation. Actual last MCP/
native source18ef; host development uses current CLI, final reload after settled.
Goal active; no live jobs/cleanup pending. Codex bridge remains parked.

## October 18 durable missing-record restoration root implemented

Added broker_service_missing_record_plan (read-only, plan digest when eligible)
and durable experimental broker_service_restore_missing_record. Exact pair/plan
hashes, immutable generation claim, original job handle on competing root, repeated
plan guards through final pre-import boundary, checkpoint before one import,
actual same UUID/cwd/canonical account-file verification afterward. Preserves
focus via existing wrapper; no shell/keyboard/app-file write or permission raise.
Post-import Accept edits reports humanPermissionRequiredtrue/actualBypassModefalse;
recordRestored does NOT mean serviceRestored/serving/native epoch qualified.
Installation/role recovery is separate and still required. Claims never replay.

Focused MCP+identity+plan+restoration34 PASS12.5sec; strengthened real saved-record
verifier/final guard then restoration6 PASS. Includes all effect/checkpoint
failures, exact pre-import drift, original exclusive claim bytes/job, mode clamp,
foreign account/UUID/cwd/worktree/archived state. Actual current CLI durable
negativej5a46920be3d144dc859a018ff2404b56 failed as intended before import because
record exists/importAttemptedfalse; evidence missing-record-present-negative-20261018.json.
Original negative failure preserved, no claim/import/native operation or deletion.
Actual positive deleted-record import remains UNQUALIFIED. No destructive loss
test or whole native profile. Existing actor snapshots only future prep, not
backfilled authority.

NEXT: qualify positive restoration against isolated full filesystem/account
fixtures and missing/linked/changed transcript boundaries; then integrate the
restored-record outcome with existing human-assisted/native service recovery,
without pretending lowered mode or absent epoch serves. Automatic routing still
refuses missing actors until that whole chain is qualified. Avoid creating new
controller identities or broadening grants. Host/MCP schema changed; current
loaded MCP/native proof remains18ef until final refresh, current CLI for work.
Goal active; no live jobs/cleanup pending. Codex bridge changes remain parked.

## October 18 missing-service same-identity preparation plan implemented

Added missing-service-plan.mjs + explicit CLI scripts/missing-service-plan-v2.mjs
<exact primary ID> <primary|standby> <exact pair digest>. No MCP schema/config
changes. Read-only inspector binds automatic pair role, immutable per-generation
recovery identity, current account store hash, independently absent old PID/all
same-host processes, verified offline installed selected generation with no STOP/
unknowns, original reciprocal role, exact CLI transcript metadata fingerprint,
installed version, and repeated binding/selection/identity/transcript/absence checks.
No transcript content read; no candidate scans, imports, grants or replacement.
Positive result only importPreparationEligible, all execution authorities false.
Requires future observed actual bypass/native epoch; flags possible human gate.

Focused plan+identity7 PASS, including both roles, STOP/unknown/account/version/
PID/generation/transcript refusals and after-inspection races. Initial unit fixture
had computed-property syntax typo, failed before execution; corrected and rerun
passed, no native effects. Actual new CLI entrypoint against existing primary
returned wait/saved-service-record-present/effectsPerformedfalse. Did not delete
or simulate loss of live app record; current actors lack new capture until future
qualified preparation (no silent backfill).

NEXT: durable same-identity restoration root consuming exact plan digest,
checkpointing one import attempt with rechecks and preserving uncertainty. Native
import can lower bypass to Accept edits; stop/report person gate, never silently
restore authority. Then reuse qualified human-assisted/cold service recovery after
verified recreated record/epoch/mode; no need invent replacement controller identity.
Host code changed, actual MCP/native qualification remains earlier18ef until final
adoption; do not request repeated restart per edit. Goal active; no live jobs or
cleanup pending. Deleted-service restoration remains incomplete.

## October 18 retain same-identity recovery evidence before preparation

Generation locator already supports offline inspection after app record loss, but
account/CLI recovery identity was not separately retained. New
service-recovery-identity.mjs captures immutable per-generation schema1 private
snapshot before native preparation: session/CLI UUID/canonical probe cwd, hashed
account store, prior bypass mode, generation/job and timestamp. No title/body,
transcript content, account path or auth material. Exact own file metadata,
O_NOFOLLOW/nonblock/bounds/mode checks; conflicts/races refuse, original bytes
never overwritten. Snapshot is evidence only, no import/replacement/permission/
role/replay authority. Existing live generations not silently backfilled.

Focused identity/index6 and preparation/renewal/continuation14 PASS. No new native
test/deletion/import/renewal. Code change is host source only; last actual MCP
adoption/native pair qualification remains18ef (do not relabel current host source
as adopted). Use current CLI during development; one final refresh after source
settles, not repeated restarts for incremental edits.

Next: missing-record same-identity recovery plan must combine this snapshot with
exact retained enrollment, absent old PID/all host peers, reviewed terminal
service history/no STOP or unknowns, exact same-account bounded transcript
presence and versioned native import contract. Re-import may lower mode to Accept
edits; that must stop for person permission gate, not claim unattended recovery.
No destructive live loss test authorized/performed. Goal active; no live jobs or
cleanup pending. Code does not yet restore a deleted actor.

## October 18 deep-link bootstrap candidate ruled out

Installed deep-link handler static contract4 PASS, zero native effects:
pressure/native-deeplink-contract-2026-10-18T05-30-48-264Z.json. New reusable
scripts/native-deeplink-contract-v2.mjs binds main chunkmuI2IV6k exactSHA4a8f1c07e69231e47127d3c55fcdda84eddb089ce06d347ad29591e25b6fb5f5
and fragment hashes. Resume imports CLI identity then navigates, no prompt/send/
start call in branch. code/continue checks entrypoint gate and resolves route of
saved unarchived session; it navigates only. Prompt parsing seen on code/new branch,
not an existing-session bootstrap. Renderer warm downstream remains possible;
static routing does not prove every possible ingress absent. No URL dispatched.

This removes another concrete all-process-absent startup candidate, not a live
recovery improvement. Current MCP adoption and expired-pair renewal remain proven
18ef source. No native test, message, new chat, permissions/UI or source renewal.
Next independent work: deleted actor replacement needs retained role/history and
already-approved reserve identity; generic pool must not silently inherit roles.
Do not repeat appquit/import-only experiment without a changed supported startup
condition. Unattended fresh-app bootstrap remains unresolved native boundary;
goal active and full scope intact. No live jobs/cleanup pending.

## October 18 actual restarted Codex MCP adopted; expired pair renewed

Taylor restarted Codex and resumed work. Actual this-chat driver_status reports
runtimeBuild==sourceBuild18ef4d442ae72cce83e46b6df014662eca4818cc1b11662c34a1fa996398cede,
restartRequiredfalse and current ordinary status fields. Adoption gate CLOSED.
Both peers survived waiting >1hour, but leases expired; no unknown requests.
One current actual MCP durable pinfalse no-op on owned8f1 fixture,
j66616ef179b04d449e83e3c8836612b5, COMPLETED with native receipt in8.8sec.
Automatic maintenancej4c0873b6d57f4ca688d16acc36382c24 renewed expired primary
AND standby, preserved roles/settings/native epochs and re-enrolled pair.
No messages, app restart, new session, full profile or prior failed pin replay.

Independent actual-mcp-adoption-renewal-20261018.json verifies primary4c0873b6d57f4ca688d16acc36382c24
PID87665/start04:25:46 and standby7adb902f27ad405f8c7a9b6db28cde5e
PID89119/start04:26:26, both source18ef4d44, idle/readiness/policytrue, fresh
deadlines/unresolved[]. Maintenance standbyRefreshQualifiedtrue. Actual MCP
status afterward route admissionobserved/currentSourceMatches/pairGenerationMatchestrue.
This is bounded same-process survival + lease renewal evidence, not proof of
unattended fresh-app startup or indefinite governor immunity.

Actual MCP read-only ProDevs metadata: exact437775cb title ⏸️ ProDevs,
isArchivedfalse/pinnedtrue. No messages or reapplication of prior mutations.
Next remaining substantial frontier: supported unattended all-process-absent
startup/deleted-service controlled replacement; do not repeat unchanged outage
or full native12. Existing code18ef suite164/fresh harnesses and current native
renewal evidence align. Goal actual ACTIVE; no live jobs/cleanup pending.

## October 18 requested Codex reload API pressure test

Taylor explicitly requested exploring access to config/mcpServer/reload for this
chat without app restart. Read-only existing codex-bridge transport reused as
reference only; no Codex bridge code/config changed. Official app-server docs
confirm reload queues loaded-thread refresh; installed CLI generated schema has
null params, no threadId/serverName selector. CLI mcp/debug expose no reload.

Supported codex app-server proxy default control socket absent (ENOENT), no daemon
started. Current shell parent app-serverPID25468 verified app-owned and listening
on neither named Unix socket nor TCP; stdio socket pairs belong to existing app
transport, not attachable published endpoint. No process environment/token read,
FD hijack, debugger/injection, app/process kill, permission/auth changes or UI.
Available tool inventory has no generic app-server reload call.

Isolated private app-server accepted config/mcpServer/reload => {}, loaded threads
0 before/after; currentChatAffectedfalse, no threads created, native effects0.
Proof .runtime/state/codex-reload-api-probe-success-20261018.json and reusable private
probe.mjs. Initial attempt exited on unsupported global --ignore-user-config flag;
failed report retained, corrected to normal private --stdio with no thread starts.
A new MCP helper could call ITS server, not automatically reach current app process.
Cannot claim a fresh server reload refreshed this chat. Adding an MCP also cannot
bootstrap itself into the already-cached tool roster without a refresh.

Result: API exists and callable in owned process, but no supported live transport
or forwarding tool established to this desktop app-server. Future app integration
could expose reload, or a stable MCP proxy could replace workers after one initial
reconnection; neither retrofits currently running stdio process. No restart done.
Ordinary current CLI remains usable while waiting. Original goal status blocked
pending actual MCP adoption; native startup/deleted-session scope still incomplete.

## October 18 consolidated gate; actual loaded MCP remains blocked

Current source18ef4d442ae72cce83e46b6df014662eca4818cc1b11662c34a1fa996398cede:
full isolated suite164 files PASS1/1 round39.7sec, sourceChangedfalse, report
pressure/v2-2026-10-18T04-30-29-703Z.json. Fresh Claude10/10 (27.5sec) and configured
gpt-6-sol Codex10/10 (19.2sec), reports harness-v2-{claude,codex}-2026-10-18T04-29-49-970Z.json,
source/global config unchanged. No native profile/outage repeated. All four
persisted registrations reread and point at claude-driver-mcp. Cursor execution
still previously auth-gated; OpenCode executable not found in current PATH.
Registration is not execution qualification.

Actual this-chat MCP runtime78678a25 still loaded, source18ef4d44,
restartRequiredtrue, ordinary status section absent. This external refresh blocker
has persisted across more than3 goal turns; no supported individual reload was
found, and killing client/app processes is not the requested reload method.
NEXT PERSON ACTION: quit/reopen Codex, then resume goal here. Verify actual MCP
runtime/source/schema afterward before any further completion claim. Do not ask
repeated off/on toggles or claim fresh subprocess harness equals cached adoption.

No safe further live gate should run while host client remains stale. Scope
incomplete: unattended all-process-absent app startup, deleted-service controlled
replacement, sustained availability, remaining optional/window/person-only limits.
These are not waived by passing synthetic gates. Last native pair verified healthy;
original failure preserved; no live jobs/cleanup pending. Mark BLOCKED on loaded
client adoption after publication. Resume retains full original objective.

## October 18 status route readiness separated from process health

Existing driver_status already exposed sessionManagement; extended its read-only
inspection with routeReadiness: exact retained pair snapshot before/after,
currentSourceMatches/pairGenerationMatches and observed vs source-maintenance-
required vs pair-reconciliation-required. Local native health remains separate.
No target assessed or operation authorized; status never renews/wakes/reconciles.
Unreadable/changing enrollment fails closed; standalone/no pair retains behavior.
Focused controller/health7 PASS. Actual CLI status verified legacy residentfalse,
ordinary native readiness/policytrue/unresolved0, pairGenerationMatchestrue,
source-maintenance-required (installed1f21629 vs new host). No new native effects.

Next substantial gate: actual loaded Codex MCP still awaits earlier requested
app restart; do not repeat toggle instructions. Unattended fresh-app startup and
deleted-service controlled replacement remain unsatisfied native/platform scope;
no unsupported context spoofing or keyboard/quarantine changes. Goal active.

## October 18 machine-ingress boundary audit

Installed-source static contract4 PASS, zero native effects:
pressure/native-machine-ingress-contract-2026-10-18T04-28-41-874Z.json.
Exact B5tintml chunk SHA f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff:
native session tools enabled only sessionTypeccd; sendPeerMessage retains peer
origin and distinguishes queued/undelivered; start_session exposure uses account
feature gate2371478310 (actual flag value not assessed). Not proof every possible
external ingress absent. Direct driver transport independently requires live
receiver peer socket/auth identity. No context spoofing, auth extraction, API
injection, flag changes, new actors or live tests. Initial default historical
source-member lookup failed closed; current member read explicitly and hashed,
versions unchanged2.42304.0/2.1.299. No update/crash inference.

Current supported pair/import/direct/native-tool routes do not establish external
bootstrap after ALL Code processes absent. Human-assisted appquit recovery proven;
unattended requirement remains unsatisfied. Do not repeat same appquit test until
new supported ingress is established. Next options require actual supported app
capability discovery or user-approved scope/architecture change; no silent waiver.
Remaining deleted-service rebind, sustained availability and loaded Codex MCP
adoption still open. Existing Codex restart question pending. Goal active;
last verified pair healthy, no live jobs/cleanup. Codex bridge remains parked.

## October 18 installed native warm-start guards qualified in isolation

Reused existing scripts/native-resume-contract-v2.mjs and exact installed source
chunkCFJssAFf SHAabff2bf8cd6fa8d3d18964636ebaa6034e93997a9eea16a8802eaec0f759c9b7.
Added extracted warmSession ingress guards (343 bytes), synthetic records only.
Missing/archived/unconfirmed import/person-stop/platform-hold return before
spawn; confirmed imported and ordinary active records pass INITIAL guards only.
No IPC, account access, whole bundle execution, monkeypatch, override or live effect.
Existing source also checks crash-loop canAutoSpawn later; not exercised here.

First contract report04:27:35 FAILED after original3 checks: new extraction test
wrapper lacked one closing object brace (SyntaxError), no native action occurred.
Corrected wrapper;04:27:48 report PASS10 checks, nativeEffectsRequested0:
pressure/native-resume-contract-2026-10-18T04-27-48-728Z.json. Failed report retained.
This confirms native guards, not WHICH one caused prior appquit failure. Current
formatted getRecord omits resumeConfirmed/importedFrom, so absent fields there
cannot prove the app's in-memory guard state. Do not infer trust refusal or write
app records. Source import existing-active branch remains unarchive no-op; import
may open saved chat without new process, as actual appquit test demonstrated.

Bridge last independent current-source pair readiness remains healthy after
human-assisted continuation. No new native profile/outage/messages this turn.
Next: supported machine ingress feasibility with exact app tool contracts, without
spoofing human origin, bypassing native stop/trust/crash guard or using quarantined
keyboard. If no supported path exists, document native boundary rather than
pretending always-on achieved. Deleted-service rebind/sustained availability and
actual loaded MCP adoption remain open. Goal active; no jobs or cleanup pending.

## October 18 human ready unblocked exact appquit continuation

Taylor reported sending ready and receiving ready. Independently observed primary
PID87665/startSunOct18 04:25:46 2026 idle. Exact failed-root continuation inspection
qualified original digest/retired histories/account/settings/roles; reply alone
was not accepted as readiness. Durable continuationj0a26c618897b45c59910ac839f470a59
COMPLETED13.2sec on source1f21629c333fca40251617afe0483a9be9f9b46b38ddb367e17f79101f282e66.
Retained original primary import and quiesce/retire prefix; standby imported once
and startedPID89119/start04:26:26 without further person input. Restored exact
roles, native policy/readiness/reads/family and CAS pair/public metadata enrollment.
No original pin replay, new chat, permission change, UI/keyboard or app restart.

Independent appquit-recovery-readback-20261018.json verifies primaryf24a9eae2bc94d25a07a16c9764dadef
and standbye9fe0ff1888c429fae022b4fe018acaf current source1f21629, both idle,
verified/readiness/policytrue/unresolved[]. Pair plan wait/primary-live. Original
failed root SHA83f86cb0b39ff49d9d55fcb6a64557c4900e7b06ac9cbdb545c429ee576e6150
unchanged. Fixture baseline title/bypass/unpinned unchanged. Bridge serving is
RESTORED. Human-assisted recovery passed; automatic app-restart startup remains
FAILED/unqualified. No claim that person ready fixes unattended startup.

Actual goal status now ACTIVE after user reply. Next independent implementation
frontier: unattended startup after app reopen needs a supported native mechanism;
current import-only route opens chat without starting receiver on fresh app.
Deleted-service replacement controlled authority rebind and sustained availability
remain open. Existing pending Codex restart needed for actual loaded-MCP adoption;
do not ask duplicate toggles. No live jobs or cleanup pending. Do not repeat
ordinary native12 or appquit test without changing the startup mechanism.

## October 18 blocked audit: native startup still absent

Revalidated exact failed import continuation without effects: primary peer absent,
inspectPairImportContinuation refuses attempted import still lacks qualified
changed-condition native epoch. Private appquit-continuation-audit-20261018.json.
Same prerequisite has persisted through original appquit gate and two consecutive
continuations. No live job/process wait can advance it; all original jobs terminal.
No supported input-free startup path is established after import only opens chat;
UI/keyboard remains quarantined and native consent cannot be synthesized. Do not
repeat import, parent pin or bootstrap, nor weaken epoch proof to unblock.

Final current-source consolidated synthetic suite PASS1/1 round44.7sec,
pressure/v2-2026-10-18T04-18-24-201Z.json, sourceChangedfalse. Focused14 tests
previously pass. This does not qualify appquit recovery, native serving or cached
MCP. Existing fresh harness passes remain3f2 source, not this diagnostic source.

NEXT REQUIRED PERSON ACTION: in Claude Code open
claude-driver-transport-scratch-2026-10-15 and send ready; resume this goal after
native startup. Then independently observe exact idle epoch, inspect unchanged
failed-root digest from previous checkpoint, submit one supported continuation
only if qualified, never replay prior import/target. Second actor may still need
native startup. Codex restart for actual loaded MCP remains separately pending.
Deleted-service replacement/sustained availability remain incomplete, not waived.
Both old services retired; bridge serving DOWN. No cleanup deletion, no running
jobs. Mark goal BLOCKED after publication; resume requires user/external state
change, not another automatic status loop. Codex bridge fixes remain parked.

## October 18 native import observation logging

Primary/standby peers independently rechecked: both absent; requested person ready
has not yet produced native startup. Original appquit failure/root remain intact.
Added pair-import-observation helper to existing bootstrap import wait: records
fixed saved identity/archive/bypass/old PID absence, peer presence/status/epoch,
observation time and qualification reason. Checkpoints first/changed/final sample,
not every100ms poll. No transcript, arbitrary error string, inferred trust/crash,
new import attempt or serving claim. Checkpoint failure stops acceptance. Same
exact pairImportEpochQualified gate and30sec startup window retained.

Focused observation/bootstrap/continuation14 PASS (absent timeout, waiting person
input, exact idle epoch vs reused PID, persistence failure/cancellation, preserved
ordered effect and continuation guards). Prior consolidated suite is earlier
source; no new native test or full suite repeat. No original failed-root rewrite.

Next remains human ready in Claude Code transport scratch; then observe new idle
primary epoch and inspect exact failed-root continuation for jfebd09b9631e4da5bceea4ece86b0b98,
rootSha83f86cb0b39ff49d9d55fcb6a64557c4900e7b06ac9cbdb545c429ee576e6150,
enrollment9aebc5d47bc7c30046197611decc5c8f206a04c7d313fc3db6f0881472bcc0e2.
Do not replay primary import or parent pin. Both old services retired, bridge
serving still DOWN; no live jobs. Deleted-service authority rebind and actual
loaded-MCP adoption remain separate open requirements. Goal active.

## October 18 actual app-quit gate failed at native startup

Strategic test after independent pair preconditions: both exact peers idle,
readiness/policy verified, no unresolved requests; ordinary fixture bypass,
unarchived/unpinned. Explicit user-authorized osascript Claude quit recorded
before effect, both old peers independently absent. Cause is planned app quit,
NOT crash/governor/update. Versions remain app2.42304.0/CLI2.1.299.

One durable no-op pinfalse parentj3d2f6f23abbc451c8d3ad8965e603f7a automatically
submitted pair childjfebd09b9631e4da5bceea4ece86b0b98. Child verified offline
quiescence/retirement of both old generations, attempted primary import ONCE,
then failed before-import-primary after30sec without native peer startup. App
main.log proves import of exact existing CLI identity, already imported saved
chat and focused session; these do NOT establish receiver startup/trust refusal.
Both peers still absent. Parent failed before selecting target service (null),
route unresolved; target remains unpinned. No target operation replay authorized.

Private app-restart-qualification-20261018.json retains preconditions, known cause,
exact root/parent, phase and current peer/baseline observations. Original failed
root hash83f86cb0b39ff49d9d55fcb6a64557c4900e7b06ac9cbdb545c429ee576e6150,
enrollment9aebc5d47bc7c30046197611decc5c8f206a04c7d313fc3db6f0881472bcc0e2.
Original root and failures not modified. Both old services now retired; serving
is DOWN pending continuation, not healthy/no-cleanup. No jobs left running.

Requested person: in Claude Code open claude-driver-transport-scratch-2026-10-15
and send ready. Do not infer trust refusal or answer any native consent. NEXT:
observe exact new idle epoch, call read-only inspectPairImportContinuation for
original root+digest, then one durable broker_service_continue_pair_bootstrap if
qualified. Never repeat primary import, bootstrap root or original pin request.
Second actor import is not yet attempted and continuation may attempt it once.
If changed-condition proof fails, preserve reason and continue diagnosis.

Deleted-service replacement audit: generic approved pool preserves bypass but
cannot silently inherit exact service role/cwd/identity or replace enrollment.
Requires separate controlled authority rebind, remains unimplemented. Codex app
restart request for stale loaded MCP also pending. Goal active; this is first
native-startup gate requiring human intervention in this audit, not blocked.

## October 18 missing-service recovery diagnosis

Audit confirmed archived retained actors are admissible for exact re-import, but
missing saved actors cannot be replaced by current pair recovery. Added explicit
saved-service-session-missing reason + primary/standby role and replacementAuthorized
false to pure planner and actual inspection before offline service reads. Other
offline evidence failures now include fixed inspection phase and actor role,
without arbitrary error text, chat content or logs. Automatic recovery durably
checkpoints bootstrap-refused diagnosis before rejecting, with no bootstrap child
or target dispatch. A missing record is NOT proof of user deletion or crash.

Focused pair/automatic regression12 PASS, including missing both roles vs archived
same identity, refusal checkpoint and no child. No native outage/profile/restart,
archive/delete, new chat, permissions or message test. Prior163-file and fresh
Claude/Codex consolidated gate remains previous source3f2db9d5; this diagnostic
change has focused qualification only, do not relabel the prior full pass.

Codex restart question remains pending from preceding turn. Continue independent
scope work rather than treating a pending answer as approval. Deleted-service
replacement, appquit/sustained availability and actual loaded MCP adoption remain
open; explicit retained-pair bootstrap and ordinary native12 already proven.
No cleanup or live job handles pending. Goal active.

## October 18 input-free CLI entrypoints and consolidated gates

preflight/probe now support explicit --input-free --controller <exact ID> --session
<exact owned fixture ID>, reusing existing ordinary live-v2 runner. Preflight
always --preflight-only; refuses --live/unknown flags. Probe requires explicit
--live; never infers targets or creates a fixture. Default legacy entrypoints
remain unchanged; legacy capability matrix not overwritten or falsely qualified.
Narrow-profile exclusions printed. Focused argument/fixture/epoch tests5 PASS.

Actual CLI read-only preflight passed all3 on current code: report
pressure/live-v2-2026-10-18T04-13-07-119Z.json, no native effects, fixture same
PID92860/tool title/high/bypass/unarchived/unpinned; inputfilters0 before/after,
quarantine true. Controllerfb79 readiness qualified; no new native profile replay.

Consolidated current-source batch PASS: Claude harness10/10 report
pressure/harness-v2-claude-2026-10-18T04-13-21-630Z.json; configured gpt-6-sol Codex
harness10/10 report pressure/harness-v2-codex-2026-10-18T04-13-25-911Z.json.
Both source/global config unchanged. Full isolated suite1/1 round45.5sec PASS,
pressure/v2-2026-10-18T04-14-03-845Z.json, sourceChangedfalse. These synthetic
harnesses do not prove new native automatic outage branches or cached adoption.

Actual loaded MCP checked again: runtime78678a vs source3f2db9d5, restartRequired
true; legacy broker offline, no recovery attempted. Next: one user Codex app
restart after publication, then actual loaded MCP verification. Remaining scope
still includes appquit/deleted-service/sustained availability and separate original
creation/focus/legacy UI/person-card limitations. No jobs or cleanup pending;
goal active. Do not repeat native12 for this CLI delegation-only change.

## October 18 original-scope entrypoint audit

Reconciled brief requirements against saved evidence, without new native tests.
Control-target trust reply is historical setup already followed by the successful
ordinary twelve-check profile; no further trust prompt or ready message needed.
README current qualification corrected: ordinary routes are independent, native12
passed on f874, explicit natural-governor pair recovery and late-readiness native
continuation passed; automatic composition remains synthetic-only. Fresh import
Bypass mismatch and final loaded-MCP adoption remain explicit gaps.

Entrypoint audit found lib/probe.mjs still calls assertUiAvailable before any
probe, requests old Haiku4.5/Accept edits, exercises legacy broker/groups and
queues deletion candidates. Do NOT run it to satisfy the brief while quarantine
is active. preflight --no-probe is read-only installation evidence but describes
legacy broker, not ordinary-controller readiness. smoke.mjs defaults t0+t1
(creation), --all adds t2-t4; cleanup errors only print and do not fail scenario.
Thus old smoke success cannot establish cleanup or whole v2 acceptance. Installation
code configures four harnesses; actual execution remains Claude/Codex proven,
Cursor authentication-gated, OpenCode unqualified. No config/auth changes made.

Next changed-condition step: make an explicit input-free qualification entrypoint
that reuses existing ordinary preflight/profile and reports legacy/UI/person-only
checks as unqualified, preserving original probe rather than weakening quarantine.
Then choose the final consolidated current-source synthetic/harness batch, and
request one Codex app restart only after source settles for actual MCP adoption.
No native jobs started; no cleanup pending. Goal active, not complete.

## October 18 automatic late-readiness continuation before ordinary dispatch

Ordinary preflight now detects a selected generation that differs from retained
pair binding BEFORE taking controller route lock. Healthy/standalone binding
returns immediately; original running renewal waits on existing normal route path.
Exact failed readiness-timeout generation is independently requalified against
original job/ledger/retired predecessor/current late-ready epoch/roles/settings.
One stable original-job+ledger-hash continuation child executes outside route lock,
preventing parent/child deadlock. Target account/identity/retained grants and exact
source digests checked before submission and current binding/readiness afterward.
Healthy generations do not submit a continuation; failed/cancelled/unknown child
keeps its handle and blocks target dispatch with no retry or installation replay.

Normal admission now explicitly refuses selected-vs-retained pair generation
mismatch even if policy could otherwise be probed. Thus a parent that waited on a
failed in-flight renewal cannot silently serve through stale failover enrollment.
Late continuation identity is retained in ordinary route ledgers/public results.
Standalone controllers without a pair keep existing admission behavior. All old
mutation, request binding, process epoch and permission gates remain intact.

Focused auto/cold/maintenance/continuation/MCP44/44 PASS12.8sec, private
.runtime/state/automatic-late-readiness-focused-20261018.log. Final extracted
stale-pair guard plus continuation12/12 PASS. No repeated live twelve-check profile,
forced outage, source deployment/renewal, messages, permissions, app restart or
UI/input changes this turn. Prior native full ordinary profile remains sourcef874,
not falsely promoted to native proof of this new automatic branch.

Next: consolidate full original-scope acceptance against persisted native12 checks,
actual natural-outage recovery, actual filtered harnesses, and source-specific
remaining group/window/person-only/appquit/loss/sustained-pressure gaps. Choose
strategic remaining gate(s), then one final current-source full suite/harness batch
and actual loaded-MCP adoption. Cached78678a MCP still requires supported user
Codex restart after source settles; no hidden process kill/reload route exists.
Fixture remains tool-title/Haiku5.5/high/bypass/unarchived/unpinned by last independent
readback, pairfb79/c404 priorf874 healthy. No cleanup pending; goal active.

## October 18 late-readiness continuation and combined ordinary profile passed

Added exact durable broker_service_continue_renewal_readiness: only original failed
before-readiness timeout with unchanged original ledger/enrollment digests and
same live idle successor epoch, observed readiness, no policy/attempts/unknowns,
verified completed install/retired predecessor and identical roles/settings.
One claim per original renewal prevents competing continuation roots. Continuation
only invokes never-attempted policy, family and standby CAS; no installation/target
operation replay. Original failed job/file bytes remain unchanged. Subsequent
normal hot renewal wait60sec (bounded); actual failed generation registered ready
~53sec after activation, explaining the former30sec deadline failure.

Native continuationjb26c6a98dddf41aba3e9d6bf12ee1e53 COMPLETED for original
j82d7a883599a4b778aed4a499b0dc4e7, originalSha1658c65f... preserved, policy/family
and pair readback verified; installationRepeatedfalse. Source7bae... observed old
installed5718... without pretending original job success. Changed-condition title
setupj3dddf033c36e48f38effa994b8f96622 then passed exact receipt/titleSourcetool.
Owned fixture efforthigh/titletool are deliberate TEST BASELINE preparation from
originalunset values, not a claim of reverting to original defaults. No permissions
raised. Explicit preflight03:59 failure retained; preflight04:04:55 passed all3.

First full ordinary profile04:05:11 retained failure: runner compared ordinary
fixturePID92860 to standby metadataTargetPID13521, rejecting before concurrent
controls and cleanup. Independent saved baseline matched exactly afterward; no
native control race/epoch change. Corrected fixture-epoch selector with regression
cases for ordinary/fixed targets and PID reuse. No receipt/idle guard weakened.

Corrected ordinary profile ALL12 PASS on
f8745320185ee2d6dffb6e69444c83425e25126dc99b385f02c78f0fb00b1b07:
pressure/live-v2-2026-10-18T04-06-00-576Z.json, sourceUnchanged. Native durable
submit+reuse+causal reply, cancellation before dispatch,3 concurrent controls,
3-field batch, busy queue, native interruption+replacement, causal QUEUED reply
with instruction ordering, unique replies and cleanup restore all verified.
Quarantine true/inputfilters0 before+after; no new chats/permissions/archives.
Batch requests:1 = one PUBLIC job; adapter verified3 distinct per-field native IDs.
Reply proof is native sender/body/cursor/ancestry, NOT returned message-UUID linkage.

Independent final readback ordinary-native-profile-readback-20261018.json confirms
fixture8f1 baseline fully restored (tool title/Haiku5.5/high/bypass/unarchived/unpinned),
controllerfb79c9df4f9b4b06a0f5a91831010193 exact samePID13210/start03:50:04 idle,
current sourcef874, readiness/policy true, unresolved[],46 slots; pair primary-live
and automatictrue. Focused continuation/MCP39 PASS plus fixture/causal13 PASS.
No whole synthetic repeat after immediately preceding160-file gate; runner-only
regression fixed during controlled native gate with first failure preserved.

Next: wire exact late-readiness continuation into ordinary preflight BEFORE its
controller route lock (same deadlock precaution as pair recovery), preventing
policy probing of a selected successor while retained pair binding stays stale.
Do not force another native profile now: preserve this substantive gate and use
changed-condition/targeted checks. Then reconcile remaining full scope (group/
window/person-only/appquit/loss/sustained-pressure) and final actual MCP adoption.
All jobs terminal; no fixture cleanup pending. Goal active.

## October 18 ordinary combined runner adapted; late readiness blocks setup

Existing scripts/live-v2.mjs now supports explicit --ordinary --input-free
--controller <primary> --session <owned target>. Ordinary batch receipts require
independent-session-management plus exact unique per-field requestIds, not fixed
metadata childJobs. New queued-turn-preserved check requires an actual causal
queued reply and queued instruction before replacement, beyond queued/busy receipt.
The twelve-check ordinary profile restores baseline and never creates/archives,
changes permissions or touches service actors. Original fresh creation/focus/archive
requirements remain separate; this profile cannot claim full interface acceptance.

--ordinary --preflight-only --input-free with exact controller/session performs
only audits/readiness/fixture admission, no sends/cleanup/native controls. Fixture
must be registered create under canonical driver-state/probe, own same account,
bypass, no worktree/open PR, explicit high/etc effort AND tool-locked title baseline,
exact native idle epoch; controller grants/readiness/policy/margins required.
Preflight reports blockers;12 focused fixture/batch/causality/scope tests PASS.
Actual preflight pressure/live-v2-2026-10-18T03-59-16-550Z.json refused missing
explicit effort baseline; quarantine stayed true/filters0/no messages sent.

Fixture setup recorded in .runtime/state/ordinary-live-preparation-20261017.json.
Public effort-high jobj9eae2875526646a9859ebccac93c2370 verified, current fixture
8f1... remains bypass/Haiku5.5/high, nativePID92860/start03:41:00 idle.
Tool-locking same title jobjfbe55c52162a47bc8c81ac15714aac10 did NOT dispatch target:
required-source renewalj82d7a883599a4b778aed4a499b0dc4e7 installed successor82d7...
then readiness timed out30sec, phasebefore-readiness. Original target request/
intent/admission/result files independently absent. Both primaryPID13210 and
standbyPID13521 still alive/idle; no new governor event, crash, permission refusal
or auto-update. Later same-epoch status readinesstrue/policyfalse/unresolved[].
Late readiness is observed, NOT a successful original renewal. Retained binding
still3011...; plan enrolled-generation-changed. TitleSource remains null; baseline
preparation/full native runner NOT ready. Do not rerun title or full profile yet.

NEXT agent-executable frontier: guarded continuation of original failed renewal
AFTER verified late same-epoch readiness, preserving original failed job/digest.
Perform only never-attempted policy/family and exact standby CAS; do not repeat
prepare/quiesce/retire/activate or infer readiness from files/send return. Then
verify current pair, finish tool-title setup after verified nondispatch, rerun
preflight once and execute one consolidated ordinary native profile. No new message
or forced outage tests this turn; full suite deferred. Goal active; all handles
terminal and failed evidence preserved. Cached MCP remains older78678a build.

## October 17 consolidated actual harness gate and scope audit

Actual filtered harness-v2 on stable source
86d5d0ed9a0f7ad2551cbe43a1065bea0f46dbb09f34049bf91ab78bed6e4fa0:
Claude10/10 PASS23.4sec, configured Codex gpt-6-sol10/10 PASS18.7sec. Reports
pressure/harness-v2-{claude,codex}-2026-10-18T03-55-22-057Z.json. Actual clients
used isolated synthetic stores with native control tools filtered out; source and
global configs unchanged. These validate clients/durable contracts, not live effect
qualification. No shell in model fixture, desktop messages or UI recovery.

Actual attached Codex driver_status still runtime78678a... vs current86d5...,
restartRequiredtrue; no independent-management fields from cached older schema.
Tool inventory exposes no supported single-MCP reload/restart action. Do not kill
client processes, repeat toggles or claim fresh subprocess client means adoption.
Defer ONE user Codex restart until remaining runner/code changes settle.

Read-only native pair audit: primary89c7 buildd423..., PID13210/start03:50:04 idle,
verified/readiness/policytrue, unresolved[],27 spare slots. Pair wait/primary-live,
automaticRecoveryEnabledtrue. This current health is source-specific d423, not
native execution of latest automatic composition. No request/lease effect performed.

Current acceptance frontier (preserves original full scope):
- Ordinary ProDevs unarchive/pin, model/config/stop/interrupt and approved pool have
  native receipts/saved-state evidence on named revisions; fresh import/fork and
  focus/history covered, with bypass-import mismatch explicitly unverified.
- Actual both-absent natural governor recovery passed explicit durable API; normal
  request automatic bootstrap/read-abandonment is now synthetic-qualified only.
- Durable/cancellation/concurrency/uncertainty and actual cross-harness contracts
  pass; current native combined queue-vs-interrupt ordering/full11 runner remains.
- Existing live-v2 supports fixed enrolled metadata target, but batched results
  still assume independent-metadata/childJobs; ordinary session route returns
  independent-session-management/requestIds. Do not run it blindly or count its
  component exclusions as full11 acceptance. Next adapt this EXISTING runner to
  explicit owned ordinary fixture/current receipts and restore-only cleanup.
- Group/project/window/person-only controls, appquit/delete/archival loss recovery,
  sustained pressure/residency and final loaded-MCP adoption remain separate open
  scope; no human card or input quarantine may be bypassed to green a suite.
Goal active; do not mark complete from these fresh harness/synthetic checks.

## October 17 automatic interrupted-family read reconciliation composed

Normal ordinary request recovery can now screen the exact interrupted-renewal
family read BEFORE eligible pair planning. Optional internal pending-read mode
checks original failed renewal/retired predecessor/unchanged epoch-role-settings
and requires exactly one generation-bound list_sessions unknown, expired request,
finished worker, intent/request/control present and entry/admission/result absent.
It returns qualified:false + metadataReadAbandonmentEligible:true, never a terminal
history or adoptable source map. Original status arrays are not modified or faked;
role bytes are compared directly against reviewed predecessor for candidate scope.

An eligible candidate gets one durable broker_service_abandon_read child with
stable controller+service+request key, original candidate/submission/job/result in
parent recovery ledger. Native offline abandonment retains all its own exact
PID/same-host/request/worker/privacy/late-evidence checks. Result must retain unknown,
no receipt/replay; guard/replan occurs afterward. Bootstrap cannot start until
fresh full lineage and both-absent plan pass. Uncertain child/checkpoint/cancel,
mutation/mixed/unknown operations and late/unreadable evidence stop without retry.
Not-yet-expired/unfinished reads refuse before child submission rather than
poisoning a future stable abandonment key with a premature failed attempt.

Focused57/57 PASS13.2sec (auto orchestration, lineage, read abandonment/history,
pair planner/executor/continuation and actual isolated MCP regression). Log
.runtime/state/automatic-read-abandonment-focused-20261017.log. No native outage,
wake/message/archive, permission or app/process manipulation repeated this turn.
Earlier explicit natural-outage native proof remains source-specific d423; current
automatic composition is implementation/synthetic evidence pending native gate.
Current89c7/c404 pair remains prior source, fresh-fixture cleanup still complete.

Next consolidated gate: actual filtered Claude/Codex harness contracts on stable
source, reconcile final native scope/audit and one final loaded-client adoption.
Automatic native outage dispatch remains unqualified until changed-condition
proof exists; do not manufacture another outage for every interim edit. Group/
window/person-only/appquit/sustained-pressure requirements remain in full audit.
Goal active, all focused test handles terminal.

## October 17 eligible both-absent recovery wired before ordinary target dispatch

Added automatic-pair-recovery for ordinary account-bound requests only. Healthy
primary returns immediately; surviving standby stays on existing cold-recovery
path. Exact automatic enrollment plus independently eligible pair plan required.
Original target account/identity and retained grants checked before recovery;
fixed recipient-epoch operations never silently adopt a replacement standby.
A separate automatic-pair lock serializes parents BEFORE controller route lock,
avoiding parent/child deadlock. Bootstrap child uses stable controller+binding
idempotency key and durable240sec scheduler budget; submission/result/checkpoint
uncertainty stops without retry. Child may continue after parent cancellation.
New target request is still NOT dispatched until binding, epochs, intended target,
source/generation/capacity/grants are freshly admitted under normal route lock.

Recovery job trace is retained in automatic-pair-recoveries/<parent>.json and
ordinary route ledgers/public results as pairRecoveryJobId/recoveryMode. A failed
post-recovery admission retains targetDispatchedfalse and original child identity.
No background wake, observer-owned legacy recovery or repeated outage test added.
Focused automatic/cold/maintenance/MCP37/37 PASS12.7sec; no full/native repeat after
prior successful real governor bootstrap. Implementation/synthetic coverage does
not itself qualify automatic native outage dispatch.

Remaining explicit gap: eligible pairs recover automatically, but an interrupted
renewal with a not-yet-abandoned unknown read still refuses planning. Need compose
exact offline metadata-read abandonment child (preserving unknown/nonmutation
scope) before replan, then exact lineage bootstrap; unknown mutations remain held.
Do not imply the earlier explicit abandonment was automatic. Following integration,
perform strategic current-source cross-harness/native qualification and one final
MCP refresh. Live pair89c7/c404 remains prior source; no new messages/fixtures or
native effects this turn. Original owned lifecycle fixture cleanup stays complete.
Goal active; all test handles terminal.

## October 17 real both-absent governor recovery completed with renewal lineage

Connected exact verified interrupted-renewal lineage to pair planning/execution,
CAS transition proof and failed-import continuation. Root keeps ORIGINAL bindingd5ed
and old842d generation/family for final CAS; separate sourceActors retires installed
successor9d576 plus standby1da3. Session/cwd/old epoch cannot change. Original
renewal ledger hash guarded throughout; source map rechecked at preflight and in
transition/continuation proof. Unknown mutation/STOP/live peer/version/role/settings
checks unchanged. Focused22 PASS; integrated synthetic1/1 PASS47.6sec sourceUnchanged
pressure/v2-2026-10-18T03-49-54-331Z.json on
 d423afe52e738858b6e35788793349d65de24dbe3d16ae7ff996bb4df960eaf8.

Actual durable bootstrapjbd7c8134bfad421cbbca1a4d635c1eeb COMPLETED in20.3sec
against the confirmed natural governor pressure eviction. Both existing actors
quiesced/retired, imported ONCE, independently observed new idle epochs, prepared,
activated, policy/read qualified, fresh family acquired and pair+public metadata
bindings resealed. No person trust/ready step, app restart, kill, new session,
permission change, keyboard/CUA or unknown operation replay during recovery.
Primary89c7bbaf4e964fb7ac5b3d6e75b67857 PID13210/startSunOct18 03:50:04;
standbyc4043124d2724f2b802201137b2d1da9 PID13521/start03:50:06.
Independent plan wait/primary-live automaticRecoveryEnabledtrue; current binding
94b6e1830c5db8e3335797289639ed89725c82bccd472fc0d0abb131317a61e8.
Root qualifiedtrue but unattendedBootstrapQualifiedfalse: this is explicit API
mechanism qualification, not automatic request-triggered dispatch or residency SLA.
Original failed renewal/archive/read history and abandonment remain retained.
Evidence .runtime/state/interrupted-pair-recovery-native-20261017.json.

CLEANUP COMPLETE: original failed archive had no selected service and its exact
request/intent/admission/result files absent in failed successor; verified this
before changed-condition cleanup. New fork archivej7a4426b76ab54651b171d7b8b26dc3a5
and source archivej26486a6c2c084e11aa2908b4042ef778 both passed native receipts and
independent saved archivedtrue. Both owned records remain Accept edits as imported;
no files deleted/permission raised. Fork cleanup saw a foreground app change and
correctly left it untouched, focusVerifiedfalse/changed-unattributed; source cleanup
focus endpoints unchanged. Do NOT call all cleanup focus preserved or hide the
known bypass-import mismatch. Fresh import/fork record updated cleanupPendingfalse.

Next: integrate eligible BOTH-ABSENT bootstrap into normal controller maintenance
using durable child/recheck and exact recovery lineage (do not replay an original
target operation after uncertainty); avoid manufacturing another outage/test now.
Then current-source filtered cross-harness gate and one final loaded-MCP refresh;
remaining group/window/person-only/appquit/sustained-pressure requirements stay
in the full audit. Goal active; all current native/test handles terminal.

## October 17 interrupted renewal successor lineage independently verified

Added read-only broker_service_renewal_lineage. It examines only deterministic
j<selected-primary-service> ledger/original failed job, exact retained binding,
selector and old OS epoch; independently verifies retired predecessor plus current
offline successor histories. Requires original phase before-standby-family,
recorded verified prepare/quiesce/retire/activate/policy turnover, exactly the
recorded abandoned family read, predecessor's independently settled empty-family
receipt and unchanged native role grants/target/settings/anchor. Any changed job,
unknown mutation, scope/epoch/settings/role/family mismatch refuses. No automatic
service scanning, binding mutation, adoption, bootstrap, import or wake authority.

Actual public read-only inspection passed for842d->9d576, original renewal
j9d5761452b974d1284b24dba7d0c2034, retained bindingd5ed..., original ledger digest
354079ed917c7259b8f2237a293c0b682fce761a20c2c597fc0ddca088daae64,
abandoned familyba99... and retained predecessor family2d38.... Outcome unknown
preserved; recoveryAuthorizedfalse. Evidence
.runtime/state/interrupted-renewal-lineage-20261017.json. Sixteen focused lineage/
role/pair-plan tests PASS; initial positive fixture carried forbidden extra serviceId
inside metadataTarget, corrected synthetic fixture to exact native shape, not guard.
No full/native lifecycle repeat, archive retry or app/permission/process changes.

NEXT concrete implementation: carry verified lineage as a separate source-actor
map in the pair bootstrap root, while retaining ORIGINAL enrollment for final CAS.
Recheck proof before effects, snapshot/retire selected9d predecessor source, preserve
842d retired history/family and unknown read marker; keep standby1da role exact.
Extend root transition and failed-import continuation checks to verify source map,
never loosen ordinary arbitrary-generation selection. Then eligible original-pair
bootstrap, final source-specific readiness and archive owned source8bab/forkcbc.
Both fixtures still unarchived; pair remains absent; goal active, no live jobs.

## October 17 exact offline metadata-read result abandonment passed

Added durable experimental broker_service_abandon_read for an exact offline owned
generation/request. Only expired single generation+policy-bound get_session or
linked-self list_sessions reads qualify, with finished worker, empty dispatch list
and absent entry/admission/module/published result evidence. Exact old PID absence
and no same-host peers checked before/after checkpoint under broker lock. Invalid,
unreadable, changed, mixed, mutation and late-result evidence refuse. No request,
control or result is overwritten; marker binds unchanged request hash and epoch.

Review separates abandonedReadRequestIds from settledRequestIds: abandoned result
retains outcome unknown, no native receipt, no replay. Terminal review may complete
without fabricating a successful read; retirement still requires its own STOP and
exact independent offline gates. Original request/job failure remains retained.
Durable native-history operationj381542509fbf4db380c2b870125c91c4 completed against
original9d576.../rpeerba99... after current absence verification. Offline readback:
verifiedtrue/offline-installed, abandonedReads[ba99...], unresolved[], settled[],
terminalAttemptReviewCompletetrue, retirementAuthorizedfalse. No native calls or
wake/import/archive replay. Evidence .runtime/state/outage-read-abandonment-native-20261017.json.

Focused13 passed first. Broader first run retained six runtime_stale refusals after
agent changed a diagnostic legacy-binding fence during that run; not native failure.
Repeat exact suite only after source stable; do not claim first run passed.
Next: interrupted-renewal successor lineage842d->9d must be reconciled with retained
d5ed enrollment using original ledger, retired predecessor family and exact roles;
current pair planner still refuses predecessor history/selection. Do not rewrite
binding or relax unknown mutation gates. BOTH owned fresh source8bab.../forkcbc...
remain unarchived pending eligible pair recovery. Goal active; no live native jobs.

## October 17 offline unknown-attempt diagnostics verified

Actual selected9d576... offline review now exposes unresolvedAttempts, bounded
metadata only: requestId, allowlisted single operation, exact runtimeBindingVerified,
operationScope(metadata-read only for bound get_session/list_sessions), and presence
of intent/request/control/entry/admission/moduleResult/publishedResult. Presence is
present/absent/unreadable; unknown read/parse failures never masquerade as absence.
No arguments, transcript/tool content, arbitrary op/error/control strings returned.
Outcome stays unknown, replayAuthorizedfalse, retirementAuthorizedfalse. Existing
terminalAttemptReviewComplete and recovery/retirement guards are unchanged.

Current offline source9570a13abd441a75b54bccb6293064b4f6f05431f5ff6f59068eb171984fd8df
observed installed792ad... generation after exact prior PID absence: original
rpeerba99d43b96115cfc36fc9a00c7ca0c1a is bound list_sessions metadata-read,
intent/request/control present, entry/admission/moduleResult/publishedResult absent.
No claim of nonexecution or safe replay. Evidence
.runtime/state/outage-offline-attempt-diagnostic-20261017.json.
Focused offline/history/retirement/pair-plan18/18 PASS2.9sec; new privacy/unreadable/
binding cases retain unknown history. No native wake, archive retry, bootstrap,
permission change or full suite repeat. BOTH owned fresh lifecycle fixtures remain
unarchived pending recovered controller; cleanup from prior checkpoint still open.

Next changed-condition engineering: introduce narrowly verified offline abandonment
of a metadata-only read after exact old PID and same-host absence, preserving
original unknown outcome and never fabricating a success/nonexecution receipt.
Mutation/unknown-op/mixed/malformed requests MUST continue blocking retirement.
Then resolve retained enrollment vs interrupted renewal successor using original
lineage and exact roles, qualify eligible pair bootstrap and archive both fixtures.
Do not bypass the current planner refusal or replay the original family. Goal active.

## October 17 actual governor pressure outage during fresh lifecycle gate

Previous turn progressed pool service-role protection. Current native lifecycle
trial on792ad0a68c98e73632e02a49f2b103b80e453e8796f74355c2cc2aa7daf728ac:
create no_project jobj6c7d598797ae4cad81ad6211b5eaba71 created owned source
local_8bab88f5-5efd-4bb0-b437-413cc27ebe57 in scratch-workspaces scratch-2026-10-17-8b4bbc.
Requested bypass; actual saved Accept edits. Correctly UNVERIFIED with permissionGap,
no automatic raise/followup. Native focus and navigation verified restore-observed.
Fork jobj2cc63cf9742a472d948c96f5b935febe produced
local_cbc18613-baad-430c-b502-d84c5cea0808, same exact folder/CLI UUID, title/model,
Accept edits inherited from source, verifiedtrue; independent saved read agrees.
Bounded private transcript hashes: source2 messages are exact prefix of fork4.
Only trivial owned bootstrap/fork exchanges; no user task/ProDevs messages. Initial
verifier path used app local ID instead of CLI UUID: ENOENT before read, corrected
without replay. Not a native fork failure. Both focus restores confirmed.

IMPORTANT cleanup archiveje425f285f1fd409d8a74943744827568 failed BEFORE target
service selection/dispatch. Required-source renewalj9d5761452b974d1284b24dba7d0c2034
installed successor9d5761452b974d1284b24dba7d0c2034 and readiness/policy verified,
but lost primary during fresh familyrpeerba99d43b96115cfc36fc9a00c7ca0c1a.
Renewal remains failed/outcome_unknown at before-standby-family; enrollment retains
predecessor842d.../standby1da.../digestd5ed... . Do NOT replay family or archive.

Authoritative narrow main.log lines BOTH at local2026-10-17 23:41:40:
CliGovernor pressure evicting primaryc0a...(idle5728s) and standby74c...(idle10710s),
followed by Pausing...(governor_evict). ps exact96436 and90418 returned absent;
peer records absent. Versions remain app2.42304/CLI2.1.299. This is confirmed
GOVERNOR eviction, not an inferred crash, planned exit143 or app auto-update.
Offline current successor review verifiedtrue with exactly the family request
unresolved, no settled IDs. Live result reconciliation refused (no replay).
Read-only pair bootstrap plan refuses offline-history-or-stop-unqualified; no
bootstrap/wake/import was attempted. Preserve guards and original lineage.

Evidence .runtime/state/fresh-import-fork-native-20261017.json contains jobs,
saved states, hashed history, source-specific focus evidence and outage/plan.
Cleanup PENDING: both owned new source/fork records remain unarchived (do not
pretend cleanup or full fresh-bypass qualification passed). No files deleted,
process killed, auth/permission/card/UI change. Remaining action is agent-owned:
investigate offline reconciliation/abandonment of this metadata-only family and
renewal-successor lineage, then eligible original-pair recovery, then archive BOTH
owned fixtures. Do not relax unknown MUTATION admission or retry unknown effects.
This actual both-absent pressure event changes the next gate; stop repeating pool
or scratch tests. Goal remains active; platform blocked threshold not met.

## October 17 pool operations exclude retained independent service actors

Audit found pool_release and stale/clean pool claims protected caller/legacy broker
but not the independent primary/standby. Pool now reads the retained management
and standby enrollments: both actors are refused by release even override:true,
excluded from suggestions, and reported service_protected if found in pool
inventory. Reconcile preserves their entries for diagnosis rather than dropping or
recycling them; claim cannot consume them. Expired/absent/archived actors remain
protected by retained role, not current native liveness. Invalid enrollment fails
closed without modifying inventory. No lease renewal, repair, wake or native
recycle is performed by this check.

Isolated public pool_release refuses both actors before native effects; public
pool_status suggestions exclude both and retain an ordinary candidate. Clean and
stale-claimed service entries cannot become available; an ordinary approved member
still claims successfully. Initial focused pool/v2/MCP gate76/76 passed12.6sec;
final suggestion guard additionally passed8 pool tests, no full/native repeat.
Live read-only role audit independently found both actual actors protected and
ordinary approved dotfiles member still ready; evidence
.runtime/state/pool-service-protection-20261017.json (source before final narrow
suggestion guard; don't claim native dispatch proof). No service actor was recycled
or archived. Prior metadata-only native pool lifecycle qualification is retained
on source673aae; this guard does not claim final-source native adoption.

Next: one bounded owned fresh import/fork lifecycle gate with saved mode/focus
verification and retained failed identities. Do not repeat pool metadata/messages.
Final MCP adoption, both-absent recovery, pressure and window gates remain open.
Goal active; no unknown native jobs introduced.

## October 17 current-source native approved pool lifecycle passed

Used one existing ready bypass pool member (2cb5bbbe...) in canonical dotfiles;
no new chat/import/fork, no message, no permission/auth change or UI automation.
Public durable create_session require_pool:true on source
673aae502955f073ac7215f524417010cd65f57e5cf4c5cc01ed28f78331fa2d:
job j1ba6ae5c4913451d8d3ead7aa4134212 completed, via pool, verifiedtrue.
Native unarchive child7d7fa... then config childc542... produced distinct exact
receipts for title/model/effort. Independent saved read confirmed title qualification,
Haiku5.5/high/bypass/unarchived; no CLI identity materialized. Focus endpoints
remained Codex plus original control-target main view throughout native results.

Automatic required-source primary renewal produced service842d0a3dc8884e908bb1b75de570e4d4;
final independent standby plan wait/primary-live, automaticRecoveryEnabledtrue,
standby1da3f53b10404658b6fe65ed48314b46. No duplicated family/wake/replay.
Restore config j7044bb56fe3346f09642b1654f632477 and archive
j37832b970a61424da5d66ab976b877bb both verified exact native receipts.
Independent saved baseline title/titleSource/Opus5.5/high/bypass/archive/pin and
empty CLI identity restored; public pool_release took its no-effects already-clean
branch and marked ready. Final pool health ready. No member was left consumed.
Evidence .runtime/state/pool-native-lifecycle-20261017.json plus original durable
jobs/route receipts. This is metadata-only approved pool creation qualification,
not first-message, fresh import/no-folder/fork, trust, grouped creation or sustained
pressure qualification. No repeated full suite: source unchanged since87-test gate.

Next changed-condition step: qualify fresh import/fork permission and focus paths
using one bounded owned lifecycle trial, preserving mismatch identities and human
permission gates; final loaded MCP remains stale. Pool service-actor protection
also needs audit: poolGate currently explicitly excludes caller/legacy broker but
not the independent pair, unlike project archive. Do not recycle service actors
or use a live recycle experiment to investigate this boundary. Goal active.

## October 17 fork permission inheritance is explicit

Current audit found fork returned verified:true without exposing the imported
permission mode. A bypass source could therefore appear fully qualified after an
Accept edits import. Fork now reports actual saved model/effort/permission/title
source and intended source permission mode; mismatches (including missing source
mode) return verified:false with structured permissionGap, no auto-raise/card.
This is a created fork needing reconciliation, never permission to recreate it.

Creation and fork share reconcileTierAImport: exact title/cwd/CLI UUID predicate,
one import, before-import navigation intent, preserved original failure/category,
created identity/fork origin/importAttempted/retrySafe:false. Bounded existing
UUID-filtered import log diagnostics survive verification failure; diagnostic
failure never masks the original. Synthetic dependencies test import ordering,
wrong identities/missing records, failed import/no replay, diagnostic failure and
navigation registration failure. No new chat or native import/fork/message ran.

Next lifecycle gate must use actual public create/fork entrypoints, independently
read saved configuration/focus and retain mismatch identities. Do not run the old
live script's Accept edits fixture as proof of Taylor's requested bypass setup.
Use existing approved pool where available; otherwise record the native permission
barrier, without automatic permission changes or duplicate creation. Keep final
loaded-MCP refresh and outage/pressure/window gates separate. Goal active.

## October 17 creation/fork failure reconciliation and focus boundary

Current-source audit found an import failure could omit the already-bootstrapped
identity and withFocus could not restore after unknown-target creation/fork errors.
Tier A now registers the exact new local ID immediately before import. Failure
restoration uses only this internal navigation intent, existing before-op snapshot
and fresh user-movement policy; it never derives authority from an error string or
arbitrary saved record. Original import error/category and no-replay status survive
restoration failure. Errors retain session/CLI ID, cwd, created/importAttempted,
retrySafe:false (plus fork origin). Do not create a replacement to resolve them.
Create/fork import verification now checks title, exact cwd and CLI UUID; public
results expose focusVerified/navigationVerified/disposition separately from saved
record verification. Eleven focused policy tests passed, including import failure,
no-intent/show/leave, restoration failure and unconfirmed successful restoration.
No real new chat, import, fork, app restart or message was performed for this fix;
native creation/fork qualification remains open.

Loaded actual Codex MCP status still reports runtime78678a... versus source034a...
and restartRequired:true BEFORE this change. Final connector adoption remains a
separate gate; do not treat current CLI proof as adoption. Next changed-condition
step: qualify consolidated creation/fork lifecycle with preserved permission gates,
then one final loaded-client refresh and source-specific integration gate. Existing
full objective and other outage/pressure/window gaps remain active.

## October 17 live standby lease maintenance verified

Resolved the stale enrollment described below. The standby was live and idle but
its lease expired; enrollment correctly refused it. Primary renewal now checks
that exact condition, renews only the explicitly automatic, unchanged live standby
once through a durable child, then CAS-enrolls the successor pair using its already
settled fresh family receipt. It never relaxes enrollment, wakes sessions, repeats
unknown effects or grants the standby ordinary-chat controls. Detailed enrollment
refusal reasons are retained. Healthy standby refresh performs no child renewal.

Native source 034aeea65a01da3cf64e2ad3842eda7e0dd3ce6af5e4b5fa10983f6dbface422:
parent jf23fcc62dee94311a6dac05634fa7845 completed, primary f23fcc62dee94311a6dac05634fa7845;
one standby child j1da3f53b10404658b6fe65ed48314b46 completed, standby 1da3f53b10404658b6fe65ed48314b46.
Both original native epochs preserved. Enrollment digest daf17288497edab690509b91189ed16ad15b056e94d0132dd960df420524d2fc
and family rpeerfe9632125f936a14310aa2a5e5685da7 independently read back:
action wait / reason primary-live, automatic recovery enabled. Earlier j750877...
failed refresh and the child's reciprocal refresh refusal against the predecessor
primary remain retained. Final parent CAS repaired the pair; child refusal alone
is not pair failure or proof of crash. Evidence: .runtime/state/live-standby-refresh-native-20261017.json.
This qualifies live-expired-standby maintenance, not unattended outage recovery or
loaded MCP adoption. Focused synthetic gate: 20 passed.

Next: finish current-source integration checks, reconcile cached MCP adoption at
one final refresh, and proceed through the existing full-scope qualification audit
(native creation/pool/fork and recovery still have unqualified gates). Ordinary
ProDevs metadata proof remains valid on its recorded source; no new message or
archive test was run on user chats. Goal remains active.

## 2026-10-17: archive recovery reached a native workspace-trust gate

Manual archive qualified absence, and import-only unarchive succeeded. The exact
fixed native wake was verified undelivered because workspace trust was required.
An existing running bypass process had not proved cold-start trust readiness.
Human trust plus ready started a new epoch; prior role was restored and fresh
MCP send18checks passed. This is human-assisted proof, not unattended recovery.
Original failure receipts and the separate after-activation rebind failure remain
retained. Retired-generation failure receipts require historical inventory/tool-ID
validation after turnover. See resume.md and private manualArchiveRecoveryTrial.

## 2026-10-07 04:57 Eastern — native duplicate definitions and commandless errors

One native edge probe configured two identical fixture reads and an unavailable
MCP context. It failed its incorrect expected result count; preserve that report.
Independent fixed-range/hash review proves one read and one error in the same
Stop event. The error omits command and cannot be assigned to a tool or operation.
Collector now retains event-only errors without fabricated receipts, and extends
private causal ancestry when multiple attachments land after a public scan.

The installed matcher collapses identical definitions inside one event, but its
key ignores timeout and distinguishes JSON input key order. Repeated events
still invoke again, so native configuration deduplication cannot replace service
canonical IDs or durable single-consumption admission. SessionStart paths can
seed an initialized watcher; Stop cannot. Remote workspace setup skips watcher
initialization. Finally, the installed FileChanged callback discards successful
tool output. This changes the next strategy: prove trigger and result channel
together before enrollment. No live FileChanged candidate was installed.

26 installed-function cases and the final full isolated suite passed, with no
inference/native writes. Native evidence belongs to a2cd9974; finalbdb7a0d3 has
later collector amendments with isolated proof. Original failed native/extractor
reports and independent reconciliations remain separate. Settings restored,
broker idle/intact, fixture archived/unpinned, quarantine ON. No user action.
See resume.md and mechanical-native-route.md for exact artifacts and limits.

## 2026-10-07 04:44 Eastern — native direct-hook read proof

Actual desktop Stop hooks performed a fixture export, one metadata read and a
successful two-target read batch. The batch completed in about3.6s including1.5s
configuration wait, using one short model turn to trigger two direct native tools.
The tools were selected by fixed hook configuration, not the model. Actual CLI
journal hook-success attachments provide results even when default SDK response
emission excludes Stop. This is a narrow native read proof, not mutation safety,
a fully inference-free transport, sustained serving or general-use readiness.

The original export probe failed observation because attachment ancestry was
hidden. Its failed report is preserved; independent fixed-range/hash validation
links its actual native result and captured archive in native-hook-export-
reconciliation-2026-10-07.json. Opt-in causality exposes only attachment IDs and
parents. Batch toolUseID is shared by the Stop event; distinct result UUIDs,
not that event ID, identify receipts. Errors may precede tool invocation.

Diagnostic settings restore byte-for-byte; ordinary requests cannot inherit a
pending diagnostic hook. Exact idle-epoch expiry recovery has isolated tests,
without live crash injection. Current5be50395 passed the complete isolated suite;
actual native passes belong to earlier recorded c743/bbb source candidates.
Broker remains idle/intact on the same PID and sealed dependencies, fixture
archived/unpinned, quarantine ON, temporary hooks removed. See resume.md and
mechanical-native-route.md for artifacts, remaining gates and uncertainty.

## 2026-10-07 04:23 Eastern — installed direct-hook runner and activation constraints

The installed2.1.289 MCP runner, recursive input interpolation, watcher lifecycle
and SDK hook-response filter passed18 executable isolated cases with synthetic
dependencies and no inference/native settings changes. A connected hook calls
tools directly without model selection, but a warm settings write alone does
not create a watcher; repeat events repeat calls; and default SDK filtering
does not emit Stop/FileChanged tool results. A script-hook dispatcher is
unavailable in this engine. Existing peer contract still passes9 cases after
sharing bounded source extraction. See mechanical-native-route.md for exact
artifacts and the read-only native activation/admission/result gates.

This evidence prevents deploying an inert or duplicate-prone native mutation
hook as an apparent reliability fix. It is not native dispatch qualification.
Current host560fc144 passed the full isolated suite unchanged. Existing hook7e,
active4af/gen6 and native PID71262 remain unchanged/idle without a verified waiter.
No settings, model/auth, input quarantine, recovery or historical outcomes changed.

## 2026-10-07 04:04 Eastern — fresh causal qualification and context-pressure refusal

Opt-in causal observation now exposes bounded native parent/peer IDs, including
metadata-only ancestors, without user text, thinking, sender fields or tool
inputs/results. Qualification uses fresh128-bit run tokens and exact peer-to-
terminal ancestry; same-UUID repeated envelopes are one logical reply. Missing,
foreign, sidechain, tool-using or truncated reply evidence cannot pass.

The native runner now restores its owned archived fixture inside its reporting/
cleanup boundary and preserves per-attempt outcomes. Controls-only modes bound
Claude usage. A newly introduced wrong wrapper assertion exposed delayed native
record persistence: an early archived snapshot preceded the successful unarchive
write. The failed original report and explicit later cleanup correction are both
preserved; an observed baseline is separate from causal settlement.

Actual controls pressure on74a753ea passed unarchive/title/pin but FAILED effort
rmuxtdyht-8a0575. Follow-on6d8c9bc4 batch probe FAILED restore rmuxtgmmz-30510d,
so no controls batch ran. Both exact native compact2 continuations landed; both
ended without tool calls. They remain unknown/non-retryable, despite original
fixture state being observed again. Independent scoped receipts and causal
forensics live in native-controls-failure-independent-2026-10-07.json and
native-batch-restore-failure-independent-2026-10-07.json.

Exact terminal API input totals172540/182328 are verified in
native-controls-context-evidence-2026-10-07.json. Neither bounded range has a
native compact_boundary. Model claims of compression/resumption are not engine
proof. No context reset, permission/model change, app restart or replay occurred.
Final host46f09629 passed all isolated suites in
v2-2026-10-07T08-03-15-746Z.json; this is not a native46f controls pass. Installed
hook7e388b8f and active4af08654/gen6 are distinct. General use remains unqualified.

# claude-driver findings

## 2026-10-07 03:49 Eastern — batched/concurrent reads and one real foreground pickup

Two distinct read operations passed in one request12.472s on the final batch
guard candidate. Three concurrent clients passed earlier with end-to-end
10.896s/27.040s/44.696s; actual kernel serialization and turn-boundary admission
produce queue cost. Independent native receipt/gate IDs were unique and matched.

A real owned foreground waiter was independently verified. Current host read
completed5.458s through that waiter without an explicit peer wake/continuation.
Readiness was correctly revoked afterward; later idle without a waiter means
this is one warm pickup, not sustained loop/residency proof.

Identical native batch slots now refuse before enqueue when the deployed helper
lacks index proof. Current native negative test produced no request/wake.
Actual held-kernel-lock timeout/abort tests also produce no publication.
Progress failure after publication now preserves request identity/cancellation,
while enqueued mutations remain unknown/retrySafe:false. Full final isolated
suite passed; resume.md distinguishes native candidates from later failure-path
amendments. Legacy unknowns were not settled by these new successful reads.

## 2026-10-07 03:33 Eastern — compact continuation executes; native compaction exercises expiry

An explicitly enrolled fixed feedbackVersion2 makes the next tool action concrete
and is under half the old directive length. Exact consumption/version/peer/epoch
metadata binds its fixed native feedback. New installs still default toversion1;
compact plus quiet waiting is refused pending separate qualification.

Two consecutive native reads passed12.879s/11.057s; independent journal replay
confirmed both compact continuations then executed tools. A follow-on first
read passed12.905s, but the next request crossed its30s deadline during native
automatic compaction. Its helper returned dispatch:false/cancelled; actual native
PreToolUse denied the model's later get_session attempt. This failed pressure
case is preserved, not reported as no-tools behavior or successful serving.

After compaction, three consecutive reads passed12.377s/10.753s/10.852s on
unchanged current source with the normal90s service budget. Each successful
operation, native receipt and exact gate tool ID was independently verified.
This qualifies a small native read sequence, not general controls or residency.
See resume.md for exact reports and distinct host/hook/dependency identities.

A complete fixed journal-range audit covers15 historical unknown effects,
hashes the range and reports matching native tool IDs without raw content.
No matched calls lack results in that range, but repeated identical operations
remain ambiguous and zero send matches does not rule out queued future effects.
No old receipts/control state or handoff gates were changed.

## 2026-10-07 03:22 Eastern — native admission improves; execution still fails

Real waiter/epoch proof now replaces native working/rearming heartbeat readiness.
Busy turns apply backpressure before enqueue. Ordinary signals use the exact
durable request ID and current v7 protocol. One native read passed13.772s; the
next signal and owned continuation reached the native journal but ended without
tools. The full sequence remains FAILED. This is not a proven dedup root cause.

The collector now binds exact owned continuation feedback and its terminal UUID,
with malformed/foreign/human feedback refusal and no metadata-only receipts.
A bounded replay of the original journal verified that distinction without a
new Claude turn. Original cancellation followed the continued terminal; this
collector improvement is not claimed as the failed trial's root-cause fix.

Initial synthetic compatibility failures were preserved and corrected. New
isolated tests cover actual helper ancestry/death, pre-enqueue backpressure,
request-specific framing and continuation branches. Active dependency, installed
hook and later host candidate remain separately identified in resume.md.

Installed peer receiver/VM inspection rules out sending SDK turn_handoff RPC on
that inspected transport; it does not rule out every possible supported API.
All15 historical mutation outcomes stay uncertain despite archived fixture
readback. Handoff cannot proceed by treating desired state as causal settlement.

## 2026-10-07 02:57 Eastern — native signal reaches context, execution still skipped

One batched read/archive completed15.635s and independent readback confirms the
owned fixture archived. A following sequential-read test failed on its second
call. Per-request budget clarification therefore does not solve availability.

An opt-in command Stop hook now waits mechanically for durable work, with real
helper-ancestry/epoch/TTL proof and exclusive per-request continuation consumption.
It has no idle model evaluation; new request IDs get independent single budgets.
Isolated subprocess tests prove silent waiting, concurrent ownership, cancellation,
expiry, STOP, helper death, drift, continued flags and separate handoff settlement.
It remains default-off and a bounded experiment, not residency qualification.

Native trial first read passed12.226s; the second timed out30s. The exact fixed
continuation reached the native journal at06:55:22.500Z, but the model ended with
no tools and only said it was processing the request. Thus mechanical signal
admission is independently verified while execution reliability still fails.
No prose or live helper marker may be promoted to completed work. Quiet waiting
was disabled only after its bounded helper exited and the same native broker
was idle. Preserve `native-quiet-read-burst-2026-10-07T06-55-03-695Z.json`,
`native-quiet-continuation-forensics-2026-10-07.json` and settlement evidence.

Focus next on execution dispatch, not more polling or repeated wake prompts.
Previous uncertain effects remain pending even though fixture cleanup succeeded.
See [resume.md](resume.md) for exact versions/build distinctions and open gates.

## 2026-10-07 02:35 Eastern — native boundary enforcement and preserved serving failures

- One exact native archive occurred0.588s after the helper returned cancelled/
  dispatch:false. Independent fixture metadata proved the effect; the old safe
  retry claim was wrong. `native-late-cleanup-forensics-2026-10-07.json` (n=1).
- A service-local native PreToolUse gate admitted one real read and correlated
  its tool ID to the native receipt. A cancellation after checkpoint produced
  an actual native hook denial (n=1 each), independently verified in
  `native-effect-gate-negative-independent-2026-10-07.json`.
- Actual admission checks request/arguments/index/deadline/cancel/STOP, native
  process/deployment identity, immutable template and recorded hook/settings
  provenance; exclusive slot consumption blocks repeated calls. Malformed and
  oversized input now explicitly refuses rather than silently skipping admission.
- Enqueued native effects without receipts now remain outcome_unknown and
  retrySafe:false, even with a gate policy. Platform hook faults remain open;
  policy presence or absent helper/marker cannot establish no effect.
- Full native pass05:58 did not persist: later concurrency failed, and the
  final f824 run failed initial serving and cleanup. One Stop rescue was consumed
  but its continued turn ended without tools. Keep failures, avoid inference
  loops and do not claim a missing hook, crash cause or general readiness.
- Three f824 isolated rounds and both10-check filtered harnesses passed; final
  bounded-input e8b16514 has one whole isolated pass. Their exact fingerprints
  remain distinct from active4af dependencies and historical native proofs.
- Final e8 native read passed13.174s with matching admission/receipt ID, but
  subsequent desired-state cleanup expired45s. Preserve the failed whole report
  `native-bounded-gate-final-check-2026-10-07T06-35-45-388Z.json`; fixture remains
  unarchived/idle and the unknown archive must not be blindly replayed.

## 2026-10-07 01:56 Eastern — native controls and stale sealed entry paths

- Native batching cut three settings to one request9.787s; concurrent controls
  passed21.079s with independent readback and archived/unpinned cleanup.
- Archived prerequisites must reject before any batch dispatch: native title
  succeeded before pin/effort refused in the retained failed archived probe.
- Updating the active pointer cannot retroactively add admission to older
  sealed scripts. Native calls to3bfc continued after generation4/dd activation.
  Completed epoch-bound entry observations are the deployment gate.
- The candidate service-scoped PreToolUse adapter redirects exact cached entry
  commands without a permission allow. Real subprocess tests and three full
  isolated rounds pass; installation/native proof remain pending.
- Late completed native receipts must reconcile a timed-out dispatch without
  replay; detector liveness return does not establish serving or crash cause.


Dated, newest first. Each entry: what was observed, the evidence, and n
(independent observations). Promote a pending learning
(`<state>/pending-learnings.jsonl`) here only after re-verifying it.
Versions: app = Claude desktop, cli = bundled Claude Code.

## 2026-10-07 01:41 Eastern — one bounded continuation restores serving

- **Exact receiver framing matters.** Installed2.1.289 adds fixed prefix/suffix
  text around a peer envelope; the exact controlled native receipt confirms it.
  Initial Stop trial accepted a wake but did not rescue it. The candidate's bare
  equality check could not accept this stored message; no unsupported conclusion
  about configuration reload or model refusal cause is drawn. Corrected equality
  accepts only known framing and exact owned origin/msg_id, never arbitrary text.
- **One command-hook continuation can serve a request.** Corrected native trial
  produced an epoch/ancestry-bound invocation, one exclusively consumed rescue,
  dispatch checkpoint and native archive receipt. Immediate metadata was stale;
  a later independent readback verified archived=true, preserving the original
  failed assertion. An ordinary current-source client then completed a native
  read in44.716s with one wake, one rescue and no sender model turn. The broker
  later idled again, so this is per-request serving evidence, not residency.
- **Native entry qualification must bind process epochs.** New activation
  pointers and selected/completed entry observations require exact PID/start,
  session, generation and actual caller ancestry. Old matching files, sibling
  callers and inactive direct candidate paths cannot qualify or claim work.
  Legacy absent epochs retain integrity but remain activation-epoch-unbound;
  present malformed epochs fail closed. Seventeen private release cases pass.
- **Exit0 can still lose output.** A forced-exit public CLI baseline returned
  only65536 of270343 UTF-8 JSON bytes. Natural completion returned the entire
  parseable observation. Independent helper reproduction lost three quarters
  of256KiB. CLI/helper regressions use actual captured pipes and full readback.
- **Evidence scope remains explicit.** Isolated/Codex harness passes do not
  imply native full controls, cold recovery, natural governor survival or an
  epoch-bound active pin. The hook package, host source and old dependency pin
  have separate fingerprints. No model/auth changes, input automation, app
  restart or native process replacement occurred.

## 2026-10-07 01:00 Eastern — deterministic transport and event detection

- **Installed receiver contract is mechanically testable without inference.**
  Seven VM cases exercised the installed2.1.289 socket auth, framing, session
  guard, deadline, line cap and exact ASCII envelope parser. Native acceptance
  independently correlated exact peer msg_ids in four focused wakes,155–159 ms.
  Only transport is qualified: v8 was ignored; generic/named v7 and compatible
  v6 ended with “Broker running” and no tools. Receiver-source extraction's
  initial failure and every native failure remain in pressure artifacts.

- **A completed native wake can prove failure to enter the relay.** Exact peer
  msg_id and descendant UUIDs correlated an end_turn with zero tools; the
  request stayed pending and the same PID/start epoch became idle. The new
  guard cancelled that undispatched request with `broker_not_serving` in 3.35 s,
  using one recipient turn and zero sender turns. Positive/negative private
  cases cover unrelated user branches, sidechains, tool work and a checkpointed
  native result that wins. This is verified failure containment, not serving
  recovery or a claim about why the model stops. Native evidence:
  native-wake-end-turn-guard-2026-10-07.json. Three final isolated rounds passed
  with unchanged source: v2-2026-10-07T05-00-48-265Z.json. A final progress-only
  copy correction passed one full round on 16a95ad1 in
  v2-2026-10-07T05-05-01-304Z.json; native guard evidence remains bound to 5dfbbdc6.

- **Sensing cadence need not equal inference cadence.** A sealed local detector
  runs every 30s, with exact owned broker metadata, PID/start epoch and aged
  unclaimed-work checks; no keys/transcripts, sends or recovery. Ten native
  read-only samples averaged 4.961 ms (max 8.556 ms). Unchanged observations and
  intentional STOPs are quiet. Nine boundary cases cover approval identity,
  ambiguous processes, inaccessible evidence, stale/cancelled work, dedup,
  reused PID epochs and atomic hash-scanned reports. It independently emitted
  one real unserved-work event and a subsequent liveness-only event; the latter
  followed request expiry, not a recovered service. The Codex inbox still has
  inference-bearing30s ticks; Claude's hourly observer is recovery fallback.
  Neither is described as event-only Claude automatic recovery.

- **Direct transport fails closed before an uncertain fallback.**2.1.289 is now
  reviewed in the source allowlist; no environment version override. Owned
  metadata/key reads reject symlinks and invalid identity, private key modes
  are enforced, and stale/ambiguous PID selection cannot route to a replacement.
  Actual synthetic socket tests verify key refusal, envelope validation,
  timeouts/abort and one authenticated frame without a sender inference call.

- **Status extraction must exclude launchd environments.** A broad launchctl
  status command exposed inherited secrets in tool output during this run.
  Subsequent checks capture output privately and emit only explicit service
  state/run-count/exit-code/interval fields. No secret values are copied to
  service evidence or documentation. Credential rotation is outside this
  bridge change and remains necessary after the exposure.

## 2026-10-07 — helper cancellation and hidden waiter pressure

- **A timeout must include its wake helper and cleanup.** Seven original private
  helper/socket expectations failed. Shared remaining budget, supervised child
  termination, inherited-reader closure and no partial-frame fallback now pass.
  A follow-up cancellation fixture proved an actual synthetic effect during the
 250ms cleanup window; concurrent durable cancellation now prevents it. Scope:
  only freshly launched helper children, no desktop session processes. Evidence:
  cli-budget-reproduction-2026-10-07.json and retained baseline logs.

- **Prompt-only foreground discipline failed natively.** The broker actually
  combined checkpoint with `broker-wait ... > /dev/null &`. A background waiter
  consumed a later cleanup request; visible wait returned IDLE. The request
  expired without dispatch and the fixture was subsequently verified archived.
  Mechanical stdout admission, one kernel-owned waiter and pickup PID metadata
  address this observed case. The first pipe-only guard failed because native
  Bash uses captured regular output; this failure was retained and corrected,
  with a subsequent normal client receipt on the same broker PID. Arbitrary
  background captures are not generally qualified.

- **Native receipt is distinct from recipient acceptance.** One synthetic
  recipient refused a replacement after automated stop, interpreting it as
  human intervention. The new fresh fixture explicitly grants the planned test
  sequence prospectively and respects actual human instructions. The failed
  chat was archived; no attempt was made to bypass its refusal. The fresh current-source fixture passed all eleven native checks afterward,
  including one replacement reply and archived cleanup. This is one observed
  planned-stop success, not a guarantee of future model acceptance. See resume.md.

## 2026-10-06 23:56 Eastern — v7 controls and maintenance (app 2.26454.0, cli 2.1.289)

- **Request traffic must not postpone maintenance indefinitely.** The actual old
  waiter claimed pending work even when its local deadline was already expired.
  The corrected waiter returns IDLE before pickup and ties its budget to the last
  native list plus nine minutes across requests. STOP remains first. Four actual
  waiter regressions pass; no twelve-minute freshness relaxation. An intermediate
  native IDLE/list/rewait at 03:52 reused the exact job despite intervening traffic.
  Final-source IDLE at 04:03:06.882Z → CronList at 04:03:09.251Z → rewait
  at 04:03:10.919Z reused job922e4a9e with no creation and preserved PID 71262.
  Ten-minute survival passed with fresh evidence and zero filters, but no natural
  pressure (overall residency report false). See wait-budget-reproduction,
  native-idle-v7-final and residency-v2-2026-10-07T03-54-52-060Z reports.

- **A compatible activation phrase differs from queued request protocol.** One
  real `wake v7` read the new standing file then answered `ignored`; one resolved
  subsequent `wake v6` entered the v7 loop on the same PID. Ordinary brokerRequest
  now uses that alias while retaining v7 checkpoints. Two actual-client synthetic
  regressions first failed on the old phrase, then passed. The current native
  client received a correlated receipt in 20.489 s. This proves one warm idle
  activation, not cold or uncertain-send replay safety.

- **Current native controls passed after real automatic compaction.** The owned
  journal records auto compaction from 188436 to 13857 tokens. Eleven native
  checks passed on the final source afterward, with zero input filters and
  archived cleanup. Five rounds passed 111 synthetic tests each, both actual
  filtered harnesses passed ten and installed governor code passed four isolated
  scenarios. This does not prove arbitrary compaction retention or real pressure.
  Exact fingerprints, receipts and failures are in resume.md.

## 2026-10-06 (app 2.26454.0, cli 2.1.289)

- **Current native IDLE rearm skipped maintenance reconciliation.** PID 71262's
  wait returned IDLE at 03:34:06.557Z and its next wait started at
  03:34:08.879Z, without CronList between them. The last list remained
  03:24:59.974Z. V6 requires reconciliation after IDLE in one section but
  instructs immediate return to waiting in another; that conflict is a
  supported cause hypothesis. The existing evidence freshness guard is
  retained. At that checkpoint an explicit branch was prepared in
  [broker-idle-rearm-candidate.md](broker-idle-rearm-candidate.md); it was later
  implemented and warm-qualified as described above. Failure: `<state>/pressure/native-idle-rearm-2026-10-07.json`.
  A separate current-source eight-minute observation kept the same PID and
  zero input filters, but saw no natural pressure and therefore has `ok:false`:
  `<state>/pressure/residency-v2-2026-10-07T03-28-00-424Z.json`. n=1 rearm.

- **The independent native observer recovered the broker after the app's
  automatic update and relaunch.** One exact native wake had a delivered receipt;
  broker PID 71262 started at 23:24:51 Eastern. Current-process CronCreate and
  subsequent CronList confirm job `3651b2a5`, with matching app acknowledgment.
  Observer PID 68416 and its own created/listed/app-acknowledged five-minute
  job `337cb675` were separately verified. This is one post-relaunch recovery,
  not proof that native send bypasses a stale exited app query. The old log's
  hash matches the report; the active log has appended since capture. The
  intentional exit143 and quit-for-update remain distinct events. Evidence:
  `/Users/taylor/Desktop/temp_reports/claude-broker-20261006T232546-0400.report.json`
  and the scoped native journals/logs identified in its review. n=1.

- **The native wake envelope differs from the v6 sender example.** The
  current broker journal records `<cross-session-message from="<observer id>"
  name="Broker Recovery Probe">`, with the exact `claude-driver wake v6` line,
  and no `from-name="claude-driver"`. The broker entered its maintenance loop.
  This independently confirms a written-versus-observed protocol mismatch;
  it does not establish a deterministic sender gate. Keep the running protocol
  stable, avoid spoofing, and require dispatch checkpoints/native receipts.
  A future candidate must qualify actual native envelopes and refusal behavior
  before rollout. Same first observer report and owned broker journal. n=1.

- **Age-based reaper cleanup can break mutual exclusion across a paused live
  process.** A private clone of the prior directory strategy reproduced two
  overlapping callbacks: one synthetic process paused after its dead-owner check,
  another reclaimed the aged reaper and entered, and the resumed first removed
  the second's directory using its stale snapshot. No desktop process was used.
  The new outer kernel flock guards that recovery path for current clients.
  Node retains the inherited descriptor after a short isolated Python helper
  exits; persistent mutex files retain one inode and must not be unlinked.
  Four regressions verify paused reaper exclusion, actual holder death, queued
  abort, and helper failure without fallback. The old directory guard remains
  for compatibility; legacy clients still need refresh. Reproduction evidence:
  `<state>/pressure/kernel-lock-reproduction-2026-10-07.json`. Current-source
  repeated/harness and measured latency evidence are recorded in [resume.md](resume.md).

- **Exactly one queued worker and a pinned revision are necessary beyond
  idempotent submission.** A second actual worker launch entered a running
  synthetic session_wait; a queued operation on a changed source clone executed
  a memory write; a control waiting on its recipient lock crossed a source change
  and reached the stub native boundary. All three expectations first failed.
  Workers now claim only queued unstarted jobs, preserve the existing claimant
  PID and refuse missing/mismatched submitting revisions before dispatch.
  Controls recheck source after acquiring the recipient lock. Three new
  regressions pass; five final fresh rounds passed 101 cases each. These tests
  use synthetic stores and no native actions. Reports/source-matched harness
  results are listed in [resume.md](resume.md). At that checkpoint native
  availability awaited observer recovery; the verified first report is above.

- **App/source drift is a distinct qualification boundary.** Claude updated
  during testing; renamed governor bindings broke the previously passing
  installed-source extractor. The version-scoped adapter now exercises the new
  functions in four isolated scenarios, retaining schema failures with app/hash
  evidence. This proves synthetic victim selection only, not real native pressure.
  Loaded MCP source is separately guarded: a stale service refuses effects before
  recipient resolution, while status and cancellation remain available. Two
  regressions cover changed and missing source. On that intermediate source, five fresh
  rounds passed 98 cases each, and actual filtered Claude/Codex harnesses each
  passed ten checks. Current-version native controls/recovery remain unqualified.

- **Independent recovery is now commissioned through evidence reports.** Taylor
  requested a prompt for a separate native Claude observer rather than another
  manual broker wake. The saved prompt scopes native restart to one verified
  broker, persists episodes, limits retries and requires actual process/receipt
  proof. A five-minute Codex heartbeat watches the exact requested report inbox;
  metadata-only scanning ignores incomplete/oversized/symlink files, detects new
  hashes and acknowledges only after reviewed work. Two regressions verify this.
  At commissioning, watcher configuration was verified and observer execution
  remained pending. Taylor later changed the inbox schedule to 30 seconds with
  scanner-first intake; the first verified observer outcome is above.
  This separates bootstrap from the offline broker relay and avoids circular
  recovery. Do not infer successful scheduling/recovery from commissioning.

## 2026-10-06 (app 2.19675.0, cli 2.1.286)

- **Resumed pressure testing exposed evidence and recovery edges.** The initial
  eleven-check input-free native run passed; both scratch chats were later
  verified archived, with zero filters in input audits. The same broker PID
  survived eight minutes, but there was no natural pressure event. Four isolated
  scenarios execute the installed native governor functions with synthetic held
  sessions, proving cron exclusion, unprotected eviction, busy exclusion and
  debounce without app IPC/OS pressure; they are not end-to-end pressure proof.
  A list taken before CronCreate could falsely appear fresh. Five new boundary
  tests reproduced that problem and cover stale/future/invalid epoch evidence,
  pending deletion and missing app acknowledgment; the hardened reader rejects
  all of them. Its larger 2 MiB bound retains ordinary control bursts, still
  failing closed on missing evidence. A protocol upgrade was answered `ignored`,
  leaving the pending operation undispatched; compatible v6 was restored and
  its interrupted fixture reconciled. Graceful STOP's native CronDelete removed
  only the owned job. External termination of the independently idle broker then
  left an app query with exit code 143 that warm navigation could not recreate.
  This is distinct from governor cap. Two regressions now preserve exact owned
  numeric failure evidence without stack content and keep input fallback absent.
  That intermediate source passed five 94-case rounds and ten checks per actual
  filtered harness; see the newer frontier above for source/version drift. Exact
  reports and resume order: [resume.md](resume.md).


- **Foreground waiting does not protect the broker from native eviction.**
  The app evicted v5 after 133 idle seconds (`governor_evict`). Local native
  source excludes live native cron jobs from idle victim selection. V6 stages
  one exact service maintenance job, reconciles it without duplicates and deletes
  only that job on STOP. Evidence requires native current-process tool receipts,
  fresh CronList and matching app acknowledgment. The headless synthetic cron
  job's creation/list/deletion were verified; desktop governor protection remains
  unqualified. The read-only residency observer was cancelled for user pause,
  with zero keyboard filters before/after and no native writes. Current source
  passed 435 isolated cases and ten checks per actual filtered harness. Broker
  is offline; the pending v6 wake is withdrawn. See [resume.md](resume.md).


- **A quoted marker is not task completion; synthetic recipients need explicit
  delegation.** Fresh imported Haiku asked whether the indirect long-generation
  request was authorized and quoted `OLD_PLAN_FINISHED`. The test's substring
  assertion mistook that for completed work; native replacement itself did
  appear. Failed `live-v2-2026-10-07T00-22-13-935Z.json` remains retained, with
  archived cleanup and zero input filters before/after. The fixed synthetic
  bootstrap explicitly authorizes only this chat's bounded broker test
  sequence. The guard accepts that exact bootstrap, never arbitrary prompts.
  Completion assertions require a final assistant line rather than a mention.
  Assistant observations now report truncation/length and a bounded 256-character
  tail, so a long response's terminal marker is not silently hidden by the
  preview limit. Two new regressions verify quoted/user markers versus actual
  completion and hidden-content exclusion in truncated observation. This
  authorization is fixture-only; delivery never authorizes arbitrary recipient
  work or proves that a recipient applied it.


- **Native controls can qualify without reopening Computer Use.** Taylor
  confirmed recovered input and one manual `claude-driver wake v5`, supported
  by paste/send screenshots. Subsequent read-only audits found zero active
  helper keyboard filters targeting Claude. Quarantine remains active because
  earlier temporary recovery did not prove native teardown. The input-free
  live scope structurally allows one private CLI bootstrap/import plus native
  controls, binds its recipient and jobs, verifies focus independently and
  audits input resources before/after. It excludes broker recovery, arbitrary
  bootstrap prompts, permission changes and user-session navigation. Shared
  service memory records the human observation separately from test results.
  Evidence: incident summary and current qualification reports below.

- **Batch settings reduce broker round trips and expose partial outcomes.**
  `set_session_config` now combines title, pin state, model, effort and
  permission mode in one ordered native request and recipient lock. Native
  disk verification checks each field. Synthetic MCP tests verify explicit
  unpin, one request for four controls and a later failure with earlier
  effects retained; error details carry the receipt and prohibit wholesale
  retry. A live three-control request verified all fields with one request
  (15.245 s), against 35.411 s for three separate controls plus unpin. Both
  timings exclude/handle cleanup differently; they are observations, not a
  speed guarantee. Evidence: native report `00-19-17-259Z` and final reports
  in v2-qualification.md. n=2 new synthetic boundary cases, native batch n=1
  at this checkpoint.

- **Explicit warm-only recovery never loads input automation.** The existing
  approved broker is validated before a native deep link, with conditional
  focus restoration and input audits even on error/cancellation. Seven pure
  tests cover identity, success, governor cap, navigation failure, preaudit,
  cancellation and failed postaudit. One live attempt hit the native process
  governor cap and returned `broker_wake_required` with no keyboard fallback;
  Taylor's manual wake then started the resident loop. This proves refusal
  at cap, not unattended cold recovery. Evidence: broker request
  `rmuxcrs3y-254616` before/after warm audits and service recovery record.


- **Typing and paste duplication recurred; UI qualification is suspended.**
  Taylor noticed duplicate characters around 17:56 Eastern and confirmed
  `hello` pasted as `hellohello` at 18:07. Native read-only CGGetEventTapList
  found two enabled active keyboard filters (mask 7168, options 0) owned by
  SkyComputerUseService PID 39019 targeting Claude PID 1891. The filters
  persisted after js_reset. SIGTERM retired the helper; no keyboard filters
  targeting Claude remained on subsequent audits. Claude's supported renderer
  reload completed; its agent processes and Codex were not restarted. Physical
  recovery was subsequently confirmed; UI quarantine remains active. Backend
  process exit, final js_reset and passing short UI tests were insufficient.
  The existing core closeSession explicitly archives a thread and frees its
  MCP resources; the Claude UI worker now invokes it before transport close
  and fails closed on archive refusal. Synthetic backend tests cover success
  and refusal, not physical input. Evidence: private
  `pressure/input-incident-2026-10-06/summary.json` and event-tap audits. Similar
  [upstream Claude-specific report](https://github.com/openai/codex/issues/49948)
  and [paste duplication report](https://github.com/openai/codex/issues/36868)
  support the helper hypothesis, without proving our complete causal chain.
  n=1 recurrence, native before/reset/helper-retirement audits, two synthetic
  thread-close cases. Prior UI reports remain historical, not readiness proof.
  The service now audits native filter ownership before/after each UI lease,
  including failure/cancellation, and quarantines further UI work if filters
  survive or the audit is unavailable. It never terminates shared helpers.
  Four additional tests cover filter identity, preserved human quarantine,
  clean evidence and unavailable audits. The current 68-case suite passed
  five fresh runs (340 cases), report `v2-2026-10-06T22-20-58-626Z.json`.
  The same source passed all eight native-only checks with quarantine active,
  report `live-v2-2026-10-06T22-20-43-966Z.json`; its owned scratch was archived.
  Fresh filtered Claude and Codex harnesses each passed ten contract checks.

- **Pre-recurrence v2 source passed bounded controls, recovery and harness tests.**
  `v2-2026-10-06T22-03-45-263Z.json`: 62 isolated tests x five processes, all
  310 passed with unchanged runtime/suite hashes. Actual Claude and Codex
  filtered model runs each passed ten contract checks; reports timestamped
  `22-03-31-307Z`. Full native `live-v2-2026-10-06T22-03-26-276Z.json` passed
  eight required checks and archived cleanup. Controlled cold recovery
  `cold-recovery-v2-2026-10-06T22-05-59-471Z.json` terminated only the owned
  idle broker, then verified one cold UI wake, new broker liveness, restored
  chat/front app and exited private stdio backend. The worker used zero shell
  calls and reset its own UI kernel; configs/source were unchanged. Native
  preflight passed all ten checks. The earlier cold fixture refused before
  termination on a stale working heartbeat despite native idle status; that
  precondition failure is retained separately. n=1 final live/harness/cold run
  each, five isolated rounds. These are bounded tests, not a latency guarantee.

- **UI recovery must isolate the backend and distinguish sent from completed.**
  The shared managed Codex daemon remained on 0.158.0-alpha.2.1 while the
  installed private backend was 0.160.0. Automatic transport restarted the
  older daemon without fixing its unsupported model. Claude's adapter now
  forces a private stdio worker/state directory and serial UI lease, leaving
  general Codex bridge changes parked. An earlier worker read skill/memory
  files before native actions; the bounded worker now uses a private cwd and
  native controls only. `setValue` appeared empty on immediate readback but
  left a delayed wake draft; the next lease refused to overwrite it. Native
  reconciliation sent that exact draft once, verified liveness and restored
  focus. Wake now uses paste plus exact readback, a structured send outcome,
  then independent liveness proof. Not-sent outcomes fail immediately with
  an evidence path. Failed `live-v2-2026-10-06T21-58-35-639Z.json` is retained,
  not counted as passing. n=1 failure for each described backend/input path.

- **Current groups combine two native schemas.** Native create_group returned
  opaque text, while its ID appeared in manual `dframe-code-sections`; native
  move_sessions still wrote `dframe-group-scopes` assignments. Creation now
  polls disk for one exact ID, refuses ambiguous names before dispatch and
  preserves uncertainty when no ID verifies. Group reads merge both schemas.
  `native-group-v2-2026-10-06T21-44-52-136Z.json` verified creation, movement,
  merged disk readback and archived fixture cleanup. The preceding failed
  creation-readback report remains retained. n=1 native sequence plus isolated
  schema/ambiguity regressions.

- **Active tool interruption is independently verified.**
  `native-tool-v2-2026-10-06T21-41-27-854Z.json` observed an exact foreground
  bounded Node command through the native Bash event and recipient process
  ancestry. Stop terminated that process; the replacement reply appeared and
  the old completion did not. The approved member's model/effort were restored,
  then context cleared and archived/parked. Four checks passed. A preceding
  fixture's extra trailing period broke the strict command match; it is a
  failed test, retained separately. n=1 actual tool interruption.

- **Native probe covered twelve existing mechanisms.**
  `probe-v2-2026-10-06T21-46-29-350Z.json` passed create, focus restoration,
  broker delivery, rename, pin/unpin, group, send, fork, archive, unarchive
  and cleanup with test fixtures archived. An isolated broker-state recovery
  fixture also verified governor-cap refusal with Tier C disabled and focus
  restoration (`native-recovery-v2-2026-10-06T21-47-44-320Z.json`); that report
  proves the fail-closed boundary, not successful warm-spawn. n=1 run each.

- **Physical typing recovery confirmed by Taylor.** Direct reply to the
  physical keystroke check: "Typing is normal now". The private UI quarantine
  was released with dated human evidence, and shared service memory records
  recovery separately from root cause, which remains unproven. Composer
  exact-readback, draft protection and unknown-send safeguards remain. n=1
  human confirmation; earlier synthetic-key observations alone were insufficient.

- **Earlier native-only qualification passed (superseded below).**
  `live-v2-2026-10-06T21-31-36-385Z.json` passed all eight required checks,
  including actual reply, pre-dispatch cancellation, three concurrent controls,
  busy queue versus interruption, one reply per marker and archive cleanup.
  `native-pool-v2-2026-10-06T21-32-38-401Z.json` passed three lifecycle checks:
  alias-based pool-only creation, first reply observed from the returned cursor,
  original model/effort restored, context self-cleared, archived and parked.
  Fresh CLI health returned apiVersion 2 and matching nativeQualification.
  This qualifies the existing-live-broker route; physical typing, import,
  focus and UI recovery remain excluded. Pool and scratch fixtures were left
  archived; the approved pool member is available again. n=1 final run each.

- **Native receipts must tolerate batched dispatch checks.** A five-operation
  approved-pool create applied every operation but timed out: the broker ran
  all checkpoints in one Bash call, returning five JSON lines. The collector
  expected one checkpoint, so no receipt could correlate. It now correlates
  each independently authorized exact operation, ignores denied checkpoints,
  and matches the native tool-use/result IDs. A regression covers both allowed
  and denied batch entries. Read-only `driver_request` reconciled request
  `rmux6xqqw-1b138c` without resending its first message (n=1 live failure).
  The failed report remains `native-pool-v2-2026-10-06T21-28-35-986Z.json`.
  The borrowed approved member was restored, self-cleared and parked on disk.
- **The relay can paraphrase and rewrite its own receipt.** One native send
  produced an early relay result `Delivered`, followed by a rewritten result
  about 2.5 seconds later. Native journal collection now independently matches
  the successful checkpoint, exact recipient/arguments and native result.
  Relay text cannot settle requests with journal provenance. Actual native
  pending-tool delivery text is `queued`; unrecognized successful text remains
  `outcome_unknown`, with a request ID and no automatic replay.
- **Uncertainty survives later cancellation sweeps.** A native configuration
  completed after the request deadline; a waiter sweep had incorrectly changed
  its dispatched uncertain control to cancelled. Sweeps now preserve that
  uncertainty. Read-only late-receipt reconciliation reports completed while
  retaining the historical control state. A native receipt proves the tool
  outcome, not a recipient's application of a new instruction.
- **Native stop preserves queued work.** A streaming, tool-free recipient stayed
  busy after a queued message; native stop ended its running turn and its queued
  follow-up then ran before the replacement. The API reports `queueDisposition`
  explicitly. Stop does not establish queue deletion or transaction rollback.
  The early six-check report `live-v2-2026-10-06T21-13-32-389Z.json` used a
  permission-waiting Bash fixture and does not prove interruption of active
  tool work. Later streaming tests qualify active text generation only.
- **Creation must return an observation cursor captured before the task.**
  Reading from a new cursor after create returns skips an already-finished
  first reply. Imported/pooled creation now returns `observationCursor`; a
  cleared session's pending cursor watches the first new transcript from its
  timestamp rather than pouring old history into the caller. Missing/rotated
  existing transcripts and malformed cursor objects fail explicitly.
- **Pool-only creation resolves folder aliases and refuses fallback.**
  `require_pool:true` fails before import/navigation if no approved member is
  available. Canonical folder matching supports `/Users/taylor/dotfiles` and
  its real checkout path. Claims remain reserved after uncertain partial
  effects; availability is published only after cleared/archived disk proof.
  Existing permission grants are preserved, never recreated or raised.
- **Earlier deterministic suite: 59 checks in five fresh processes (295 passed).**
  `v2-2026-10-06T21-31-42-006Z.json` retained unchanged source/suite fingerprints.
  Actual headless fixture workflows also passed on that source: Claude
  `harness-v2-claude-2026-10-06T21-31-49-397Z.json`, Codex
  `harness-v2-codex-2026-10-06T21-31-50-579Z.json`. Each verifies all ten contract
  checks and unchanged global configs. They qualify real model use of the
  filtered synthetic API, separately from native desktop control evidence.
  Interrupted/preflight/superseded runs are retained in
  `native-boundary-audit-2026-10-06.json`, never counted as passes.

- **Quarantine must cover entry paths, not just typing.** Dead-broker recovery
  previously navigated before the Tier C gate, and preflight could launch a
  live probe after version drift. Recovery now refuses before taking a focus
  snapshot or opening a deep link, without writing a cooldown. New/forced
  broker bootstrap and explicit probes also refuse before making fixtures.
  Preflight reports the blocked unknown matrix instead of running a probe.
  Real MCP and CLI fixture tests exercise these paths, including forced
  recovery/init, while disk reads and an already-live broker remain available.
  Current report `<state>/pressure/v2-2026-10-06T20-21-42-521Z.json`: 42
  checks in each of five fresh runs (210 passed), runtime/suite unchanged.

- **Current isolated suite: 40 checks in five fresh runs (200 passed).**
  Report `<state>/pressure/v2-2026-10-06T20-19-15-423Z.json` has unchanged
  runtime/suite fingerprints. Includes UI quarantine before input bridge
  loading and fixture relay rejection of null arguments without crashing.
  The real `live-v2.mjs --live` entry was separately verified to stop at
  quarantine with no stdout and before its fixture creation or app work.

- **UI incident quarantine is service-level.** Private `ui-quarantine.json`
  blocks Tier C before its input bridge loads; live qualification also checks
  it before app operations. Policy is reread on every entry and malformed
  state blocks. This does not stop other chats' Computer Use. After another
  CUA reset, CGGetEventTapList showed no keyboard filter owned by the still
  running SkyComputerUseService. Physical typing remains unconfirmed. The
  [upstream Computer Use duplication report](https://github.com/openai/codex/issues/36868)
  is a plausible hypothesis, not proof of this Claude-only incident's cause.
  Codex UI inspection was refused by the computer-use tool; no bypass used.
- **Actual headless Claude and Codex fixture workflows passed.** Strong
  reports `harness-v2-claude-2026-10-06T20-13-32-515Z.json` and
  `harness-v2-codex-2026-10-06T20-14-27-285Z.json` under `<state>/pressure/`
  verify every required MCP reply, idempotent one-worker completion, matching
  recipient, incremental events and shared memory, with global configuration
  unchanged. These use private synthetic stores with a filter refusing native
  controls and alternate recipients. Cursor's model run and catalogue request
  stopped at authentication before tool use; compatibility remains unverified.

- **Offline v2 iteration: 38 checks passed in five fresh runs (190 checks).**
  Report: `<state>/pressure/v2-2026-10-06T20-06-05-870Z.json`; runtime source
  and suite fingerprints were unchanged throughout. The actual MCP launcher
  was tested with independent clients, a synthetic broker and detached
  workers. This qualifies lifecycle/protocol behavior, not native tools or
  actual Codex/Cursor/Claude headless harness runs. Live qualification stays
  stopped pending physical typing recovery. Scope and remaining evidence:
  `docs/v2-qualification.md`.
- **Stop/replacement must serialize per recipient.** Two independent MCP
  clients produced stop/send/stop/send, never stop/stop/send/send. Direct
  controls and jobs bind title references before waiting, preventing a
  different chat taking the old title from becoming the recipient. Worker
  identity retains the original caller's self-protection gate. Cancellation
  between verified stop and replacement reports `partial_effect` with the
  known stopped state and no replacement sent.
- **Pool publication and registry updates require ownership.** Twelve
  independent processes retained all registry updates. Parking members cannot
  be claimed before native state verifies; eight concurrent claimants got
  one owner. A partial unarchive/configuration failure keeps its claim
  reserved, even after the former stale-claim age. An unarchived member cannot
  be silently returned as ready.
- **Shared evidence needs bounded reads and source identity.** Memory and
  recent-ledger reads now scan backwards with bounded memory. Unicode,
  multi-chunk and oversized records were exercised. Both learning entry
  points write one canonical candidate store; legacy pending entries remain
  readable. Memory records include the actual runtime source fingerprint.
- **A configured MCP process can still serve old code.** A read through this
  Codex chat's connected MCP returned driver `706a338`, without `apiVersion`
  or a runtime fingerprint, after source iteration. Fresh launcher tests
  expose v2. This chat's connection needs refresh and subsequent readback;
  source/commit presence alone is not evidence of runtime activation.

- **Physical typing duplication incident remains under investigation.** Taylor
  reported that one physical key produced two characters, only in Claude
  Desktop, severely affecting use. Live qualification was stopped and its
  outstanding request cancelled; no durable bridge jobs remained running.
  Resetting the current CUA session was followed by a single `q` key producing
  `q`. A supported View → Reload reset the renderer; separate `a`, `b`, `c`
  presses then produced `abc`, and three Backspace presses cleared it. No test
  text was sent. Those are synthetic-key observations, not physical-keyboard
  verification or a proven root cause. Physical readback is still required.
  Inspected Hammerspoon/Karabiner configs showed no Claude-specific key replay.
- **Broker heartbeat alone does not prove a running wait loop.** The broker
  ended its turn after a result, leaving a recent `working` heartbeat while
  its live status was idle. Requests then waited without being picked up.
  Residency now also requires busy/working live status; pending unclaimed
  requests receive bounded direct re-wakes. A CLI 2.1.286 peer wake produced
  a correlated native request/result, qualifying that version for broker
  delivery. Native controls still require the broker model and are serialized.
- **V2 lifecycle isolation passed; full live qualification did not.** The
  21-check suite passed in five independent processes (105 checks), covering
  cancellation, duplicate claims/dispatch, expiry, malformed results, dead
  workers, idempotency, locks, transcript cursors and private memory records.
  Report: `<state>/pressure/v2-2026-10-06T19-44-48-937Z.json`.
  Live session creation, idempotent send/reply and rename/pin/config readback
  passed. The queue fixture failed because Claude refused a bare Bash sleep;
  its report retains the failure rather than qualifying interruption/queue.
  A bounded Node fixture replaced it, but that rerun was stopped for the
  keyboard incident. Cross-harness live pressure coverage remains unfinished.
  Automatic shared memory stores operation metadata, not prompts or replies.


## 2026-10-02 (app 2.19675.0, cli 2.1.286)

- **A bypass session keeps bypass across clear, archive and unarchive, with
  no card.** local_13cc48b7 (merged #6463, bypass): `unarchive_session` →
  recycle message → it called `unbind_pr` and `clear_session self` → record
  lost `cliSessionId` (old id moved to `priorCliSessionIds`), old transcript
  still on disk → retitle, archive, unarchive → new brief ran Bash (curl,
  python), Write outside the project and an MCP tool with
  `permissionMode: bypassPermissions`, `prior_context=none`, and 0
  `Emitted tool permission request` lines in main.log for the whole run.
  n=2 claims, n=4 recycles.
  main.log: `[permissionMode] spawn … requested=bypassPermissions
  effective=bypassPermissions` on each respawn. Recycle turn 9–13 s.
- **A pooled session cannot be moved to another folder reliably.**
  local_980dfefa: `change_directory` to an untrusted folder logged
  `pending cwd apply … needs_trust` (a workspace-trust prompt for Taylor,
  which times out by itself), and the brief queued behind the move turn ran
  before the move applied, in the old cwd. Bypass held (0 permission
  requests). The pool is therefore per folder; claims never move. n=1.
- **Import clamp and consent mint unchanged in 2.19675.0.**
  `resolveImportedPermissionMode` still maps Bypass → AcceptEdits;
  `redeemPermissionModeConsent` still requires the card's token.
- **`start_session` exists but is server-gated off** (`ZW("2371478310")`;
  when on it replaces `spawn_task`). Its description: "It runs in this
  session's permission mode unless permission_mode names a lower one". That
  is the native answer once the gate opens for this account.
- **A session can decline a relayed recycle.** local_01041b19 (#6466) held:
  it had an open question for Taylor. Correct; the recycle message now tells
  a session to answer "recycle declined: <why>" in that case. n=1.
- **`prs` in the record keeps a MERGED entry after `unbind_pr`**;
  `ccd_pr get_status` reports `bound: false`. `openPrs()` ignores merged
  entries, so gates are unaffected. n=1.

## 2026-09-30 (app 2.9939.4, cli 2.1.284)

- **Imports can never be bypass; other modes survive.** App code
  `resolveImportedPermissionMode` clamps `Bypass → AcceptEdits` whether the
  mode comes from the transcript or the settings default. Probe P1: bootstrap
  `--permission-mode bypassPermissions` → acceptEdits; `--permission-mode
  default` → default. n=1 each (+4 earlier bypass-default imports). Raising
  afterwards needs the app card's consent token in every mode, including
  from a bypass caller: main.log shows `Emitted tool permission request … for
  set_session_permission_mode` then a renderer `respondToToolPermission …
  decision=once, hasUpdatedInput=true` (a human click) before every raise.
  n=2 (broker 2026-09-29, 58 s to approve; local_980dfefa from a bypass
  caller 2026-09-30, 9.5 min to approve — reported by that caller as "no
  card", corrected from the log). Full analysis
  and options: [strategy-bypass-create.md](strategy-bypass-create.md).
- **A scheduled-task run is the only UI-free native create, and it is
  unattended.** `create_scheduled_task` + `run_scheduled_task` produced a
  bypass session (`bypassChosenInApp: true`, cwd = the creating session's) in
  ~5 s with no card. But `send_message` refuses it ("is unattended"), and
  `change_directory` on itself raised a permission prompt despite bypass.
  n=2 runs.
- **`claude://code/new?folder=` does not set the composer's folder** (it kept
  the last project, for a trusted and an untrusted folder); the composer's
  mode label read "Bypass permissions". n=2 / n=3.

- **Batched delete, desktop path.** `delete_sessions {from_queue}` from a
  desktop session handed back one `delete_session` call for 14 queued test
  sessions; one card, Taylor approved, all 14 records gone. The app left 68
  CLI files behind for them (transcripts, `<uuid>/` dirs, session-env,
  security state, empty project dirs); `delete_sessions {cleanup_only}`
  removed them. Gates: the broker and the caller were refused; archive_project
  on the dotfiles repo refused (1387 commits, 8 sessions), on the probe
  folder allowed. n=1.

- **A resident broker survives an app quit and relaunch with no revival.**
  At quit the app logged `unhealthy cycle for <broker> (1211s, …,
  reason=app_quit)` and stopped it; on relaunch `[CCD] Relaunch auto-resume:
  ran — warmed 2 of 2 eligible (2 marked)` warmed it and sent it a message,
  and it was resident again (heartbeat `waiting`) before any driver call.
  Sessions mid-turn at quit are marked and auto-resumed; the resident loop
  keeps the broker mid-turn by design. The same 1211 s cycle shows the
  540 s wait re-arming across IDLE returns. n=1 (real quit by Taylor).

- **Pressure tests.** (1) Faked app version (`CLAUDE_DRIVER_APP_VERSION`):
  preflight saw no matrix for the key and ran the full probe, all pass. (2)
  Three concurrent CLI harnesses (rename, pin, effort on one session): the
  broker lock serialized them, all three landed, 18 s total. (3) Broker
  process killed (as an app restart would): the next plain-CLI request
  revived it via Tier C (governor at cap) and returned the layout in 26 s,
  main window and Arc (frontmost) restored. (4) Codex 0.159 (bundled CLI) in
  a read-only sandbox with approval_policy never: create in a named folder
  (focus restored: main window and front app), pin, rename, unpin, archive,
  all verified, ~4–5 s each; the MCP server runs outside Codex's sandbox so
  `open` and state writes work. Codex gates tools annotated
  `destructiveHint` behind approval (archive was, wrongly; now only delete
  and archive_project are). (5) cursor-agent: `mcp enable` approves per
  workspace (`~/.cursor/projects/<ws>/mcp-approvals.json`); its client lists
  all 22 tools; a model-driven call needs `cursor-agent login`. n=1 each.

- **Resident broker: never idle, never evicted, no delivery hop.** The broker
  stays mid-turn in a bounded Bash wait (`scripts/broker-wait.mjs`, 540 s,
  re-armed) that returns when a request file appears. The governor only
  evicts sessions idle ≥ 60 s, and a session mid-turn is not idle. Requests
  are just files: 4.3 s and 7.0 s per op with Haiku, versus 8–19 s plus a
  wake before. Heartbeat file tells the driver it is resident. n=3.
- **A peer message's trigger line is inside an envelope.** The receiver sees
  `Another Claude session sent a message:` then `<cross-session-message
  from-name=… from-mode=…>` around the text; a protocol that says "first line
  exactly" makes Haiku reply `ignored`. Protocol v4 names the envelope. n=1.
- **A ccd `send_message` to a live idle session can go undelivered.**
  `peer input … drew no acknowledgement from the CLI in 45001ms — settled as
  undelivered`, right after the broker's previous turn; a direct peer frame
  landed at once. n=1.
- **Asar (2.9939.4): nothing outside the app can start a turn in an existing
  session.** Every `claude://` route, universal link and Handoff only
  navigates the main window; `code/new?q=` only fills a new-session composer;
  scheduled tasks always make new sessions. Governor cap =
  max(6, floor(RAM / 3 GiB)) = 8 here, fixed; it is soft for real sends and
  only warm spawns yield; eviction happens when a warm spawn lands exactly at
  the cap (LRU session idle ≥ 60 s). `[WarmLifecycle:preview]` 1800 s stops
  preview dev servers, not the CLI. No native "archive project" action in the
  main-process bundle (the sidebar is the remote web UI); no route opens a
  pop-out window. n=1 (code reading).

- **The CLI governor caps live session processes at 8 and evicts idle ones
  under pressure.** `[CliGovernor] at cap=8; would evict <broker> (idle 53s)
  for user spawn`, then `pressure evicting <broker> (idle 89s)` → `Pausing
  session (governor_evict)`. On a busy day the broker is evicted within
  minutes of each use, so most non-desktop Tier B calls pay a revival. A
  real send ("user spawn") evicts someone else's idle process; a focus warm
  spawn just yields. n=2 evictions.
- **Tier C revival conflicts with Taylor using the app.** In the first probe,
  Codex found the main window showing Taylor's session instead of the broker
  (he was clicking) and correctly refused to type (3 of 4 revivals). n=4.

- ~~The app reaps idle session processes after 30 min.~~ Retracted: that
  1800 s timer stops preview servers; the broker's deaths were governor
  evictions (below and above). n=code reading.
- **Focusing a session warm-spawns its process — unless the CLI governor is
  at cap.** `Warming session <id>` on focus; with many live sessions:
  `[CliGovernor] at cap; yielding warm spawn` and no process appears. Warm
  revival therefore fails on a busy day. n=3 (all at cap).
- **Tier C revival works when warm spawn is capped.** Codex Computer Use
  typed `claude-driver wake v2` into the broker's composer; the process was
  live 21 s after the op started. A real send spawns regardless of the cap.
  n=1.
- **Focus restore can race the app.** Snapshotting right after a restore's
  deep link read the pre-restore focus (the app had not processed it yet).
  Fixed: a restore now waits until main.log confirms the restored session, and
  revival is one snapshot/one restore. n=1.
- **main.log gives exact focus.** `LocalSessions.setFocusedSession:
  sessionId=local_…` lines, timestamped, track every main-window switch
  (Taylor's clicks and deep links alike). Matched `get_window_layout`. n=3.
- **The focus policy correctly stood down when Taylor moved.** During a
  revival Taylor clicked another session; the driver reported "left alone"
  instead of yanking him back. n=1.
- **Groups are on disk.** `claude_desktop_config.json`
  `.preferences.epitaxyPrefs["dframe-group-scopes"][<acct>/<org>]` has
  `groups`, `assignments` (`code:<local id>` → group id) and `order`. n=1.

## 2026-09-29 (app 2.9939.4, cli 2.1.284)

- **peerProtocol v1 spoken directly: 0.16–0.26 s, no LLM hop.** One unix
  socket connection per message, auth line with the receiver's own peerToken
  (key file `sessions/<pid>.<sha256(resolved socket path)>.key`), one frame,
  half-close; no ack. Delivered into a self-started CLI target (transcript
  origin `kind: peer`) and into the broker (results returned). n=6.
- **The receiver gates on permission-mode class.** from-mode `bypass` vs
  `prompting` must match the receiver's class or the message is held for
  approval (a card). The driver claims the broker's own class. n=2.
- **Broker needs bypassPermissions.** archive, unarchive, pin/move of other
  sessions and renaming user-titled sessions ask Taylor outside bypass (tool
  descriptions, confirmed by the app). One card from Taylor switched it. n=1.
- **Changing a session's permission mode ends its idle process.** The broker
  process was gone right after `set_session_permission_mode`; the next send
  respawned it (slow: >20 s). n=1.
- **Broker latency.** Cold (tool schemas not yet loaded) ~19 s for two ops;
  warm ~8–12 s per request with Haiku 4.5. Delivery itself 0.16 s. n=5.
- **`set_session_title` on self sets `titleSource: "tool"`** even when the
  title is unchanged. n=1.
- **Disk focus snapshot = `get_window_layout`.** `desktop-frame.paneStore.v1
  .state.lastPrimaryCodeSession` and the newest `lastFocusedAt` both named the
  focused main pane. Superseded as primary source by main.log (above). n=2.
- **Create + restore: ~4 s with Haiku,** the main window jumped to the new
  session and back to the prior one. Imported sessions start in acceptEdits,
  `titleSource: auto`. n=3.
- **The MCP server can find its desktop host.** Its parent process is the
  Claude Code process; `~/.claude/sessions/<ppid>.json` names
  `hostSessionId`, so `"self"` resolves without any env var. n=1.
- Research-session findings (import, fork, unarchive link, env -i, bundled
  CLI, ruled-out CDP) are in [brief.md](brief.md) §3.


## October 15 — installed native compatibility checks

CLI2.1.299 / Desktop2.42304.0 changed minified symbols relative to the earlier
qualification fixtures. Nine failures were preserved, then reconciled by executing
bounded installed code with synthetic dependencies. Retirement, dispatch filtering,
collection reload ordering, late-load start deduplication, native MCP/tool wrappers,
and peer receive routing checks now pass. Envelope handling now strips from-plugin
before passing the preserved direct envelope through its encoder; that encoder is
injected in this check, so actual encoder behavior is not qualified here. Unknown
versions fail explicit symbol profiles. These are source/adapter checks, not proof
of live sidecar serving, shutdown recovery, or permission approval. Pressure reports
now hash imported test helpers and record installed identity before/after to detect
source or installed-version drift during a run.

## 2026-10-17 — Native module serving follows a turn boundary

Human hot-reload consent was independently verified in the owned native journal. A fresh bounded fixed-target module probe passed native validation and hash verification. Its first post-update slot reached the model with no intent/result; after that turn ended, its second distinct slot produced a bound native get_session result in 68 ms, matching independent target metadata. Receiver remained the same native epoch in bypass mode; descriptor-bound journal offset stayed unchanged for the consumed request. Preserve the first failure: consent/validation are not readiness. Require an explicit activation handshake before workload. One metadata read is not always-on, recovery, unload or retirement qualification. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/renewed-fe63e48580f5/plan.json`.

## 2026-10-17 — Verify a zero-operation handshake before native workload

The bounded scratch module now writes an identity/lifetime-bound ready receipt on its exact readiness challenge and requires both successful in-memory handshake and receipt presence before a metadata read. A stale file alone cannot arm a reloaded instance. Actual native qualification preserved the first challenge reaching model before turn-boundary reload; the subsequent challenge was consumed without journal growth. Only after independent readiness verification did slot0 return correct target metadata in25ms, with no model rows. Five focused tests, full pressure and both filtered harnesses pass. Scope remains bounded scratch serving; durable enrollment, unload, retirement and recovery are pending. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/readiness-c815b8b299ae/plan.json`.

## 2026-10-17 — Activation gate and candidate dependency identity

Existing host readiness admission did not imply candidate receiver activation. The receiver now requires in-memory successful readiness publication and receipt presence before lifecycle checkpoints; exact zero-operation challenge can initialize it, while stale receipts after reload fail closed. Plain and marker variants covered; no legacy activation. Candidate JavaScript loaded by package generators was also missing from runtime fingerprints and sealed releases. Those sources now participate in identity, snapshot copying and pinned entry validation. Regressions verify stale-source effect refusal and package generation from a sealed snapshot. Final pressure and both filtered harnesses pass on unchanged source; native current-version durable enrollment, retirement and recovery remain pending.

## 2026-10-17 — Native reload refuses stale readiness

The bounded scratch module now leaves exact refusal evidence when a fresh instance sees an old readiness file. Actual native validation/update and a correlated tool-free boundary turn were followed by one unused metadata slot: same native epoch, exact stale-ready refusal receipt, no native intent/result, and unchanged descriptor-bound journal. This proves activation does not survive reload merely through an old file. It does not prove process retirement. Module left unarmed, prior source and failures preserved; fresh generation required next. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/readiness-c815b8b299ae/plan.json`, reloadTrial.

## 2026-10-17 — Bound independent state and honest deadline receipts

An explicit version1 service-state binding permits a new private lifecycle namespace under the receiver cwd, bound to exact session/build and sealed release capability. Existing cwd checks remain for legacy pointers; native PID/start/ancestry and owned nonsymlink namespace checks remain mandatory. Isolated real sealed-helper subprocess tests cover admission and foreign/capability/link refusals; actual desktop enrollment is pending. Pressure also caught an owned resource child reporting deadline slightly early. Its callback now rechecks wall time and rearms; deterministic early firing and actual child tests pass. Original failed pressure artifact is retained. Final pressure and both filtered harnesses pass.

## 2026-10-17 — Actual independent-state sealed helper on current desktop

Receiver package binds session cwd separately from private lifecycle state and safely quotes sealed checkpoint paths. Current CLI2.1.299 accepted the package; the approved scratch produced bound readiness, then executed one real sealed missing-request checkpoint. Completed retained entry proves exact live native PID/start/session ancestry and release/bootstrap/generation. Independent hash inventory and absent request/control/result confirm no metadata operation was admitted; journal growth0. This proves the helper boundary on actual desktop, not native effect admission or recovery. New bounded state/module retained; legacy state untouched. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/independent-ee9e54bb05ca3b6652c3ce5eebdfe98d/plan.json`. Full pressure and both filtered harnesses pass.

## 2026-10-17 — Current bound policy identity and command quoting

PreToolUse current-version identity is now opt-in via exact service-state binding and release capability; unbound legacy and Stop/rescue retain prior version boundaries. Actual hook subprocess fixtures with synthetic native ancestry cover exact checkpoint admission and foreign/capability refusals without a permission allow decision. Guard parsing now accepts package-generated single quoting and preserves literal special path characters through safe rewrites; shell round-trip regression passes. No live policy installed. Actual receiver hook loading and native MCP admission remain pending. Final pressure and both filtered harnesses pass.

## 2026-10-17 — Actual receiver-cwd policy loading follows boundary

Prepared and installed a bound PreToolUse-only policy in the approved scratch receiver cwd, with state in its private namespace. First module callback after installation ran the sealed missing-request helper without hook audit; preserve that failure. After a correlated tool-free model boundary, second distinct missing request produced one native toolu_plugin hook audit and matching retained completed helper entry. Same PID/start/build/generation, exact handler/settings hashes, no request/control/native result and journal growth0 verified. Actual native MCP admission/read remains unqualified; module capacity2/2 used. No Stop/rescue enabled, no legacy state changed. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/policy-83ada8d22920716010cc15df3f767f54/plan.json`.

## 2026-10-17 — Actual admitted native read and pre-dispatch cancellation

On current CLI2.1.299, a fresh independent receiver used the existing standard enqueue/claim/sealed-checkpoint lifecycle. Actual native MCP admission and bound module result passed pure independent correlation; target metadata matched, standard native result was atomically published and inspectRequest read back completed. Module path289ms; no model journal growth. A second distinct request was cancelled before callback: exact completed helper, cancelled control, zero dispatch slots, no admission/native result, unchanged journal. Settlement helper quoting and absent-directory failures were preserved and fixed without resending native work. Public durable routing for independent receivers, retirement and recovery remain pending. Evidence: `.runtime/state/probe/scratch-native-read-2026-10-17/admitted-read-18e7d5f05162d0a528bef47cc51c6c47/plan.json`.

## 2026-10-17 — Public durable independent receipt reattachment

Existing result-reconciliation API now accepts an explicit receiver session for independently bound state; legacy defaults are unchanged. A namespace-isolated child verifies exact current ownership/source/policy and retained native admission/result, then publishes or compares the standard native result without sending. Actual durable job reconciled the prior real receipt after a later helper entry, published:false; same key returned same job. Wrong receiver refused and result/control/admission hashes stayed unchanged. Public fresh publication/enrollment/read and recovery remain pending. Focused tests, full pressure and both filtered harnesses pass.

## 2026-10-17 — Public native read and job-context regression

Public independent read now reuses standard durable transaction/budget/lifecycle and shared strict settlement. Actual API job freshly published verified native result in335ms module path, no model journal growth; same-key reattachment reused job and preserved evidence. Smoke exposed dispatcher dropping trusted jobId, so operation used a safe durable random ID. Mismatch retained; dispatcher now forwards/validates ID with a direct operation-context regression. Corrected mapping still needs native trial. Final post-fix pressure and both filtered harnesses pass; public enrollment, retirement and recovery remain pending.

## 2026-10-17 — Corrected request identity and read-only independent status

Fresh native public job exactly mapped jobId to requestId through durable host record, lifecycle, MCP admission and fresh native result;266ms module path, journal growth0. Same key reused job without evidence changes. This closes the prior ID-forwarding failure for the tested source. Independent read-only status now reports bound epoch/source, retained readiness/policy audit and validated reservations without claiming serving or attempting recovery. Actual exhausted budget reported2/2; wrong receiver returned unqualified and preserved native result. Full pressure and both filtered harnesses pass; enrollment/retirement/recovery remain open.

## 2026-10-17 — Validate installed package against its sealed generator

Workspace factory updates could previously invalidate a healthy pinned independent receiver. Expected bytes now come from the validated sealed release generator, tied to config build and namespace capability. Async context consumers await validation. A clone regression changes mutable candidate source and proves sealed expected hashes remain unchanged; first fixture syntax failure is retained separately. Existing live pinned status and receipt reconciliation still pass without result changes. Full pressure and both filtered harnesses pass. Enrollment/retirement/recovery remain open.


### Independent preparation and refusal evidence (October 17)

Public preparation job j10f4fc1039314bd5bb6e4365e26843c9 staged and native-validated
a sealed candidate without changing the installed module/settings or creating an
active pointer. Same-key submission reattached the original job. Preparation is
separate from activation and serving. Candidate refusal receipts now distinguish
an exact pre-dispatch helper refusal from a missing result; they do not alone
establish no-effect, settlement or safe retirement. Native execution of the new
refusal receipt remains pending; synthetic boundaries pass.


### Empty owned receiver activation (October 17)

Public preparation/activation installed servicedb2a06e219134fd78fcfa2bbb33c70a2
on existing interrupt scratch74/PID20499. Exact installed bytes/settings/policy/
pointer and native epoch independently verified; no readiness/policy-loading or
serving proof and no native message. An initial pre-effect failure exposed inverted
ENOENT handling; absent effect paths independently verified before corrected job.
Original failure and read-only diagnostic retained. Activation never replaces an
existing generation or erases unresolved attempts. Native consent/loading remains
separate from successful filesystem installation.


### Public prepared/activated receiver native qualification (October 17)

After Taylor enabled native hot reload, interrupt scratch74/PID20499 emitted a
loaded notification and bound ready receipt. Tool-free settings boundary followed
by missing-request policy self-test produced the new exact invalid_request refusal
receipt with native helper completion and no native MCP admission/result. Marker
alone remains insufficient for terminal settlement. One public metadata read
through prepared/activated servicedb2a06e219134fd78fcfa2bbb33c70a2 completed in300ms,
fresh published receipt, exact job-derived request identity, independent metadata
match and no native journal growth. Same-key job reuse preserved all receipt hashes.
This is native scoped serving proof; no always-on/recovery/retirement claim.

### Stable receiver hook first native qualification (October 17)

Explicit stable_hook activation preserves default empty-receiver guards and sealed
factory provenance. Stable settings reference a fixed receiver entry; exact selector
binds generation/private namespace/epoch/bootstrap and hashes. On same native
PID20499, first install plus one tool-free settings boundary produced actual policy
self-test audit and terminal refusal. Public metadata readjd5bbcc3d19bc4142a2bc6fe846df536c
verified persisted receipt and independently matched target metadata with native
journal growth0. Same-key reattachment preserved evidence hashes. This proves one
installed generation only; successor selector turnover and zero-boundary renewal
remain open. No app restart, permission change or unknown replay.

### Same-process stable hook turnover without model boundary (October 17)

Guarded replacement requires historical retired source, exact owned STOP, terminal
attempt review, same native epoch and identical anchor/settings. Prior selector is
retained exclusively. Native d80→8f32 turnover onPID20499 produced fresh policy audit,
terminal self-test and verified public metadata read, with zero native journal bytes
across the entire transition. Shared anchor/settings inode/mtime/hash unchanged;
old STOP/history verified afterward. This qualifies one explicit same-process
renewal, not autonomous always-on or crash/cold/record-loss recovery.

### Durable bounded renewal orchestration (October 17)

One job now checkpoints prepare-before-STOP, quiesce, retire, stable activation and
verification under exact epoch/selector guards. Native jobj44e1287366824bfe82e42a32458e9635
completed on same native epoch with unchanged shared files/history and zero journal
growth. Fresh readiness followed install; no policy audit on the new generation yet.
This is explicit one-shot orchestration, not scheduled automatic recovery or serving
qualification. Original job reattachment preserves ledger and successor identity.

### Durable negative policy qualification (October 17)

Policy probe now has one durable job/request, permanent capacity reservation and
private lifecycle lock. Native jobjecd36ad6999c4b048a4d45f59e376fb1 verified exact
missing-request audit/helper/refusal/absence proof, then separate public read
ja93978a8866f4cfa8dcc71c709f15bb7 verified matching target metadata. No native journal
growth/model turn. Probe reattachment preserved evidence. Negative qualification
never claims positive serving; uncertainty retains original request and slot.

### Integrated renewal readiness latency and qualification (October 17)

Original15sec readiness budget failed before probe; exact native registration was
18.59sec after activation. Failure preserved. A revised bounded30sec run observed
23.44sec readiness, completed its built-in negative policy probe and then a separate
verified positive metadata read. Same native epoch, no model/journal growth, stable
files/history unchanged. This demonstrates7step renewal qualification, not a latency
SLA or autonomous crash recovery. Native loader latency must be observed rather than
inferred from publication; installation does not make policy readiness immediate.

### Read-only service action planning (October 17)

Current-generation planner compares stable selector before/after exact live status.
STOP/uncertainty override expiry/capacity; readiness/input/busy state never triggers
blind recovery. Current533f recommended read; stale821f recommended inspect, with
unchanged budget/pointer hashes and zero native journal growth. Recommendations
perform no effect and do not establish positive serving or automatic resumption.

### On-demand native read route capacity renewal (October 17)

Durable parent routes current-generation metadata through distinct real child jobs,
with at most one renewal/probe/read and no uncertain replay. Real reads exhausted
533f capacity6/6. Next parent automatically renewed via one7step child, then read on
newbb97; matching persisted metadata and distinct probe/read identities verified.
Same-key parent preserves route/renewal hashes, old STOP/history retained, zero
native journal growth/model turn, shared hook/settings unchanged. This qualifies
one on-demand capacity transition; expiry/cold/crash recovery remain separate gates.

### Native queued current reads with duplicate key (October 17)

Three concurrent distinct routed reads plus one duplicate submission completed as
three parent/readchild/request identities, exactly3newslots. Duplicate returned the
same parent. Persisted target metadata matched; native receipt intervals were
nonoverlapping446/410/596ms, parent queue-inclusive1217/2280/3638ms. Zerojournal
bytes/model turns, no unresolved attempts. This is a small healthy-queue sample,
not a latency SLA or queued-renewal/unbounded-load qualification.

### Fresh cross-harness MCP current-route qualification (October 17)

Fresh Claude/Codex clients each passed14native current-route checks through the
canonical MCP launcher: exact double submission/reattachment, distinct readchild
request mapping, selected generation, no maintenance/external tools/config/source
changes or native model turn. Persisted targetmetadata independently matches;2slots
consumed, no unknowns. This qualifies healthy current-route clients; attached stale
chat binding still reports restartRequired:true and was used only read-only.

### Readers queued behind renewal (October 17)

Real capacity2generation plus3concurrent readers reproduced old5sec admission
failure:2completed,1lock_timeout before route ledger/children. Default60sec bounded
admission and typed no-admission errors added. Fresh changed-condition test completed
all3readers, one automatic renewal; third waited7.72sec then returned matching native
metadata. Original failedjob preserved, no retry, zero native journalgrowth, shared
files/history unchanged. This qualifies one bounded queued-renewal scenario, not
unlimited queueing or a native latency SLA.

### Real deadline expiry through current-route API (October 17)

A supported60second generation was allowed to expire on actual wallclock with
3unusedslots. Exact live status/plan showed expired/lifetime-margin. Next routed
read performed one qualified renewal child and one read child on a fresh generation;
persisted targetmetadata verified, originaldeadline/STOP/history and sharedfiles
preserved, same-key ledgers unchanged, zero native journalgrowth. This qualifies
on-demand expiry recovery on the same nativeepoch, not app/crash/cold recovery.

### Versioned lifecycle declarations are not process proof (October 17)

Read-only generated2.1.299 surface audit records16session methods/no direct exit,
exact lifecycle tool inputs, turn-only stop, archive's declared process/family/
worktree effects and deletion's always-human card. Owned scratch disk metadata
showed no worktree/samecwd/directID references, but native family scope remains
unqualified. No lifecycle call, signal or restart was attempted. Actual cold/physical
recovery requires independent ownership and executed native evidence.

### Explicit cold epoch admission boundary (October 17)

Cold rebind is now an explicit activation option: changed independently verified
new epoch, oldPID absent twice, retired/STOP/terminal predecessor and identical
anchor/settings. Default same-process gate unchanged. Synthetic tests/pressure and
both harnesses pass; no native cold activation or restart yet. Ownership snapshot
also found a live idle but non-serving legacy broker with stale epoch evidence;
observer ownership preserved. Liveness is not a recovered serving channel.

### Historical rebind evidence completeness (October 17)

Human-assisted retired receipts require explicit empty unresolved inventory, strict
terminal review and a present bounded native tool ID. Missing values cannot stand
in for verified absence or a correlated tool receipt. Regression tests cover these
malformed cases; no additional native recovery authority is granted.

### Ordinary native archived sessions remain outside qualified scratch recovery (October 17)

ProDevs public unarchive failed through legacy broker epoch mismatch; its native
identity is ineligible for CLI re-import, so import-only failed closed. Read-only
record confirms archived and unpinned. No pin request was proven executed. Current
MCP and independent scratch pair readiness do not qualify general user-session
unarchive/pin. This full public workflow must pass with persisted target readback
before goal completion; manual UI workaround is not the service's acceptance test.

## October 17 ordinary user-session integration

Public ProDevs unarchive then pin succeeded through identity-bound independent
session management; native receipts plus final saved archived=false/pinned=true
verified. Explicit sessionManagementControl grant required in sealed config/policy/
runtime; fixed scratch role preserved. Retained postcondition observations drive
historical settlement. Only unarchive_session/set_pinned added; no target bypass,
live PID, scratch enrollment or worktree restrictions required for these metadata
actions. Unknown outcomes remain pending, never replayed. See docs/resume.md for
exact jobs, source revisions, passing focused/full synthetic/filtered harness
evidence and remaining final-source/focus/loaded-MCP qualification gaps.

## October 17 ordinary-route health and focus observations

Legacy resident=false can coexist with a qualified independent ordinary-session
controller. driver_status now exposes sessionManagement separately using exact
retained enrollment/generation/epoch and bounded independent health; status never
wakes or repairs it. Native metadata results without navigation attribution need
fresh endpoint focus observations, not assumed restoration. Changed/unknown views
remain untouched and unconfirmed; matching endpoints do not establish uninterrupted
focus. Focus/status focused tests pass; no repeated live user-chat mutation.

## October 17 ordinary configuration avoids unserved legacy dependency

Explicit session_metadata_control adds title/model/effort to account-bound ordinary
session management without expanding existing unarchive/pin-only grants. Public
model change then restoration on an existing owned non-enrolled target passed native
receipts and saved state, with original baseline restored and focus endpoints
unchanged. Batch fields are sequential and individually durable; failure/unknown
stops later fields. Historical missing false grants normalize to false across host
upgrades, while true-right/target/argument changes reject. See resume.md for exact
source, jobs, reports and remaining native/loaded-client qualification boundaries.

## October 17 ordinary native sends and SDK journal visibility

Implemented separate sessionSendControl (public session_send_control:true), requiring
sessionManagementControl and matching sealed package/policy/pointer grants. Old
management/metadata generations gain no send permission. Default durable send_message
routes through the enrolled controller for exact same-account ordinary recipients,
without scratch enrollment, bypass mode or a live recipient PID prerequisite.
Archived recipients refuse. One native attempt, no fallback/replay; delivered/queued
receipt proves native acceptance, not application or a causal reply. Route ledgers
retain message hash/length rather than message text. Native failures stay failures.
Renewal and pair recovery preserve the explicit grant; standby cannot acquire it.

Focused70 passed; integrated synthetic1/1 passed on source
0d5e209d3e929bce43c749f84eafe7aa008bade66016b00c823cd62e1ba34f38,
pressure/v2-2026-10-18T02-51-00-224Z.json. One public send on the existing owned
control target passed exact native delivered acceptance: job
j3d5ae77f89ce4804b98096b1559bc96b. Baseline and focus endpoints preserved; no
ProDevs message. Evidence .runtime/state/ordinary-native-send-20261017.json.
Primary renewal j8b026a975ebd4448b261287072e829e4 installed service
8b026a975ebd4448b261287072e829e4 on the same PID96436/start00:42:30; standby
binding refreshed with fresh family rpeer87eeaf418a5d9119c801acddaa45a0f4.
Read-only inspection confirms primary idle and both requests settled.

Original strict journal qualification FAILED and remains unchanged: this resumed
Claude Desktop SDK turn has no peer-origin receipt metadata. Its exact requested
assistant reply did appear. Added a bounded metadata-only SDK envelope projection
and unique content/hash plus parent-lineage correlation, explicitly senderAttested:
false and messageIdAvailable:false. It cannot replace strict peer-origin receipts,
authorize an effect or establish transport-ID linkage. Re-reading the SAME cursor
without resending confirms content/reply correlation; strict receipt stays false.
Post-projection focused20 pass. The full/native source above predates this host-only
projection; final-source integration remains pending. No new message for parser QA.

NEXT: qualify broader ordinary operations and the experimental both-absent recovery
path with a supported scoped outage; keep loaded-client/final-source full synthetic,
filtered harness and native batch for the final gate. ProDevs unarchive/pin already
verified; do not repeat just to show activity. Loaded MCP adoption remains unverified
until final refresh. Legacy reports unchanged/pending; observer owns legacy wakes.
Goal ACTIVE; Codex-driver/1Password work remain separate.

## October 17 ordinary archive implementation

Previous turn = progress (actual ordinary send failure-count tests). Implemented
ordinary archive_session through the enrolled management controller instead of
legacy tierB. Requires new explicit sessionArchiveControl/public
session_archive_control:true AND management, sealed in package0.13.0, policy and
pointer; prepare/activate/status/renew/maintenance/cold/pair roles preserve it.
Existing generations gain NO archive authority. Health advertises only with all
matching grants. Existing self/broker gates retained; self still follows its
explicit existing path, ordinary route never targets its controller/caller.
Optional reason is bounded nonempty <=500, no NUL; exact native arguments bound.
No permission, delete, stop or arbitrary native-tool capability added.

Ordinary archive uses account/cwd/CLI identity binding, exact native admission and
receipt-hashed saved archived:true postcondition. It does NOT claim process death
or fixed-actor retirement. Separated fixed archive observation/review from ordinary
archive in settlement and historical-attempt review. No retry/fallback after an
unresolved field. Missing ordinary target binding under the new archive right now
explicitly refuses native-hook admission rather than falling through fixed roles.

Focused60 passed; integrated synthetic1/1 passed28sec on source
9cfc929657d7e66910054409f66cc9a8c8d6bd85a194f43562303b25bf5fcacf,
pressure/v2-2026-10-18T02-59-08-877Z.json, sourceUnchanged. After that run, extracted
binding-required helper and added missing-binding/fixed-role separation regression;
focused20 pass on that final change. Full run is not final-source blanket proof.
No native archive, controller renewal, app restart or ProDevs mutation this turn.
Archive grant is implemented but NOT activated/native-qualified yet. Next strategic
native batch should qualify ordinary archive/unarchive on the owned control target,
not a user work chat; combine with subsequent ordinary stop integration if practical.

NEXT implementation: ordinary stop with separate authority and exact recipient
epoch, preserving requested/pending stop semantics. Both-absent recovery, natural
pressure, broader original brief and final loaded-MCP/source suite remain open.
Goal ACTIVE. No live test job remains; Codex-driver/1Password work stay separate.

## October 17 ordinary epoch-bound stop implementation

Previous turn = progress (ordinary archive published). Added separately explicit
sessionStopControl/public session_stop_control:true requiring management and exact
sealed config/policy/pointer agreement; package0.14.0. Preparation, activation,
status, renewal, maintenance and cold/pair roles preserve the new right without
expanding old grants. Health advertises stop only with matching explicit grants.
Public stop_session uses ordinary route when no fixed metadata route exists;
existing fixed-target and self/broker protections remain. No permission changes.

ordinary-stop-control binds recipient PID/procStart, host/CLI identity, cwd,
entrypoint and supported CLI version. Busy/idle/waiting peers qualify; dormant,
ambiguous/changed/starting/foreign peers refuse. Request carries exact separate
nativeSessionStopEpoch and ordinary identity. Host preflight AND actual native
PreToolUse independently observe the peer/process; retained admission includes the
matched stopEpoch. Missing ordinary binding cannot fall through fixed admission.
Native callback calls only stop_session with exact session_id once. No caller
text can add native arguments, consent, a different target or arbitrary tools.

Durable ordinary-stop-routes ledger retains original intent/epoch/native receipt.
Native stopped/already_idle acceptance is not success until SAME recipient epoch
is independently idle. Native requested remains outcome_unknown and prevents the
steer replacement; unknown/error/timeout/identity drift/write failure never replay.
Queue behavior remains native (already queued messages preserved). Ordinary stop
uses stop receipt review rather than a saved metadata postcondition; historical
attempt review retains that distinction and fixed scratch receipts remain valid.

Focused72 PASS, ordinary-stop-focused-20261017.log; changed JS syntax/diff checks
pass. Covers grants/native callback/receipt/pending state/epoch changes/admission/
no-replay orchestration/recovery/maintenance/history. No full rerun or native
message/stop/archive/generation activation for this interim gate. The integrated
archive report is earlier-source proof only. Both new archive AND stop grants are
implemented but NOT native activated/qualified yet. ProDevs unchanged.

NEXT strategic native gate: renew primary once with archive+stop grants, qualify
ordinary already-idle stop and archive/unarchive on the existing owned control
target, checking saved baseline/focus and exact terminal settlement. No ProDevs
messages or archive test. Busy ordinary stop still needs actual controlled native
proof (prior fixed-target proof is separate). Batch with final-source synthetic
and harness gates when implementation settles; avoid per-edit desktop tests.
Both-absent recovery/natural pressure/broader original brief/loaded MCP remain open.
Goal ACTIVE. No live job pending. Codex-driver and 1Password remain separate.

## October 17 combined ordinary archive/idle-stop native gate

Previous turn = progress (ordinary epoch-bound stop implemented). Source
2fdaaac4d40781d0bcdab2609f373e30fa70c8b54db1d8eefc7f11b74aa32bc9:
one primary renewal with session_archive_control and session_stop_control true,
job j6c9618ee44454c619033959897971e8a completed. CURRENT PRIMARY service
6c9618ee44454c619033959897971e8a, same PID96436/startSunOct18 00:42:30.
Native readiness/policy/read verified; standby refresh qualified with fresh family
rpeer113dfbccf093497b2a36b49a1500952f. Existing grants retained.

On the existing owned controltarget local_8f1d6d55-df3d-4b50-a96c-f4b61a7858bd:
- Public stop j7f16bbf837534af8bf38466d7d995862 passed exact native already_idle
  receipt, admitted recipient PID42813/startSatOct17 16:03:11, same-epoch idle.
  This does NOT qualify stopping a busy turn.
- Public archive jfaf5e9b0a57f46efb00b3e6c9c7518bd passed exact ordinary native
  receipt and retained saved archived:true postcondition, with custom reason.
- Public unarchive ja86a578cf3d84c64b11b3716a3ff5439 completed via TierA deep link.
  Independent saved read matches original title/titleSource/model/effort/permission/
  archive/pin baseline. Recipient has NO live peer afterward. This is restoration
  of saved state, NOT proof of startup/readiness or ordinary native-unarchive path.

Stop/archive before-after focus endpoints independently unchanged (Codex front,
ProDevs main). Unarchive reports restoration; no claim of uninterrupted layout.
Controller independently idle, both new grants true, unresolved IDs empty; native
stop/archive/fresh-family requests settled. No ProDevs changes, new messages,
app restarts, CUA/keyboard/auth/permission effects. Evidence
.runtime/state/ordinary-archive-stop-native-20261017.json, scoped qualificationtrue.
One integrated synthetic1/1 PASS36.7sec on SAME source, sourceUnchanged:
pressure/v2-2026-10-18T03-03-37-898Z.json. No source edits during native/test jobs.

NEXT: ordinary BUSY-stop/interrupt-steer qualification on the same owned target
requires one deliberate controlled request, not repetitive smoke messages. Dormant
target startup/trust remains a separate gate; do not assume unarchive starts it.
Both-absent bootstrap/outage, natural pressure, broader creation/fork/window/person
and final loaded-MCP adoption remain open. Choose next changed-condition gate;
no repeat archive/idle-stop merely to appear active. Goal ACTIVE, no live job pending.

## October 17 ordinary busy-stop and dormant-trust boundary

Previous turn = progress (native archive/idle-stop + integrated source2fdaa pass).
Dormant controltarget send j08509ad4dc79426bb9cda794a938d412 failed with exact
verified workspace_trust_required / undelivered receipt. No peer/new events; saved
baseline unchanged. Failure settled, not replayed; old failed record retained.
Taylor then explicitly sent ready and approved exact target workspace trust.
New recipient epoch PID19357/startSunOct18 03:05:05, independently idle.

Changed-condition send j74db349e96784960a4001f75a45d569c delivered a bounded text
response. Busy was observed, but stop jdb226e0ed55f47fab2e30c6abe0450d5 returned
already_idle; this race is NOT busy-stop proof. A changed timed Bash wait request
jd02ac6db65ea499187f0abd4c2e1c8a8 was delivered, but target's OWN historical
sealed receiver policy rejected Bash before execution. Stopj8d1d090df4b145c09ae3ba30bca6f301
again already_idle. Read-only target settings confirm old local serviced5e108...;
this is not general ordinary-chat hook inheritance. No hook/settings weakened.

Final changed condition: longer TEXT-ONLY response, with host immediately issuing
stop after exact delivery and busy observation. Sendjbd75c09c36ed4aca94e6f9b8692cb1ce,
stopj6a792e9745a4429f8fbb941d4a3d751d: actual native stopped receipt, SAME exact
PID/start independently idle, baseline unchanged, focus endpoints unchanged,
controller idle and unresolved requestIDs empty. Qualificationtrue scoped to
ordinary busy stop AFTER person-approved startup. No unattended startup claim.
Evidence .runtime/state/ordinary-busy-stop-native-20261017.json retains ALL attempts.
Native sealed source2fdaaac4d40781d0bcdab2609f373e30fa70c8b54db1d8eefc7f11b74aa32bc9;
host6a29218c49dc80b5cbb5fe013d790b7e9487cd9c01a754881719bebd6cadc7b7.
No app restart, process kill, CUA/keyboard, new chat or ProDevs mutation.

Added bounded humanAction metadata for exact native trust failures in ordinary-send
errors AND durable route failure: app/view/existing session title+ID/exact folder,
personRequired, replayOriginalRequest:false, servingReadinessAssessed:false. No
message text/raw native error copied into guidance; foreign/malformed targets or
unclassified failures do not generate instructions. Focused8 pass. This new error
projection is synthetically tested; original native failure predates projection.
No full suite repeated for this diagnostics-only change; prior2fdaa integrated pass
is not final host-source blanket proof.

NEXT substantial gap: both-absent bootstrap/outage qualification, natural pressure,
broader creation/fork/window/person gates and final loaded-MCP adoption. Ordinary
busy stop now has native proof; don't repeat it or resend failures to show activity.
Any trust-approval-dependent continuation must use a new explicit request and keep
original failed job unchanged. Target is currently LIVE IDLE (not dormant), control
baseline preserved. Goal ACTIVE; no pending native job or human trust action.

## October 17 created-session followups join ordinary routes

Previous turn = progress (ordinary busy stop qualified; trust guidance published).
Pair-bootstrap audit confirms its current live-peer guard refuses deliberate
eligibility forcing. No actor archived/stopped, app restarted or outage simulated.
Actual both-absent qualification remains open, not counted from a planner pass.

Source audit found imported create_session followups still always used legacy
TierB even with an enrolled independent controller. Added created-session-followups:
for durable no-group/default-route imports, title lock and first_message now call
public rename_session/send_message ordinary routes, under one recipient control
lock. Each effect gets a distinct stable context ID derived from parent+operation;
private parent ledger retains IDs/results/phase, not prompt text. Whole followup
plan validates before any followup effect. Title must independently verify exact
value/titleSource tool before sending. Failure/cancellation/unknown/record-write
error stops later effects; no fallback/replay/recreation. Error retains the already
CREATED session ID and child contexts, including native humanAction when present.
Original followUps op/ok/result shape retained with additional contextId.

Focused3 new orchestration checks + actual isolated MCP regression19 =22 PASS
(~11.4sec); final narrow3 rerun after result-shape/ledger cleanup PASS. No native
chat created, no message sent, no full suite repeated for this wiring change.
This is implementation/synthetic evidence, NOT native create/fork qualification.
The synchronous/no-parent, explicit alternate-route and grouped creation paths
retain existing behavior. Existing bypass pool creation still has its own legacy
configuration batch; THIS IS THE NEXT concrete integration gap, not closed here.
Do not claim all create paths now independent. Permission gaps/native person-only
trust remain authoritative and unchanged. No permissions/settings changed.

NEXT code step: route durable approved pool claims through independent unarchive,
configuration and optional send with distinct retained identities; preserve partial
claim reservation on uncertainty and verified-before-first-message behavior.
Then reassess one integrated creation/lifecycle gate (don't incidentally create new
chats). Both-absent/bootstrap/natural pressure/window/person/final loaded-MCP gates
remain open. Goal ACTIVE; no live job pending. Codex-driver work remains parked.

## October 17 approved pool claims use independent configuration

Previous turn = progress (durable imported creation followups). Durable approved
bypass pool claims without group/explicit alternate route now use independent
public unarchive, set_session_config and optional send_message. No import or
permission raise is added. Record's actual folder must resolve to requested
canonical folder and mode remain bypass. Stable separate contexts derived from
parent+operation, one recipient lock, private pool-native-claims root. Original
identity/account/cwd retained; unarchive may materialize only the expected host CLI
UUID from null, with original/after bindings retained. Other identity drift refuses.

Whole config/message plan validates before followup effects. Saved unarchive and
exact title/titleSource tool/model/effort/bypass verify before first message; saved
configuration is freshly rechecked immediately before sending to catch drift.
Native send requires exact delivered/queued acceptance, never model application.
Unknown effects stop later steps, preserve parent/child contexts and claimed ID,
never retry, legacy-fallback, recreate or automatically return the claim.

Added persistent claimUnresolved/claimJobId marker BEFORE native intent. Pool
health/reconciliation no longer recycles that claim via the ordinary stale timeout,
even if still archived/CLI-null. Clear marker only after all requested steps and
checkpointing succeed. A failed final registry/checkpoint write remains reserved.
This closes an uncertainty/reuse gap; old ordinary handback stale claims retain
existing behavior. Operators must reconcile original exact requests before manual
claim repair; no reset/repair effect is introduced by this change.

Focused pool/import orchestration + existing actual isolated MCP/pool regressions:
26 PASS (~12.2sec). After added immediate pre-send config recheck, focused8 PASS;
syntax/diff pass after exact-folder guard. No native pool claimed, chat created,
message sent or full suite repeated this interim gate. No claim of native pooled
creation qualification. Grouped/synchronous/explicit alternate-route paths remain
legacy; no new sidebar/project rights. Codex-driver and 1Password stay separate.

NEXT: audit remaining ordinary grouping and lifecycle dependencies, then run one
integrated final-source batch including actual MCP entrypoints; native creation/
pool/fork and app/both-absent recovery/pressure/window/person gates remain open.
Do not rerun archive/stop/send merely for activity. Goal ACTIVE; no live test job.

## October 17 imported permission mismatch defers real task

Previous turn = progress (independent approved pool configuration). Review across
both creation paths found imports could report permissionGap/verifiedfalse but
still send first_message and other followups. That violates requested readiness:
most importantly bypass fallback imports start Accept edits, not requested bypass.

Added explicit createdPermissionGap gate in actual create_session immediately after
saved imported mode assessment and before BOTH independent and legacy followups.
Any actual/requested mismatch (including missing mode) returns created session ID,
existing permissionGap and bounded followUpsDeferred metadata: requested/actual
mode, firstMessage/titleLock/groupAssignment deferred flags, no permission raise,
no replay authority. No task text is returned in this metadata. Already-created
record is retained, not recreated/cleaned up to hide the mismatch. Group existence
may already have been ensured before import; session assignment is deferred.
Matching modes continue existing paths. Approved pool route already verifies
bypass and is unchanged. No auto-raise, card acceptance, trust or auth bypass.
Updated tool description to explain actual followup route and deferral.

Focused55 PASS (creation/pool orchestration + v2 regression), ~5sec:
creation-permission-gap-focused-20261017.log. Syntax/diff checks pass. No full
suite, new native chat, message, settings/permissions or desktop effects this turn.
Native import fallback/card behavior remains separate from this source-level gate.

NEXT: audit remaining grouped/create/fork/window dependencies and build a concrete
integrated qualification plan without repeating qualified native send/archive/stop.
Both-absent bootstrap, natural pressure, broader native lifecycle/person tests and
final loaded-MCP/source adoption remain open. Goal ACTIVE; no live job pending.
Codex-driver and 1Password remain separate.

## October 17 integrated creation contracts and ordinary interrupt identities

Previous turn = progress (creation permission mismatch defers effects). One integrated
batch on source3e6cf9a6acf50c87a5dda75f41e850c34a25e04962e5c87dbcf78703848187fa:
synthetic1/1 PASS41.9sec, v2-2026-10-18T03-13-42-118Z.json; actual filtered Claude
Haiku4.5 contract10/10 PASS23.3sec, harness-v2-claude-2026-10-18T03-13-04-901Z.json;
actual filtered Codex CONFIGURED gpt-6-sol contract10/10 PASS15.6sec,
harness-v2-codex-2026-10-18T03-13-06-134Z.json. Source and global configs unchanged.
All fixture-only, no native messages. These are pre-fix-source evidence below,
NOT final host/current loaded-MCP/native qualification.

Audit uncovered ordinary interrupt fallback reused parent job context for stop AND
send. Native request IDs would collide after a successful stop. Added dedicated
ordinary-steer-route using existing runNativeInterrupt and distinct deterministic
stop/send identities, durable parent ledger, original target identity/epoch and
whole two-request capacity/grant preflight. Actual public steer_session interrupt
selects it for ordinary recipients; queue/default sends retain existing semantics.
Pending/unknown stop, cancellation, controller/recipient drift or failed checkpoint
prevents replacement. Existing recipient control lock covers both phases.

Replacement send now carries optional expected original PID/start through host
preflight, request nativeSessionSendEpoch, actual native admission and retained
sendEpoch evidence. Must still be SAME idle peer at admission, not merely a host
check before enqueue. Standalone ordinary sends remain free of recipient-epoch
prerequisites. Receipt review refuses absent/mismatched admitted epoch. No native
arguments, rights or permission mode widened. Route health advertises steer only
with explicit send+stop grants across config/policy/pointer.

Older loaded hooks cannot prove this new optional epoch binding. Maintenance
requiredBuild now requests ONE recorded source renewal before this sequence,
preserving scope/roles/epoch/grants and requiring verified successor source.
Unqualified budget/history never becomes a renewal attempt. Expected-epoch send
also requires current source. Native maintenance ledger retains requiredBuild.
Old installed native source2fdaa remains unmodified this turn; new interrupt will
renew before effects rather than silently use its weaker old proof.

Focused42 PASS (admission/receipt/identity/maintenance/interrupt/send/health); final
narrow20 PASS after budget-before-renew guard. Changed JS syntax/diff checks pass.
No repeat full/harness/native cycle after discovering this gap; original batch is
retained, final source now newer. No desktop messages, app restart, settings or
permissions touched. Ordinary busy-stop native proof stays historical by source;
new ordinary interrupt sequence awaits one integrated native qualification gate.

NEXT: qualify actual ordinary interrupt sequence once (current-source renewal,
controlled busy owned target, stop+replacement distinct receipts, original epoch
and reply observation), then review remaining lifecycle/group/window/person and
both-absent/pressure/loaded-MCP requirements. Don't repeat standalone native stop
or replay old requests. Goal ACTIVE; all three test handles terminal, no live job.

## October 17 ordinary interrupt native sequence qualified

Previous turn = progress (distinct ordinary interrupt contexts + native replacement
same-epoch admission). One integrated native gate on source
982ab2f6469736c3243db4ebdab39a2d2a6dcd63ea1dad4015613b89b59f5613 passed.
Renewjc5fbfd1706384ac68e8b07dd5538682a: CURRENT PRIMARY service
c5fbfd1706384ac68e8b07dd5538682a, samePID96436/startSunOct18 00:42:30.
All grants retained; native readiness/policy/read and automatic standby refresh
qualified. Fresh familyrpeerc53922c8cabb94b6d1a16f65f45baba3; enrollment digest
9e08ec9e2052328d34bef9eb0303c708caf035782743bbba7c8594835977d94c.

Owned controltarget local_8f1d6d55-df3d-4b50-a96c-f4b61a7858bd:
controlled text sendj43d0a3a7b9ce4d4db7402381e7fed033 delivered; recipient busy
PID19357/startSunOct18 03:05:05 independently recorded. Public steer_session
interruptj5f50154185314ac29b6378f84bfd01fa completed native stopped then delivered
replacement with DISTINCT request IDs:
rpeer67bd3a967d52433b945b2345d4fa7b32 and
rpeer0dc8442f8c26036a3bb09a07a4717ac8. Send admission retained original idle
recipient epoch. Exact replacement reply observed, no tools, same recipient epoch
then idle. Saved baseline and focus endpoints unchanged. Controller independently
idle, all current requests settled, unresolved IDs empty. No ProDevs effects,
new chats, app restart, keyboard/CUA/auth/permission changes.

Existing qualification.recipientReplyEvidence verified native sender/body/cursor/
ancestry and unique exact terminal reply. returnedMessageIdLinked:false retained.
The lower single-peer nativeSendUserReceipt helper rejects this MULTI-request
observation window (busy setup + replacement); its false result remains recorded.
Use the existing multi-request verifier, not a parser weakening or another send.
No SDK-only correlation needed. Evidence
.runtime/state/ordinary-interrupt-native-20261017.json, qualificationtrue.
One integrated synthetic1/1 PASS38.9sec on SAME982 source, sourceUnchanged:
pressure/v2-2026-10-18T03-18-27-433Z.json. No source changes during jobs.

Actual THIS-CHAT MCP driver_status responds, APIv2/app2.42304/CLI2.1.299, but loaded
source78678a25... vs current982ab2f... and restartRequiredtrue; it lacks newer route
health fields. Connection exists; current feature adoption is NOT established.
Keep one final client refresh gate rather than requesting mid-development restarts.
Claude/Codex filtered fixture contracts last passed on pre-fix3e6c source, not982.

NEXT: reassess remaining ordinary grouped/lifecycle/window/person paths and the
both-absent bootstrap/natural-pressure/final MCP gates. Current ordinary interrupt
is now qualified; do not repeat its messages or old standalone stop/archive tests.
Goal ACTIVE. Native and synthetic handles terminal, target/controller live idle.
Codex-driver work stays parked and 1Password separate.

## October 17 account-store admission and project cleanup safeguards

Previous turn = progress (ordinary interrupt native982 + same-source integration).
Project archive audit found its batch still legacy-dependent and two safety gaps:
generic selection could include independent service actors, and folder cleanup
could follow partial saved archive success. Added project-archive-control:
exclude configured legacy/caller/management-primary/retained-standby identities in
dry-run and actual selection, report excluded identities, require EXACT complete
unique archived target set before cleanup. Partial saved success now yields
outcome_unknown with archived/notArchived/folderDeletedfalse; no folder removal.
Dry-run/scratch/user override/delete_folder gates remain intact. No new deletion,
archive or sidebar authority. Native project batch routing remains NEXT work.

Audit also found ordinary binding hashed target account/org store but never
compared it with controller store. Added ordinarySessionsSameStore: exact controller
identity and app record store must match. Check before maintenance, repeat while
maintaining, and independently check actual target/controller records at native
PreToolUse. New requests retain nativeSessionControllerStoreHash; admission retains
controllerStoreHash and receipt review requires agreement with exact target binding.
Historical requests lacking the new field retain their original exact shape; no
retroactive proof invented and old settled histories remain reviewable.

All ordinary maintenance now requires current source before this new account-proof
request shape. Direct ordinary native read preflight refuses mismatched source.
Old loaded hooks cannot silently dispatch then omit the account proof. Renewal
retains existing roles/grants/epoch; foreign/unverified accounts refuse BEFORE
maintenance/native effects. Installed native982 remains historical this turn;
no native source update or message required for this interim source gate.

Focused33 PASS (project/account + actual isolated MCP regression), ~12.8sec. The
actual archive_project fixture returns native success but leaves one target saved
unarchived: cleanup refused and work canary remained. Focused26 receipt/history/
maintenance PASS; changed JS syntax/diff pass. Old native same-account results are
not negative cross-account gate proof; that new boundary is currently synthetic.
No real project archived, folder deleted, app restarted, CUA/permissions changed,
new chat/message or full suite repeated. Goal ACTIVE; all test handles terminal.

NEXT concrete step: durable project batches via independent archive per exact
preselected target with distinct retained IDs, sequential failure-stop and no
cleanup until every saved postcondition is proven. Keep current service actors
excluded. Group/window/person/both-absent/pressure/final loaded-MCP gates remain.
Codex-driver stays parked; 1Password separate.

## October 17 durable independent project archive batches

Previous turn = progress (account-store admission and safe cleanup). Durable
archive_project without explicit alternate route now selects the independent
controller, retaining existing dry-run/scratch/user override/excluded-service gates.
Bounded128 unique exact targets, stable distinct contexts parent+session, private
project-archive-routes ledger. Whole account/folder/identity/protected-actor set
checks before first effect; repeat per target. Calls public archive_session
sequentially; each native receipt and saved archived state must verify before
next. Already-archived targets get no fabricated native receipt and still require
saved verification. Unknown/failed/pending/cancelled/moved/foreign effects stop
remaining targets with original IDs, prior verified archives and no replay/cleanup.
No new permissions/sidebar rights. Synchronous/explicit alternate paths retain
legacy behavior; native batch qualification remains pending.

Cleanup additionally refuses ANY retained service directory under the folder,
including aliases (even when service actors were excluded from archive selection).
Invalid delete_folder ownership refuses BEFORE native effects. Recheck current
registry ownership and fresh active session inventory before removal; a newly
created/unarchived record after initial selection prevents cleanup. Existing
explicit delete_folder authority stays required and limited to driver-created
temp/probe folders. No deletion method or native approval is bypassed.

Focused28 PASS (~12.7sec) project batch/policy + actual isolated MCP regressions;
final focused8 PASS after fresh-inventory guard, syntax/diff checks pass. Fixtures
prove partial saved archive cannot delete work and invalid cleanup dispatches no
archives. No REAL project archived or folder deleted, no new chat/message/native
renewal/CUA/app restart. No full suite repeated this interim gate. Core batch code
was included by another shared-master client in1c7cd4d (required shared add-A),
not lost; remaining guards/docs checkpoint separately. No unrelated edits undone.

NEXT: audit grouped ordinary operations and remaining lifecycle/window/person
interfaces, then consolidate final-source integration/native qualification gates.
New project batch/account-store proof need native qualification together when
appropriate; don't archive user projects to prove activity. Both-absent recovery,
natural pressure and final THIS-CHAT loaded-MCP adoption remain open. Goal ACTIVE;
all test handles terminal. Current native controllers remain on older982 source
until automatic required-source renewal; no manual wake/restart. Codex-driver and
1Password remain separate.

## October 17 frozen archive-only project jobs and native account proof

Previous turn = progress (independent project batching). Planned native gate's dry
run selected ONLY owned controltarget8f1... under its driver-state folder, no gates,
wouldProceedtrue. First submission refused BEFORE job/native effects because
archive_project remained scheduler-excluded: previous durable branch was unreachable.
That refusal is preserved in project-native-account-20261017.json, not relabelled.

Corrected scheduler boundary CONDITIONALLY: background project jobs require explicit
dry_run:false, archive-only (delete_foldertrue remains forbidden), no alternate
route and configured independent controller. Submission runs current dry-run gates,
freezes exact folder/controller/account bindings/target IDs/service exclusions in
job metadata. Idempotent reattachment keeps original snapshot. Worker rechecks
current gates and exact snapshot before any effect; inventory/account/controller/
exclusion drift refuses, not retargets. Worker ALSO revalidates archive-only flags
independently of stored snapshot. Foreground cleanup stays separately gated; no
background folder deletion or approval-card bypass is introduced.

Native gate on99e780865c3fd4cb6ede8d51aff0017f635987b703f523fe1927f20bd230e9a3:
new archive_project jobj50ee461cfbd945ed8d318f3942c4b0e8 completed via frozen
independent parent; exact childjda626793334c13f3d06ffde0a3e810a6/native request
rpeerda626793334c13f3d06ffde0a3e810a6. Saved archivedtrue independently read BEFORE
restore. Actual native admission includes controllerStoreHash matching target
storeHash, same exact target. Automatic required-source renewal produced CURRENT
PRIMARY service750877f7733b4a95bf05735881d5a93d, PID96436/startSunOct18 00:42:30,
readiness/policy verified, fresh familyrpeercf715ee7fe13f8288dbf31b2e0da1d3d.
Controller idle, unresolved IDs empty. Native store-bound positive scope now proven.

Restorejc4ad68428bea48dbb4a39c9dce084374 via TierA deep link: independent title/
titleSource/model/effort/permission/archive/pin baseline restored. Target has NO
live peer afterward; this is saved restoration, not unattended startup proof.
FolderDeletedfalse, no folder removed. No user projects/ProDevs/new chats/messages/
CUA/keyboard/auth/permission or app restart. User's current Browser foreground was
restored by normal focus semantics; don't claim a fixed Codex foreground.
Evidence .runtime/state/project-native-account-20261017.json, qualificationtrue
scoped to ONE-target archive-only batch, same-store proof and saved restoration.

Same-source99 integrated synthetic1/1 PASS36.1sec, sourceUnchanged:
pressure/v2-2026-10-18T03-28-12-122Z.json. Focused31 preceded native gate. After
that integrated run, added worker-side archive-only revalidation and an actual
isolated MCP refusal test: focused32 PASS (~12.8sec). This narrow final guard is
newer source; don't call the99 report final-source blanket proof. No native rerun
for a guard that leaves the tested non-destructive request unchanged.

NEXT: consolidated original-scope audit and remaining ordinary group/lifecycle/
window/person, both-absent/pressure/final loaded-MCP gates. Multi-target native
project batches remain unqualified by this one-target proof (synthetic sequencing
covers multiple targets). Avoid repeated scratch archiving/messages. Goal ACTIVE;
all job/test handles terminal; controller idle, target dormant after restoration.

## October 17 immediate next: automatic renewal left standby enrollment stale

Final read-only audit AFTER the native project gate found actual primary service
750877f7733b4a95bf05735881d5a93d, but retained automatic standby enrollment still
names predecessorc5fbfd1706384ac68e8b07dd5538682a and familyc539... (digest9e08...).
Renewal ledgerj750877... standbyRefresh.phase=not-enrolled, qualifiedfalse,
category=standby-refresh-unqualified; fresh familycf715... receipt exists and is
settled, but enrollment CAS did NOT complete. Do NOT claim current pair failover
qualified from successful public archive or the earlier c5 refresh. Native primary
is idle/verified/no unknown requests; archive/account proof/restored baseline remain
valid. Diagnose this changed-condition renewal/rebind failure FIRST next turn;
no duplicate family call/wake/replay or app restart to hide the retained failure.
Goal active; this is agent-executable investigation, not a user permission blocker.

Integrated synthetic gate on the same 034aee... source: 1/1 PASS in 39.0 seconds, sourceUnchanged; pressure/v2-2026-10-18T03-34-54-384Z.json. This does not expand native or loaded-client qualification.

Same-source cc707991544f36ebbe1abbc9d91a09368a560df1a270b56c704a3cd64e7a8699 integrated synthetic gate: 1/1 PASS, 34.2 seconds, sourceUnchanged; pressure/v2-2026-10-18T03-36-27-652Z.json. No native creation/fork claim.

Focused gate on source673aae502955f073ac7215f524417010cd65f57e5cf4c5cc01ed28f78331fa2d: 87/87 PASS in12.7sec (import/focus/creation followups/v2/MCP). Private log tiera-import-focused-20261017.log. No full-suite or native repeat for this interim gate.

Stable-source91c5bbf9963effa2ab1a5a00699fb251c1c72372021ff1ffa1e23deb71ea3201 focused42/42 PASS12.8sec, offline-read-abandonment-stable-focused-20261017.log. First stale-source failure log preserved separately; full suite deferred to consolidated gate.

Integrated current86d5 gate: all160 test files passed in35.3sec,1/1 round, sourceUnchanged; pressure/v2-2026-10-18T03-56-45-280Z.json. Aggregate hashed evidence .runtime/state/consolidated-harness-gate-20261017.json binds both actual harness reports and suite to identical source; loadedMCP adoption remains false.
