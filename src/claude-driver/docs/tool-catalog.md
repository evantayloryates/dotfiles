# Claude-driver v2 tool catalog

Exact MCP tool names. Purpose descriptions contain at most16 words. Harnesses
may prefix names, for example `mcp__claude_driver__driver_status` in Codex.
This catalog describes the93-tool schema, not93 unconditionally ready actions.
Readiness is determined per route, installed version, ownership and native gates.

## Released — guidance, health and shared lessons

| ID | Purpose |
|---|---|
| `driver_guide` | Read the operating contract and safety prerequisites. |
| `driver_status` | Inspect loaded build, versions, route readiness and recent failures. |
| `action_health` | Check eligibility for a specific action dependency. |
| `service_health` | Inspect serving evidence for the broker or an exact independent service. |
| `broker_recovery_status` | Inspect broker identity and durable request history. |
| `broker_status` | Inspect legacy broker state; revival requires an eligible recovery route. |
| `driver_learnings` | Read curated findings and pending service lessons. |
| `driver_record_learning` | Append a candidate finding with supporting evidence. |
| `driver_memory_query` | Query shared sanitized lessons and operation outcomes. |
| `driver_memory_record` | Record an evidence-backed candidate service lesson. |

## Released — durable work and reconciliation

| ID | Purpose |
|---|---|
| `driver_submit` | Submit durable work; reuse an idempotency key to reattach safely. |
| `driver_job` | Inspect a durable job and its recorded outcome. |
| `driver_wait` | Wait a bounded interval for a durable job. |
| `driver_cancel` | Cancel queued work or request cancellation of running work. |
| `driver_request` | Reconcile the original broker request without replay. |

## Released — discovery and observation

| ID | Purpose |
|---|---|
| `list_sessions` | Find Claude Code chats across account stores. |
| `get_session` | Read exact persisted chat metadata and live-process association. |
| `live_sessions` | List live Claude Code processes and associated chats. |
| `session_events` | Read incremental transcript events using a cursor. |
| `session_wait` | Wait for new events or live status changes. |
| `window_state` | Read the focused Claude chat and frontmost app. |

## Released with route prerequisites — chat lifecycle and configuration

Native mutations need currently eligible, scoped controllers. Creation/fork,
permissions and deletion retain their existing consent gates. These are Claude
desktop **Code chats**; web/Cowork chat support is not implied.
At this release's live check, the ordinary controller had no eligible operations
and the legacy broker was not resident. Native mutation tools below are
implemented but **not ready to rely on here**. Disk reads and durable local work
remain available; no native write was smoke-tested in this release cut.

| ID | Purpose |
|---|---|
| `create_session` | Create a Code chat; bypass requires an eligible preapproved pool session. |
| `fork_session` | Fork a Code chat with its history. |
| `open_session` | Open a chat through its native deep link. |
| `unarchive_session` | Restore an archived chat and verify its saved state. |
| `rename_session` | Set a chat title and lock it against automatic renaming. |
| `pin_session` | Pin or unpin a chat and verify persistence. |
| `archive_session` | Archive a chat reversibly and verify its saved state. |
| `set_session_config` | Batch title, pin, model, effort or permission changes. |
| `delete_sessions` | Request permanent deletion; native confirmation gates still apply. |

## Released with route prerequisites — messaging and control

| ID | Purpose |
|---|---|
| `send_message` | Deliver an authorized turn with explicit delivery and receipt semantics. |
| `steer_session` | Queue instructions or interrupt before sending a replacement. |
| `stop_session` | Stop the active turn and verify non-busy state. |
| `peer_send_status` | Reconcile a persisted direct-peer send without resending. |

## Released with route prerequisites — organization and pool

| ID | Purpose |
|---|---|
| `manage_groups` | List groups or move chats into a selected group. |
| `archive_project` | Plan or archive chats under an exact project folder. |
| `pool_status` | Inspect preapproved bypass sessions and recycling candidates. |
| `pool_release` | Clear and park an eligible finished bypass chat. |

## Blocked by quarantine — excluded from supported release

| ID | Purpose |
|---|---|
| `window_manage` | Automate Claude window controls unavailable through native APIs. |

Tier C fallback beneath other operations is also blocked. No tool grants
physical-input clearance or bypasses native trust, permission or loader consent.

## Experimental — not promoted to supported release

These IDs remain discoverable for controlled engineering and existing exact
enrollments. They are not a promise of unattended recovery or general safety.
Read-only plans/status are useful evidence; they do not authorize later writes.

### Service inspection and qualification

| ID | Purpose |
|---|---|
| `broker_service_status` | Inspect bounded service enrollment and existing settlement metadata. |
| `broker_service_plan` | Inspect the selected generation's next eligible lifecycle decision. |
| `broker_service_resource_review` | Review exact owned stream resources after service retirement. |
| `broker_service_marker_review` | Review native markers, enrolled bytes and retirement chronology. |
| `broker_service_metadata_binding` | Read exact enrollment metadata and its compare-and-swap digest. |
| `broker_service_standby_status` | Inspect retained standby enrollment and cold-recovery eligibility. |
| `broker_service_standby_plan` | Check explicit standby and primary-generation eligibility. |
| `broker_service_policy_probe` | Run a missing-request negative probe on an exact loaded receiver. |
| `broker_service_family` | Read bounded linked-session metadata through an independent receiver. |
| `broker_service_read` | Read exact session metadata through an already loaded receiver. |
| `broker_service_read_current` | Read metadata through the currently selected stable receiver. |
| `broker_idle` | Observe native broker idle state without asserting task completion. |

