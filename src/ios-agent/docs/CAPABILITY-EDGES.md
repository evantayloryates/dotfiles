# Verified capability edges — personal development service

This ledger records where qualification changes the strategy. It is not a
claim of universal Appium/Chrome parity. Current binary fingerprints are in
physical-resume-smoke.json; displayed build 775 is not unique identity.

| Edge | Observed result | Agent response / delivery consequence |
| --- | --- | --- |
| Mirroring input window absent | Phone screenshot existed but input returned noWindowsAvailable. Fresh rebind after actual window state changed restored usable chrome. Physical phone was already locked. | Rebind and inspect actual window once; do not assume another lock request will help. |
| Phone VPN disconnected | Enrollment matched host but device bridge was offline. Existing account Connect restored transport. | Distinguish VPN, foreground registration and actual app readiness. Tailscale Connect shortcut/on-demand recovery is a candidate, not delivered. |
| CoreDevice app foreground | Exact Kickoff DEV and Tailscale launches succeeded after developer connection recovered. | Prefer fixed app identifiers over Spotlight. USB launch is a recovery adapter, not wireless control. |
| CoreDevice inventory filter | JSON included all apps despite a displayed filter. | Filter returned JSON locally before printing; never emit whole phone inventory. |
| Remote startup without VPN | Embedded runtime started and responded; later explicit reload selected private Metro and React inspection returned. | Startup fallback works; reconnection alone does not change bundle source. |
| Native target selection | Later transparent/debug views intersected a visible gear; last-node selection was rejected. Selecting the observed button container delivered a real native event and opened goals. | Tree order is not hit order. A hit-test-rich selector helper is high value; preserve driver occlusion fencing. |
| Web visual labels | CSS displayed Nutrition while DOM tab text was lowercase nutrition. | Use actual DOM text. Tabs change context without immediately changing URL; visible section is the relevant oracle. |
| Paired runbook route | /dashboard/clients was wrong; actual client workspace prefix is /dashboard/client-list. | Correct the helper/runbook to actual product routes; visible settings link qualified the form. |
| Local DB read boundary | Direct diagnostic invocation lacked canonical environment; existing schema also lacks clients.updated_at. | Use run-local-development.cjs and verified actual columns. No schema reset or invented version column. |
| Prelude false readiness | After a reload from goals, screen black, JS ready true, fresh domain active, no navigation/Apollo registrations. | New ready gate requires application registrations. Keep physical workflow open until actual rendered result. |
| Startup lease race | Acquiring immediately after a successful process launch bound to the old device boot; the new boot correctly retired it. A later settled embedded session passed strict readiness. | Wait for the new foreground boot registration before acquiring; do not replay accepted commands. |
| Remote cold load | Four native startup views and JS ready=false confirmed a pre-mount failure; host HTTPS bundle download still succeeded. Exact cause remains unknown. | One native 45-second application-registration fallback physically passed, including lease retirement, embedded selection, application registration and actual visible dashboard. Remote-load root cause remains unknown. |
| Capture deadline margin | Settled 3x screenshot returned 1,244,062 PNG bytes in 14.65s; the fixed command deadline is 15s. Startup capture and a later tree timed out. | Default capture now 2x, optional 1x/3x, PNG encoding off main and transport size/time metadata. Physical budget verified: 681,027 bytes / 6.816s at 2x. No automatic replay or paired mutation left behind. |
| Completed native rejection | Transport completed with a native error, but CLI previously exited 0. | CLI now fails and preserves private receipt; never replay an accepted input on an unknown outcome. |

Finite finish line: physical rendered readiness on current source, one reversible
coach/client equality workflow, app-owned Wi-Fi/cellular round trip, representative
physical input/recovery limits, reviewed service and agent runbook. Proposed
scenario clocks, arbitrary evaluation, full network bodies, multi-touch, staging
and general system automation are separate extensions, not reasons to endlessly
reopen already-qualified baseline gates.

## Physical transport and focused editing — 8 October

With physical phone unlocked and Mirroring disconnected, the same installed
build passed ready, 321-node tree, 2x capture and native idle. Capture: 681,027
PNG bytes, 105ms render, 25ms encode, 6.816s command. Earlier 62KB tree result
upload failed at 8s with NSURLSession -1001. Authenticated Mac HTTPS uploads
through 1.24MB passed synthetic wrong-target rejection in 0.27s. These isolate
a phone transport condition; they do not prove Mirroring causes the failure.

Actual coach mutation rendered on paired phone, exact React client/value matched.
Native scroll inertia rejected an occluded row safely; a settled fresh snapshot
worked. Bottom sheet focus worked; holding text moved caret without a usable
selection menu. New bounded focused replacement uses public UITextInput selection
and normal UIKeyInput insertion. 39 UIKit fixture gates passed including Unicode
replacement, empty clearing and invalid-mode no-change. Physical replacement/one Save and reverse coach readback passed at 2345.
Nullable baseline restored through coach UI and normal mobile refetch.


Both unique DEV callbacks returned despite immediate observations timing out.
Do not infer handoff failure from a failed read. Separate admission, callback,
radio/association, and resumed app readiness. Mirroring keyboard/menu navigation
works while pointer commands can fail with no input window; one rebind/raise
was insufficient. A later direct click succeeded; recheck the current surface before requesting a human click. Prefer the app-owned lane and retain this system-adapter edge.

Network-transition qualification: existing VPN On Demand enabled and reopened readback passed, but the next Off transition still lost direct tailnet reachability. Cellular line/data and both app permissions are on. Subsequent physical unlock and DEV launch recovered strict readiness and fresh GraphQL. Causality remains unknown; no unchanged ping loop or automatic accepted-command replay is justified.

Verification sequencing: diagnostics-probe is an explicit action, while verify network only observes. Submit the probe and observe immediately in the same batch; the verifier intentionally rejects results older than 3 seconds. A stale successful probe is not a failed backend.
