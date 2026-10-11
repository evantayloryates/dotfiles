# Cursor and Chrome source-quality corrections — 0.20.4

Taylor requested fixes for missing reconstructed cursor positions, the blue
pointer residual and Chrome debugging banner, with smoke verification before
completion. This release delivers an explicit idle cursor policy and a tested
cleaner Chrome production path. It does not erase contaminated existing footage
or invent missing movement.

## Missing positions: idle expiry is repaired, initial absence stays unknown

`cursor_render` now accepts `idle_policy:"hold_last"`. It holds the last retained
position until another pointer event, a typing-hide decision or an input
interruption. Default `expire` keeps the previous `max_hold_ms` behavior.
Every timeline frame records exact position age; coverage and warnings identify
holds beyond the usual expiry. No interpolation, future-position backfill or
actor inference is added. Input gaps and non-listening notifications survive
snapshot loading and event/action selection. They invalidate both the old pointer
and click ring until a new measured event. Unknown interruption clocks refuse;
idle holding requires a complete loss-free journal. Clock/fitted-origin/media
refusal guards remain.

Retained Sleeper intervals use the original fps, source selection, trim bounds
and max_hold_ms values, changing only idle policy. Missing positions fall from
1358/2409 (56.4%) to645/2409 (26.8%):713 expired-hold frames are recovered. All645
remaining absences precede a retained position. The old takes cannot establish
where a pointer was before the first event, or reconstruct continuous movement
from sparse clicks. Their movies and raw input are unchanged. Prepare an
intentional pointer action during preroll and begin the selected scene after its
measured position, when that edit fits the production; do not infer an earlier
position from a future click.

## Blue pointer and banner: choose the qualified native alternative

Controlled Chrome154.0.8037.98/build8037.98 on macOS build25F80, Retina2x:

- Fresh owned native-only window, child inclusion disabled, show_cursor:false:
  native clicks and scrolling reached the fixture. Actual5/18/32-second source
  samples contain neither the blue pointer nor debugger banner.
- Attaching browser Playwright control and clicking the same fixture reproduced
  the blue pointer and debugger banner in encoded source samples. Read-only DOM
  inspection found no ordinary overlay element; the internal producer remains
  unconfirmed. Capture pointer hiding cannot remove already painted content.
- Native Close dismissed the informational banner temporarily, but it returned
  in the attached-tab test. Native reload retained the blue pointer. These
  failed repair attempts are preserved; neither is advertised as a clean-source
  fix. No peer debugging session was cancelled and no security settings changed.

For clean production, prepare a fresh owned Chrome window/tab and use native
macOS computer use for the presented actions. Do not attach browser Playwright
control to that production tab. Source-check its encoded pixels before a real
scene. Native input can still be sparse; this alternative does not certify
continuous motion, every app/Chrome version or every display arrangement.
`production_plan` returns the scoped Chrome recommendation for an observed
Chrome window with pointer hiding, so consumers see it without searching docs.
Shared version-scoped pass/fail facts preserve the source findings; unknown
provider version prevents claiming automatic exact-environment qualification.

## Verification and availability

40 focused cursor/frame-snapshot/planning checks pass, including complete-journal
requirements, initial absence, selected-event interruption barriers, resumed
positions, click-ring invalidation and default behavior. Fresh registered MCP
launched with minimal PATH reports0.20.4, advertises cursor_idle_policy:1 and the
new schema, and returns the Chrome plan guidance. Actual native source rendered
through MCP under both policies: expiry lacks positions on203/225 frames; hold_last positions
all225/225 frames in the15-second selected interval (8–23 seconds, after the
first measured position). Both800×500/15fps files fully decode; first/middle/last
render samples visually show one white cursor, no blue residual and no banner.
This verifies held idle presentation, not continuous physical motion.

Native PID89707/buildd7a6a75d975f and widgetbe27e75d391a are unchanged. Fresh MCP
connections/current CLI load0.20.4; existing adapter processes keep their loaded
code until refreshed. The original Desktop Sleeper movie retains its original
hash. Two owned fixture windows, the loopback server, reader/render children,
actions and investigation session are settled. Seven shared action outcomes
have separate verification and cleanup, including the failed reload approach.

Private evidence: this chat's existing capture-qualification bundle under
`release-next/cursor-quality/`, including tests.log, summary.json,
retained-coverage-comparison.json, native-clean-{5,18,32}.png, comparison-{22,55}.png,
fresh-status.json, fresh-plan.json, shared-audit.json and saved render receipts.
Raw captures and cursor derivatives live outside Git. Official composition and
recipe-book work remains Ready; this is a correction to the provisional renderer.
