# Register one retained frame inside the service

Fresh MCP0.19 exposes `recording_registered_frame`; current CLI uses
`record-screen registered-frame JSON`. This read-only path can recover a local
translation when an isolated child-enabled source's original affine is guarded.
It does not alter `recording_frame_map` or remove the fitted-origin guard.

Pass distinct terminal primary/backup recording IDs, one exact primary frame
index, two to four anchor rectangles and one to four independent verification
rectangles. Rectangles use desktop points and globally unique IDs. Supply
textured, disjoint regions that refer to the same subject in both sources.
Verification must stay outside all anchor sampling extents; the validator
reserves15points for quarter-phase expansion at the minimum supported density.
Optional `desktop_regions` requests geometry projections after verification.
No file paths, external clocks, caller affine or score overrides are accepted.

```json
{
  "primary_recording_id": "rec_PRIMARY",
  "backup_recording_id": "rec_BACKUP",
  "primary_frame_index": 100,
  "anchors": [
    {"id":"red-marker","x":416,"y":394,"w":48,"h":48},
    {"id":"title","x":515,"y":290,"w":250,"h":32}
  ],
  "verification_regions": [
    {"id":"independent-marker","x":736,"y":536,"w":48,"h":48}
  ],
  "desktop_regions": [
    {"id":"parent","x":400,"y":290,"w":400,"h":310}
  ]
}
```

These example coordinates describe the owned qualification fixture, not an
arbitrary application. Caller-declared features remain hypotheses. A successful
local comparison does not authenticate semantic ownership or an actor.

## Timing and file binding

The service resolves source journals and actual mux packets under one snapshot
admission. It selects backup content at the primary frame's retained **source
content time**, including held/preroll frames. Both records need a qualified
common recorder process clock and complete journals. The default maximum
absolute content-time difference is50000000ns; explicit
`max_content_delta_ns` can range from`"0"` to`"250000000"`. This bounds retained
reception/content time, not physical presentation or provider calibration.

Source/video leaves remain open while the async consumer works. FFmpeg receives
those video descriptors, selects the probed first video stream and exact frame
indices, and reports rational decoded PTS. Both decoded timestamps and image
dimensions must match the selected mux records. The result includes source/frame
identities, opened-leaf stat identities, metadata digests and decoded RGB hashes.
Opened leaves are checked again after worker completion. There is no filesystem
isolation guarantee, but path replacement cannot redirect decoding away from
those already-open video descriptors. The mapping lease remains active through
async decoding; concurrent mapping refuses rather than sharing mutable state.

Primary canvas is limited to1million pixels and backup to8million. The service
does not silently rescale videos into another coordinate system. Supported
registration is positive isotropic density plus translation. Backup affine
must already be available; an unqualified fitted backup cannot certify a fitted
primary. Unknown clocks, source gaps, missing references, clipped features and
excessive content-time difference refuse before decoding.

## Independent image verification

The bounded RGB matcher uses the retained primary density and backup affine as
hypotheses, with fixed score>=0.8, peak margin>=0.1 and translation spread<=2px.
Quarter-phase/density trials preserve distinctive color evidence. Every separate
verification region must be contained and textured; its RGB correlation must be
>=0.9 and normalized mean absolute error<=0.1. Flat white agreement cannot pass.
Only then is `state:"available"` returned with
`registered_desktop_to_primary_pixels` and requested region projections.

A returned matrix is evidence for this exact frame pair and the checked regions.
Other projected regions still say `content_presence:"unverified"`. Do not cache
it across changing/closed popups, held content changes or an entire shot merely
because geometry metadata repeats. Continuous mapping and real-menu breadth
still need qualification. Missing/ambiguous results retain reasons and available
source/decode diagnostics; worker/probe errors are bounded tool errors. No failed
read automatically schedules capture, changes permissions or replays a mutation.

## Runtime and actual evidence

The launchers resolve optional FFmpeg/FFprobe and prefer the installed bundled
Codex Python runtime when available. `RECORD_SCREEN_REGISTRATION_PYTHON` selects
an explicit interpreter with NumPy/Pillow. Missing dependencies refuse on request;
startup does not run a dependency probe. The advertised capability describes the
loaded contract, not dependency health or qualification of every application.
An owned worker has40seconds; each journal/probe has its separate existing
budget. Allow time for the whole pipeline rather than treating40seconds as P80.
Output limits and timeout stops kill only the owned worker process group and
withhold another worker while prior closure is unconfirmed. No peer restart.

Stage84 verifies fresh MCP0.19/28tools and minimal GUI-PATH CLI parity on retained
source. Above/corner fitted frames and one held frame pass. The held primary's
output time is39.966665879s; selected backup output is36.082202308s, while source
content differs by only0.945ms. Actual decoded PTS binds both images to their mux
records. Ambiguous right anchors, a flat independent region and zero allowed
time difference refuse. Four source/video hashes stay unchanged; readers exit0,
workers settle and native6c/PID20948 remains unchanged.81 distinct focused checks
cover strict requests, common clocks/content time, wrong independent pixels,
first-stream selection, exact PTS mismatch, async snapshot mutation, descriptor
cleanup, response overflow and affected existing contracts.

