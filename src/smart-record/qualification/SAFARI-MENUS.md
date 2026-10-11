# Safari native popup lane

Qualified environment: Safari26.5/build21624.2.5.11.4, macOS25F80,
native recorder7c0f81e9d71f, built-in Retina2x, point-density output,30fps.
Native CUA provider version remains unknown. Stage70 capture and stage71
retained verification are one episode, not independent repetitions.

| Observed case | Source evidence | Remaining limit |
| --- | --- | --- |
| Native select at lower right | Twelve rows in window childtrue H264 and fixed app-crop HEVC | OS fitted it inside the parent; no overflow qualification |
| Native select moved inside | Both sources preserve selected row; row edges agree within1px | Does not release the guarded isolated-window map |
| Change selection and dismiss | App source preserves second selection and closed popup | Primary75s take had already ended |
| Editing context menu and dismissal | App source preserves the root menu and later closed state | Nested submenu was skipped; no full-shadow/alpha equality claim |
| Target stops drawing | Authored marker absent from35 final packets; later samples black | Fixed canvas remains geometrically contained; cause/timing of off-Space transition is unverified |

All8,900 actual mux timestamps match accepted source decisions exactly and both
videos decode. For all6,684 app packets before229.911662823s, the authored
parent marker remains within1px of the fixed-crop projection. This is a
stationary parent/fixed crop scope. The two independently checked menu rows
also agree within1px across sources, using the declared parent origin; that is
supporting spatial evidence rather than a production isolated-origin override.

The service supplies all11 selected app maps and guards all4 selected primary
maps. A paired whole-interval summary evaluates8,900 boundaries and reports
252.068s of backup canvas containment, including the black tail. A contained
region is not a captured menu, visible app or rescued shot. Inspect actual
decoded content over the affected interval before selecting a backup.

The app take was stopped for a user pause at about252.07s before its planned
300s. Its mux tail ends at252.561567657s; held packet duration is separate from
controller wall duration and fresh capture. Use exact service packet/source
clocks and trim decisions rather than treating container duration as action time.

The source/resource profile is published through `production_plan` as
`resource_guidance.measured_safari_app_profile`.250 passive observations give
recorder peak RSS38.73MiB and median interval CPU2.98% of one core. Safari's
parent process alone was sampled; WebContent, GPU/driver and thermal costs are
unmeasured. This supplies measured scene costs, not a safe upper capacity or P80.

Six stored action scopes have separate outcomes: two failed, one unknown and
three verified. The protected menu scope expired and final dismissal exceeded
the120s reservation. Preserve that failure despite useful footage. The original
single window close was initially unverified; a later independent inventory
finds it absent with the original Start Page preserved. Intervening actor/time
remain unknown. No close or capture was replayed.

Private evidence: qualification `gates-v70/qualification-summary.json`, decoded
phase images, exact packet probes, continuous marker proof, source maps, resource
samples and scoped shared readbacks. Shared facts expire and retain exact
app/OS/provider/display/capture keys. Requalify a changed dimension without
assuming this reported pass establishes present readiness.
