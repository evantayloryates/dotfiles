# Safari tab recovery probe — experimental

This one-shot extension tests whether Safari can create a fixed private DEV tab when its current page bridge is unavailable. It is not in the MCP catalog, has no persistent network channel, and cannot claim to foreground Safari from Home or another app.

The popup explicitly arms one alarm. Twenty seconds later it creates only `/dev/ios-agent` on the configured private call-rig origin. After sixty seconds it closes only its own tab if the URL is unchanged. The Close button clears both alarms and closes that same owned tab. There is no capture, credential read, script injection, arbitrary URL or automatic arming.

Apple requires a nonpersistent extension background on iOS; `browser.alarms` is used instead of a background JavaScript timer. Actual alarm delivery while Safari is backgrounded must be qualified on the phone.

Physical qualification on 11 October 2026: converter, simulator build, automatic signing, install and DEV-host enable passed. While Safari was active, the alarm created a new DEV document and automatic cleanup returned away from that probe. Original-tab focus restoration did not pass. In the background test, Home was confirmed 3.3 seconds after arming and remained foreground at31.57 seconds. The popup showed `created` only after Safari was explicitly reopened; alarm timing while suspended remains unproved.

Decision: do not integrate this probe into MCP. It cannot solve the high-priority off-site foreground launch gap, and routine tab navigation is already delivered. Keep this reproducible source as a narrow fallback experiment; remove its installed one-shot app after cleanup. It has no remote command channel. See `docs/safari-extension-probe-2026-10-11.json`.

Source placeholders `__DEV_HOST_PATTERN__` and `__DEV_URL__` must be replaced only in a private build copy using the configured HTTPS Tailscale hostname. Do not package credentials or enrollment links. Do not enable this probe in routine agent workflows before physical qualification.

References:
- https://developer.apple.com/videos/play/wwdc2021/10027/
- https://developer.apple.com/videos/play/wwdc2021/10104/
