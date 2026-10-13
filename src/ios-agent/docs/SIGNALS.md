# iOS agent compact signals

The host signal log records transitions and terminal outcomes for debugging an iOS agent request. It is metadata, not a transcript or proof that a phone action took effect. Emit once at admission, dispatch, accepted/unknown result, independent verification and cleanup where those boundaries exist. Do not emit on each heartbeat, poll, snapshot or retry loop iteration. Coalesce repeated failures at the caller.

## Host APIs

```js
import {emitSignal, withSignalContext, readSignals, signalContextEnvironment} from './mcp/signal-log.mjs';
await withSignalContext({requestId, sessionId}, async () => {
  emitSignal('mcp', 'input.dispatch', {tool:'ios_action', action:'tap', dispatched:true});
  // Pass signalContextEnvironment(process.env) to an existing child process if it needs correlation.
});
const page = readSignals({scope:'mcp', traceId, limit:40, after:previous.nextCursor});
```

```python
from signals import emit_signal, signal_context, signal_context_environment
with signal_context(requestId=request_id, sessionId=session_id):
    emit_signal('host', 'input.accepted', action='tap', outcome='accepted', inputSent=True)
    # Pass signal_context_environment() to an existing child process if needed.
```

The Python emitter also reads a bounded `IOS_AGENT_SIGNAL_CONTEXT` from its environment. `signal_context_from_environment()` can expose its scrubbed contents to code that needs them. Context never implies that two independent observations share a causal span; propagate only IDs already known at the boundary. JS uses `AsyncLocalStorage`; Python uses `ContextVar`.

Both emitters return `true`/`True` when one record is written and `false`/`False` on rejection or a logging failure. They never print, throw, perform network I/O, or change the outcome of the control operation. There are no runtime dependencies beyond Node/Python standard libraries.

`readSignals(options={})` returns `{text, count, nextCursor, truncated}`. `text` is newest-first, one line per signal, with `time scope.event level=... key=value`; an event already prefixed with its scope prints once. IDs over 20 characters show an eight-character prefix and six-character suffix. Pass `nextCursor` back as `after` to read an **older page**, not to subscribe to future signals. Filters: `scope`, `event` prefix, `level`, `tool`, exact `traceId` or `sessionId`, and ISO UTC `since`. `limit` defaults to 40 and caps at 100; `maxBytes` defaults to 12,000 and caps at 24,000. The reader accepts no filesystem path. An invalid cursor returns `invalid cursor` with zero records. Cursor validity lasts only while retained records exist.

## Record contract

JSONL rows have `v:1`, UTC `time`, random row `id`, `scope`, dotted `event`, `level`, and selected metadata. Scopes are `mcp`, `browser`, `host`, `native`, `kck-native`, `kck-web`, `kck-call`; levels are `info`, `warn`, `error`. JS and Python use the same names and limits:

| Type | Allowed fields |
| --- | --- |
| Bounded words | `action`, `code`, `errorCode`, `errorName`, `fromState`, `kind`, `op`, `outcome`, `phase`, `previousRoute`, `provider`, `reason`, `route`, `stage`, `state`, `strategy`, `surface`, `toState`, `tool`, `transport`, `version` |
| Correlation / build IDs | `backendEpoch`, `bootId`, `buildId`, `clientEpoch`, `documentId`, `epoch`, `frameLoaderId`, `leaseFingerprint`, `observedDocumentId`, `ownerId`, `pageId`, `requestId`, `sessionId`, `sourceHash`, `sourceStream`, `traceId` |
| Nonnegative numbers | `acceptedCount`, `attemptCount`, `bytes`, `cleanupFailures`, `count`, `domainCount`, `dropCount`, `droppedCount`, `drops`, `durationMs`, `edgeCount`, `eventCount`, `failedCount`, `frameCount`, `gaps`, `nodeCount`, `participants`, `received`, `retryCount`, `sent`, `signalCount`, `sourceAtMs`, `sourceSeq`, `truncatedCount`, `workerCount`, `workersInitialized` ; `statusCode` only from100 to599 |
| Booleans | `breakpointRemoved`, `dispatched`, `enabled`, `inputSent`, `muted`, `pauseObserved`, `present`, `ready`, `released`, `resumeConfirmed`, `terminated`, `truncated`, `verified`, `visible` |
| Error evidence | `message`, `detail` (160 characters), `stack` (240 characters) |
| URL | `url`, reduced to origin class and pathname template |

