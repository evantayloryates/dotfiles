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
| Bounded words | `tool`, `action`, `op`, `kind`, `surface`, `transport`, `provider`, `stage`, `phase`, `fromState`, `toState`, `outcome`, `reason`, `code`, `version`, `errorName`, `errorCode`, `route`, `previousRoute` |
| Correlation / build IDs | `traceId`, `requestId`, `sessionId`, `ownerId`, `pageId`, `buildId`, `bootId`, `epoch`, `backendEpoch`, `clientEpoch`, `sourceHash`, `sourceStream`, `leaseFingerprint` |
| Nonnegative numbers | `durationMs`, `count`, `attemptCount`, `retryCount`, `acceptedCount`, `failedCount`, `frameCount`, `signalCount`, `dropCount`, `droppedCount`, `truncatedCount`, `sourceAtMs`, `sourceSeq`, `bytes`; `statusCode` only from 100 to 599 |
| Booleans | `dispatched`, `inputSent`, `verified`, `released`, `ready`, `truncated` |
| Error evidence | `message`, `detail` (160 characters), `stack` (240 characters) |
| URL | `url`, reduced to origin class and pathname template |

Aliases `trace`, `request`, `session`, `owner`, `page`, `build`, `boot` normalize to the corresponding `*Id` field. `routeName`, `previousRouteName`, `operationName`, and `errorCount` normalize to `route`, `previousRoute`, `op`, and `count`. `lease` and `leaseId` become a twelve-hex SHA-256 `leaseFingerprint`; the live lease value is never stored. A precomputed twelve-hex `leaseFingerprint` may be passed directly. A queued browser/native signal can carry `sourceStream`, `sourceAtMs`, `sourceSeq`, and `droppedCount`; `time` remains host ingestion time, and source clocks are not presumed synchronized.

Unknown keys, nested values, arrays and objects are discarded. `level` is a special top-level argument. Do not pass arbitrary request, response, error, page or provider objects. Extract only the listed scalars. `message`/`stack` are bounded and scrubbed, but callers should still prefer controlled error codes over text that could contain user content. Values containing credential markers, JWTs or long base64 strings become `[redacted]`. URLs lose host, query and fragment; path segments that resemble identifiers become `:id`. Raw payloads, text inputs, headers, signed URLs, enrollment fragments, tokens, cookies and image/audio bytes must never be provided as signal fields. If uncertain, omit the field. If optional fields would push a record past 1,200 bytes, less important error detail is omitted while core outcome and correlation fields remain.

## Storage and cost

Files live under `~/Library/Application Support/ios-agent/signals`, in a mode `0700` directory with mode `0600` regular JSONL files. Writers use their own files, rotate at 128 KiB or 24 hours, and prune by age (seven days), aggregate bytes (2 MiB), and file count (32). Cleanup occurs on new writes and reads, so an idle installation can retain an expired file until the next use. The reader ignores symlinks, oversized files, malformed or partial lines, and files outside the fixed signal directory; it reads at most 2 MiB of retained data. Each emission performs one small synchronous append. Emit only at meaningful boundaries so logging remains inexpensive and does not amplify polling traffic.

For isolated fixture runs, a process may set absolute `IOS_AGENT_SIGNAL_STATE_DIR` before loading either module. It replaces only that process's state root. It is not accepted in reader options or MCP arguments.

Example read lines:

```text
2026-10-11T18:00:00.000Z mcp.input.dispatch level=info requestId=aa118833…ff0011 tool=ios_action action=tap dispatched=true
2026-10-11T18:00:00.140Z host.input.result level=warn requestId=aa118833…ff0011 outcome=unknown reason=provider_deadline inputSent=true durationMs=140
```
