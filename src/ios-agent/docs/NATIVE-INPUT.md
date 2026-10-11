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