Aliases `trace`, `request`, `session`, `owner`, `page`, `build`, `boot` normalize to the corresponding `*Id` field. `routeName`, `previousRouteName`, `operationName`, and `errorCount` normalize to `route`, `previousRoute`, `op`, and `count`. `lease` and `leaseId` become a twelve-hex SHA-256 `leaseFingerprint`; the live lease value is never stored. A precomputed twelve-hex `leaseFingerprint` may be passed directly. A queued browser/native signal can carry `sourceStream`, `sourceAtMs`, `sourceSeq`, and `droppedCount`; `time` remains host ingestion time, and source clocks are not presumed synchronized.

Unknown keys, nested values, arrays and objects are discarded. `level` is a special top-level argument. Do not pass arbitrary request, response, error, page or provider objects. Extract only the listed scalars. `message`/`stack` are bounded and scrubbed, but callers should still prefer controlled error codes over text that could contain user content. Values containing credential markers, JWTs or long base64 strings become `[redacted]`. URLs lose host, query and fragment; path segments that resemble identifiers become `:id`. Raw payloads, text inputs, headers, signed URLs, enrollment fragments, tokens, cookies and image/audio bytes must never be provided as signal fields. If uncertain, omit the field. If optional fields would push a record past 1,200 bytes, less important error detail is omitted while core outcome and correlation fields remain.

## Storage and cost

Files live under `~/Library/Application Support/ios-agent/signals`, in a mode `0700` directory with mode `0600` regular JSONL files. Writers use their own files, rotate at 128 KiB or 24 hours, and prune by age (seven days), aggregate bytes (2 MiB), and file count (256). Cleanup occurs on new writes and reads, so an idle installation can retain an expired file until the next use. The reader ignores symlinks, oversized files, malformed or partial lines, and files outside the fixed signal directory; it reads at most 2 MiB of retained data. Each emission performs one small synchronous append. Emit only at meaningful boundaries so logging remains inexpensive and does not amplify polling traffic.

For isolated fixture runs, a process may set absolute `IOS_AGENT_SIGNAL_STATE_DIR` before loading either module. It replaces only that process's state root. It is not accepted in reader options or MCP arguments.

Example read lines:

```text
2026-10-11T18:00:00.000Z mcp.input.dispatch level=info requestId=aa118833…ff0011 tool=ios_action action=tap dispatched=true
2026-10-11T18:00:00.140Z host.input.result level=warn requestId=aa118833…ff0011 outcome=unknown reason=provider_deadline inputSent=true durationMs=140
```

## Agent entrypoints

Use `ios_signals {traceId: signalRequestId, limit:40}` after an MCP result or
error. `signalRequestId` is returned with admitted tool results and refusals; SDK
schema rejection before handler admission has no service trace. The read tool
works without a phone lease and while a control request is in flight. It emits
no new signal for its own reads. Resource: `ios-agent://signals`.

CLI: `/Users/taylor/dotfiles/bin/ios-agent-signals --trace <exact-id> --limit 40`.
Use `--scope kck-call`, `--event browser.command`, `--level error`, `--since`,
`--after`, or `--bytes` to narrow it. `--json` returns the bounded text page and
cursor metadata, not raw records. A repeated trace/request ID is displayed once.
Outcome and reason precede correlation fields; routine lines cap at600characters
and error lines at1000, with a visible ellipsis for trimmed read views. Storage
remains scrubbed and bounded independently.

Refresh existing MCP connections for1.10.1; reload the enrolled page or native JS
bundle to load its new hooks. Restart the Python broker only through the documented
installer at verified idle. Logging fixtures are not physical phone acceptance.

## Reading a failure trail

