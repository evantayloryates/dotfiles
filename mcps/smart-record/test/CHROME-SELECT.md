# Chrome native select capture lane

Qualified on Chrome 154.0.8037.98 (build 8037.98), macOS 26.5.1 / 25F80:
recorder 767d45f6ce40 on the external G34WQC A display at 1x, and
53b202f58af8 on the built-in Retina display at 2x. Keep these scopes separate.
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

## Built-in Retina qualification

The 1x omission is not a universal Chrome rule. On the built-in 2x display,
one preexisting 424x346-point overflow select appeared in both child-enabled
window video and a 452x370-point display crop. The display source retained all
twelve rows at 2x with 0.989 glyph overlap. Window capture fitted the overflow
into its fixed 1786x1256 canvas: content scale 0.686339, or 1.372678 source
pixels per desktop point. The saved affine aligned the base marker with zero
edge error and the popup with 0.902 glyph overlap after explicit reference
resampling; no fitted translation was used. Use the journal map rather than
assuming that a 2x display always means two source pixels per point.

A subsequent select opened at a different position entirely inside the same
base window. In paired live streams it appeared with child inclusion enabled
and disappeared with it disabled. The true lane kept the base map at 2x.
This qualifies contained child-option behavior, not an overflow-driven shrink/
restore transition. Popup placement must be reobserved even when the base
window has not moved. Four takes supplied 630 exact muxed/source samples.

The bounded `popup-catalog.swift` helper observed a new same-PID layer-101
window absent/present/present/absent around the authored menu lifecycle.
It omits window titles and unrelated normal-window content, caps returned
candidates at 64 and exposes truncation and exact query bounds. This gives
candidate geometry; PID/layer/overlap still do not prove a general parent
relationship. Run it under `probe-supervisor.py`, never in a capture callback.
An unavailable anchor fails explicitly; the supervisor reaps only its child.

`verify-popup-affine.py` checks supplied bright-on-dark authored popup crops
against a selected decoded frame, including explicit scale resampling and a
scoped absence control. It first checks actual mux/source correspondence and
requires one geometry segment. It is source QA, not automatic menu detection,
continuous tracking, ownership inference or a composition recipe.

Full synchronized recovery, general menu ownership, nested/select variants,
dynamic overflow fitting, app-only video and measured motion/resource budgets
remain open. Source evidence: private gates-v24 and gates-v28; report sections
`twenty-fourth-pass` and `twenty-eighth-pass`.
