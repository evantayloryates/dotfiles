# Agent-owned iPhone Wi-Fi changes

The dev adapter supports `wifi` with exactly `{"state":"on"}` or
`{"state":"off"}`. It opens one of two fixed Apple shortcuts:
**Runner Wi-Fi On** and **Runner Wi-Fi Off**. Each contains one `Set Wi-Fi`
action with an explicit value. They were created in Mac Shortcuts and their
iCloud sync to this phone was verified. Never run these shortcuts on the Mac:
the action changes the device on which it executes.

The initial USB experiment changed association from connected → disconnected →
connected without XCTest or a manual Wi-Fi change. This is a separate gate
from the app-owned Tailscale command and an unplugged cellular test; those must
have their own installed-build evidence before being called qualified.

## Normal workflow

1. Require the intended dev app foreground and unlocked, a fresh lease, and
   a real app state/React response. Record initial network state. Do not change
   Wi-Fi while the human is using the phone.
2. Request `ios-agent action wifi --args '{"state":"off"}' --lease-file <private>`.
   This is a semantic OS-settings handoff, not simulated touch input.
3. The host first records **prepared-shortcut-handoff**, ends normal control and
   authorizes that exact command ID in its acknowledgment. The native adapter
   accepts this once, checks the epoch and originating lease, removes its glow,
   then opens Shortcuts. This acknowledgment does not prove execution or radio state.
4. Shortcuts runs the fixed action and returns to Kickoff using Apple's
   x-callback-url. The one-time nonce expires in 60 seconds. Error contents and
   result text are not exported. Normal control and React inspection have already
   ended before the handoff. A callback grants no control.
5. Wait for return, no pending React cleanup, and a fresh foreground connection.
   Acquire a new lease. Inspect `state.wifiHandoff`: **returned**, **failed**,
   **cancelled**, **expired**, or **opened** are distinct. Check actual app
   readiness and connection observations, not just receipt of the prepared result.
6. Restore the original state with a separately requested `wifi` action and
   verify it. End with explicit lease release and no glow/frontend/cleanup.

`wifiInterface` exposes only readability, presence, up/running flags and IPv4
address presence for `en0`, using `getifaddrs`. No address, SSID or BSSID is
exported. These observations help validate association changes but do not
represent the Settings radio switch, so `radioVerified` remains false.
Independent qualification uses the actual Settings switch or USB diagnostic
association metadata. A Tailscale response alone is not a cellular-path proof.

## Recovery and constraints

- An unknown accepted outcome is never automatically replayed. Read the handoff
  state and independent evidence first. Explicit On recovery is a separate
  idempotent recovery action, not a hidden command retry.
- A bounded USB recovery can launch the fixed On shortcut via CoreDevice's
  `--payload-url`. The phone must be unlocked. A launch result is not execution
  evidence; check the device again. Routine app-owned commands use Tailscale.
- If Kickoff fails to return after Off, the bridge is unavailable until the app
  is foreground. Keep this failure explicit; do not silently start XCTest.
- Mirroring requires Wi-Fi on, proximity and a locked phone. Turning the radio
  off disconnects it. An initial Off → Wait 20s → On shortcut did not recover
  while the phone was locked after Mirroring ended; the cause was not established.
  That experiment was changed to an On-only recovery retry. Do not use timed
  background execution as the safety mechanism for an Off operation.
- QuickTime USB preview is observation only. It standardizes the captured status
  bar and can introduce an audio-device prompt; its Wi-Fi icon is not evidence.
- These fixed settings handoffs do not enable arbitrary system UI control,
  authentication, generic URL launching, or remote shortcut authoring.

Apple's protocol documentation:
https://support.apple.com/guide/shortcuts/use-x-callback-url-apdcd7f20a6f/ios

Mirroring requirements:
https://support.apple.com/en-us/120421

## Callback isolation qualification — 8 October

The original callback used the shared business `kudos` scheme. This phone has
both Kickoff DEV and Kickoff Staging installed, making routing ambiguous. An Off
command prepared and ended control, but its callback expired and the app channel
did not return. USB On plus foreground recovery restored the channel. Neither
radio-Off nor the exact cause is claimed from that acknowledgment.

The candidate reserves `runner-kickoff-dev://ios-agent-return`. The explicit
build helper appends that scheme only to its generated development app product,
re-signs with the original local development identity and preserved entitlements,
and strictly verifies the signature. Project/Pod Info.plists remain untouched.
Both unique-scheme callbacks returned on the installed phone. On uploaded a
405-byte result HTTP 200 in 51.51ms; Off uploaded 406 bytes in 18.715ms.
Immediate state reads can be unknown; a fresh read after recovery confirmed Off
returned. Do not infer callback failure from a timed-out observation.

The isolated Wi-Fi Off test lost even direct Tailscale reachability to the phone;
USB On recovery restored it (105ms via LAN). This narrows the failure to the
network transition, rather than only the app driver. Cellular Data and the
cellular line were independently observed enabled in Settings. VPN On Demand
was off; it is now enabled on the existing account, with Wi-Fi and Cellular both
Always, verified by leaving and reopening its preferences. The subsequent Off test still lost direct tailnet ping; foregrounding Tailscale did not immediately restore it. Automatic reconnect is not a proven fix. Kickoff DEV and Tailscale cellular permissions were also observed enabled. After physical unlock and DEV foreground, the bridge, strict readiness, fresh GraphQL probe and native idle passed. The exact recovery cause remains unproven.

The paired USB IORegistry diagnostic exposes Wi-Fi driver power state but no conclusive Settings radio switch. A successful CoreDevice Shortcuts launch is not execution evidence. Use the app-owned callback and fresh interface observation, and independently verify association rather than treating launch success as restoration.

Mirroring pointer delivery initially failed with noWindowsAvailable, despite
images/keyboard/menu working. Rebind/raise did not repair it. A later direct
click on Tailscale succeeded, and settings navigation now works. Recheck the
current surface before asking the human for a click; do not carry a stale
provider failure into a new connection. Keep all phone inspection in the shared
Mirroring window. The temporary QuickTime USB preview is closed; it had exposed
a headphones dialog, which Taylor subsequently confirmed absent.

A diagnostics sleep success is not sufficient proof of physical lock.
Independent confirmation is required when Mirroring still reports in use.
The direct developer screenshot attempt had no active RSD route; no root
daemon or XCTest was started.

## Unplugged bundle transport — 8 October late evening

With USB unplugged, strict readiness, fresh GraphQL, reconstructed React and real native Nutrition navigation (ClientMealLogs) passed. An unconfirmed Home action was not replayed; independent state still showed Nutrition. A semantic reload hit the one-shot embedded fallback and recovered Home. The live Metro bundle measured 34,982,522 decoded bytes with no content encoding. Dev-only streaming compression reduced wire bytes to 7,869,716 (77.5%), with identical SHA-256 of the decoded JavaScript and preserved RN multipart protocol. After the scoped idle Metro restart, the phone loaded tailnet-Metro with no fallback. This is a verified transport improvement; exact cellular path and the final explicit Off batch remain separately open. On callback returned, but no Wi-Fi IPv4 association was observed, so On execution is not called verified association restoration.
