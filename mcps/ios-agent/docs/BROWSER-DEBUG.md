# On-demand browser Inspector

`ios_browser_debug` adds independent WebKit diagnostics for the configured
private DEV origin. It uses the existing pinned paired-device observer, without
XCTest or Mirroring. **Physical Safari and Chrome source/CSS/console and bounded combined-timeline reads passed nearby.**

## Choose the lane

Use `ios_web_*` for routine Tailscale page work on any reachable network.
Use this Inspector lane through the nearby Apple paired developer channel, or the
explicit tailnet transport described in DEVELOPER-TAILNET.md. Physical Safari/Chrome
reads over that overlay passed; physical off-LAN acceptance remains open. A live page
bridge alone does not prove developer transport availability.
This is especially useful if the DEV page fails before its SDK registers.
Fixed app launch also supports the configured tailnet developer lane; this debugger
does not provide trusted input, OS permission handling,
arbitrary full browser internals. Explicit heap graphs and one-shot breakpoint capture have their own heavier ownership gates below; dedicated-worker source/console/profiles are delivered; arbitrary worker evaluation and deeper interactive frame debugging remain optional extensions.

## Small, explicit operations

1. Call `ios_guide`, then `ios_browser_debug {browser:"safari",op:"sources"}`.
   The response contains a fresh `documentRef` and an artifact ID, not bulk source.
2. `ios_read {artifactId,pointer:"/result/pages/0/debug/scripts"}` lists source
   references. URLs omit user info, query strings and fragments.
3. Read one source window with `{browser:"safari",op:"source",documentRef,
   scriptId,startLine:0,lineCount:40}`. Lines are zero-based; at most 200 lines
   and 128 KiB of text are retained. A full-source SHA256 identifies the reading.
   A changed document or script absent from its catalog fails without replay.
4. `{browser:"safari",op:"styles",selector:"#your-control"}` captures matched,
   inherited, pseudo, inline and computed style data. Read one subtree at a time.
5. `{browser:"safari",op:"console",sampleMs:500}` captures buffered console
   messages plus the bounded live window. `{op:"trace",sampleMs:500}` records
   WebKit timeline events for 100–3000 ms. This is not calibrated page CPU or
   a JS sampling profile. Trace stop and domain disable must both succeed.

For Chrome choose `browser:"chrome"` and verify its own Web Inspector opt-in
and active DEV target. Existing Inspector attachments are never displaced.
A missing/busy/suspended target is a refusal; do not repeatedly try it blindly.

## Network details (1.9.9)

`{browser:"safari",op:"network",sampleMs:1000}` collects a bounded Inspector
Network window: request/response, cache source, transfer size, timing, protocol
and failures when WebKit supplies them. It does not refetch a resource, alter
caching, intercept requests or download response bodies. Use `ios_capture` for
explicit app-level response content. Existing long-lived requests may have no
initial request event during this window; optional metrics remain absent.
Read `/result/pages/0/debug/events` in the private artifact selectively.
An optional expression uses the same owned-page/document rules below.
Network.disable and socket detach must succeed even after lost ownership.
Physical Safari and Chrome network qualification passed; see browser-network-physical-2026-10-11.json.
Protocol: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Network.json

## Explicit evaluation

`op:"evaluate"`, or an `expression` during console/trace, additionally requires
this connection's active `ios_web_begin` session, matching fresh `documentRef`,
and the matching page's visible owned glow. Always `ios_web_end` in finally.
No eval occurs under a temporary observer owner. `userGesture` is always false;
this cannot authorize microphone requests or turn synthetic input into trusted
input. Console effects from explicit evaluation remain recordable. Promise
completion is not awaited. An exception is retained in the private result;
inspect it rather than replaying the expression.

## Capture and cleanup

Each invocation detaches its own Inspector socket and stops its receiver.
Enabled domains are disabled even after uncertain enable or lost ownership;
CSS uses fixed direct reads without change subscriptions.
an attempted timeline start always gets a stop attempt. A cleanup failure fails
the operation. Read-only calls without a session reserve and release a temporary
shared owner. An existing owner's work is never displaced.

