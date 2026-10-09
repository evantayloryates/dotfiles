# Native input qualification matrix

Personal Debug builds only. Simulator qualification is evidence for the actual
compiled UIKit driver; it is not a physical iPhone or React Native gesture-matrix
substitute. No XCTest is used by this fixture.

## 8 October 2026 simulator pass

The runner compiles `tests/Fixture.m` with the real native `.inc` files, launches
an isolated UIKit app, and checks UIKit callbacks and responder state. Driver
results such as `delivered: true` are insufficient on their own. Source hashes
bind each private result to the driver compiled for that run; source drift fails
the gate. Results are private mode-0600 files and cannot overwrite an earlier run.

| Behavior | Independent fixture assertion | Current evidence |
| --- | --- | --- |
| Native tap | UIButton touch-up counter increments once | Passed |
| Long press | UILongPressGestureRecognizer began counter increments once | Passed |
| Scroll | UIScrollView content offset changes by over 50 points | Passed |
| Nested recognizers | Child tap recognizes; parent requiring child failure does not | Passed |
| Gesture competition | Moving pan recognizes; competing long press does not | Passed |
| Native focus | Native tap makes UITextField the first responder | Passed |
| Focus switching and text | Two native taps route Unicode text to two distinct responders | Passed |
| No focused responder | Text is rejected before insertion | Passed |
| Same-window cover | Fresh underlying target is rejected | Passed |
| UIKit modal | Real over-fullscreen presented controller blocks underlying target | Passed |
| Secondary window | Another app-owned UIWindow blocks underlying target without delivering a touch | Passed |
| Stale snapshots | Old age and a superseding tree both reject input | Passed |
| Geometry changes | Moved and detached views reject old target coordinates | Passed |
| Bounds | Negative app coordinate is rejected | Passed |
| Command fencing | Duplicate ID and wrong epoch are rejected | Passed |
| Input collision | A second command cannot start while a touch is active | Passed |
| Cancellation | UIKit touchesCancelled occurs; no extra end or long press occurs | Passed |
| Owner replacement | Old gesture completion cannot revoke a new owner's glow/lease | Passed |
| Expiry | Native watchdog removes lease, glow, touch, and snapshot state | Passed |
| Visual fidelity | Glow preserves button geometry/key window and passes hit testing through | Passed |
| Wi-Fi callback boundary | Wrong/duplicate/expired callback cannot grant control | Passed; no phone radio action in fixture |

The initial expanded run exposed fixture issues rather than a driver defect: the
previously scrolled button was offscreen for geometry checks, and Objective-C
logical expressions serialized as numeric 1 rather than JSON true. Later runs
use a visible target and accept only true/1 for boolean assertions. Detaching a
view changes its screen geometry, so its expected safe rejection is
`target_geometry_changed`.

The expanded behavior run passed all 31 gates in
`/Users/taylor/Library/Application Support/ios-agent/qualification-2026-10-08/input/extended-3-window.json`.
The simulator returned to Shutdown. An initial container query while Shutdown
was not valid evidence of app removal. A booted registry read later found the
fixture still installed; it was explicitly removed and registry absence verified.
The runner now fails if its fixture is already installed, verifies uninstall
against the booted app registry, and restores Shutdown even if cleanup fails.
The final repeat below qualifies those cleanup checks and includes native source
and fixture executable hashes.

Final receipt:
`/Users/taylor/Library/Application Support/ios-agent/qualification-2026-10-08/input/extended-final-registry.json`.
All 31 gates passed; sources remained unchanged. The runner exited 0 after
verifying fixture absence in the booted installed-app registry. Independent
readback confirmed the simulator was Shutdown after completion.

## Required physical gates

- Long-press recognizers and actual context menus in the installed app. Moving
  a text caret after a delivered hold is narrower evidence.
- React Native nested scroll and gesture-handler competition, including a
  cancel or background event during an actual native gesture.
- Software keyboard layouts, selection/editing behavior, secure fields, and
  hardware keyboard cases that agents will rely on. UIKeyInput insertion is
  semantic text entry and does not reproduce a keyboard keypress.
- Separate app-owned alert/window behavior on the current iPhone runtime, plus
  independent system-occlusion checks through Mirroring or a bounded fallback.
  An app-window screenshot cannot establish absence of system overlays.
- Repeat native selector/runtime capability and behavioral probes after an iOS
  update. Private UIKit/HID construction is a runtime dependency.

Multi-touch/pinch, system Settings/permission dialogs, and hardware buttons are
outside this single-touch in-process driver. These should remain explicit
capability limits rather than successful-test claims.

## Reproduction and cleanup

Use the dedicated `Kickoff iOS POC` simulator UUID and a fresh private output:

```sh
python3 -B /Users/taylor/dotfiles/src/ios-agent/tests/run_fixture.py \
  --simulator 8F5D9771-2224-482D-8A96-C0315640BA9C \
  --output '/Users/taylor/Library/Application Support/ios-agent/qualification-2026-10-08/input/new-result.json'
```

The runner starts only the selected simulator if previously shut down, removes
only its own `com.taylor.ios-agent.fixture` app, and restores a simulator that it
booted to Shutdown. A previously booted simulator remains booted. It never
boots or shuts other simulators, enrolls an app, connects to the live broker, or
accesses business data.

## Current physical additions — 8 October

The installed adapter passed the real meal row's dedicated 850ms long-press,
UIKit popover text inspection, outside-popover dismissal, absence of performance
and warning panels, and restored native idle. The horizontal macro row inside
the vertical meal list moved exactly its 6.333-point overflow while preserving
vertical position. A generic 20-point fixture assertion was invalid for this
small row; existing geometry/after evidence closes the correct end-of-content
assertion without another input attempt. Actual focused replacement/Save and
normal native navigation remain qualified by the paired workflow.

The candidate's 42 compiled UIKit gates include explicit accessibility-label
precedence, UILabel text fallback, and secure input descendant redaction.
Physical IME/composition, hardware keypresses, multi-touch and system UI are
not qualified by UIKeyInput or by app-owned pixels. Cancellation of an accepted
long gesture retired the host command as unknown, explicitly released control
and passed native idle; no input was replayed. Its target was a passive view,
so this alone is not a physical competing-recognizer cancellation assertion.


Recovery candidate, 8 October: native trees retain capture time, with a five-second input window after the first successful delivery acknowledgment and a 15-second absolute age cap. Acknowledgment is fenced to the same snapshot, owner, epoch and foreground generation; reload invalidates it. Host background React admission yields for at most two seconds after a successful tree. Compiled fixture: 48 gates passed; host suite: 82 tests; JS suite: 22 tests. Latest signed product installed, physical recovery gates in progress. Refresh-cause enums are recorded without paths, source contents or console messages. State-preserving Fast Refresh remains unqualified.


Lease-scoped keep-awake candidate: UIKit idle timer is disabled only while control is leased; release, foreground loss and expiry restore its prior value. A preexisting disabled idle timer remains disabled. This does not prevent a manual lock or remove phone/Mac authentication. Compiled fixture 51 gates passed, including the three idle-timer checks. Latest signed build installed. Fixture runner now repairs only a missing-payload registry record on its own freshly booted simulator; a real installation or shared boot remains a collision refusal. Wi-Fi-off handoff briefly lost transport; fixed USB On recovery and a fresh build restored foreground registration. No single root cause is claimed for that transport loss.
