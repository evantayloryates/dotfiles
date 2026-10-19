# On-demand static accessibility diagnosis — 1.9.26

`ios_accessibility_audit` asks Apple's on-device audit daemon to inspect a fixed
foreground DEV surface. It adds an independent native-process check alongside
DOM/native hierarchy reads. It requires neither XCTest nor Mirroring.

```json
{"target":"safari","profile":"call-rig","checks":["hit-region","text-clipped"]}
```

Targets: Kickoff DEV, Safari, Chrome. Browser profiles: app or call-rig. Optional
checks: contrast, hit-region, text-clipped; at most three distinct checks.
Default: Kickoff DEV, hit-region and text-clipped. Dynamic Text, changes to device
accessibility settings and simulated element activation are excluded.

Use an existing native/browser sessionId to preserve its usual owner/glow.
Otherwise the tool reserves/releases a temporary diagnostic owner; it does not
start XCTest or add phone UI. Existing owners are never displaced. Native
foreground comes from fresh authenticated SDK feedback, with boot/host fencing.
Browser foreground requires an active Inspector target at the exact configured
DEV origin, a visible document and the same frame/loader identity before/after.
No native action is sent under a system/browser owner: the preflight uses status.
The target process is resolved freshly on the exact paired iPhone.

The audit window is bounded to eight seconds. Target setup and completion use a
private audit connection; final cleanup is sent and that connection closes even
on timeout or ownership loss. An unconfirmed cleanup fails the operation.
The whole invocation has a32-second provider limit. A failed/unknown attempt is
never an instruction to replay it automatically.

The result summarizes issue counts and returns an artifact. Read selected
`/result/issues` with ios_read, including offset/count windows. Keep up to256issues
and1MiB of projected diagnosis fields; droppedIssues is explicit. The host report
uses the existing2MiB diagnostic/128MiB total quota and expires after one hour.
No screenshot, raw element handle or full audit protocol dump is retained.

## What the physical smoke established

The static checks completed on Kickoff DEV. A deliberately broken fixture in the
approved call-rig origin produced four Safari and seven Chrome findings. Both
contained the intentionally tiny button at12×13points, with different screen Y
positions matching the browsers' different chrome. This is a positive control
for tap-region diagnosis. See accessibility-physical-2026-10-11.json.

**Interpret the report, not just its count.** Safari/Chrome audits can include
browser controls as well as page content. Their rectangles are native screen
points, not document CSS coordinates. Compare with an independent DOM/native
reading; the tool does not automatically attribute every issue to app markup.
The clipped-text findings did not establish a positive control for the fixture's
clipped paragraph. The known low-contrast text was not reported by either browser.
Therefore contrastPositiveControlQualified stays false and zero issues never
certifies accessibility. Do not label the app compliant from this tool.

The reproducible synthetic fixture lives in tests/fixtures/accessibility.html.
For qualification it was copied temporarily into the existing DEV web public
folder, independently served, then removed. The temporary receiver was stopped;
Home returned; the original XCTest hold remained intact. No app-source behavior
or user accessibility setting was changed. Physical off-LAN transport acceptance
remains separate from this nearby overlay test.

## Other developer-control candidates closed for this device

A fresh paired tailnet RSD catalog did not advertise the Indigo button,
Universal HID, display-stream or pasteboard services. Those APIs exist in the
pinned provider but are not usable just because the library exposes a class.
No HID event, media stream, privilege change or new XCTest session was attempted.
The working launch/Inspector/DVT lane remains available. A future OS/DDI change
can justify rechecking service availability; unchanged retries cannot.
