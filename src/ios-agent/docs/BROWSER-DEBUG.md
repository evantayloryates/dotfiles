# On-demand browser Inspector — v1.8 candidate

`ios_browser_debug` adds independent WebKit diagnostics for the configured
private DEV origin. It uses the existing pinned paired-device observer, without
XCTest or Mirroring. **Physical Safari source/CSS/console/passive-timeline reads passed.**
Chrome Inspector and combined trace effects remain unqualified.

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

A separate passive timeline returned three events, stopped and detached. The
combined trace effect encountered a changed document and was not replayed;
its input outcome stays conservatively unknown. Passive tracing does not prove
that combined workflow or calibrated page CPU. Page lease release and glow off
passed. See browser-debug-physical-2026-10-10.json.

Chrome's enrolled page was visible/ready, but no matching Inspector target was
discoverable. Its separate Web Inspector setting and required relaunch remain
to be confirmed. A bounded XCTest startup did not become ready; runner stop and
shared ownership release passed. No Mirroring was used. Neither browser result
qualifies arbitrary-network Inspector access.

Ten Python fault/ownership/domain checks and focused MCP discovery/capture checks
pass. v1.8.1 exposes 34 tools and nine resources. Script catalogs remain bounded
and can be incomplete on larger pages; inspect dropped counts.

Protocol references: [Debugger](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Debugger.json),
[DOM](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/DOM.json),
[CSS](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/CSS.json),
[Timeline](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/JavaScriptCore/inspector/protocol/Timeline.json).
