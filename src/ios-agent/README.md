# Personal iOS app agent

The latest snapshot/refresh/keep-awake SDK passed USB-unplugged native Nutrition→Home, native/React inspection, remote Metro and fresh backend readiness through private Tailscale without a Wi-Fi IPv4 association. Wi-Fi On and Home were restored; native/host cleanup passed. Both coach/client edit directions and exact restoration passed on the earlier dated runtime. See docs/recovery-wireless-final-2026-10-08.json for the newest build identity and docs/DELIVERY.md for the agent operating contract.

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
editing the provider package. Provider failure revokes the lease. Status exposes
`reactFrontendCleanupPending`; wait until it is false before reacquiring after
release, even if `reactFrontendRunning` is already false. Inspection and
profiling contents require private output files; routine status prints metadata.
The console adapter hides LogBox UI while forwarding original calls. The next
bundle adapter records bounded console levels/positions, runtime error severity
and global-fetch method/status/duration only during the owning lease. It never
exports message arguments, raw errors/stacks, URLs, headers or bodies. Fetch
observation chains its promise while preserving response/rejection identity; it
does not retry or consume payloads. The adapter bundled, installed and passed native-to-JavaScript session/protocol
and history-reset checks on the phone. Console/fetch forwarding has host
integration coverage; the physical global-fetch matrix passed; the real crash-reporter chain is not invoked by the isolated sentinel-handler fixture.
A read-only domain registry now samples the registered navigation route and
Apollo's last emitted query statuses during a lease. Route names come from a
static code allowlist; query data, variables, error contents and cache contents
are not exported. The cache metric counts records only. No refetch or navigation
command is invoked. The installed phone independently reported its committed
route and query status; see `docs/QUALIFICATION.md` for the bounded scope.

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
checks source hashes for changes during the build. Use `--generic-destination`
to prepare a signed device product while the iPhone is disconnected; USB or an
existing developer connection is only needed for installation. The default embeds JavaScript;
`--metro` retains the app's Metro URL. `--runtime-config <private-config>` embeds
the private tailnet endpoints and an offline JavaScript fallback. It snapshots
the config for the build and never changes `mobile/local-env.js`.

`python3 src/ios-agent/install_runtime.py --mobile <Kickoff-mobile>` starts the
scoped `com.taylor.ios-agent.metro` LaunchAgent on loopback port 19404, with two
workers. It verifies the existing personal tailnet, the guarded local backend
processes, and local GraphQL/web readiness. It compiles and validates the actual
device bundle before reporting ready; a cold cache can take about a minute.
It adds private Serve ports 10444
(Metro), 10445 (local GraphQL) and 10446 (local web), preserving other routes and
refusing port conflicts or Funnel. It does not start, seed or replace the backend.
The current backend-container default is `default-ki-e3ee9-dev-1`; use
`--backend-container` only for an equivalent guarded local runtime. `--restart`
replaces this Metro job at a chosen idle point. Metro stdout/stderr are discarded
to avoid retaining app console contents. Tailnet membership controls endpoint
access; these endpoints have no public exposure. The native adapter checks Metro
at launch; its upstream health check can wait up to ten seconds before selecting
the embedded bundle. Runtime inspection has no USB relay.

After a Metro restart, its old Fast Refresh graph no longer exists. Use the
fixed `reload` action to request React Native's standard JavaScript reload,
then explicitly release and acquire a new lease after readiness returns.
It is a semantic development operation, not a native tap, and accepts no code,
URL or navigation parameters. Verify the new state and React tree before input.
Reload clears the cached ready flag. State reports a `bundleSource` enum
(`tailnet-Metro`, `embedded`, or `standard-Metro`) without exporting a URL.
The startup recovery allows one 45-second fallback if a foreground remote
load never registers both application adapters. Successful registration is
latched per bundle attempt, so later screen unmounts do not trigger recovery.
Old bridge instances cannot publish into a newer attempt. Fallback retires any
control lease; agents must acquire anew and verify. The native receipt exposes
`startupRecovery.fallbackAttempted`; physical fallback acceptance passed on the phone.

Agent workflow:

```sh
ios-agent doctor
ios-agent status
ios-agent acquire --rollout <this-chat-rollout.jsonl> --lease-file <private-lease.json>
ios-agent action capabilities --lease-file <private-lease.json>
ios-agent action tree --lease-file <private-lease.json> --output <private-tree.json>
ios-agent inspect --lease-file <private-lease.json> --args '{"type":"status"}'
ios-agent inspect --lease-file <private-lease.json> --args '{"type":"get-tree","depth":8}' --output <private-react-tree.json>
ios-agent release --lease-file <private-lease.json>
```

`ios-agent doctor` performs read-only source, private routing, guarded local
backend and HTTP checks. It never acquires the phone or repairs services. Its
`hostPrerequisitesReady` result is separate from foreground application readiness.
Use `ios-agent verify ready --lease-file <private-lease.json> --timeout 30
--output <new-private-receipt.json>` after acquiring a fresh lease. The fixed
verifier also supports native/React trees, route, bundle source, network and
cleanup; see [workflow gates](docs/WORKFLOWS.md). Every receipt requires a new
private file; a read-only gate is not a replacement for the real product flow.

