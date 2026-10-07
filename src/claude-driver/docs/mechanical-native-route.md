# Deterministic native execution candidate

October 7, 2026, 04:57 Eastern. Native diagnostic read proof, not a public transport.
The broker remains on its existing sealed dependencies and admission hooks.

## Experimental shared metadata execution — 05:51 Eastern

`broker_read_batch` turns the diagnostic get_session mechanism into a bounded
opt-in CLI/MCP API integrated with existing durable jobs. It is not a generic
mutation dispatcher. Actual current-source77441d1d native09:51:15 passed one
job shared by two MCP harnesses after publisher exit, two native reads for three
requested targets, correlated host finish, exact settings restoration and
idempotent completed reattachment. Total5130ms with one short trigger turn;
the native hooks perform tools without model selection. Cancellation/fault/expiry
pressure remains required before broader use; broker servicing/guarded mutations
and deployment gates remain distinct. SDK source87405bcd's createProxyServers
calls the actual handler directly; direct hooks do not inherit our assistant
PreToolUse checkpoint gate.

## Service-owned native idle observation — 05:41 Eastern

The observer now detaches its private listener after durable publication and
records the eventual notice in a private mailbox. Caller cancellation/deadline
ends only that wait; a different harness can adopt the receipt after the first
publisher exits. Actual native09:40:47 passed that three-harness lifecycle with
one observation in1170ms on source2b8697ed, with zero model events. Isolated
tests also cover pipe closure before ACK and actual publisher process death.
Native subscription debt remains conservative if the service helper itself
fails. This does not keep the broker resident or qualify general serving.

Public `broker_idle` now exposes the reviewed native control subscription with
private authenticated IPC, kernel PID/UID verification and durable per-epoch
ownership. Two independent MCP harnesses shared one observation in the actual
already-idle probe09:31:04 (1073ms, no model events). The fresh probe09:32:14
passed in4538ms with one short tool-free diagnostic turn, correlated native
peer/reply ancestry, matching finish timestamp and one shared observation.
Reports are `native-idle-service-2026-10-07T09-31-04-547Z.json` (6e49b9ac) and
`native-idle-service-2026-10-07T09-32-14-381Z.json` (cbef2bce). Observation has
zero inference; fresh diagnostic triggering uses one model turn.

Cancellation/unknown publication retains native subscription debt until
delivery or reviewed12h expiry; closing the owned listener cannot cancel the
native subscription. Stale finish timestamps remain distinct from fresh host
completion. This does not qualify general request execution, queue quiescence,
historical effect settlement or release handoff. Those remain separate gates.

## What the installed engine actually does

`node src/claude-driver/scripts/hook-contract-v2.mjs` extracts bounded source
windows from the installed Claude CLI and executes its exact MCP hook runner,
input interpolation, file-watcher lifecycle and SDK emission functions with
synthetic dependencies. The installed 2.1.289 contract passed 18 cases in
`<state>/pressure/hook-contract-2026-10-07T08-22-12-618Z.json`. This performed no
desktop IPC, live MCP calls, inference, native writes or settings changes.

The runner calls a connected server's tool directly. There is no model deciding
which tool to select inside that function. It returns actual tool text, charges
connection wait against the execution budget, and reports disconnected, withheld,
deadline, cancellation and tool-error conditions. Its exact input interpolation
recurses through strings, arrays and objects. Connection classification, signal
helper, cgroup release and account-memory policy remain synthetic dependencies.

Four constraints change the deployment strategy:

1. **Activation requires evidence.** The installed watcher initializes once.
   When its initial hook snapshot has no FileChanged/CwdChanged hooks, adding
   settings later neither subscribes it to settings changes nor creates a
   watcher. Calling initialize again while initialized returns immediately.
   An explicit watch-path update can create a watcher. If it already subscribed,
   a settings-change callback disposes it; updates after disposal do nothing
   until a later initialize. Tests exercise this lifecycle, not a live reload.
2. **Observational events do not wait for connection.** FileChanged with a
   pending MCP server returns an error without invoking or waiting. A configured
   hook is not evidence that CCD's internal session server is connected in this
   event context.
