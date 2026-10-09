# Chrome native select capture lane

Qualified on Chrome 154.0.8037.98 (build 8037.98), macOS 26.5.1 / 25F80,
installed recorder 767d45f6ce40 and the external G34WQC A display at 1x.
This is a source-capture finding. Visual reintegration remains deferred.

## Observed boundary

- A tab/app screenshot and selectable AX nodes did not establish native input
  readiness. The existing window was off Space. Raise and Window-menu selection
  did not repair it; native pointer delivery refused without sending input.
- Chrome's native File > New Window produced an owned, reachable fixture window.
  Later movement/off-screen interference invalidated the first menu comparison.
  Moving only that owned window through Window > Move to G34WQC A recovered it.
  These are observed recovery candidates, not universal activation guarantees.
- A genuine native select opened with twelve AX/menu rows. Child-enabled isolated
  window video and a window screenshot taken during display recording omitted
  the popup. A bounded application-only screenshot also omitted it.
- A 520x480 display crop preserved all twelve rows in actual encoded footage.
  Its 51 muxed samples exactly matched source decisions. The supplied popup region
  was 424x348 source pixels at desktop points (1155,-634). Glyph overlap was
  0.983 after measuring a one-pixel horizontal reference offset; zero-offset
  verification failed and remains retained. Arbitrary popup tracking is unproven.
- The display background was covered by another app while the popup remained.
  This qualifies a separate transient source layer, not whole-shot insurance.

## Agent usage

1. Reconfirm the exact app/OS/provider/display environment. Consult shared
   `computer_use_plan` facts for this surface and capture mode; unknown provider
   or display-profile versions must keep `environment_verified=false`.
2. Declare an action scope before UI work. Resolve the exact owned window and
   observe native delivery and popup pixels. Do not arm from tab screenshots alone.
3. Prefer the already qualified base-window lane. For this select, plan a bounded
   display crop that includes the transient surface and allows for movement.
   Explain that display content can be occluded and unrelated pixels can enter.
4. Preserve source geometry segments and exact clocks. Use the recorder's source
   packet for later joins; do not infer ownership or interpolate through missing
   geometry. Verify encoded popup pixels before promising the layer is available.
5. If interference removes the popup or moves the window, retain the take and
   repair only that boundary. Do not rerun completed journal/color/clock work.
6. Close owned tabs/windows and settle the session. A timed-out close observation
   requires an independent absence check, not another close request.

Full synchronized recovery, menu ownership, nested/select variants, built-in
display fallback, app-only video and measured motion/resource budgets remain
open. Source evidence: private gates-v24; report section `twenty-fourth-pass`.