Start with the tool’s `signalRequestId`, then filter by `traceId`. The MCP
request ID crosses the existing CLI-to-broker request and is retained on queued
commands for their later dispatch and terminal reports. The broker command ID is
a distinct `requestId`; a shared `traceId` links the two. A live lease capability
never serves as a logged session ID: it becomes a one-way `leaseFingerprint`.

Independent queued page/native events retain page or boot/stream identity and
source sequence/time. Merely arriving with a command-result batch does not make
them descendants of that command. Native events drain on an existing state read;
a late event can remain in the32-record phone queue. Reloaded code and the next
owned workflow activate the new app hooks; no phone run was performed for1.10.0.

| Area | Useful signal boundary |
| --- | --- |
| MCP | Admission/refusal, exact request trace, provider selection, accepted/unknown outcome, verification, cleanup |
| Host | Bridge freshness/foreground, queued/dispatched/reported command, guarded recovery, build/delivery and XCTest startup/stop |
| Browser | Enrollment/resume, document fencing, connection loss/recovery, command terminal outcome |
| Inspector | Target discovery/attach, protocol deadline phase, capture counts and detach/cleanup |
| Native app | Registration, static route/app lifecycle, terminal Apollo failure and independent operation response |
| Web app | Bootstrap/router/proxy gates and recovery; optional server sink shares this store |
| Calls | Permission state and actual track separately, room/phase changes, transport selection and terminal count summary |

Repeated client/host boundaries are retained only when they supply distinct
evidence. The duplicate SDK command-executed line was removed; the broker’s
terminal report remains. Read-only host state polling, per-render state equality,
packet progress and ordinary heartbeats are quiet. Observer errors retain the
fixed failing phase, class and reason; MCP errors include scrubbed bounded frames.

Server proxy signals reuse this writer through an optional local Node import.
If unavailable, they use compact Next console fallback instead; those console
lines are **not** included in `ios_signals`. A failed SDK cannot flush its early
eight-record queue; proxy logs are the independent server evidence. A missing
retained line is not proof that an operation never ran: retention, queue overflow,
old connections/code and unavailable sinks remain possible. Read the reported
bounds and source identity before inferring cause.

##1.10.1 postmortem improvements

Use `ios_signals {view:"summary", since:"<UTC ISO time>"}` or `ios-agent-signals --summary --since <time>` before drilling into a trail. Summary aggregates all matching retained rows (subject to the bounded2MiB/256file/7day store), ignoring the event-page limit. `after` still restricts it to older rows; summary has no cursor. It shows levels/outcomes, browser commands lacking trace and eight recent notable records, including historical info-level rejected/unknown outcomes. Counts are records, not unique operations or complete workflow proof. Text obeys maxBytes; structured summary contains only bounded counts and time bounds.

Guide/status now compare loaded connectionVersion with installedVersion; guide also reports workerRelease. Existing clients must reconnect to load these checks. `connection.outdated` is advisory and coalesced per installed version, never a control refusal or process termination. `host.request.uncorrelated` identifies absent request lineage at acquisition/mutating input, coalesced per operation per60seconds; it can also mean a direct CLI client, not necessarily an old MCP. Host rejection and page rejected/unknown terminal rows warn. New MCP terminal rows preserve fixed error reason.

`browser.handoff_released` records an intentional `ios_web_end home=false` detour; it is not a Home request. See POSTMORTEM-1.10.0.md for observations and remaining physical gates.

Only the exact fixed reason/code/errorCode values xctest_authorization_failed and xctest_authorization_timed_out bypass keyword scrubbing. They describe Apple gates and contain no credential. Arbitrary authorization strings and credential-bearing messages remain redacted. Runner startup gates/unconfirmed stop now warn.

Run MCP fixtures with `npm test` (or `npm test -- test/<file>.test.mjs`). The test runner sets a fresh disposable IOS_AGENT_SIGNAL_STATE_DIR before Node loads any modules. Direct node --test or Python unittest invocations must also set this variable to a temporary directory; never write fabricated results into the live store.

## 1.10.2: separate real failures from expected handoff cleanup