3. **No durable duplicate suppression.** The actual matcher collapses identical
   MCP configurations within one event. Its key ignores timeout and distinguishes
   JSON input key order. This does not deduplicate durable requests. Two identical runner invocations make
   two tool calls, and two watcher notifications produce two event invocations.
   A file change is not an exactly-once request transport. Hook order cannot
   substitute for an admission gate.
4. **SDK emission and journal persistence differ.** The installed SDK emission
   filter sends SessionStart/Setup hook responses by default; Stop/FileChanged
   need the separate all-events mode. Whether this exact native process enables
   that mode has not been verified. Actual native Stop probes subsequently proved
   that CLI journal `attachment` records preserve genuine hook-success results
   independently of this SDK filter. FileChanged journal persistence is still
   unqualified. Existing assistant tool-use/checkpoint
   correlation does not collect direct hook calls. A command observer marker
   proves that command ran, not that an adjacent MCP hook succeeded.

The extracted runner contains no call to the existing service PreToolUse
admission implementation. That is a local source observation, not proof that
the entire native host lacks permission checks. Do not route mutations through
it until the actual host path enforces request ownership, expiry, cancellation,
STOP and duplicate admission, and produces a correlated native result.

The installed script-hook implementation explicitly throws that script hooks
are unavailable. Do not propose a script-hook dynamic dispatcher for this build.
The inspected desktop CCD proxy creates in-process SDK servers; the inspected
peer inbox does not route generic SDK control requests. Neither observation
establishes that every possible app API has been exhaustively ruled out.
`desktop-native-route-source-2026-10-07.json` records app versions and the two
inspected chunk hashes; `peer-contract-2026-10-07T08-22-12-959Z.json` preserves
the installed peer dispatch tests.

## Actual native read proof

Three bounded temporary Stop probes targeted only the exact existing owned
fixture/broker in the same PID/start epoch. One short no-tools broker turn
triggered each event; fixed hooks selected the MCP tools directly. Core hooks
were preserved and settings/policy restored byte-for-byte. Native versions,
peer nonce, command witness, causal terminal chain and real hook-result
attachments were independently bound. No generic mutation hooks were installed.

- The initial export report `native-hook-export-2026-10-07T08-30-00-721Z.json`
  remains failed because observation omitted metadata attachment ancestry.
  Independent reconciliation `native-hook-export-reconciliation-2026-10-07.json`
  proves the actual native export succeeded and records the captured archive
  hash, with no raw transcript text. The earlier guessed-filename comparison
  was invalid; preserve both original artifacts. Source a66eaecf.
- `native-hook-export-2026-10-07T08-35-35-106Z.json` passed one direct
  get_session read on c74317f0, with actual archived/unpinned fixture metadata.
- `native-hook-export-2026-10-07T08-37-41-302Z.json` passed two distinct
  get_session reads on bbb33c19. About3.6s from probe start included1.5s settings
  wait. Both native results and distinct target identities were verified. One
  model turn triggered the batch; tool execution and collection had no inference.

Both batch attachments share native `toolUseID`: this is the Stop event ID,
now named `hookEventId`, not a unique operation slot. Receipt identity uses each
attachment UUID. Historical reports' `hookRunId` label remains historical data.
The private collector accepts only fixed diagnostic read tools; public causal
observation emits only attachment IDs/parents, never command/stdout/content.
Native hook-error attachments can occur before invocation and do not alone
establish that a tool ran.

Ordinary requests refuse a pending diagnostic before publication. Abandoned
expired probe settings can restore only under the broker lock in their exact
idle intact epoch, without STOP/arm/quiet owner and with matching current bytes.
These recovery boundaries have isolated tests, not live crash/kill injection.
Final5be50395 passed the full isolated suite in
`v2-2026-10-07T08-44-38-415Z.json`; later host guards do not relabel older native
passes as current-source native proof. No temporary probe remains installed.

## Native edge pressure and result-channel limits

`native-hook-export-2026-10-07T08-50-42-263Z.json` on a2cd9974 configured two
identical fixture reads plus an unavailable MCP context. It remains FAILED:
expecting two read receipts and a command-bound error was wrong. The exact
installed matcher explains one definition surviving; actual journal evidence
contains one real read and one error attachment in the same Stop event. See
`native-hook-read-edges-independent-2026-10-07.json` and its separate
`native-hook-read-edges-reconciliation-2026-10-07.json`. No replay was needed.

