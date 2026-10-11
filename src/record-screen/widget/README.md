# Native desktop recording widget

The signed **Record Screen Control** companion and WidgetKit extension are
installed under `data/record-screen/widget/Record Screen Control.app`.
Widget build **5e680bb4c5ab** is separate from recorder build **e402dc736458**;
installing it did not rebuild/restart the recorder or change its capture grants.

The original build registered but was absent from the gallery: its executable
returned before answering the system's descriptor request. The corrected build
uses Xcode's `_NSExtensionMain` linker entry point. Notification Center now
receives **Screen recording**. Taylor confirmed both original size previews in
the gallery; at Taylor’s request the taller Large size was then removed. The
installed widget now supports **Medium only**, and macOS reports that single
family and successfully loads its preview. A successful registration alone does not establish
this; inspect the descriptor/placeholder result after installation.

To add: right-click empty **desktop wallpaper**, choose **Edit Widgets**, search
**Screen recording** (app **Record Screen Control**), and drag the single Medium preview
to the desktop; click **Done**. Reopen an already-open gallery after an upgrade.
Gallery appearance and placement are confirmed: Taylor added it, WidgetKit
reports one configured instance, and an actual display capture shows the
compact widget Ready on the built-in desktop. Actual control clicks are the
remaining check. CUA sees a different empty Notification Center window and
cannot target the desktop links; the direct companion/service controls already
passed independently. Do not treat those direct controls as a widget click test.

The widget shows sampled recording/queue/action counts, sample age and explicit
unavailable/stale state. Pause and Resume links open the signed companion, which
performs one fixed service request. Live panel opens the existing native panel.
Pause means finish current work safely and queue new work; it never blocks user
input. URLs cannot supply arbitrary methods, parameters, paths or commands.
Unknown outcomes are not automatically replayed.

The service gate remains authoritative. macOS schedules widget refreshes;
sampled status is not an instantaneous guarantee. Timeline entries expire after
30 seconds, and sample age stays visible. The companion polls every three
seconds, publishes aggregate-only snapshots on changes or every 20 seconds,
and asks WidgetKit to reload. Missing service data never becomes a confident
zero-active reading. The group snapshot is private mode 0600; no window names,
input events or footage are shared with the widget.

`production_widget_status` (CLI `record-screen production-widget-status`)
reports installation, helper state, configured instance count and snapshot age.
A configuration count cannot establish desktop versus Notification Center
placement. No raw launch-service environment is returned. The helper starts
with a small clean environment through its own LaunchAgent
`~/Library/LaunchAgents/com.taylor.record-screen.widget-host.plist`.

The widget may appear in a broad display capture, like other desktop content.
Use the qualified source/crop/exclusion strategy; do not assume the desktop
widget inherits the live panel’s capture exclusion.

## Delivery and focused checks

`python3 src/record-screen/widget/build.py` prepares an immutable signed
candidate. `--install` registers a first installation. Deliberate
`--install --upgrade` replaces/restarts only the widget companion; original
signed candidates stay available under `prepared/`. Never use this to restart
the recorder. Builds freeze source and reject drift before installation. The bundle version
changes with the source fingerprint so macOS refreshes widget descriptors.
The existing H77CX8PYPV development identity/app-group team must match;
no account enrollment, new signing identity or permission change is attempted.

Seventeen contract checks cover freshness, future/old samples, URL rejection
and the fixed-method boundary. Installed companion control calls paused/resumed
the actual service, and its running helper published the matching shared
snapshot; the original recorder PID/build stayed unchanged. WidgetKit reports
configuration count separately. These checks do not certify gallery rendering
or the links being clicked inside a placed widget.

Apple references: [app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups),
[widget refresh](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date),
[widget links](https://developer.apple.com/documentation/widgetkit/linking-to-specific-app-scenes-from-your-widget-or-live-activity).
