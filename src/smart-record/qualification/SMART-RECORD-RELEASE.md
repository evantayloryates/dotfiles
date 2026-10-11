# Smart Record delivery

The service is installed as `smart-record`, with native engine `smart-recordd`
and the single Medium **Smart Record** desktop widget. The existing feature
release is now adapter0.20.4; the delivered native build is d7a6a75d975f and the
companion build is be27e75d391a.

## Cursor/source-quality update:0.20.4

Explicit `idle_policy:hold_last` keeps measured cursor positions visible during
idle reading; exact position age and long-hold counts remain inspectable. Input
interruptions invalidate holds and click rings, including when events are
filtered. Default expiry is preserved, and initial positions/motion are never
invented.713 previously absent Sleeper frames are recoverable by this policy;
645 initial-absence frames remain unknown.

A controlled native-only Chrome window recorded click/scroll/idle without the
blue pointer or debugging banner. Browser attachment/click reproduced both;
reload did not clear the blue pointer. Chrome planning and the agent runbook now
recommend the fresh native-only production path and source-pixel verification.
This is a qualified alternative, not an internal browser-provider repair.

40 focused checks and fresh registered minimal-PATH MCP0.20.4 reads/renders pass.
The15-second native sample has225/225 positioned cursor frames and both policies'
outputs fully decode. Native/widget and the original Desktop movie stay unchanged.
See [source-quality corrections and limits](CURSOR-QUALITY-FIXES.md).

## Second production feedback update:0.20.3

Valid concurrent retained-input queries now wait in a bounded FIFO rather than
immediately failing. Frame-linked pagination accepts its own returned cursor;
plain pagination no longer advertises an unnecessary media hash. Input reads
also summarize interval-wide movement/scroll/key evidence and flag click-only
positions. Action evidence schemas and pre-dispatch validation explain saved
absolute file paths, preserving an open action when a prose reference is rejected.

28 focused checks and actual fresh minimal-PATH MCP read/action checks pass,
including the rerun's three takes in parallel, joined/plain next pages and
changed-media withholding. Native PID89707/build d7a6a75d975f and widget remain
unchanged. Fresh connections/current CLI load0.20.3; existing adapters need refresh.
The80.3-second Desktop master still decodes and retains its hash. Sparse pointer
coverage, painted residual/banner and external-master discovery remain explicit
limits. See [second-run review](SLEEPER-RERUN-REVIEW.md).

## Production feedback update:0.20.2

The completed Sleeper run exposed two malformed requests, an empty input canary,
sparse cursor placement, an Escape/typing-hide defect and premature scene marks.
Fresh clients now get actionable production-plan field/enum errors, explicit
record-wait state/deadline guidance and cursor coverage/warnings in render receipts.
Escape and Command/Control shortcuts no longer hide the cursor as typing. Agent
guidance now leads with a short prepared-action workflow and verified scene anchors.

31 focused checks plus actual retained-source MCP/CLI and one15-frame render pass.
Native build/PID and the user's Desktop movie are unchanged. Existing adapters
remain loaded at their prior version; new connections and current CLI use0.20.2.
The stationary pointer residual's producer remains unconfirmed. External masters
and cursor outputs still need official session composition integration.
See [independent run review](SLEEPER-RUN-REVIEW.md) for findings and limits.

## Delivered composition boundary

Adapter0.20.1 adds the live `session_show`/CLI bundle inventory without restarting
the recorder. Automatically published export maps are discoverable with their
media and source files. `export_time_map` remains an optional exact-offset read;
it does not generate the map. Both footage-producing tools below are explicitly
provisional, with a required migration/retirement review when official
composition tools arrive. See [session strategy](../SESSION-STRATEGY.md).

Nine focused bundle/mapping/MCP checks pass. A fresh registered minimal-PATH MCP
reports0.20.1/session_bundle1, discovers46 tools and returns the same inventory
as the CLI for an existing session/export. Provisional descriptions pass.
Native PID89707/build d7a6a75d975f remains unchanged. Already-loaded adapters
retain their version until refreshed; the current CLI is immediately usable.

