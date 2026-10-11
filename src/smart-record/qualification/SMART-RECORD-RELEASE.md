# Smart Record delivery

The service is installed as `smart-record`, with native engine `smart-recordd`
and the single Medium **Smart Record** desktop widget. The existing feature
release remains 0.20.0; the delivered native build is d7a6a75d975f and the
companion build is be27e75d391a.

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