Events cap at 1000 rows and 2 MiB; excess rows increment `droppedEvents`.
Final artifacts cap at 2 MiB, expire after one hour, and share the existing
128 MiB host capture quota. Expiry is pruned on access/new connection and by the
active MCP's five-second maintenance timer; it is not a new always-on recorder.
Full protocol responses/source can be larger transiently before windowing.
Use `ios_read` pointers; content never enters shared learning automatically.
Known password/token/cookie/authorization fields retain at most four leading
and trailing characters. Console/source text remains high fidelity by request;
this is a quick deterministic scrub, not a guarantee about arbitrary embedded
secrets. Files are 0600 in 0700 directories.

## Current evidence

Physical Safari qualification on 10 October passed source catalogs/windows,
matched/inline/computed CSS (531 properties, expected 18px fixture font), and an
explicit synthetic console warning under the owned glow. Trimming source-map
and provider extras before catalog admission produced zero dropped entries.
Direct CSS reads avoid CSS change subscriptions: CSS.enable/disable did not
answer on this phone. No stylesheet or product source was changed.

Fresh physical Chrome qualification enabled Settings → Content settings → Web
Inspector (previously Off), then restarted Chrome once. Source discovery found
407 scripts with zero drops; bounded source-window, CSS, console warning and
combined timeline effect/readback passed. Safari combined timeline effect also
passed after physical unlock with Mirroring disconnected. Both traces stopped,
disabled their domains and detached; page release confirmed glow off.

Document references must be fresh. A stale reference is rejected before input;
request diagnostics now distinguish initial / before-expression / after-operation
identity changes. Only a confirmed pre-expression rejection reports inputSent=false;
a dispatched expression with an uncertain outcome remains unknown and must not
be replayed. The previous Safari attempt lost ownership when temporary Mirroring
was closed during the trace; its uncertain input was not replayed.

See browser-debug-dual-physical-2026-10-10.json. Fifteen focused Python checks and
eight MCP debugger/observer checks pass. Neither browser result qualifies
arbitrary-network Inspector access or audible audio. Heap/breakpoint qualification is recorded separately below.

Protocol references: [Debugger](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Debugger.json),
[DOM](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/DOM.json),
[CSS](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/CSS.json),
[Timeline](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Timeline.json).


### Named local stacks — 1.9.4

Pass `profile:"call-rig"` to inspect the dedicated10520 origin instead of the
default10446 app origin. Only these fixed private origins are allowed; the
same hostname comes from the private runtime configuration. Physical Chrome
overview on the call-rig origin passed, with domains disabled and Inspector
detached. This remains a nearby developer transport, separate from Tailscale
page input. See browser-call-rig-profile-2026-10-10.json.

Physical 1.9.9 capture retained 9 Safari / 16 Chrome events with zero drops, scrubbed known token/cookie fields, domains disabled, Inspector detached and page glow off. WebKit supplied HTTP/2 and byte counters. Preserve provider timing values, including zero/negative values, as raw diagnostics rather than calibrated latency.

## JavaScript sampling profile (1.9.10)

`ios_browser_debug browser=safari|chrome op=profile sampleMs=1000` records a bounded
ScriptProfiler sample into the same one-hour private diagnostic store. Require
`profilerStopped:true` and `profileComplete:true`; `sampleCount:0` means no retained
stacks, not zero CPU use. Final trackingComplete samples are retained after Stop.
The 1000-event/2-MiB budget may drop data; inspect droppedEvents before drawing
conclusions. Sampling measures JavaScript work, not whole-browser CPU, GPU, memory,
or audible audio. No GC, heap snapshot or persistent profiler is started.

