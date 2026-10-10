# Annotation delivery — 10 October 2026

This is a development-only release candidate. The foreground native/page lanes
remain the default; staging is deferred. Unqualified edges below block claiming
complete autonomous whole-phone operation.

## 1. Open the app remotely

`ios_device_launch` now exposes four fixed launch targets behind the shared owner
fence. A physical nearby paired Wi-Fi launch moved from Settings to Kickoff DEV,
then strict native readiness and fresh state passed. No XCTest or user action.
This does not solve the coffee-shop case: the paired developer channel is distinct
from Tailscale and has not been qualified across arbitrary networks.

Best next software candidate: a dedicated synced Focus, with a phone-local
Shortcuts automation set to Run Immediately → Open App → Kickoff DEV. Apple
documents Focus sharing and Focus automation triggers separately; their combined
foreground behavior on this exact phone is NOT tested. Use a dedicated Focus
without notification suppression, restore the previous state, bound each request,
and require a fresh app boot/foreground heartbeat. An APNs notification can offer
a tap-to-open fallback, but cannot promise automatic foreground launch. The dedicated non-silencing Focus was created on the Mac; Share Across Devices
was already on. It has not been activated and phone automation is not configured.
A signed shortcut template passed signing, but its iOS-only app target did not
resolve in the Mac preview, so import was canceled; signing is not execution proof.

## 2. Avoid recurring XCTest approval

No supported scoped credential or app-only authorization exemption was found.
Keeping an approved WDA runner alive can avoid some restarts, but it leaves the
OS automation state active; stopping it can bring the approval back. That tradeoff
is not the requested final solution. No passcode is stored or entered.

Physical alternatives tested without XCTest:

- AX audit service advertises element actions and its capabilities are readable.
  The bounded DEV element walk found no exact intended target; no press was sent.
  Provider documentation requires task_for_pid-allow for perform_press targets,
  so availability does not prove Settings/SpringBoard control.
- Safari Remote Automation advertises availability. A bounded session request
  returned an error on the first attempt and timed out on a diagnostic attempt;
  no click was sent. Do not publish it as a working trusted-input provider.
- Existing native responder input and page DOM input continue to work; neither
  controls OS dialogs. The Focus/Shortcuts candidate reduces the need for system
  input rather than pretending to authorize XCTest.

Remaining gate: qualify one no-XCTest system input path OR explicitly qualify a
reusable approved-runner lifecycle, including reconnect, prompt frequency and
cleanup. Overlay styling is secondary to this gate.

## 3. Minimal hardware only

The daily-phone constraint is binding: no bulky attached rig. A XIAO ESP32C3-class
21 × 17.8 mm BLE-HID board, a tiny keyboard-class accessory or an existing wearable
is a candidate, not a delivery. Battery, antenna and enclosure increase size.
Remote transport and trusted key behavior require proof. Do not assume an iPhone
hotspot forwards its Tailscale VPN. No hardware was purchased or installed.

## 4. Explicit rich capture

`ios_capture` implements opt-in console/network/audio modes for the owned DEV
surface, with bounded device ring, host quotas, selected reads, deterministic
credential masking and private expiring artifacts. Both MCP and the always-on
worker enforce retention. End stops capture, attempts bounded remaining drains,
and reports completeness. Visibility/ownership loss removes hooks and discards
undrained device buffers. No collection while idle.

Physical Safari console/network capture passed with a >12 KiB event, masked
sentinel, preserved response readability, private persistence and glow-off.
A subsequent trusted Mirroring tap started a silent generated Safari stream.
Three private audio chunks assembled into valid AAC media (2.241 seconds).
Capture stop preserved the source track; fixture and glow cleanup passed.
This qualifies generated-stream capture, not microphone or full-call behavior.
The signed native adapter installed, strict runtime readiness passed, seven
console/network events persisted, and idle verification confirmed lease/glow off.
React Native raw audio still requires a native audio adapter.

## 5. Paid membership

The report's membership section now distinguishes paid delivery/services from
free APIs. Eleven projects cover Safari companion extensions, wireless builds,
App Attest, push-assisted return, App Groups, Universal Links, network experiments,
widgets/App Intents, Mac Developer ID and watch/cloud companions. Restricted
entitlements still require approval; membership is not an XCTest passcode exemption.

## 6. Wait and resume promptly

`ios_wait_ready` waits without ownership, wakes on foreground registration, and
returns the fresh surface identity. Browser/page filters cannot accidentally return
native readiness. Tests prove event wakeup and owner preservation; physical
Safari readiness through fresh MCP passed. `ios_begin` still verifies the exact
runtime. Bounded waits should continue while the task is waiting; an expired wait
is not an instruction to give up. Automatic wake of an already-ended model turn
requires a harness scheduler and is not claimed by this MCP tool.

## References

- Focus sharing: https://support.apple.com/en-lamr/guide/iphone/iphd6288a67f/26/ios/26
- Focus triggers: https://support.apple.com/en-euro/guide/shortcuts/apde31e9638b/9.0/ios/26
- Run immediately: https://support.apple.com/en-euro/guide/shortcuts/apdfbdbd7123/10.0/ios/27
- XCTest approval report: https://github.com/appium/appium/issues/19363
- WDA lifecycle: https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/
- Minimal board: https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/

## Phone locking follow-up

Created **Runner Lock iPhone** on the Mac with one Apple Lock Screen action.
iCloud Sync was already enabled. It appeared on the physical phone, one fixed
developer-channel URL invocation locked it, and independent `passcodeRequired`
readback plus live Mirroring confirmed the result. `ios_device_lock` exposes this
without an arbitrary URL/name, and skips dispatch when already locked. Unlock
and true OS authentication remain human actions; nearby lock is not off-LAN proof.

The configured `/Users/taylor/dotfiles/bin/speak` helper is required for human
unblock alerts: speak the actual concise request, never placeholder wording.
