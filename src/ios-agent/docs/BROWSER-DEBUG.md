# On-demand browser Inspector — v1.8 candidate

`ios_browser_debug` adds independent WebKit diagnostics for the configured
private DEV origin. It uses the existing pinned paired-device observer, without
XCTest or Mirroring. **Physical qualification of these new operations is pending.**
The older fixed Safari bootstrap read is independently qualified; that is not
proof of the new domains or Chrome.

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

Nine Python fault/ownership/domain checks, four existing observer boundary
checks, and 33 focused MCP discovery/capture/observer checks passed on 10 October.
The fresh installed candidate exposes 33 tools and seven resources.
The host doctor passed 11/11; Safari's Tailscale page was registered and visible.
The paired transport could not discover the phone (`_RemotePairingDeviceNotFoundError`),
and CoreDevice independently reported its tunnel unavailable. No page or console
failure is inferred from that transport result. Physical source/CSS/console/trace
and independent Chrome qualification remain the next gate.

Protocol references: [Debugger](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Debugger.json),
[DOM](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/DOM.json),
[CSS](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/CSS.json),
[Timeline](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Timeline.json).