An optional expression requires the current matching page lease/glow and documentRef,
exactly like Network and trace. On an uncertain start or lost owner, cleanup still
attempts Stop once; cleanup failure remains failed. Existing Inspector attachments
are preserved. Physical Safari and Chrome qualification passed: 47/48 stacks, 45/44 fixture stacks, zero drops, stop/detach and glow-off confirmed. Every sample timestamp was zero on this phone; use stacks and counts for attribution, not timed flame charts. See browser-profile-physical-2026-10-11.json. Fifteen focused Python
Inspector tests and five MCP debugger tests pass.

Protocol: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/ScriptProfiler.json

## Rendered controls alongside native accessibility

`ios_browser_debug browser=chrome op=dom profile=call-rig` reads up to 200
controls through a fixed read-only projection. An optional CSS selector narrows
the result. Each control includes its label, value, options, rectangle, ancestor
clipping and a DOM hit test at its visible center. Password/credential fields
are redacted. Content remains in the expiring private artifact; read only the
needed items. No caller JavaScript or input is dispatched by this operation.

This is useful during a system fallback: pass that same system sessionId to
reuse its owner while inspecting the active DEV page. It neither acquires a
second owner nor releases the signed runner. Native AX can mark a clipped
WebKit control visible even when its reported center lands on other content.
Do not treat that AX flag, DOM hit test or delivered tap as a verified effect.
Nearby Inspector remains separate from network-only page operation.


## CPU and memory resource probe — published1.9.17

`ios_browser_debug browser=safari|chrome op=resources sampleMs=1500` subscribes
briefly to WebKit Memory and CPUProfiler resource-usage events. It does not take
a heap snapshot, force garbage collection, run a caller expression or change
product settings. Both tracking stops and Memory.disable must pass; uncertain
starts and lost ownership still attempt cleanup. Zero retained samples means
no measurement, never zero usage. Provider events may include shared-process
work; do not label them exclusive page or whole-device measurements.

Artifacts use the same one-hour expiry, event/byte budgets and selected-pointer
reads. The MCP schema and nineteen Python Inspector checks pass. Physical Safari
returned four CPU and four memory readings in two seconds, with no drops, both
tracking stops, Memory.disable and detach verified. Every provider timestamp
was zero: retain sequence/order and reported percentages/bytes, not calibrated
interval timing. Chrome also returned four CPU and four memory readings with both stops, disable and detach passed. The added `receivedElapsedMs` records host monotonic arrival offsets; it does not replace provider timestamps or establish measurement intervals. Published in1.9.17. See `browser-resources-physical-2026-10-11.json`.

Protocols:
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Memory.json
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/CPUProfiler.json

## WebSocket network events (1.9.19)

Network capture now includes WebSocket creation, handshake, sent/received frames, errors and close events. Text frames retain structured content with the same known-key scrubbing and shared1000-event/2MiB budget; plain Bearer values are masked. Binary payloads retain opcode/length/timing, with media content available through explicit audio capture. No interception or always-on listener. Fresh summaries expose frame count and payload bytes.

Physical Chrome captured159 frames/15189 payload bytes in3 seconds with zero drops and disable/detach confirmed.152 frames had no observed socket-creation URL; keep that attribution unknown. An empty Network window is not evidence that a worker or socket is idle. This does not establish a worker debugger attachment. See `network-websocket-physical-2026-10-11.json`.

## Dedicated worker catalog (1.9.20)

`ios_browser_debug {browser:"safari",op:"workers",sampleMs:1000}` briefly enables WebKit's Worker domain, retains worker IDs/names/scrubbed URLs, then disables and detaches. Chrome uses the same operation. Every reported worker is immediately sent `Worker.initialized`, including after owner loss or during disable, so this inspection does not intentionally leave workers suspended. Initialization or disable failure fails the operation.

Physical Safari and Chrome each found the named synthetic counter worker, initialized it, and detached. Independent DOM counters advanced10→104 in Chrome and29→112 in Safari. These are controlled counter-page proofs, not product-worker source, evaluation, service-worker or socket attribution. A zero-row window provides no measured worker content. The existing private event budget/one-hour expiry applies. Twenty-three Python lifecycle checks and five MCP debugger/schema checks pass.