### Service preparation, lifecycle and enrollment

| ID | Purpose |
|---|---|
| `broker_service_prepare` | Prepare a sealed candidate on an exact owned bypass receiver. |
| `broker_service_activate` | Activate a prepared generation on an eligible idle receiver. |
| `broker_service_renew` | Perform one durable, guarded successor-generation renewal. |
| `broker_service_quiesce` | Stop new scoped service admissions under the lifecycle lock. |
| `broker_service_retire` | Retire one exact service after scoped settlement and STOP checks. |
| `broker_service_enroll` | Enroll the exact previously consented native session. |
| `broker_service_enroll_metadata` | Bind a qualified controller to its sealed metadata target. |
| `broker_service_enroll_session_management` | Enroll a qualified controller for ordinary-chat unarchive and pin operations. |
| `broker_service_enroll_standby` | Enroll an exact qualified primary and standby pair. |
| `broker_service_rebind_metadata` | Rebind metadata ownership after proving the original process absent. |
| `broker_service_rebind_standby` | Rebind standby enrollment to the exact original recovery. |
| `broker_service_control` | Apply one scoped native metadata change through an enrolled controller. |
| `broker_service_archive` | Archive one exact owned scratch target through an independent controller. |
| `broker_service_wake_target` | Send one fixed tool-free wake to an exact retired scratch target. |

### Recovery, restoration and continuation

| ID | Purpose |
|---|---|
| `broker_service_recover` | Recover an exact target through an independently sealed controller. |
| `broker_service_recover_enrolled` | Attempt one durable cold recovery from exact retained enrollment. |
| `broker_service_continue_imported` | Continue an exact failed recovery after an explicitly undelivered wake. |
| `broker_service_missing_record_plan` | Plan same-identity restoration for one missing saved service record. |
| `broker_service_restore_missing_record` | Restore one missing record using an exact qualified plan. |
| `broker_service_seed_plan` | Plan restoration when both saved record and exact transcripts are missing. |
| `broker_service_rebuild_missing_record` | Seed and import one exact missing service identity. |
| `broker_service_seed_continuation_plan` | Inspect a failed rebuild's independently completed retirement boundary. |
| `broker_service_continue_seeded_record` | Continue one separately claimed rebuild after verified retirement. |
| `broker_service_controller_record_status` | Inspect ordinary-controller restoration claims and original failed parents. |
| `broker_service_restoration_status` | Inspect restoration phases and independently observed parent-child handles. |
| `broker_service_restored_pair_plan` | Plan reciprocal reactivation after verified record restoration. |
| `broker_service_reactivate_restored_pair` | Reactivate one restored pair using exact current plan hashes. |
| `broker_service_pair_continuation_plan` | Inspect a failed pair-readiness checkpoint and prepared successor. |
| `broker_service_continue_restored_pair` | Continue one separately claimed failed pair-readiness checkpoint. |
| `broker_service_pair_bootstrap_status` | Inspect bootstrap root identity, phase and attempted import roles. |
| `broker_service_pair_bootstrap_plan` | Inspect admission for an exact retained automatic pair. |
| `broker_service_bootstrap_pair` | Bootstrap an enrolled pair after proving old epochs and peers absent. |
| `broker_service_continue_pair_bootstrap` | Continue one terminal failed bootstrap at an exact import boundary. |
| `broker_service_continue_renewal_readiness` | Continue never-attempted renewal steps after independently verified late readiness. |
| `broker_service_renewal_lineage` | Inspect installed successor lineage after an interrupted renewal read. |

### Receipt and hook diagnostics

| ID | Purpose |
|---|---|
| `broker_service_abandon_read` | Record read abandonment after proving the old process and peers absent. |
| `broker_service_result_reconcile` | Publish a captured reusable-receiver receipt without replay. |
| `broker_peer_result_reconcile` | Publish an existing enrolled native-peer receipt without replay. |
| `broker_read_batch` | Run an opt-in metadata hook batch with one diagnostic turn. |
| `broker_read_status` | Inspect bounded native-read batch phases and cleanup records. |
| `broker_read_recover` | Clean up an expired owned batch in its original idle epoch. |
| `broker_read_reconcile` | Reconcile original metadata receipts after exact settings restoration. |

## Not implemented or not qualified; no public tool ID

- Production shared-helper keeper admission and native lease routing.
- Native receiving settlement and pending-release controller-loss recovery.
- Physical-key safety and removal of the input quarantine.
- Guaranteed unattended cold startup and universal crash/archive/delete recovery.
- Automatic native trust, hot-reload consent or permission-raise approval.
- MCP hot reload in this Codex chat; Cursor/OpenCode execution qualification.
- Claude web/Cowork chat parity, broader Codex bridge fixes and unrelated 1Password work.
