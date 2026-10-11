# Safari Remote Automation: evaluated, not a default driver

On the physical iPhone running iOS26.7.1, the paired Tailscale Web Inspector
provider could request a Safari automation session, create its own isolated
context, navigate a fixed DEV fixture and read the DOM. It started no XCTest.

The decisive input gates failed: element click returned `NotImplemented`;
keyboard insertion was accepted but neither the input value nor event count
changed. We closed our created context, detached the automation socket and
Inspector, confirmed zero remaining automation targets and removed the fixture.
Safari left another blank context; this is not a claim that all browser tabs
were closed. There was no microphone or real call test in this context.

Do not integrate this as a default input provider. Existing Inspector reads and
the page SDK already cover the useful read path. Revisit when the upstream iOS
input implementation changes or a specific isolated mock-media test needs it.
Never use accepted protocol input as an effect oracle or replay it automatically.

The installed Mac safaridriver is26.5; its local manual says automation sessions
use mock capture rather than live microphones/cameras. Safari27's native MCP is
not installed here. Those are separate providers, not qualified substitutes for
the delivered real-device browser driver. W3C interaction sequences were not
attempted because an upstream report describes a Safari command wedge.

The original held phone runner later disappeared. The raw probe's unconditional
`originalRunnerPreserved` field was not independently checked and is not proof.
The result bundle records a killed original test and a replacement authorization
failure; it does not establish what killed the original test. The sanitized
receipt corrects that claim.

Evidence: `safari-automation-candidate-2026-10-11.json` and
`xctest-hold-failure-2026-10-11.json`.

Primary references:

- [WebKit iOS WebDriver design](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/)
- [Apple iOS WebDriver setup](https://developer.apple.com/documentation/safari-developer-tools/ios-enabling-webdriver)
- [WebKit keyboard input issue322938](https://bugs.webkit.org/show_bug.cgi?id=322938)
- [WebKit interaction-sequence issue322937](https://bugs.webkit.org/show_bug.cgi?id=322937)
- [Safari27 features](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)