Media verification terminal rows include kind=sent/received/both and a fixed failed predicate reason. system.inspection_completed records the inspection kind, presence and node count, never labels/content. lease.release_reconciled means only the exact last retired capability is already inactive, not global device idle. Unknown or mismatched releases still warn. Normal non-Codex connection ownership is info; claimed invalid Codex context still warns. Missing host context includes a fixed action name to investigate the unreproduced native handoff trace gap. browser.cleanup_unconfirmed retains unknown severity and a fixed last-feedback category. Captures and timings retain their existing bounds.

## 1.10.3: independent browser launch and retained context

provider.selected for managed_browser_open includes the chosen lane and fixed selection reason. Browser launch/cleanup remain separate from native readiness. wifi.recovery_requested records accepted/unknown fixed On handoff without claiming actual Wi-Fi state. Relay startup inherits correlation; each retained request replaces it with current request context, and Python broker calls use current context rather than stale environment alone. system.provider_failed includes the fixed failing phase; runner-status polling failures are coalesced. system.session_requested/ready/unconfirmed distinguish provider creation, and request.completed uses outcome=pending for unfinished startup. No labels, URLs, capabilities or payloads are added to logs.

## 1.10.4: recoverable startup and short-lived writer retention

Passing verification has no failure reason. A cold owned runner's unavailable /status is a coalesced system.startup_wait outcome=pending at info level; non-startup provider errors and expired startup still warn. system.runner_ready carries the owning session, elapsed startup duration and status-read count. system.session_requested is dispatched; only an unconfirmed creation response is unknown. Concurrent startup inspections share one in-flight continuation and cannot send duplicate session creation. system.inspection_completed includes permission/alert/tree kind, alert/tree-fallback stage, read duration and visible-node count without labels or content.

Short-lived clients now share the same2MiB/7-day limits across up to256 private writer files, instead of32. This reduces premature evidence loss from process churn without increasing payload or byte retention. An idle writer whose file was pruned starts a new private file before its next append. The count, byte or age bound can still expire evidence early; neither summary nor row count promises a complete history. Summary includes storage.retainedFiles/retainedBytes and fixed limits (for the whole store, regardless of filters), so agents can see count/byte pressure. Save a bounded evidence snapshot before analysis and compare its count to the consumer's saved summary.

## 1.10.5: cross-session usage and discovery churn

Catalog-only connections and signals-only readers do not emit connection.started.
The first ordinary tool call creates it. This removes the observed 222 singleton
files from future catalog churn without raising retention bounds. Old bounded
history may already have been pruned; no completeness guarantee is added.

Record connectionId from ios_guide. Filter ios_signals connectionId=... or use
`ios-agent-signals --connection <16-hex-id> --summary --json`. The same fixed ID
travels through Node/Python request context; it identifies one MCP connection,
not a person or every reconnect in a consumer workflow. Old rows lacking it stay
visible and are counted as requestsWithoutConnection.

summary.operations deduplicates retained MCP request.completed/failed/refused
by traceId (legacy rows without trace use row ID). It reports terminalRequests,
distinctConnections, requestsWithoutConnection, and at most 12 tool groups and
12 failure groups. Tool groups carry calls/failed/unknown/pending and P50/P95/max
milliseconds where durations exist. Quantiles describe retained completed reads,
not complete service SLOs; unknown delivery is separate from confirmed failure.
Text displays up to six tool groups, followed by bounded notable records.

Managed-open failures preserve phase=page_readiness and underlying launchReason
as errorCode in signals. Provider launch retains its original failure phase;
secondary cleanup failures do not overwrite the first error. A readiness timeout
never replays a launch or chooses another lane. Fresh replacement-document
cleanup ends its obsolete wait immediately and stays explicitly unconfirmed.

Native idle receipts retain deadline_exceeded and add failedPredicate when the
last typed observation identifies the missing condition. Browser/system callers
should use host-idle for host ownership and independently inspect page glow,
media release and Home. host.check_failed names each failed fixed prerequisite;
request completion has host_prerequisites_incomplete. No credentials or request
payloads are added.