Commandless errors cannot become tool/operation receipts. The private collector
records `native-hook-event-error`, event ID and result UUID with
`commandBound:false`; stderr stays private and only its hash enters reports.
Proved receipts extend private batch ancestry when they arrive after a public
scan. Identical definitions within an event are distinct from repeated events:
the latter still invoke again. Never treat native configuration matching as
canonical durable single-consumption admission.

`hook-contract-2026-10-07T08-57-11-072Z.json` passed26 exact installed-function
cases, including matching, output parsing, actual SessionStart consumer and
startup workspace guard. Dependencies remain synthetic, not live activation.
SessionStart paths can seed an initialized warm watcher; Stop cannot, and
SessionStart cannot initialize a cold watcher. Cancellation prevents seeding.
Remote workspace startup skips initialization; a local filesystem cwd alone
does not prove the native surface capability or watcher state.

Crucially, the installed FileChanged callback discards successful tool output;
it forwards only failures and system messages. A live watcher would therefore
need a separately verified result channel. No FileChanged candidate was enrolled.
An owned export could yield an independent artifact, but its rate/size limits
and internal queue snapshot semantics would need separate qualification.
Current bdb7a0d3 passed the full isolated suite in
`v2-2026-10-07T08-57-20-303Z.json`. Later collector changes do not convert the
original failed native run into a current-source native pass. Broker settings
were restored exactly and the owned fixture remains archived/unpinned/not live.

## Next native proof

Select trigger and genuine result channel together before enrollment. The next
event-only activation probe must be read-only and target only the exact existing
owned broker or fixture. It must have a nonce, a finite deadline, exact PID/start
and CLI-version binding, and durable sanitized evidence. Preserve Stop and
PreToolUse settings and policy hashes. Restore any temporary service settings
byte-for-byte only after checking current ownership; do not overwrite another
writer or a newly armed request.

Establish these separately:

- A real initializer or watch-path update registered the trigger in this native
  epoch. Merely writing settings/trigger files cannot count as activation.
- The event had connected CCD MCP clients and called the intended read tool.
- A genuine native result, including error when applicable, was captured and
  correlated to this probe. A callback marker or unchanged session readback is
  insufficient. Never manufacture an assistant-tool receipt for a hook call.
- Repeated trigger events, disconnection, deadline, cancellation and settings
  restoration preserve the claimed semantics before permitting any mutations.

Do not restart Claude, reset/compact the context, alter permissions/model/auth,
inject keys, create chats or enable broad SDK logging to manufacture the event.
Natural lifecycle events may supply activation, but must be observed. Until an
activation/result channel is proved, an inert live FileChanged installation
would add uncertainty without improving the bridge.

Source extraction is shared with the existing peer contract through
`lib/installed-source.mjs`: bounded small modules or unique marker windows,
source hashes and offsets, regular-file checks, and refusal on ambiguous/missing
markers or binary changes during reading. The corresponding test exercises
chunk-boundary extraction, large-module window fallback and drift refusal.
These are version-specific diagnostics, never supported runtime APIs.

