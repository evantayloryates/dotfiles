# Cross-session iOS-agent review: 1.10.4 → 1.10.5

## Scope and evidence

Requested window: preceding 24 hours. The immutable snapshot retains **1,705 rows in 256 files**, spanning **2026-10-12 19:56:29Z through 2026-10-13 03:51:38Z** (about eight hours, not the full requested day). It contains 214 retained MCP terminal requests, not 1705 unique operations. Earlier history was already pruned; missing records cannot establish non-execution. 222 files contain only connection.started; total snapshot size is 518,672 bytes, well below the 2 MiB limit. The file-count cap, rather than byte volume, is the observed pressure. Original files and their hashes were saved before live reads or fixtures.

This review independently traced structured service records and source, then reconciled the consumer's recent commentary in Codex Runner (2). That consumer reported iPhone launch uncertainty and temporarily continued on Android; later it completed an iPhone transcription run. Its transcription latency/accuracy are product evidence, not service-control qualification. Earlier Claude Runner reports remain historical supplemental context; no new 1.10.4 Claude postmortem was found in the existing smoke folder. No private client corpus or bulk conversation was classified.

## Findings and chosen strategy

| Priority | Evidence | Delivered response | Boundary |
| --- | --- | --- | --- |
| High: meaningful evidence evicted by discovery | 222 of 256 files contain just connection.started | Defer connection logging until a real tool call. Catalog construction, listTools/listResources and signals-only readers create no log file. Keep existing 256-file/2 MiB/seven-day limits. | Historical lost records cannot be recovered; retention remains bounded. No racing compactor or larger unbounded store. |
| High: cross-session usage hard to reconstruct | Older request traces identify operations but have no stable MCP connection identity | New connectionId appears in guide and request context, propagates through Python, and is filterable in MCP/CLI. Summary counts one terminal per trace, grouping calls/failures/unknowns/pending and P50/P95/max latency. | Connection is not a person, entire harness session or unique real-world workflow. Partial old traces stay marked as lacking connection identity. |
| High: Safari launch result loses provider cause | Two opens finish fresh_launched_page_unconfirmed; one underlying CoreDeviceError is misleadingly labelled foreground_monitor_cleanup | Preserve original failure phase through observer cleanup. Preserve launch reason/phase/input uncertainty and bounded recovery counts at managed-open completion. Keep a second cleanup failure separate. | No claim to fix the Apple launch failure itself or bypass its authorization. No replay, automatic lane switch or implicit acquisition of an old page. |
| Medium-high: wrong idle gate creates delay/confusion | Two native idle checks take about 12 seconds and fail without a logged reason; browser workflows don't guarantee a native DEV bridge | Receipt carries failedPredicate alongside original deadline reason. MCP/logs expose the fixed failed condition and recommend host-idle + page/media/Home evidence for browser/system work. Doctor logs exact fixed failed checks. | Native idle semantics are unchanged; absence of native feedback is not proof of phone lock/cable state. Historical missing receipts cannot establish their exact failed predicate. |
| Medium: impossible old-document acknowledgment is polled for seven seconds | Cleanup records page_runtime_changed, then times out | A fresh replacement runtime ends the old-runtime wait immediately, preserving unconfirmed cleanup and sending no Home into it. | No false glow-off/media-release success. Stale/missing feedback can still use the bounded recovery wait. |

## Creative alternatives evaluated

A central logging broker or shared-file compactor could also reduce file churn, but would introduce transport/locking/crash-recovery complexity to solve predominantly catalog-only noise. Lazy creation removes that observed cause directly. Connection grouping provides much of the useful session narrative without reading full conversation transcripts or adding a new tool.

A live failure that lands on an already enrolled intended page can be recovered explicitly with web_pages → web_begin after checking identity. Automatically accepting any existing page would risk acquiring an old/wrong document, so the driver returns evidence and a specific recovery next step instead. A generic native authentication shortcut is not verified; permissions, XCTest passcodes and off-LAN native startup retain their known boundaries. The Focus command mailbox remains unprovisioned and is not represented as delivered.

## Verification and rollout

45 distinct Node checks and 42 isolated Python checks passed. These cover actual MCP schema/read calls, 20 catalog-only connections, stable distinct connection identity and Python propagation, terminal deduplication/latency groups, host/idle failure projection, one-dispatch launch recovery, original failure/secondary cleanup preservation and early unconfirmed replacement-document cleanup. Existing ownership, managed-browser cleanup, signal scrubbing and observer boundaries passed. No fixtures wrote into the live signal store.

Final syntax/JSON, real CLI catalog churn, actual fresh stdio entrypoint and installed worker checks are recorded separately in the release receipt. Restart is coordinated with the active consumer and must occur only after shared ownership is idle. No call policy, microphone grant, audio capture, network radio, native build, web SDK or staging behavior changes in this release. Lobby follow-up remains deferred at Taylor's request.

## Final live acceptance

The consumer reported its qualification finished, owned sessions released, Home independently confirmed and synthetic test rooms closed. The global broker was then independently idle. The existing scoped installer restarted only ios-agent; the loaded worker reports 1.10.5 and its exact expected source hash.

Twenty invocations of the actual --catalog CLI created zero signal files in an isolated store. A fresh actual stdio client exposed 42 tools/11 resources and connectionId. Host-idle passed on the first observation without reopening native DEV. The boolean home=false unknown-session probe sent no input. Physical capabilities were read over tailnet-paired-userspace, then the temporary owner released; there was no phone input, call, microphone grant, network change, XCTest or Mirroring. Correlated live provider signals retained the same connection identity. The helper closed; final status was unleased. No human unblock was requested. This does not newly qualify Safari launch reliability or off-LAN behavior.

The root consumer's real iPhone call succeeded after its earlier launch uncertainty; its saved media/accuracy findings remain owned by that product task. This release improves diagnosis/recovery and reduces demonstrated discovery churn rather than claiming all provider edges disappeared.
