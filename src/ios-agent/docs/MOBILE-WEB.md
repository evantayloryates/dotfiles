# Dev mobile-web driver

Use actual Safari and Chrome on the iPhone. The adapter lives in an explicitly
enrolled local development document. Requests return through the existing
private HTTPS web origin on port 10446 to the same broker as native control.
No new Serve route or public Funnel is installed. Physical browser opening
through CoreDevice is a provisioning convenience, not the operating transport.

## MCP workflow

1. `ios_web_enroll`: obtain a private JSON launchFile, never print its URL
   fragment. Enrollment expires in five minutes and is single-use, origin-bound.
   Open its URL in the intended browser. On the paired developer channel,
   `devicectl device process launch --payload-url` can open Safari or Chrome.
   Off-network, an already enrolled browser tab is sufficient for page control;
   an offline/closed browser cannot be remotely launched by this page adapter.
2. `ios_web_pages`: choose the actual page ID and browser, check visible/ready
   and age. Desktop WebKit is not evidence of a physical iPhone.
3. `ios_web_begin`: one session per work turn. This acquires the SAME owner
   fence as native input, atomically in the existing broker. A second native or
   browser owner is refused. Cancel/EOF/tool-silence cleanup is inherited.
4. `ios_web_inspect`: snapshot returns bounded semantic DOM, content, rectangles,
   hit-test and viewport data. References expire after five seconds; select tag
   as well as label. State includes secure context, activation and registered
   domains. Events contain bounded console types, error codes and request timings;
   no console argument content, URLs, headers, request bodies, SDP or audio.
5. `ios_web_action`: click/fill/scroll require fresh refs. Delivery is synthetic
   DOM input; React form state must be read back. Explicit evaluate executes JS
   in this enrolled dev document. It is NOT a read-only or trusted-input tool.
   Accepted/unknown commands never replay. Inspect independently after mutations.
6. `ios_web_verify`: ready/DOM/route gates save structural receipts into the
   existing shared learning store. Expected content stays in private artifacts;
   shared evidence contains only booleans/counts. Lessons require review, never
   execute as instructions. `ios_web_end` confirms host release AND glow off.
   If page feedback is unavailable, cleanup is unconfirmed, not passed.

## Lifecycle and visibility

The pointer-transparent perimeter glow changes no layout. A page-side 15-second
watchdog clears it on transport loss; hiding/pagehide clears it immediately.
The server retires disconnected page ownership after 30 seconds. Tool silence
ends ownership after 20 minutes; heartbeats do not prolong tool silence.
Full document reload changes its boot and retires old ownership/commands. Tab
credentials live in sessionStorage; host stores only a token hash with a 24-hour
expiry in a private file. An authenticated tab can recover across broker restart
or transport interruption without reenrollment; a fresh control session is needed.
SDK source upgrades require a page reload; ordinary Next Fast Refresh remains
live, subject to separately verified route/form preservation.

## Domain instrumentation

`window.__iosWebAgent.register('name', readFunction)` returns an unregister
function. Read functions should return bounded synthetic/domain diagnostics,
never credentials, transcripts or models. The built-in media reader reports
track kind/enabled/muted/readyState, WebSocket counts/bytes and selected audio
WebRTC counters. It covers objects created AFTER adapter boot only. Instrument
before call setup; it does not capture audio, create a microphone or stop an
existing product track. Fetch/XHR and console wrappers add metadata only.

## Proven and still open

Dated receipts prove desktop Chromium/WebKit and real iPhone Safari/Chrome DOM,
React form input/readback, click, scroll, events, stale refs and glow cleanup.
They are synthetic qualification-page proof, NOT a coach/client business call,
actual microphone acquisition, independent screenshots or off-LAN proof.
Page DOM omits closed shadow roots and cross-origin frames. It does not operate
browser chrome, OS prompts, IME/keyboard hardware, trusted touch or other apps.
WebKit Inspector can supply deeper CSS/timeline/heap information for Safari and
Chrome; its local paired transport is a separate constraint. Inspect's CDP
translation documents synthetic input too; it cannot be treated as trusted input.
XCTest/WDA remains a bounded alternative for genuine native input/system UI;
Apple authorization and its stock indicator are not hidden or bypassed.

## Delivery boundary

Next only exposes the API and qualification page in development runtime,
explicit KICKOFF_LOCAL_DEMO=1, non-hosted APP_ENV, and non-Vercel. POST origin
must match the fixed loopback/private-tailnet Host. SDK enrollment is stripped
from the address before analytics. Production requests are 404. No arbitrary
upstream URL, customer database, global browser injection or credential API.

## Sources

- https://webkit.org/web-inspector/enabling-web-inspector/
- https://developer.chrome.com/blog/debugging-chrome-on-ios
- https://docs.inspect.dev/developers/mcp
- https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/protocol/Runtime.json