The capture/session/event/frame foundation is delivered. Two public tools also
produce derivatives: `record_export` trims one take into MP4/GIF, and
`cursor_render` applies one editable cursor/click treatment to one terminal take,
with draft/final effort and private recipe/timeline/sample artifacts. The cursor
output is silent SDR H.264, bounded to60 seconds,7200 source frames and2MP.
`final` selects rendering quality; it does not assemble a complete production
master. Source footage remains unchanged.

A general composition timeline, multi-source assembly, preferred recipe book,
transitions, audio/narration and automatic backup-footage repair are future work.
Frame/paired-source mapping tools return evidence rather than composited footage.
Agents use external composition tools for final masters beyond the two existing
derivative operations. See [agent usage](../AGENT-USAGE.md) for the current scope.

## Canonical entry points

- CLI: `/Users/taylor/dotfiles/bin/smart-record`
- MCP launcher: `/Users/taylor/dotfiles/src/smart-record/bin/smart-record-mcp`
- MCP name: `smart-record`; tool namespace: `mcp__smart_record`
- Native identity and LaunchAgent: `com.taylor.smart-record`
- Widget host: `com.taylor.smart-record.widget-host`
- Widget identity: `com.taylor.smart-record.control.widget`
- Widget kind: `SmartRecordProduction`; URL scheme: `smart-record-control`
- Private state: `~/.smart-record`; installed artifacts: `data/smart-record/`
- Environment overrides: `SMART_RECORD_*`
- Source/action/derived schemas: `smart-record-*/v1`
- Report/checklist: `/Users/taylor/src/docs/html/smart-record-strategies/`

Both Codex and Claude Code registrations point to the renamed launcher.
Already-loaded clients should refresh their MCP connection if they retain a
previous registration; this chat has verified the new namespace directly.
Operational aliases to the previous service name are not retained.

## Verified migration

The cutover began at an independently checked idle maintenance boundary.
Sessions, recordings, actions, repairs, compositions and the persistent production
gate moved together. Schema and managed-path references were upgraded; original
metadata and signed bundles remain in private recovery archives. Literal captured
inputs and all 1,537 existing media assets remain unchanged. Original journal
metadata is preserved separately; the live copies have upgraded schema headers
and their manifest byte counts match. No recorded clocks or frame identities
were recalculated. The repair database passes its integrity check.

Screen Recording and Input Monitoring are enabled for the new signed identity;
the retired app’s grants and launch registrations were removed. Taylor confirmed
adding the renamed widget, and macOS reports one configuration and a fresh status
snapshot. Actual desktop pixels show the new title and readable unfocused Pause
control, with part of the widget covered by an unrelated user window.

## Focused acceptance

- 37 adapter, source-reader, reconnect, checklist and bridge checks passed.
- 39 widget contract/mailbox checks and four cursor recipe checks passed.
- Minimal PATH MCP initializes as `smart-record` and discovers 46 tools.
- Retained recording `rec_fzk9xct9`: frame mapping and 12 input events remain
  readable; a new one-second draft cursor render decodes all 15 frames.
- New tiny two-second take `rec_534e9jtx` completes, with exact source mapping,
  no lost journal rows and actual listener access. This checks the renamed
  installation; it does not add physical-device coverage claims.
- Renamed companion Pause/Resume URLs reach authoritative service state.
- The clean-environment renderer smoke found an existing bare-ffmpeg dependency
  bug. The worker now honors the launcher-resolved `FFMPEG_PATH`; the same
  targeted smoke passes.

Raw media, event rows, original metadata, configuration backups and failed
observations stay private. Historical transcripts, app observations and signed
forensic archives retain their original identifiers intentionally. They are not
active service references and must not be rewritten to disguise past evidence.

The normal cooperative pause and all stated qualification limits still apply.
Physical input, broader provider/app coverage and capacity remain the existing
11 Deferred tasks rather than new rename blockers.
