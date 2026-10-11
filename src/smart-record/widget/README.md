# Native desktop recording widget

The signed **Smart Record Control** companion and WidgetKit extension are
installed under `data/smart-record/widget/Smart Record Control.app`.
Widget build **be27e75d391a** is separate from recorder build **d7a6a75d975f**.
The renamed app identities, permissions and single placed widget are verified;
see [current delivery evidence](../qualification/SMART-RECORD-RELEASE.md).
The earlier gallery and control qualifications below describe the implementation
carried forward into this installation.

The original build registered but was absent from the gallery: its executable
returned before answering the system's descriptor request. The corrected build
uses Xcode's `_NSExtensionMain` linker entry point. Notification Center now
receives **Smart Record**. Taylor confirmed both original size previews in
the gallery; at Taylor’s request the taller Large size was then removed. The
installed widget now supports **Medium only**, and macOS reports that single
family and successfully loads its preview. A successful registration alone does not establish
this; inspect the descriptor/placeholder result after installation.

To add: right-click empty **desktop wallpaper**, choose **Edit Widgets**, search
**Smart Record** (app **Smart Record Control**), and drag the single Medium preview
to the desktop; click **Done**. Reopen an already-open gallery after an upgrade.
Gallery appearance and placement are confirmed: Taylor added it, WidgetKit
reports one configured instance, and an actual display capture shows the
compact widget Ready on the built-in desktop. Taylor's actual Pause click was
independently read back as Paused (generation 9). The later interactive-button
upgrade keeps the same single Medium widget; its actual Resume interaction is now confirmed by WidgetKit execution logs,
service generation 11 and Taylor's screenshots. CUA cannot itself click that
surface; the system log identifies the real extension invocation independently.

The widget now has **one interactive button**: ▶ Resume while paused, ⏸ Pause
while accepting work. It uses a background App Intent, with `openAppWhenRun`
false, instead of activating the companion through a link. **Details** optionally
opens the existing live panel. Pause means finish current work safely and queue
new work; it never blocks user input. Draining still offers Resume to cancel the
pause request. A stale/unavailable sample disables the button and directs the
user to current status; its icon is based on the visible sample, not a promise
that the service cannot have changed since sampling.

The sandboxed extension writes one explicit desired state to a private app-group
mailbox. The running companion checks it each second, claims before sending once,
performs only the fixed service Pause/Resume call, confirms the actual state,
publishes the snapshot and acknowledges. WidgetKit reloads after the intent
returns. No new socket entitlement, foreground window or arbitrary command
channel is added. A ten-second request expiry prevents surprise delayed actions;
claims survive helper crashes until cleanup and uncertain outcomes are never
replayed. Receipts expire after a minute. A failure is explicit rather than an
optimistic icon change. Source events, window names and footage never enter this
mailbox. Existing fixed URLs remain for backwards compatibility and Details.

The service gate remains authoritative. macOS schedules widget refreshes;
sampled status is not an instantaneous guarantee. Timeline entries expire after
30 seconds, and sample age stays visible. The companion samples every three
seconds, publishes aggregate-only snapshots on changes or every 20 seconds,
and asks WidgetKit to reload. Missing service data never becomes a confident
zero-active reading. The group snapshot is private mode 0600; no window names,
input events or footage are shared with the widget.

`production_widget_status` (CLI `smart-record production-widget-status`)
reports installation, helper state, configured instance count and snapshot age.
A configuration count cannot establish desktop versus Notification Center
placement. No raw launch-service environment is returned. The helper starts
with a small clean environment through its own LaunchAgent
`~/Library/LaunchAgents/com.taylor.smart-record.widget-host.plist`.

The widget may appear in a broad display capture, like other desktop content.
Use the qualified source/crop/exclusion strategy; do not assume the desktop
widget inherits the live panel’s capture exclusion.

## Delivery and focused checks

`python3 src/smart-record/widget/build.py` prepares an immutable signed
candidate. `--install` registers a first installation. Deliberate
`--install --upgrade` replaces/restarts only the widget companion; original
signed candidates stay available under `prepared/`. Never use this to restart
the recorder. Builds freeze source and reject drift before installation. The bundle version
changes with the source fingerprint so macOS refreshes widget descriptors.
The builder extracts and verifies App Intent metadata in both app and extension
before signing; ordinary Swift compilation alone does not register an intent.
After replacement it retires only the old installed widget extension process.
Otherwise macOS can keep the old code and reject new timelines with “Bundle
version did not match.” Notification Center, chronod and the recorder are preserved.
The existing H77CX8PYPV development identity/app-group team must match;
no account enrollment, new signing identity or permission change is attempted.

Seventeen contract checks cover freshness, future/old samples, URL rejection
and the fixed-method boundary. Twenty-two mailbox checks cover expiry, duplicate
claims, uncertain failures without replay, mismatched state, bounded/symlink
reads and asynchronous acknowledgment. A signed **sandboxed app probe** invokes
the same App Intent, successfully reaches the installed companion and confirms
the actual paused state without foreground activation. The original unbundled
probe failed in sandbox initialization; the correctly packaged app probe passed.
This establishes the sandbox transport, not actual WidgetKit button dispatch.
Taylor's earlier real widget Pause click passed on the old link version.
Actual WidgetKit dispatch also passed: chronod received SetRecordingGateIntent
at 20:14:21.238, extension perform ran from .272 to .688, and chronod reported
success with openAppWhenRun NO. The service became Ready at generation 11.
Taylor's focused screenshot shows the single blue Pause button. The unfocused
screenshot exposed flattened same-color prominent button content. The repaired
build reads widgetRenderingMode: fullColor keeps the blue button; other modes use
primary text and a transparent capsule outline. Actual unfocused display pixels
confirm the pause glyph and text are legible. State reads “Recording allowed” or
“New work paused”; a draining pause additionally says it is finishing safely.

Apple references: [interactive widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities),
[app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups),
[widget refresh](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date).
