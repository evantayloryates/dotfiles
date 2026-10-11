# Recorder 0.20 — release integration and Taylor smoke test

The release integrates useful verified portions of partial qualification items;
their broader historical scopes and limitations remain visible in the checklist.
Native build **e402dc736458** is installed, including the real panel-ticket
repair. The initial gate/panel build 3a048fbec3f8 remains in the delivery history. Fresh MCP adapters report 0.20.0 and expose 46 tools. Existing clients
keep their loaded code; the CLI reads current code without restarting peers.

## Included in this release

- Persistent service-owned global safe Pause/Resume, 128-request bounded queue,
  stale-timer fencing, no late auto-start after a queued start expires, native
  desktop reading/control panel and cross-client/CLI controls. Current takes
  drain safely; arbitrary external UI tools cooperate through checkpoints.
- Native WidgetKit desktop companion 5e680bb4c5ab, signed and registered, with
  sampled status, freshness, fixed Pause/Resume links and a Live panel link. Its
  control/snapshot checks passed and desktop placement is confirmed; actual
  widget link-click verification remains underway. No recorder restart or capture-permission change.
- Exact optional input-reception-to-actual-frame context, with held source ages,
  clock/snapshot limits and useful input preserved when video context is absent.
- First configurable SVG/PNG cursor/click recipe, draft and final effort, private
  editable recipe/timeline, meaningful sample frames and original-media retention.
- Durable bug tickets, exact open duplicate detection, one bounded developer
  attempt, actual delivery readback, private release log, subscription/wait hook,
  explicit redispatch/cancellation and uncertain outcomes without automatic replay.
- Shared per-app observations directly discoverable in recorder tools, with the
  existing exact-version facts/planner and bounded resource advisories/logs.
- Existing verified app/display/window capture choices, padding/overflow fallback,
  context scopes, source/frame/paired maps, frame-local independent registration,
  low-effort previews, gap/loss reporting, take-local failures/partial media,
  metadata/identity guards, exclusions, recovery/readback and maintenance fence.
  Those capabilities remain available; no unrelated settled qualification phase
  was reset or replaced by the new features.

## Taylor's short smoke test

1. The single **Medium** widget is installed and Taylor has added it to the
   desktop. Click **Pause**: with no take active, the authoritative service should
   become Paused. Click **Resume**: it should return to Ready. The widget is a
   sampled display, so macOS may delay its text refresh; **Live panel** shows
   current state. Your mouse and keyboard stay usable throughout. Close hides
   the panel without changing the gate; `record-screen production-panel-show`
   reopens it.

2. Ask an agent to record one short throwaway window while showing the panel.
   Pause during the take: expect “finishing,” not an abrupt stop. A second request
   should wait. Let the active take end, then Resume. If the queued start has
   elapsed, expect an explicit reschedule rather than a surprise late start.
3. Preview the retained owned-fixture cursor sample linked in the checklist.
   The basic cursor should land on the red marker and follow the recorded drag.
   This tests the tool behavior, not Taylor's final visual style. Ask for a
   different size/opacity or Draft/Final effort using the editable recipe.
4. If anything fails, file `report_bug` with the symptom and recording ID. The
   repair status must not claim Ready merely because a patch exists. The waiting
   consumer can subscribe, work elsewhere and explicitly retry after delivery.

## Focused evidence

Private acceptance bundle:
`/Users/taylor/.codex/visualizations/2026/10/07/01a11731-ba1f-73c3-bd83-f107fd8b467b/capture-qualification-2026-10-08/release-next/`.
35 controlled native gate checks passed. The private and installed native panel
Pause/Resume controls were read back through AX and CLI. A private owned take
queued, started after Resume, stayed active while Pause showed Draining and
finalized normally. Installed direct-coordinate take rec_fzk9xct9 retained 12
input events with optional frame context available; rendered cursor positions
matched the observed marker [84,248] and drag endpoint [480,550]. Its fresh MCP
consumer smoke checked tool discovery, frame-context reads, a decoded 45-frame
preview and shared fact readback. 27 input/frame reader checks, 2 reception-context
checks, 4 cursor acceptance/refusal checks and 9 durable-ticket checks passed, including feedback that cannot promote a
prepared patch or retrigger a ready signal.
Draft/final recipe renders and representative PNGs are retained privately.
Real ticket bug_222cb658ed024988bb4c7b65 reached the developer worker, preserved
a prepared patch across its explicit sandbox stop, then delivered e402dc736458
through the idle fence and commit/push. Supervisor readback emitted ready
revision 6 once through the deterministic watcher. A repeated wait emitted no
second event. Final native AX confirmed “0 active · 0 queued · 1 in-flight
action” while draining, and the owned action/session settled with the gate open.

## Explicit remaining boundaries

Physical input density/touchpad phases, exhaustive human attribution, extended
provider matrices, whole-host failure/sleep recovery, broad capacity tuning,
real overflow discovery and per-app depth/receipt passes keep Taylor's stated
Deferred prerequisites. Their useful existing portions are included above.
Millisecond clock precision is preserved; physical reaction latency and frame
cadence are separate and are not certified by exact timestamps. The desktop
panel and native WidgetKit companion are installed. Taylor confirmed placement;
macOS reports one configured instance and a display capture shows the compact
widget on the built-in desktop, Ready with a fresh sample. Actual widget control
clicks are the last targeted verification. See [widget usage and evidence](../widget/README.md).
No optional new qualification is silently made a blocker, and no unverified
criterion is called completed.


Widget gallery correction: the initial companion registered but exited before
answering descriptor requests. The corrected extension matches Xcode's
NSExtensionMain entry point. Notification Center receives its entry and both
original Medium/Large placeholders loaded successfully. Large was subsequently
removed at Taylor’s request; actual desktop control clicks remain outstanding. See widget/README.md for the evidence limits.


Taylor confirmed gallery rendering and requested one compact size. Large is
removed; installed companion 5e680bb4c5ab offers Medium only. The current macOS
descriptor and successful Medium preview load confirm that choice. Desktop
placement is confirmed. Control clicks remain outstanding; no other release checks rerun.
