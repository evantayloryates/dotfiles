# Personal iOS app agent

Under qualification. Source compilation and broker lifecycle tests are verified;
native event behavior, authenticated wireless routing and installed-service recovery
must pass the strategy gates before this is described as ready for routine use.

The host lives in dotfiles; the app integration stays on `ety/local-dev-foundation`.
Only the explicit `IOS_AGENT_ENABLED=1` Debug build for `com.dev.kudos.fit` starts
the SDK. It adds no business-screen layout, diagnostic bar or overlay text.
Release builds exclude the native agent and private APIs.

## Contract

The app opens an outbound, authenticated HTTPS polling channel through private
Tailscale Serve. The Mac listens only on `127.0.0.1:19403`; local owner controls
use a mode-0600 Unix socket in a mode-0700 directory. Every installed host boot
has a new epoch. Every foreground app launch has a new boot identity. Device
credentials and enrollment files stay outside Git, in the private service state.
No tunnel, device token or lease is printed. No request bodies are logged.

One active Codex turn can acquire the phone. Only structural events from that
turn's own local rollout provide liveness. Completion, interruption, replacement,
device restart, loss of connection or service restart revoke control. The host
allows 20 minutes without a positive owner event. The app independently expires
control within 30 seconds without a valid host response and immediately when it
loses foreground state. Its transparent, hit-through glow is visible during a
lease and removed on revocation. It never changes Apple's XCTest indicator.

Commands are single-flight, fenced and bounded. A sent command that times out
has an unknown outcome; it is never automatically replayed. Native delivery
acknowledgments do **not** prove React/business state committed. Follow them
with independent tree, image, React or domain assertions. Images cover the
app's main window only and cannot establish system occlusion.

Native input requires a fresh tree snapshot and a target that still matches
UIKit hit testing. Touches go through `UIApplication.sendEvent`, including
recognizer timing. Text insertion is explicitly `UIKeyInput`, not physical
keyboard simulation. System UI and authentication are outside this driver's
scope. React messaging is a separate standard DevTools adapter; semantic
operations must never be relabeled as native taps.

## Installation and use

Qualification must complete first. The tracked LaunchAgent is installed with
`python3 src/ios-agent/install.py --endpoint https://<this-mac>.ts.net:10443/v1/device`.
It verifies the existing personal tailnet account, preserves enrollment, and
does not change Tailscale sharing. Configure the scoped private Serve endpoint
separately; preserve other Serve routes and never use Funnel for this service.
`--provision-device <CoreDevice-ID>` copies only the enrollment JSON into the
dev app's Documents directory. CoreDevice is used for enrollment/builds, not
ongoing runtime control. `--restart` explicitly drops an existing host lease.

Include `native/IOSAgent.inc` once in the dev app's AppDelegate and call
`IOSAgentStart()` after its main window is created. Enable the compile macro
and link IOKit only in the dedicated developer build. Default SDK certificate
validation is retained; redirects are rejected to prevent credential forwarding.

Agent workflow:

```sh
ios-agent status
ios-agent acquire --rollout <this-chat-rollout.jsonl> --lease-file <private-lease.json>
ios-agent action capabilities --lease-file <private-lease.json>
ios-agent action tree --lease-file <private-lease.json> --output <private-tree.json>
ios-agent release --lease-file <private-lease.json>
```

Explicitly release before finishing a turn. A separately running observer also
releases at turn completion, including agents that forget. Do not keep a lease
file or try to reuse it in another turn. Do not acquire while the human is using
the phone. Use Mirroring for nearby system recovery or explicitly authorized,
bounded WDA batches when needed; neither is silently started by this service.

## Verification

`python3 -B -m unittest discover -s src/ios-agent/tests -v` exercises synthetic
lease, device, stale result, unknown outcome and owner-event failure cases.
See [strategy gates](docs/STRATEGIES.md) for the remaining physical-device and
installed-service checks. KIF-derived HID construction retains its Apache 2.0
license under `native/KIF-LICENSE`.