The [official hooks reference](https://code.claude.com/docs/en/hooks#mcp-tool-hook-fields)
describes direct MCP hooks and connection availability. Its
[FileChanged section](https://code.claude.com/docs/en/hooks#filechanged) describes
watch seeding, literal paths and output limits. Installed source/actual native
evidence must decide what this desktop build supports.
# Native broker snapshot checkpoint — October 7, 05:06 Eastern

The owned broker export at09:01 UTC has genuine Stop-hook result and exact
broker/CLI archive metadata proof. Preserve original FAILED observer report
native-hook-export-2026-10-07T09-01-45-570Z.json; its SID-in-return assumption was
wrong. Independent fixed-range journal/hash and archive reconciliation lives in
native-broker-snapshot-reconciliation-2026-10-07.json under service pressure.
Self-export returns the filename without SID; a filename alone is not target
proof. Corrected parser retains separate owned hook, log and ZIP identity gates.

Snapshot isRunning:false occurred with cliProvablyIdle:false and both turn-result
and boundary flags false. Stop-time observation cannot authorize release.
Sanitizer exposes only flags/counts/marker presence, no queued content, and
releaseAuthorized is always false. Missing/null fields remain unknown pending
installed-version semantic qualification. Snapshot/native proof source49c1811d;
later parser correction has isolated checks only. No mutation/handoff deployed.
# Native idle and export semantics — October 7, 05:10 Eastern

`native-idle-contract-v2.mjs` executes the exact installed HC/BC/LC/RC/PC/wC/FC
functions and the exact shareSession snapshot expression with synthetic state.
Six checks pass in native-idle-contract-2026-10-07T09-09-13-745Z.json. This is
not a live observer or native dispatch test. The reviewed app source SHA is
b7c512ce6a9993a94b6b30e78f17cc088f0d148ec45475c6b3ae864162293327.

HC can be true with echoes older than120000ms still present, an expired
interrupt marker, or a feature-gated fresh interruption. It does not itself
inspect visible isRunning, nextCycleUuid, deferred sends, awaiting result,
tool activity or background tasks. A result boundary plus HC alone cannot
authorize operational retirement, handoff or replay of historical unknowns.
No live feature gate was inspected or changed.

Actual projection exports task maps, not integers, and null for absent queues
and false awaitingTurnResult. Source-pinned normalization now handles this
format without returning task keys/values or queued UUIDs. Missing fields and
unknown projection sources remain unknown/refused. A bounded ASAR reader pins
the exact source for native probe parsing; malformed/link/unpacked/truncated
entry cases refuse. Snapshot releaseAuthorized is always false.

Reprojection of the existing09:01 broker archive has queueStateComplete:true
and idleCandidate:false. Evidence native-broker-snapshot-projection-2026-10-07.json
records original report/archive hashes and both native/projection builds.
No fresh native turn was used or historical failure rewritten. Actual current
post-turn observation and safe handoff remain to qualify; do not substitute
this historical snapshot for them.
# Native peer idle control signal — October 7, 05:21 Eastern

The installed protocol has `control:notify_when_idle` and `peer_idle_notice`.
Unlike unsupported generic SDK controls, this route is actually implemented.
Headless startup subscribes its publisher to real sessionState transitions;
registration's mounted handler logs without enqueueing model input.
Six exact installed subscription tests pass in peer-idle-contract-
2026-10-07T09-16-38-124Z.json (synthetic dependencies). Debounce is750ms; queued
work or parked approvals hold back delivery. Same verified PID/reply address
refreshes; subscriptions expire after12h and delivery consumes them once.

`pressure-peer-idle.mjs --run-owned-idle-subscription` performs one native
diagnostic subscription on the exact approved PID/start, never model text.
It uses the existing private receiver key and an ephemeral reply socket in the
same owned namespace, without fake sessions or key publication. Its Python
listener checks sender PID using macOS LOCAL_PEERPID and UID using getpeereid,
then exact nonce/from/state/time. Private detail is reduced to presence only.
Cleanup verifies owned socket inode; cancellation does not claim native cancel.

Native passes09:18:31/09:20:20/09:21:51 each received the correlated reply in
about0.9s, with no user/assistant events. Latest source11f4c411 and helperf78deebc
are fingerprinted; pressure/native-peer-idle-2026-10-07T09-21-51-906Z.json records
actual kernel identity, native versions, reply and cleanup. The last host turn
finishedAt1791363709797 is4ms after the earlier real export result. An already
idle subscription reports that historical finish, not a new operation outcome.

This is actual zero-inference host signaling, not full queue quiescence,
invocation admission or correlated tool execution. Never retire/replay old
unknown effects or activate a release from this signal alone. No public generic
observer has shipped yet: durable pending ownership and a fresh busy-to-idle
native run remain to qualify. Listener timeout can leave a native subscription
until notice/12h expiry; do not repeat blindly. All actual probes above received
their one-shot notices and removed listeners. Isolated refusal/redaction/cancel
tests pass; active broker/settings/quarantine remain intact.

Python is now included in host and sealed bootstrap fingerprints. Preserve the
original09:20:30 failed suite exposing mismatched enumeration. Corrected full
suite09:21:48 passed before current-source native signal proof. No inference,
app restart, keyboard input, auth/permission changes or other-chat messaging.
