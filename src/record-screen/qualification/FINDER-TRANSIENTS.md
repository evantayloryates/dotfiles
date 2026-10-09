# Finder transient surfaces: qualified lane

October 9, 2026. Finder26.4/build1828.5.2, macOS25F80, native CUA
provider version unknown, stage39 recorder f314bb340344; stage41 installed3ff4c4519dc8. Built-in display1:
1512×982 points at2×. This is one synthetic list-view file fixture, not a
universal Finder, OS or provider guarantee.

| Surface | Actual recorded result | Consumer expectation |
| --- | --- | --- |
| Context menu and Open With submenu | Present with child-enabled parent capture; absent in child-disabled control; present in padded display | Use child inclusion explicitly and check encoded menu pixels |
| Quick Look file preview | Absent from child-enabled Finder parent source | Do not inherit the menu result for this different transient family |
| Quick Look in padded display rect172,160,1202,812 | Panel body visible; title and two text lines above the crop | Padding is a candidate, not a coverage guarantee |
| Quick Look in full display3024×1964 | Actual title and both synthetic text lines retained | Useful insurance; unrelated desktop and upper-right notification also present |

The menu sources retain one fixed parent geometry segment2404×788, affine
[2,0,0,2,-344,-870]. No arbitrary overflow extent or dynamic child-fitting claim
follows. The padded display source is2404×1624, affine[2,0,0,2,-344,-320].
Source-owned mapping selected actual muxed frame indices; requested fps was not
used to reconstruct timestamps. Eight sources passed18,641 exact journal/mux
joins, with zero reported writer drops and journal rows lost.

At stage39, Quick Look was observable through Finder AX but absent from the
normal Finder inventory; ownership was then unestablished. Stage41 broader
discovery establishes FinderPID71091/window8096/layer3 for the owned panel.
Normal inventory excluded that layer. This does not establish semantic
parenthood or promise application capture inclusion.

For a requested file preview, select the exact row and verify selected filename
before Space, then independently verify preview filename and content. Dismissing
a context menu did not preserve the required selection here: the first attempt
previewed the folder. Its correction happened after the initial70s take ended.
That failed precondition is retained; the later150s sample recorded the already
verified file preview. Closing occurred after the take, so no recorded closing
transition is claimed. A final40s full-display sample proved the missing content.

Before choosing a crop, inspect the actual transient extent. A source can
contain a dark panel while omitting the only meaningful content at its top.
If the bounds are uncertain, retain a broad source and choose the crop later
from verified pixels and source geometry. Broad recording captures unrelated
windows/notifications; protect private evidence and show only the necessary
owned pixels in reports. This test changed no notification settings or user
input behavior. Composition/reintegration remains the next phase.

The first cleanup receipt expired during a long observation gap. Its later
window close was independently verified, without extending the expired bounds.
Keep UI scopes short: begin, dispatch, inspect, close; run media QA afterwards.
The final setup/cleanup scopes closed normally. Ten typed receipts/outcomes
retain9 verified checks and1 failed precondition, cleanup10 complete/uncovered0.
These are reported observations, not authenticated actor ownership or a task
success rate. Four scoped app facts were independently read back; unknown
provider version prevents treating them as fully verified reuse guarantees.

All owned Finder windows, Quick Look panels, eight recordings and three passive
observers were settled. Finder and unrelated baseline apps stayed running.
The recorder remained unchanged/idle, PID35547.374 resource observations were
fresh normal pressure, with no observer errors/guard stops; no thermal, GPU,
capacity or WindowServer-causality qualification. The menu source reports a
protected-input gap; Input Monitoring remains granted, with no new key claim.

Private evidence: this chat's capture-qualification-2026-10-08/gates-v39.
Read the shared capability lane before reuse and qualify only the changed or
missing boundary. Preserve the menu and failed-preview evidence; do not rerun
the whole sequence to investigate another transient family.

## Stage41 direct panel source

Explicit windows include_transients:true reveals floating/small/helper surfaces;
default inventory remains unchanged. Narrow by app/on_screen_only, verify AX
filename and PID/ID/layer/extent, then target the exact discovered window. Native
capability transient_window_inventory1 and fresh adapter0.11.3 are required;
older native engines refuse explicit scope rather than silently ignoring it.
Exact-window production planning uses broader inventory when supported.

Candidate30s and installed8s takes captured this Quick Look panel directly with
childfalse/cursorfalse at1632×1698.446/120 exact actual mux/source joins, no reported
writer or journal loss. Selected frame222/60 shows filename, both synthetic lines
and isolated panel; declared title region contained1. This avoids the unrelated
desktop and crop omission observed in stage39 for this scope. No blanket clean
cursor/popup/occlusion guarantee follows from two selected samples.

One fenced delivery installed3ff4c4519dc8/PID74192, preserving all119 prior state
hashes and grants. Fresh listener available; protected-input gap remains, no new
key coverage. Four reported typed outcomes/cleanup completed, zero uncovered;
central scoped fact independently read back. All owned UI/sessions/private engine
settled, production idle. Evidence: private gates-v41. Menu/failed-preview/crop
controls from stage39 remain useful and were not rerun.
