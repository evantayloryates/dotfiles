# Native and React operations — quick recipes

Call `ios_guide`, diagnose with `ios_doctor` if needed, and acquire `ios_begin`
once. Use its `sessionId` throughout; always `ios_end` in finally. Native touch
and React inspection use separate IDs. Native arguments are typed per action;
React commands list all supported provider operations in the MCP schema.
Malformed combinations fail before a phone command is admitted.

## Navigate and verify

1. `ios_native {sessionId,action:"tree"}`. Select an observed visible target
   and point within its actual bounds. Use the full private artifact via
   `ios_read` if compact output omits the needed view.
2. `ios_native {sessionId,action:"tap",args:{snapshot,target,x,y}}` within
   five seconds. A label belongs to the observed view; a text child may not be
   the interactive container. Preserve native hit-test/occlusion checks.
3. `ios_verify {sessionId,gate:"route",expected:"NutritionSettings"}` for an
   expected route, or inspect actual React props for the resulting value.
   Delivery alone does not prove navigation or persistence.

## Exact targeting in one MCP call

When you already know a control's exact observed label or identifier, use:
`ios_native {sessionId,action:"tap",args:{selector:{identifier:"meal-description"}}}`.
`label` and native `class` are also supported, and supplied fields must all
match. Exactly one visible interactive view with valid bounds is required.
For an observed unlabelled editor, `{selector:{class:"RCTUITextView"}}` works
only when unique. No substring matching, ordinal selection or heuristic ranking.

The MCP reads the complete private native tree, computes the matched view's
center and immediately sends one normal guarded tap. This avoids a model turn
consuming the five-second snapshot window. Native ownership, freshness,
occlusion and hit testing still apply. Missing/ambiguous matches send no touch;
accepted or unknown outcomes are never replayed. Verify the resulting route or
value as usual. Use explicit fresh points when the center is not the intended
hit region; this helper does not search for an alternative point after failure.

## Edit a field

Tap the actual input from a fresh tree. Then
`ios_native {sessionId,action:"text",args:{text:"2345",mode:"replace"}}`.
For clearing, replacement text may be empty. Take another fresh tree and tap
Save once; independently read persisted state and rendered value. This is
UIKeyInput editing, not software-keyboard, IME or hardware-key simulation.

## Scroll or hold

Use `action:"gesture"` with `{snapshot,target,x,y,endX,endY,durationMs}`.
Duration is 50–5000 ms. A hold keeps end coordinates equal to the start;
a scroll moves through the intended scroll container. Verify recognizer/UI
outcome after delivery. Never replay accepted or unknown input.

## Inspect and profile React

- `ios_react {sessionId,command:{type:"get-tree",depth:8,noHost:true}}`
- `... command:{type:"find",name:"TargetCalories",exact:true}`
- `... command:{type:"get-component",id:<observed React ID or label>}`
- `... command:{type:"profile-start",name:"nutrition-navigation"}`
- Perform one bounded UI interaction, then `... command:{type:"profile-stop"}`.
- Read `profile-slow`, `profile-rerenders`, `profile-timeline`, `profile-commit`,
  `profile-report` or `profile-export` with typed limits/IDs from the schema.

Stop profiling in finally before ending the app lease. Do not invoke product
handlers or replace state to manufacture success. React commit timing is not
whole-process CPU, memory or browser performance.

## Network diagnostics and Wi-Fi

`diagnostics-probe` then `ios_verify gate:"network"` checks the fixed synthetic
backend probe. `diagnostics-matrix` runs the fixed synthetic telemetry fixture;
inspect state/readback to distinguish queued from completed.

`ios_native {sessionId,action:"wifi",args:{state:"off"}}` explicitly retires
control and opens the installed fixed Shortcut. This can disconnect the app.
Do not reuse that lease or replay the handoff. Use existing independent network
readback, recovery shortcut and a fresh lease after the app returns. An offline
bridge does not prove the phone is locked or unplugged.

## Pixels and broader limits

`image` accepts scale 1, 2 or 3 (default 2); `ios_read` renders private pixels.
App-owned images omit system overlays. `ios_device_inspect kind:"screen"`
observes the full display through the nearby paired developer channel.
Normal app control works over Tailscale; device inspection/system fallback
startup has a separate nearby transport boundary. System permission buttons
use explicit bounded `ios_system_begin/action/end`, never an app DOM/native
input masquerading as an OS tap. Apple may require human authorization.

On meaningful driver changes, discover `ios_input_matrix` and read
`ios-agent://native-input-matrix`. That isolated simulator job does not qualify
physical IME, multi-touch, competing-recognizer cancellation or off-LAN use.


### Safari address-field focus handoff

Safari can replace its address field when the keyboard appears. An initial
`type` or `clear` may focus it and then reject its stale native element. Do not
replay that uncertain input. Inspect its current value and keyboard state.
Use explicit `ios_system_action action=focus label=Address
 elementType=XCUIElementTypeTextField`, inspect, then clear/type as separate
intents against the new field. `focus` sends one guarded native click and no
text or clear. Secure fields remain excluded. Submit by tapping the observed
Go button and verify the resulting URL/page, rather than appending Return.


## Recover a clipped browser layout — 1.9.18 candidate

`ios_system_action {sessionId,action:"orientation",orientation:"portrait"}` requests device portrait orientation and independently reads it back. `landscape` is the other allowed value. The same owner/lock/app-scope guards apply; an unknown write is never replayed automatically. Inspect the actual page afterward: Apple device orientation is not an app-layout guarantee.

Physical Chrome had a750×334 landscape viewport with Join below the clipped area; native scroll did not reveal it. Portrait readback passed, the viewport became390×669, and independent DOM showed Join visible and hit-testable. This is not orientation lock: portrait later reverted; an immediate orientation request followed by a fresh guarded Join query succeeded. A separate unexpected Clock foreground was refused before input; fixed Chrome activation recovered without reading Clock content. See system-orientation-physical-2026-10-11.json.

References: https://developer.apple.com/documentation/xcuiautomation/xcuidevice/orientation and https://appium.readthedocs.io/en/stable/en/commands/session/orientation/set-orientation/

### Nested browser panels (1.9.18)

`ios_system_action(action="scroll", direction="down", label="Follow call microphone", elementType="XCUIElementTypeSwitch")` resolves a unique live anchor, checks native bounds/hittability and ownership, and sends one drag of at most 150 points opposite the requested content-scroll direction. No caller coordinates or implicit click. Choose an anchor visibly inside the intended pane. Inspect afterward: inertia can move content farther than the gesture.

On Chrome iOS, native accessibility reported a clipped transport summary as visible/hittable; tapping it changed the microphone beneath it. Native hittability alone does not establish web hit testing. Use the browser DOM clipping and `hitAtVisibleCenter` evidence before native web taps. Anchored scrolling exposed that summary and independent DOM confirmed it visible and hit-testable. The service does not yet automatically correlate native and DOM targets. See `system-scroll-physical-2026-10-11.json`.

### Native web-select controls (1.9.19)

Chrome exposes HTML select controls as `XCUIElementTypeOther`. Exact label/type tapping can open their native option menu without a time-sensitive whole-tree snapshot. Use a DOM read to confirm the select is visible and hit-testable, tap once, inspect the native options, then choose one observed option and read back the DOM value. `Other` is accepted only for tapping/scroll anchors, never for text entry. This is normal native input, not a DOM mutation or a browser-permission bypass.
