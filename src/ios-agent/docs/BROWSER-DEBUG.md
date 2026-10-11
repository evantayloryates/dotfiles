# On-demand browser Inspector — v1.9.1

`ios_browser_debug` adds independent WebKit diagnostics for the configured
private DEV origin. It uses the existing pinned paired-device observer, without
XCTest or Mirroring. **Physical Safari and Chrome source/CSS/console and bounded combined-timeline reads passed nearby.**

## Choose the lane

Use `ios_web_*` for routine Tailscale page work on any reachable network.
Use this Inspector lane when the phone is nearby and the Apple paired developer
channel works. A live page bridge does not imply that paired channel is available.
This is especially useful if the DEV page fails before its SDK registers.
It does not provide off-site launch, trusted input, OS permission handling,
full browser internals, heap profiling, breakpoints or worker/frame debugging.

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
arbitrary-network Inspector access, breakpoints, heaps or audible audio.

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
