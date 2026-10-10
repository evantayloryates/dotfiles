# Recorder 0.20 — release integration and Taylor smoke test

The release integrates useful verified portions of partial qualification items;
their broader historical scopes and limitations remain visible in the checklist.
The first new native build is3a048fbec3f8; the real panel repair ticket will record
its subsequent delivered build. Fresh MCP adapters report0.20.0. Existing clients
keep their loaded code; the CLI reads current code without restarting peers.

## Included in this release

- Persistent service-owned global safe Pause/Resume,128-request bounded queue,
  stale-timer fencing, no late auto-start after a queued start expires, native
  desktop reading/control panel and cross-client/CLI controls. Current takes
  drain safely; arbitrary external UI tools cooperate through checkpoints.
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

1. In the **Screen recording** desktop panel, request safe pause. With no take
   active, it should say Paused. Resume should return to Ready. Your mouse and
   keyboard stay usable throughout. Close hides the panel without changing the
   gate; `record-screen production-panel-show` reopens it.
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
finalized normally. Installed direct-coordinate take rec_fzk9xct9 retained12
input events with optional frame context available; rendered cursor positions
matched the observed marker [84,248] and drag endpoint [480,550]. Its fresh MCP
consumer smoke checked tool discovery, frame-context reads, a decoded45-frame
preview and shared fact readback.27 input/frame reader checks,2 reception-context
checks,4 cursor acceptance/refusal checks and6 durable-ticket checks passed.
Draft/final recipe renders and representative PNGs are retained privately.
The live developer-ticket completion evidence is recorded separately rather than
being inferred from those isolated lifecycle checks.

## Explicit remaining boundaries

Physical input density/touchpad phases, exhaustive human attribution, extended
provider matrices, whole-host failure/sleep recovery, broad capacity tuning,
real overflow discovery and per-app depth/receipt passes keep Taylor's stated
Deferred prerequisites. Their useful existing portions are included above.
Millisecond clock precision is preserved; physical reaction latency and frame
cadence are separate and are not certified by exact timestamps. The desktop
panel is installed; a true WidgetKit desktop widget remains a presentation
choice awaiting Taylor's response. No optional new qualification is silently
made a blocker, and no unverified criterion is called completed.
