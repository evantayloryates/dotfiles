# claude-driver findings

Dated, newest first. Each entry: what was observed, the evidence, and n
(independent observations). Promote a pending learning
(`<state>/pending-learnings.jsonl`) here only after re-verifying it.
Versions: app = Claude desktop, cli = bundled Claude Code.

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
  at 04:03:10.919Z reused job922e4a9e with no creation and preserved PID71262.
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
