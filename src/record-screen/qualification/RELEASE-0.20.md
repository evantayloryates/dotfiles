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
- Native WidgetKit companion 0c731006740f, one Medium widget with sampled status,
  freshness and a single background play/pause App Intent button; Details opens
  the optional live panel. Taylor's original widget Pause click passed; 17
  contract/22 mailbox checks and a signed sandboxed same-intent probe passed.
  Actual WidgetKit Resume dispatch and focused/unfocused appearance are verified. The upgrade now
  retires only its old extension process to avoid stale version mismatches.
  No recorder restart or capture-permission change.
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

1. The existing single **Medium** widget now uses one button: **▶ Resume** while
   paused, **⏸ Pause** while running. Click it and expect the service to change
   state without opening another window. **Details** optionally opens the live
   panel. Sample age stays visible; an expired sample disables the button. Your
   input stays usable. A pause lets current work finish safely and queues new work.

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
panel and native WidgetKit companion are installed. Desktop placement and
Taylor's original real Pause click passed. The new single-button background
transport is verified from a signed sandboxed app; actual WidgetKit Resume dispatch passed with openAppWhenRun NO and service
state Ready/generation 11. Taylor's screenshots established the focused display
and exposed the unfocused button-contrast defect. Build 0c731006740f fixes that
mode with a transparent outline; actual unfocused pixels show a readable pause
glyph/label. Explicit state text makes admission clear. See
[widget usage and evidence](../widget/README.md). No other release criterion is
silently deferred or called complete.

The initial gallery failure was repaired with Xcode's NSExtensionMain linker
entry point. Large was removed at Taylor's request. A later in-place upgrade
exposed a retained old extension process and bundle-version mismatch; the
installer now retires only that extension so macOS loads current code. Original
failures and evidence are preserved privately.
