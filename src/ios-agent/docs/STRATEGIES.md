# iOS agent strategy tournament

7 October 2026. Personal dev service; Kickoff app integration stays on ety/local-dev-foundation. Production-ready means the installed personal service, not enabling instrumentation in a customer production app.

## Evaluation gates

Gate 1: real-device compatibility and no XCTest dependency. Gate 2: actual native event delivery, hit/occlusion oracle, scrolling and text. Gate 3: native + React + domain evidence and app-window images with explicit visibility scope. Gate 4: authenticated wireless transport, target identity and freshness. Gate 5: fencing, cancellation, completion observation and independent expiry. Gate 6: review, artifact exclusion, installed-service crash/restart and final live smoke.

“Better than Appium at every level” is an aspiration, not an evidence claim: an app-scoped instrument cannot independently control arbitrary system UI. Compare actual matched workloads and retain explicit unsupported capabilities.

## Broad candidate set

| Candidate | Opportunity | Important constraint | Gate/status |
|---|---|---|---|
| Appium/WDA + React DevTools + Rozenite | Provider-heavy baseline with native/system UI and rich React state | XCTest system indicator and manual authorization; Metro targeting still needs qualification | Earlier physical-device baseline qualified; retained fallback |
| agent-device + React/domain adapters | Agent-oriented selectors, snapshots, replay and provider abstraction | Backend-dependent; not evidence of a no-XCTest real-iPhone path | Official docs inspected; not runtime qualified |
| Maestro / Detox simulator lane | Deterministic broad native UI regression testing | Official iOS configurations are simulator-oriented | Source/documentation gate; existing Maestro CLI available |
| maestro-runner physical-device lane | Provider orchestration with existing flow formats and reports | Uses WDA/XCUITest on iOS; does not remove system constraints | Official repository inspected |
| KIF-inspired in-process event adapter | Touch delivery inside the app, no out-of-process UI automation runner; control over indicator | Private Apple APIs require runtime qualification; ordinary SDK APIs do not expose touch constructors | Installed SDK delivered taps and scrolling; simulator also verified hold/text |
| EarlGrey-inspired synchronisation | Observe real idleness instead of timing sleeps | EarlGrey versions differ; avoid assuming its runner model removes XCTest UI automation | Source candidate |
| Native accessibility/view introspection + React DevTools | Correlate native bounds/hits with React components and committed state | App background/occlusion can invalidate apparent UI; flattened Fabric views require care | Installed SDK native tree + React props/hooks + profiling qualified |
| FLEX / Reveal as optional adapters | Deep UIKit/runtime/layout diagnostics | Human tooling is not automatically an agent API; raw network payload capture unsuitable as a default | Official repositories/docs inspected |
| iPhone Mirroring + app bridge | OS-provided real phone input without XCTest; whole-phone pixels | Nearby Mac, phone locked, Mac authentication; some hardware unavailable; native Mac AX exposes wrapper, not full phone tree | Connection and system navigation qualified; recurring lock/in-use gates; onboarding resolved |
| Accessibility Audit developer service | Potential system accessibility descriptions | Its activation API documents a restricted process entitlement; not a general input grant | Provider docs inspected; no entitlement change |
| Voice Control / Switch Control / hardware HID | Potential OS-generated input independent of XCTest | Human setup, audio/HID hardware, contention and visible system state; authentication still belongs to human | Research candidates; not installed or qualified |
| App-owned replay + deterministic fixtures + fault injection | Rich causal evidence, generated replay, controllable clocks and test-oracle failures | Semantic replay alone cannot prove native hit paths | Architectural opportunity, add to chosen service |
| System indicator suppression | Keep WDA with preferred visuals | No working supported control found; disabling visual state may also disable automation; stock OS privileges unknown | Not demonstrated; never silently treat as available |

## Three champions retained during implementation

1. **App-owned native input and inspection service + standard React DevTools**, with native lease/glow and outbound authenticated network transport. Strongest fit for personal phone in hand and remote local-app development. Native event/hit, authenticated Tailscale and installed crash/recovery gates have passed; final cellular qualification is recorded separately.
2. **iPhone Mirroring + the same app bridge**, with an isolated simulator regression lane. Avoids XCTest for broad nearby-phone control; keep as a recovery/control adapter. Its proximity/locked-phone requirements make it unsuitable as the remote app's primary control path.
3. **Bounded WDA provider + the same rich bridge**, optionally using agent-device/maestro-runner orchestration. Most established native/system input fallback. Accept Apple's indicator and human authorization when used; actual runner ownership/stop is mandatory.

Keep one common target, action/result and lease contract so a driver can change without business-screen changes. Do not silently switch from native events to handler invocation or mark a semantic result as native verification. Use an independent native/system lane to challenge the custom adapter's oracle.

## Developer membership

Apple permits personal on-device development without paid membership but Personal Team profiles expire after seven days and have app/device limits. Paid membership adds advanced capabilities and distribution choices. It does not establish private OS entitlements, a scoped UI-automation grant, or system-indicator styling.

The current evaluation binary already has a non-Personal-Team development profile, get-task-allow enabled, twelve registered devices and expiry 2027-09-18. This supports testing now without enrolling Taylor's personal account. No certificate, entitlement, account or provisioning preference was changed.

## Primary references

- https://developer.apple.com/support/compare-memberships/
- https://github.com/kif-framework/KIF
- https://github.com/google/EarlGrey
- https://oss.callstack.com/agent-device/docs/introduction
- https://docs.maestro.dev/get-started/supported-platform
- https://wix.github.io/Detox/docs/config/devices
- https://github.com/devicelab-dev/maestro-runner
- https://github.com/FLEXTool/FLEX
- https://doronz88.github.io/pymobiledevice3/api/capture/
- https://support.apple.com/en-us/120421
- https://appium.github.io/appium-xcuitest-driver/latest/troubleshooting/
