# Personal iOS app agent

Under qualification. Simulator native-input tests, a physical-device input
prototype, and the combined broker/React transport have passed. The installed
SDK and off-LAN wireless gates must pass before routine-use readiness is claimed.

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

The pinned React frontend runs only for the owning lease, with private state,
a mode-0600 IPC socket, a loopback WebSocket listener and an ephemeral handshake
credential passed through stdin. A generated adapter adds authentication without
editing the provider package. Provider failure revokes the lease. Inspection and
profiling contents require private output files; routine status prints metadata.
The console adapter preserves console behavior, hides LogBox UI and exports
warning/error counts. Full console bodies and a domain command catalog are
separate future integrations.

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

`python3 src/ios-agent/build_app.py --mobile <Kickoff-mobile> --udid <device-UDID>
--derived-data <private-build-dir> --log <new-private-log>` creates the explicit
Debug build without editing project source. It injects the React prelude through
a dedicated Metro wrapper, verifies native classes in the built binary and
checks source hashes for changes during the build. The default embeds JavaScript;
`--metro` retains the app's Metro URL. Updating Metro/OTA/build delivery remotely
is a separate dev-foundation task; runtime inspection has no USB relay.

Agent workflow:

```sh
ios-agent status
ios-agent acquire --rollout <this-chat-rollout.jsonl> --lease-file <private-lease.json>
ios-agent action capabilities --lease-file <private-lease.json>
ios-agent action tree --lease-file <private-lease.json> --output <private-tree.json>
ios-agent inspect --lease-file <private-lease.json> --args '{"type":"status"}'
ios-agent inspect --lease-file <private-lease.json> --args '{"type":"get-tree","depth":8}' --output <private-react-tree.json>
ios-agent release --lease-file <private-lease.json>
```

Explicitly release before finishing a turn. A separately running observer also
releases at turn completion, including agents that forget. Do not keep a lease
file or try to reuse it in another turn. Do not acquire while the human is using
the phone. Use Mirroring for nearby system recovery or explicitly authorized,
bounded WDA batches when needed; neither is silently started by this service.
The native session also ends when the app loses foreground, including Home or
locking the phone. This app driver does not implement Apple's simultaneous
volume-button exit gesture or control the system's automation state.

## Verification

`python3 -B -m unittest discover -s src/ios-agent/tests -v` exercises synthetic
lease, device, stale result, unknown outcome and owner-event failure cases.
With `npm ci --ignore-scripts` in `src/ios-agent/react`, it also runs the real pinned
frontend against a synthetic backend, verifies component state, authentication,
provider-crash cleanup, recovery and turn-end cleanup. The suite currently has
19 tests. The UIKit simulator fixture and physical prototype evidence are
separate artifacts; neither substitutes for the final installed SDK smoke.
See [strategy gates](docs/STRATEGIES.md) for the remaining physical-device and
installed-service checks. KIF-derived HID construction retains its Apache 2.0
license under `native/KIF-LICENSE`.