Protocol: https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Worker.json

## Explicit heap graphs and stable document identity (1.9.21)

Safari's reported `performance.timeOrigin` moved by a few milliseconds while the same document stayed loaded. Document references now hash WebKit's main-frame/loader IDs, checked before and after each fixed context read. Raw timing remains diagnostic only. A missing loader or an actual navigation fails closed; no rounding/tolerance or page mutation is used. Get a fresh overview after upgrading.

`ios_browser_debug {browser:"safari",op:"heap",sessionId,documentRef}` explicitly takes a JavaScriptCore heap snapshot. It requires this connection's active web/system owner and a fresh document reference; it cannot acquire a temporary observer owner. WebKit performs synchronous full GC during snapshot construction and temporarily pauses execution. Use this intentionally for memory diagnosis, never as a routine resource probe or live-call measurement.

The private graph includes nodes, edges and class/property tables, plus class counts/shallow bytes, the thirty largest objects and up to eight immediate incoming edges for each. These are not retained sizes, dominators or proof of a leak. Scope is the inspected JavaScript VM and accessible script states, not whole-device or exclusively page memory. Disabling Heap clears live provider snapshots/object IDs; the captured graph remains available offline.

Heap artifacts allow32MiB, retaining the same128MiB host quota, one-hour expiry and0600 files. Ordinary diagnostic artifacts keep their2MiB cap. `ios_read {artifactId,pointer:"/result/pages/0/debug/heap/summary/classes",offset:0,count:20}` returns a bounded window and `pagination.nextOffset`; reduce count when the character budget refuses a row set. The full graph stays outside model context. No always-on heap tracking or repeated snapshot loop is installed.

Protocols/implementation:
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Heap.json
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/heap/HeapSnapshotBuilder.cpp
- https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Page.json

Physical Safari retained168909nodes/506647edges (10.9MB source); Chrome27518nodes/73056edges (1.58MB source). Both disabled Heap and detached. Actual Chrome reload rejected the old loader reference before snapshot dispatch. See `browser-heap-physical-2026-10-11.json`.

## One-shot breakpoint stacks and locals (1.9.22)

Use this when a source location explains a bug better than more screenshots.
It is an atomic capture, with no paused state left for the next agent turn:

1. `ios_browser_debug {browser:"chrome",op:"sources",sessionId}` returns a fresh document reference and a private script catalog.
2. Read its scripts, then call `op:"source"` with that `documentRef` and exact `scriptId`. Read `/result/pages/0/debug/source/sha256` and the relevant source window.
3. Call `ios_browser_debug {browser:"chrome",op:"breakpoint",sessionId,documentRef,scriptId,sourceHash,lineNumber:4,columnNumber:2,sampleMs:1500}`. Lines and columns are **zero-based** WebKit script locations. The script hash must match the full source, including after HMR.
4. Read `/result/pages/0/debug/callFrames` and `/result/pages/0/debug/locals` selectively. `breakpointHit:false` means no matching hit was observed; never treat it as executed-code proof.

An active connection-owned web/system session is required. The operation sets one exact script breakpoint (not a reload-surviving URL breakpoint), activates it for100–3000ms, captures the first pause, removes its breakpoint **before** resuming, confirms WebKit's resumed event, disables Debugger and detaches. Ownership loss, failed reads and uncertain installation still run cleanup. Cleanup failure is an unconfirmed result and must not be replayed. A late pause during cleanup is labeled separately and may have no stack capture.

Up to40 frames and the top frame's first3 non-global scopes are retained. Each scope reads at most41 own property descriptors to retain40 and identify truncation; string values/descriptions are limited to4096 characters. Getters and setters are identified, never invoked. Object descriptions and primitive locals remain; live object and call-frame handles are omitted because resume invalidates them. Known secret-named locals receive the existing first/last-character scrub. No caller expression, stepping, cross-turn pause, global-object walk or user-gesture emulation is involved.

