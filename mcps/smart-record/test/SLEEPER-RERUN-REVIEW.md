# Second Sleeper run: review and 0.20.3 corrections

The four recordings finalized successfully. The most useful recorder fixes are
reliable concurrent input reads, usable frame-linked pagination, clearer saved
evidence requirements and a compact warning when retained input is click-only.
This is adapter **0.20.3**; the native engine and widget are unchanged.

## Inspected evidence

Archived chat **Record Sleeper fantasy walkthrough**
(`01a12b8b-7d3d-7ed0-9af0-d3143b59bdd7`), retained session `ses_7rk5jqtg`, all
four manifests/journals, three final cursor receipts/recipes, assembly sidecar and
ten sampled master frames. The chat took about12 minutes and used102 recorder
MCP calls,60 computer-use calls and30 shell commands. Those counts include
preparation, review and cleanup, not just filming.

The canary retained a click pair and key pair. The main/standings/player takes
retained6/4/2 input events respectively, all click down/up pairs. All four
journals report complete with zero lost rows; manifests report zero dropped
frames and442/1588/707/354 written frames. No input-gap notifications were
retained. These observations describe this run, not universal delivery coverage.

The Desktop master is80.3 seconds,1600×1002,30fps H.264. Independent full decode
passes; SHA-256 remains
`77ef54fb6e9f640cc29ecdb3d1956b41985dc24671b9c7b8f4c7d30d3838ec21`.
Original captures and the user's master were not modified.

## Findings and disposition

| Finding | Impact | Correction or explicit limit |
| --- | --- | --- |
| Parallel valid input reads repeatedly returned `input_query_busy`. The agent eventually serialized them. | Avoidable failures, retries and context use while reviewing multiple takes. | One active reader now admits up to8 FIFO waiters with a10-second queue deadline. Queue saturation/timeout remain explicit read-only retry conditions. Resource/file/parse bounds are retained; no capture/action replay. Health exposes active/queued/limits. |
| Frame-linked pages return a media fingerprint in `next_cursor`, but validation rejected that same field. The public schema also required it on plain pages that never returned one. | Larger event investigations could fail on their second page. | Accept the optional media fingerprint only with frame joins; require only the three base cursor fields. Pass cursors unchanged. Snapshot/query binding remains enforced. A changed media fingerprint withholds frame context while preserving input rows. |
| The agent passed prose such as an AX observation in `action_end.evidence_refs`. Native validation requires absolute saved file paths. | Action closure failed; the retry omitted its evidence. | Schema now describes saved paths and bounds. Adapter validation identifies the invalid reference before any action RPC and explains where prose belongs. Correct and settle the same token. This does not independently verify caller-reported results or file contents. |
| The input canary established clicks and keys, but no motion or scroll events were retained in the production takes. The agent used quiet browser scrolling. | A successful click canary cannot promise the continuous reconstructed pointer the film needs. | Every input query now returns an interval-wide event-type/motion/scroll/key summary, independent of page/action/type filters. Click-only positions explicitly warn against assuming a continuous path. Guidance requires a representative movement/scroll canary when those are production requirements. No synthetic motion is added. |
| Three final cursor timelines lack positions on699/1335,394/717 and265/357 frames:1358/2409 overall,56.4%. | The cursor appears late, jumps and disappears. The longest absent interval is14.83 seconds. | Existing coverage receipts expose this correctly. Missing motion is not recovered by rerendering or increasing hold duration. Set presentation expectations before shooting; report a limitation if the chosen input path cannot meet them. |
| Sampled footage still contains a small blue pointer-like residual and Chrome's automation banner. | The added white cursor can coexist with another pointer, and browser chrome distracts from the film. | These are visible source-quality limits, not an encoder failure. Inspect source pixels before filming and choose a cleaner qualified source/provider when possible. Do not erase changing page content or claim the residual's producer is known. |
| Browser-control calls failed, including `noWindowsAvailable`; standings and player details needed extra takes. | The director spends time recovering bindings and reaching content. | Preserve recorder timing and prepare bindings/actions before capture. Computer-use internals remain that tool's responsibility. No unrelated tool repair or repeated full walkthrough is required for these recorder fixes. |
| Cursor outputs and the external assembly master remain outside ordinary session bundle discovery. | Later agents need the task's assembly sidecar to reconstruct the master. | The sidecar exists for this run. Official session composition remains Ready, with migration/retirement review of provisional tools; this release does not claim a general compositor or automatic master registration. |

## Verification and availability

28 focused tests pass: FIFO/capacity/deadline/release behavior; real reader
concurrency/failure cleanup; filtered/page-independent delivery summaries; plain
and joined cursor validation; snapshot/clock uncertainty; action evidence and
actual MCP rejection-before-RPC; once-only action/reconnect boundaries.

A fresh registered MCP launched with minimal PATH reports0.20.3 and46 tools.
The formerly failing three-way retained-input batch now succeeds, including
actual reception-to-mux context and click-only diagnostics. Plain and joined
pagination return successive source rows458 and463. A changed-media cursor
preserves the input row and explicitly withholds its join. An owned declared
metadata action remains active after prose rejection, accepts a saved evidence
file, closes and persists; its session is closed. No UI action was claimed by
that fixture. Native PID89707/build d7a6a75d975f stayed running.

Private evidence is under this chat's existing qualification bundle:
`release-next/smoke-review-2/{retained-summary.json,live-smoke.json,tests.log}`.
Raw footage, account pixels and input rows stay outside Git. Fresh MCP
connections and the current CLI load these source updates; already-loaded
adapters retain their version until refreshed. This is ready for another useful
production smoke, with the cursor/source limitations above explicitly retained.