A high-frequency synthetic texture refuses with both lossy and lossless encoding;
encoding alone was not established as cause. The smooth positive control is a
separate case, without lowering thresholds. The first fresh harness encountered
an output filename collision after retaining a successful above response; that
reader exited0 and its response was reused without replay. These limits remain
in the evidence. No new UI, recording, native install or human input was needed.
Use current CLI when an older loaded MCP schema lacks the tool.

The final worker also takes a kernel advisory lock in the recorder home's
private run directory. Only one decode/RGB worker runs per recorder home across
adapters. A competing live owner returns `registration_busy` before decoding;
closing that owner's descriptor permits new work. Kernel closure releases the
lease without stale PID files or polling. The lock leaf is regular, private,
owned and nonsymlink. Metadata probes retain their per-adapter admission; this
is not a global host capacity/GPU/P80 guarantee. The final minimal-PATH MCP/CLI
held-frame outputs agree completely with the lease enabled and both settle.

## Native-menu and ordinary consumer qualification

Stage85 exercises eight retained AppKit pairs through current MCP0.19: baseline,
root/nested menus, selected/closed, resized and narrow root/nested/dismissed.
Each independently returns[1,0,0,1,-120,-210] on its original620x542 canvas.
Separate actual menu or canvas-label patches have RGBNCC>=0.99152; retained
source-content differences are at most36.804583ms. The caller declares different
independent patches for different phases; this is not a cached continuous map.
These real native menus fit within the parent. No new above/below-parent fitted
menu origin is qualified. The unchanged encoded canvas includes black unused
space after resize; canvas containment alone still cannot prove content.

Requesting the disappeared menu's region refuses for insufficient texture,
rather than passing white agreement. The larger retained Safari1324x948 primary
returns decoded_pixel_budget before decoding. No silent resampling or score change.
The ordinary chat's28tools/status0.19 and direct nested response now match the
fresh reader in every result field. Original recording_frame_map remains guarded.
Three focused socket/capability checks verify read reconnect and single dispatch
for accepted session/schedule/stop/export mutations after lost replies. This is
controlled transport evidence, not a deliberately crashed production capture.
Eight source/media hashes stay unchanged; owned readers/workers settle. Native
6c/PID799 was already running before the batch and was not restarted by it.

## Admission when a worker dies

Stage86 reproduces abrupt Python worker death while a bounded owned substitute
decoder remains alive. The old worker-only lock released too early. The decoder
now inherits the same open kernel lease descriptor. A new adapter stays refused
until every holder closes, even if its Python parent has died. Normal decode
still verifies through the ordinary MCP with exactly the same retained result.
The before/after probe and nine distinct affected checks pass; only the new
initially failing harness check was rerun. Source media stays unchanged.

Worker stdout/stderr EOF is not decoder closure or lease release proof. The
qualification probe observes kernel acquisition independently after owned group
cleanup; production continues to refuse while the lock is held. A stalled
holder can therefore keep admission unavailable. This change does not add an
automatic peer kill/restart or prove host-wide capacity/OS capture recovery.
Controlled substitute decoder evidence is distinct from a real FFmpeg crash.

## Nearest retained content selection (reader0.19.1)

Frame-local registration first requires the primary source-content timestamp to
fall in a measured backup packet interval with qualified geometry. It then scans
the already bounded packet table (maximum120,000) for the closest referenced
source-content timestamp, using exact integers. Future output packets are allowed
for offline alignment. Equal distances prefer the original covering packet, then
first presentation order. No image-based retry or threshold override is used.

The response records covering and selected indices and candidate count in
`backup_selection`; status advertises its policy. Delta limits, selected geometry,
retained common-clock identity and independent held-out RGB checks still apply.
This selection cannot bridge missing original media coverage or establish a
continuous transform. Negative content age explicitly means the selected source
is later than the primary source timestamp; packet time and source time remain
separate. Interval paired maps retain their original coverage semantics.

## Dense retained-counter comparison (stage89)

The retained eight-minute30fps pair exposes a limit that four successful frame
registrations cannot establish. Exact current mux/source joins cover26,648
frames; prior full-decode twelve-bit counters are reused without a new video
decode. A standalone numeric comparison agrees with five actual service frame
choices and keeps source timestamps separate from output packet timestamps.

For window→app moving frames, nearest source time improves exact counter matches
from869/12,257 to5,860/12,257; reverse direction improves5,371/12,219 to
5,844/12,219. Some individual choices regress (6forward,532reverse). An authored
counter oracle finds a matching value within50ms for only6,240 moving frames
in either direction. This oracle is diagnostic; it is not deployed selection
and cannot prove whole-frame identity. Longer mismatch runs exceed two seconds.

A closer retained timestamp is not a paint-generation identifier. Independent
content checks remain required, particularly when borrowing animated pixels
from another stream. Static matches describe admitted subsets: window→app
441/1,549 passes the source-age cap while1,108 refuses; reverse189/189 admits.
Do not bypass clock guards because a small counter or background appears static.

This suggests preserving one adequate capture master for frame-exact derived
views where it contains all required pixels. That is a strategy inference, not
a new derived-source implementation or universal app certification. Separate
backup streams still provide useful insurance with explicitly checked content
and uncertainty. Continuous changing-content/fitted-menu mapping remains open.