If the local backend needs recovery at an idle point, explicitly run
`ios-agent stack-ensure --timeout 90`. It serializes recovery, requires the
existing local Docker Desktop socket, configured foundation checkout mount,
local database identity marker and guarded processes. It rechecks device
ownership after Docker startup, refuses unknown port owners and admits each
missing canonical launcher once. It never resets data, replaces containers,
switches contexts or stops workers. No automatic accepted-command replay occurs.
After a timeout or unknown outcome, inspect `doctor` and current processes before
another attempt. Warm reuse passed live; controlled cold recovery is still an
acceptance gate. The lock serializes this tool, not every independent agent or
process on the laptop, so an ownership check cannot guarantee zero collisions.

Focused text insertion uses `text` with `{"text":"…"}`. To replace the current
field, add `"mode":"replace"`; the adapter selects the actual focused
UITextInput document and calls UIKeyInput insertion. Empty replacement clears
the field. It never sets a React prop or invokes a product handler. This is
semantic text editing, not hardware-keyboard simulation. Confirm the rendered
value and persisted mutation before treating delivery as completion.

The fixed `wifi` action hands off to the phone's **Runner Wi-Fi On/Off** Apple
shortcuts, then returns to the dev app. It accepts only `{"state":"on"}` or
`{"state":"off"}`; no arbitrary shortcut name or URL is accepted. Foreground
loss ends the lease, so reacquire after return and verify independent state.
The USB shortcut actuator passed a connected → disconnected → connected test;
the app-owned command passed the latest installed unplugged round trip. See
[Wi-Fi workflow and recovery](docs/WIFI.md). A prepared acknowledgment or
successful callback does not prove radio state.

Explicitly release before finishing a turn. An already-retired lease now cleans its local capability file after confirming it no longer owns control; this never releases a replacement owner or establishes global idle. A separately running observer also
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
provider-crash cleanup, recovery and turn-end cleanup. At the current checkpoint
86 Python checks pass, including fixed verifier, health, recovery and absolute
IPC deadline tests. Run `node --test src/ios-agent/tests/test_telemetry.cjs src/ios-agent/tests/test_domain.cjs`
for metadata/failure-path checks. Set `IOS_AGENT_MOBILE_ROOT` to the app checkout and run
`node --test src/ios-agent/tests/test_bridge.cjs src/ios-agent/tests/test_transformer.cjs`
for real prelude/event wiring and development-only runtime replacement, including
Metro's relative filenames. The `diagnostics-probe` action sends a fixed,
read-only `__typename` query to the configured local GraphQL route, records
status/readiness enums, and cancels after ten seconds or lease end. It accepts
no caller-supplied URL or query. A queued acknowledgment requires a later state
assertion of the result.
The UIKit simulator fixture and physical prototype evidence are
separate artifacts; neither substitutes for the final installed SDK smoke.
The combined JavaScript suite passed 22 checks; the extended UIKit simulator
matrix passed 51 gates. The paired local-auth helper passed 45 focused
Kickoff checks and live mint/readback/retirement, but signed-in browser/phone
workflow acceptance passed on the recorded paired runtime.
Keep the [progress report](docs/PROGRESS.md) current after each verification stage.
See [strategy gates](docs/STRATEGIES.md) for the remaining physical-device and
installed-service checks. KIF-derived HID construction retains its Apache 2.0
license under `native/KIF-LICENSE`.

App-owned capture defaults to 2x point resolution; fixed `image --args
'{"scale":1}'` reduces transport cost and `{"scale":3}` requests full density.
The receipt labels scale, PNG bytes, render/encoding time and the unchanged
app-window/occlusion scope. PNG encoding leaves the main queue; an ended lease
discards its frame. `state.lastCommandTransport` contains only an action enum,
bytes, elapsed time, HTTP status, OS error code and generation-discard boolean.
Native transport never exports its URL, credential or response body.

Native tree labels use explicit accessibility labels first, then visible UILabel
text. Secure text-input descendants return an empty label. This made the actual
iOS UIKit meal-menu options readable without screenshot interpretation; the
51-gate compiled fixture covers fallback/precedence/redaction. The dedicated
dev adapter clears RN's persisted Perf Monitor preference at bundle selection
and hides the active performance/element-inspector panels when its prelude
starts. Diagnostics remain available in the agent channel. Physical verification
found those panels absent on the updated signed product.

Fast Refresh state preservation is not qualified: a presentation-only meal edit
returned the current app to Home while retaining the native boot. Source was
restored. Treat a source update as a potential route/form reset, inspect readiness
and the current route before input, and never replay accepted business changes
to restore a lost screen. See docs/CAPABILITY-EDGES.md for the open gate.


For slow wireless links, successful tree delivery reserves a bounded follow-up opportunity: five seconds after the first owner-fenced acknowledgment, with total capture age capped at 15 seconds and live geometry/hit checks retained. Background React polling yields up to two seconds after a native tree. The candidate also exposes allowlisted refresh cause counters in `state.refreshDiagnostics`; it never exports reload messages or source paths. Latest installed wireless input and scoped-worker recovery passed; ordinary Fast Refresh may still reset navigation.


Lease-scoped keep-awake candidate: UIKit idle timer is disabled only while control is leased; release, foreground loss and expiry restore its prior value. A preexisting disabled idle timer remains disabled. This does not prevent a manual lock or remove phone/Mac authentication. Compiled fixture 51 gates passed, including the three idle-timer checks. Latest signed build installed. Fixture runner now repairs only a missing-payload registry record on its own freshly booted simulator; a real installation or shared boot remains a collision refusal. Wi-Fi-off handoff briefly lost transport; fixed USB On recovery and a fresh build restored foreground registration. No single root cause is claimed for that transport loss.