This intentionally pauses the target and changes its timing. Do not use it to benchmark live audio or as a routine polling tool. The ordinary2MiB private capture limit,128MiB host quota and one-hour expiry apply. Nearby paired Inspector only; this does not extend off-LAN reach.

Protocol sources: [Debugger](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Debugger.json), [Runtime descriptors](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Runtime.json).

Physical Safari and Chrome each hit `agentBreakpointTick` at zero-based line4/column2, read `step`/`nextCount`, removed the breakpoint, confirmed the resumed event, disabled and detached. Independent counters advanced after resume. Safari rejected a deliberately wrong source hash before breakpoint dispatch and still disabled Debugger. See `browser-breakpoint-physical-2026-10-11.json`. These provider proofs are separate from fresh MCP schema/backend checks; the original old-schema XCTest connection was preserved.

## Dedicated worker source, console and sampling (1.9.23)

The audio path may execute outside the page's JavaScript context. These operations use WebKit's actual dedicated-worker Inspector channel, rather than pretending page console or network events describe that worker:

1. `ios_browser_debug {browser:"safari",op:"workers",sessionId}`; read `/result/pages/0/debug/workers` for a current exact `workerId` and use the response's `documentRef`.
2. `op:"worker-sources"` with both references lists that worker's scripts.
3. `op:"worker-source"` additionally takes an exact catalog `scriptId`, `startLine` and `lineCount` (1–200). It returns a128KiB maximum source window and full-source SHA256.
4. `op:"worker-console"` captures100–3000ms of worker Console events. Read selected `/result/pages/0/debug/events`; existing console history may replay, so a retained message alone is not proof of a newly executed action.
5. `op:"worker-profile"` samples the selected worker for100–3000ms with `ScriptProfiler`; final stack traces are retained in the events artifact. `profilerStopped` and `profileComplete` report confirmed teardown, and `sampleCount` reports actual stacks. A quiet worker can produce zero samples.

Only the selected current dedicated worker receives nested Inspector commands. Every worker reported during attach/disable is immediately initialized so it can execute. Unexpected worker debugger pauses are resumed and confirmed; source/console domains and parent Worker subscriptions are disabled before detach; an attempted sampler is stopped even after owner loss. A terminated worker invalidates its reference and cancels pending commands. Do not retry a stale ID blindly: rediscover workers in the current document. Failure to confirm cleanup fails the operation.

No caller worker evaluation, worker breakpoint, service-worker coverage, audio content capture or worker network attribution. The ordinary2MiB event/capture budgets,1000event ceiling, private artifacts and one-hour expiry apply. Nearby paired Inspector only. Source reads can affect debugger/JIT timing and are separate from resource benchmarks. Sampling measures worker JavaScript stacks, not whole-device CPU, audio latency or native codec work. Stack line/column coordinates are provider-native (observed one-based); some physical worker samples have zero timestamps, so do not infer per-sample timing or elapsed CPU from those values.

[WebKit Worker protocol](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Worker.json), [ScriptProfiler protocol](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/ScriptProfiler.json)

Physical Safari and Chrome each returned the exact synthetic worker source and worker Console messages. With bounded synthetic worker CPU work, Safari retained37 stack samples and Chrome41, including `workerDebugTick`; stop/completion and domain cleanup passed. Independent page counters continued after profiling, then both workers were stopped and temporary files removed. Safari rejected a terminated worker ID before nested dispatch. See `browser-worker-debug-physical-2026-10-11.json`.

## Independent static accessibility checks —1.9.26

`ios_accessibility_audit` complements Inspector DOM/layout with Apple process-level
checks. The deliberately tiny Safari/Chrome fixture button was reported at12×13points.
Reports can also contain browser chrome, and known low-contrast text was not flagged;
zero issues is not a pass. See ACCESSIBILITY.md for bounded ownership, document
fencing, expiry and interpretation. No accessibility setting changes are made.
