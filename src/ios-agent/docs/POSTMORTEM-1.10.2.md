# Real-use postmortem: 1.10.2 → 1.10.3

## Result

The previous smoke’s Chrome failure was avoidable: its paired developer connection worked, but managed browser launch unnecessarily depended on Kickoff DEV’s native bridge. 1.10.3 adds a bridge-independent paired browser lane and fixed phone-local Wi-Fi-On recovery. It also repairs relay trace propagation and prevents repeated XCTest session creation after an unknown response.

Independent source/log review was performed after reading the supplied Claude report; this was not a blinded review. Raw service evidence, consumer observations and new physical receipts remain distinct. Original signals and Claude artifacts were preserved before tests under the existing report’s evidence/postmortem-1-10-2/.

## Evidence

The preserved 12 October 03:24:03–03:32:54 UTC window (11 October Eastern) contains 291 records:158 MCP,57 host,52 browser,4 web,20 call. Fifteen browser terminal reports completed and all carried trace IDs. Counts are retained records, not proof of complete call correctness.

The service trail independently confirms Safari’s boolean no-Home cleanup: glow_only/intermediate_handoff followed by fresh indicator-off feedback. Claude’s refreshed harness passed the callable signals/schema preflight. This closes the prior physical web-end boolean gate.

Chrome trace f39ad569bf7e747b selected reflected pairing. Pairing connected and DEV foreground was independently observed, but no native bridge arrived; the request failed after17.284s with native_bootstrap_unavailable. The two subsequent native waits and three XCTest inspection deadlines did not establish a phone lock, missing cable or authentication prompt.

## Ranked opportunities and decisions

| Opportunity | Impact / confidence | Decision and evidence |
| --- | --- | --- |
| Launch Safari/Chrome without native bootstrap | High / high | Ship. Auto selects the direct paired lane when pairing is the preferred network path but no native bridge is ready. Explicit paired/app/reflected selection is available before dispatch. Physical Chrome direct launch, fresh owned page, DOM/readiness, glow-off and independent Home display passed. No user action, XCTest or Mirroring. |
| Recover Wi-Fi through a phone-local shortcut outside DEV | Medium / conditional | Ship ios_device_wifi_on. It reuses the already provisioned Runner Wi-Fi On shortcut through the existing paired transport, takes a temporary exclusive owner, and allows no arbitrary names/URLs. Physical paired launch completed without a human unblock; shortcut execution was not independently observed. Wi-Fi was already associated, so this run does NOT prove Off→On recovery or radio state; wifiVerified remains false. Follow with independent observation and Home. |
| Close the developer-relay trace gap | Medium-high / high source confidence | Ship. The previously unidentified input is developer-relay. RelayChannel omitted inherited context, retained commands lacked fresh per-request context, and cli.request used only environment context. Startup context and each request now propagate separately; the worker discards startup lineage after ready. Real child/stdio and Python current-context-to-socket fixtures passed. A new physical reflected-relay run remains separate. |
| Stop repeated unknown XCTest session creation | High / high defect confidence | Ship. Source allowed a later inspect to repeat POST /session after its response timed out. A per-runner latch now prevents a second creation; malformed session IDs never become ready. Existing cleanup stops the owned runner. Logs identify runner-status/session-create/context/alert/tree/input phases; pending startup is logged as pending. The live timeout phase was not recorded previously and remains unproven. No new phone XCTest attempt was needed. |
| Focus-triggered fixed command mailbox | High potential / unproven composition | Keep as a concrete next experiment. Existing Focus native launch is proven; Apple documents Focus triggers, Shortcut URL inputs and web API actions. A phone-local automation could fetch one expiring, owner-bound, fixed command and open the chosen browser without DEV’s bridge or the developer port. It needs separate phone-side provisioning and end-to-end receipt/expiry/foreground qualification. It is not installed or advertised as working. |
| App-open/charger readiness beacons | Medium potential / unproven | An optional Shortcut could tell a waiting service that a specific app opened. It would not prove arbitrary unlock or grant control. Existing foreground wait already supplies app/page readiness; add a beacon only to close an observed availability gap, not as always-on polling. |
| Persist XCTest to avoid reauthorization | Conditional / existing explicit experiment | Keep intentional reservation semantics, not a default. A retained host process does not guarantee a live phone runner or remove Apple authentication. This release reduces routine dependence on XCTest instead of leaving its overlay indefinitely. |

## Delivered behavior and boundaries

For browser transport=auto, select the provider before launch. When the developer endpoint is unavailable, preserve the existing qualified app-owned/Focus lane. When it is available and the native bridge is ready, preserve reflected pairing. When the bridge is unavailable, direct pairing delivers the fixed DEV URL and acquires only one new, intended, visible, fresh document. Never fall back after an accepted or unknown launch.

Direct paired cleanup verifies glow-off first, then requests the fixed Runner Home shortcut through pairing. It does not need native bootstrap. Home acceptance remains separate from screen proof. The physical direct Chrome test’s screen showed Home after cleanup. Direct pairing’s new composition is qualified nearby; cellular page control through the existing app-owned lane remains qualified separately. Deep cellular Inspector and off-LAN direct pairing are not promoted by this result.

Explicit reflected failures now distinguish browserInputSent=false from a DEV bootstrap that may already have been dispatched. No false claim that nothing happened. Rich capture, permissions and media-release fences are unchanged. New fixed Wi-Fi-On recovery is not an automatic retry, Wi-Fi-Off action, generic shortcut executor or authentication exemption.

## Shortcut strategy

Use phone-local actions as a small recovery/control plane, with ordinary page/app control doing the detailed work. Home and Wi-Fi-On already have useful fixed-action integration. Lock and the existing native Wi-Fi handoff remain separate delivered paths. The next high-value extension is a provisioned Focus→mailbox→fixed-browser action, not screen-coordinate scripting of every system panel.

For that future mailbox: use a dedicated automation, preserve personal Focus, fetch only from the existing private origin, bind an expiring nonce to an exact owner and fixed action allowlist, consume before dispatch, and report dispatch separately from fresh browser registration. Lost acknowledgments must remain unknown and never cause a second launch. Do not alter the existing native Focus automation until the replacement is independently qualified. Foreground-app execution on a locked phone is not assumed.

Apple references (capability primitives, not proof of the composed design):
- https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/ios
- https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios

## Verification and rollout

55 distinct focused Node checks and57 Python checks passed, plus11 changed-source syntax checks and package JSON parsing. The Node count comprises the54-check focused pass plus one new schema/pending-outcome check; the new eight-check file passed after that addition. Fixture logs stayed isolated. A malformed fake-child test harness was corrected before acceptance; no application error was hidden.

Actual pre-release MCP on the phone qualified explicit direct Chrome launch/ready/DOM/end/Home and the fixed Wi-Fi-On dispatch/Home path. No network-off, microphone, call/provider, Mirroring or XCTest mutation was performed during these checks. No new native build or page SDK is required. Final published source, installed worker/source and fresh stdio readback are recorded separately in publication.json, together with the final auto-route smoke.

The transcription source re-lease and network-quality policy changes are Claude’s product findings. This release does not change that policy. Repeat the real call through both browsers in the next consumer run, preserving original fixtures and reporting audio/call outcomes separately from driver delivery.
