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
Installed handoff acceptance is pending; no staging/customer callback is changed.

The installed unique-scheme On handoff also failed to return; shared-scheme
ambiguity was not the entire cause. A one-shot `pymobiledevice3 diagnostics sleep`
locked this paired phone, independently confirmed by Mirroring reaching its Mac
authentication screen. This is a wired recovery convenience, not an unlock or
authentication bypass. The direct developer screenshot attempt had no active
RSD route; no root tunnel daemon was started. System-side inspection awaits the
human Mac authentication step. No routine flow depends on that screenshot path.
