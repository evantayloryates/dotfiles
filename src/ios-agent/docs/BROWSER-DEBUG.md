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
