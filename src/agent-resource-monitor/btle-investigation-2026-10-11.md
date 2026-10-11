# BTLEServer investigation — October 11, 2026

Status: persistent CPU spin confirmed; recovery and exact accessory attribution pending.

## Evidence

Two elevated samples of PID 11713, version 354.11 on macOS 26.5.1 (25F80):
13:43:30 Eastern (4,197 samples per thread) and 13:48:53 (2,508).
The same worker, Thread_1336673, remains entirely in CoreUARP
`uarpPlatformAssetRescind → uarpTransmitQueueAssetRescinded` or its immediate callee.
Main thread remains synchronously blocked in `accessoryUnreachable:error:`.
This strongly supports an internal asset-queue spin, not useful continuous transfer.
No source-level defect or exact malformed queue state has been established.

Historical chronology, all Eastern:

- Oct 10 14:06:07: audioaccessoryd/bluetoothd records identify Taylor's AirPods Pro,
  models A3047/A3048, firmware 9A348.
- 14:06:10: BTLEServer accepts dynamic assets, fully stages an asset, completes
  solicitation and releases an asset. The asset kind/content is redacted; this
  does not prove an actual firmware update was underway.
- 14:34:48: earliest retained high-CPU observation of current PID, ps CPU 99.4%.
  This is not an exact onset: previous retained samples were a different PID
  before a long recorder gap.
- 15:03:08: UARP-over-AACP data received.
- 15:03:10: nearby audioaccessoryd record again identifies Taylor's AirPods Pro.
- 15:03:17: connection event:0, stopping UARP procedure, newly unreachable accessory.
  The peripheral is private/redacted. This is AFTER high CPU was observed,
  so it cannot be presented as the initial CPU trigger.

## Research and limits

Apple identifies A3047/A3048 as AirPods Pro 2 USB-C and lists 9A348 as current:
https://support.apple.com/en-us/109525
https://support.apple.com/en-us/106340
Apple documents automatic firmware delivery while charging and within Bluetooth
range. Current firmware does not rule out a host-side UARP bug or dynamic-asset
handling. No primary public source located documents this exact function's loop
or a confirmed OS fix. Do not assert that an OS upgrade fixes this incident.

System launchd label verified from Apple's plist: com.apple.BTServer.le.
It exposes UARP personalization, BTLE audio and logging Mach services.
There is no evidence linking the spin to custom ios-agent discovery.
AirPods are the leading temporal candidate, not proven origin.

## Next controlled experiment

Await Taylor's current audio/usage status. Preserve active calls and any actual
firmware transfer. Capture baseline CPU and event time, then change one identified
AirPods connection at a time, restoring the original state and comparing CPU.
A persistent tight loop may survive reconnect: if necessary and safe, use one
explicitly scoped launchd restart, `sudo launchctl kickstart -k system/com.apple.BTServer.le`,
then verify new PID, CPU recovery, Bluetooth/audio function and recurrence on
reconnection. This is a recovery experiment, not a permanent fix. Do not restart
bluetoothd, delete pairing databases, reset accessories, disable SIP, or install
a general root helper as a shortcut. Do not run that recovery before the audio
interruption constraint is resolved. Root authentication can expire.

Evidence bundle: /Users/taylor/src/docs/html/resource-usage-audit/
- btleserver-stack-2026-10-11.txt
- btleserver-stack-repeat-2026-10-11.txt
- btle-uarp-events-sanitized.json
- btle-asset-context-sanitized.json
- btle-disconnect-context-sanitized.json
- btle-device-inventory-sanitized.json

The one-second watcher is still active; no system daemon was stopped or restarted.

## Available host updates

Software Update currently offers macOS Tahoe 26.7.1 (restart required), plus macOS 27.0.1. Neither is installed by this investigation, and no primary-source confirmation ties either release to a fix for this exact CoreUARP spin.
