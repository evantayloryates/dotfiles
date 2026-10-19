# Apple AX native recovery candidate — disabled

Do not enable for routine agents yet. Workouts activation passed through a corrected
Apple accessibility payload, and a later packaged Invite-to-Workouts transition passed after a500ms channel
settlement. An earlier immediately cleaned Home request had no effect. Corrected
Home/Nutrition effects remain unqualified. The original XCTest runner was active throughout, so
standalone approval-free operation is also unqualified. No current workflow depends
on this candidate. Use the delivered native driver, fixed Home shortcut and bounded
XCTest fallback under their documented gates.

`IOS_AGENT_EXPERIMENTAL_AX=1` adds `ios_ax_native_tab` for isolated qualification.
It takes/releases the shared owner, requires paired Tailscale, foregrounds DEV only
when fresh native foreground evidence is absent, and targets one of Home, Workouts,
Nutrition or Invite. Inspector focus resets and walks only the four known tab
captions, including their Selected suffix. It never activates an arbitrary caption,
uses caller coordinates, types, approves authentication or starts XCTest.

The pinned provider's original element dictionary fails its own deserializer.
The corrected nesting passed an offline round trip and one real Workouts activation.
The service contains that compact correction without modifying the pinned runtime.
See the [upstream method](https://github.com/doronz88/pymobiledevice3/blob/master/pymobiledevice3/services/accessibilityaudit.py)
and ax-native-candidate-2026-10-11.json for evidence and failed gates.

Accepted/unknown activation is never replayed. `effectVerified:false` requires an
independent selected-tab or route check; an unchanged selection is not success.
Monitoring disable/final cleanup and channel close remain mandatory. The candidate
has seven focused provider cases and four MCP/backend cases. Its material physical
gates are still open, so it is absent from the default catalog and harness config.

The candidate now holds its AX channel for500ms after a single activation before
final cleanup. A separately instrumented Invite activation and the actual packaged
Workouts path then passed independent selected-tab readbacks. This supports the
cleanup-timing hypothesis without proving it uniquely caused the older Home
failure. No accepted action was replayed as an uncertain retry. It remains
disabled: all-tab, standalone XCTest-free and physical off-LAN gates are open.

## Later negative boundary: no XCTest, Mirroring connected

After the phone XCTest process disappeared independently, automatic Mirroring
reconnect succeeded. Fixed paired DEV launch and fresh native foreground feedback
worked. One new Nutrition attempt could not obtain AX focus and sent no activation;
Mirroring independently remained on Home. No retry was sent. Home Screen cleanup
through Mirroring was separately confirmed. This is a new boundary, not proof
that the candidate fails on an ordinarily unlocked phone without Mirroring.
The candidate remains disabled; do not promote the earlier held-XCTest results
into standalone authorization proof. See the dated candidate receipt.
