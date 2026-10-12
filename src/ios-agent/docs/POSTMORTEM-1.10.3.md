# Independent service review: 1.10.3

Review date: 12 October 2026. The Claude report was read before this source/log review; this is independent evidence reconciliation, not blinded analysis.

## What improved

Runner reports both real browsers completed the synthetic call workflow in approximately 4½ minutes with zero human unblocks. Service traces independently show paired-direct provider selection, call/media gate passes, the Chrome permission detour resuming the same XCTest attempt, owner release and runner stop. Consumer audio/transcription results remain separate from driver proof. The correct supplied report is .scratch/ios-transcription-smoke/postmortem-1.10.3.md; no report exists at the root path supplied.

## Findings and release priorities

| Finding | Impact / confidence | Decision |
| --- | --- | --- |
| Successful call/readiness checks log condition_not_met | High diagnostic value / confirmed source + five call rows | Remove failure reason from passing signals; retain exact reason on failure. |
| Native alert absence requires another agent turn to inspect Chrome's permission sheet | High workflow value / observed sequence + source | Add explicit permission inspection: alert once; if confirmed absent, one native tree; unknown alert reads do not fall back. Preserve authentication and input guards. |
| Cold runner expected startup refusal looks like failure and a request-in-progress looks unknown | Medium-high / exact source + traces | Log coalesced pending startup and correlated readiness duration/poll count. Log session POST as dispatched, reserve unknown for an unconfirmed response. Allow a bounded 25-second initial wait; resume the same attempt. |
| Idle per-process log files quickly exhaust 32-file cap | High evidence value / confirmed count cap + 16 fewer retained rows | Raise count bound to256, retain2MiB total/128KiB file/7-day maximum age. Reopen a new private writer file after another process prunes the old one. Evidence is still bounded, never guaranteed complete. |
| Concurrent startup reads can race across async authorization | High correctness value / confirmed source + overlapping-call fixture | Share one in-flight startup continuation; one session POST. |
| Failed inspection can leave previous snapshot usable briefly | High correctness value / source | Invalidate prior snapshot/input certainty before reading; successful observation restores fresh authority. |

## Evidence limits

Claude's saved summary reports368rows at04:25Z. This later raw snapshot retains352rows; do not claim exact complete coverage or equate missing rows with non-execution. Five retained web-call passes have contradictory failure reasons; media pass rows do not. The first runner-status connection failed before runner.started, and session creation succeeded roughly19seconds later on the same owned attempt. This supports cold-start pending behavior; it does not prove why the endpoint was unavailable or that a passcode exemption exists. Raw row version fields include service release, web SDK identity and absent version; do not infer every writer has the same version string.

## Creative opportunities retained

The Focus→fixed-command mailbox remains the strongest next control-plane experiment for off-LAN browser launch without a native bridge/developer endpoint. It requires phone-side provisioning and independent execution/expiry receipts; this healthy nearby run does not justify claiming it works or silently replacing the qualified Focus path. Readiness beacons can reduce waiting, but cannot prove arbitrary unlock. Explicit retained XCTest remains conditional and must not become an indefinite default overlay. Wi-Fi-On dispatch is available when pairing is reachable; Off→On execution remains unqualified. No radio changes or repeated full call loops are needed for this patch release.

## Verification plan

Exercise alert/tree/authentication/failure/context changes, cold-start wait/schema, exactly-once session creation, verification pass/failure signals, and cross-language bounded retention with isolated fixtures. Run the actual refreshed stdio entrypoint and idle worker readback. Attempt one bounded physical permission-mode inspection/cleanup if the existing paired device is available; report authentication/transport gates honestly, without manufacturing a new unblock for an otherwise fixture-verifiable patch.
