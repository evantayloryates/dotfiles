# Native input ownership and audit coverage — October 18, 2026

The actual-host test already proved that successful Stop dispatch does not
release native filters while another client stays connected. This investigation
narrows the owner and isolation questions without patching or calling private
native interfaces. The full goal remains incomplete and local quarantine stays
enabled.

## A separate CODEX_HOME is not helper isolation

By default the current shipped `native-pipe.js` connects first to a socket beneath the
macOS user's home, at
`Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`.
Only when connection fails does its startup branch select a helper application,
including one beneath CODEX_HOME. Separate test homes therefore do not by
themselves separate helper ownership. This agrees with the two-client native
observations; no new native experiment was needed to establish the client path.

Reviewed source SHA256:
`60b3653f7ee052007b02a79e11416a89d424d73dac450e429a93b214839c267f`.
Internal service/pipe environment overrides appear in that implementation, but
no supported public isolation contract or alternate-server binding was
established. They were not executed. Do not ship a per-worker helper design
based only on changing CODEX_HOME, an internal environment variable or the
helper's bundle path. A later read-only string inventory found the same pipe-path
override name inside the native helper binary itself. This is a concrete lead
for checking server-side startup configuration, not proof of a supported or safe
multi-instance mode. It has not been executed. Verify its binding and instance
semantics before proposing a remote isolation experiment; preserve current
client, signature, permission and owner boundaries.

## Native app lifetime is a separate boundary

Static symbols in exact helper SHA256 `f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13`
identify a shared `ComputerUseAppInstanceManager`, app instances with a retained
app controller, and explicit instance removal/deactivation. The controller has
a focus enforcer and termination observer. `SystemFocusStealPreventer` has a
`viewBridgeKeyboardTap` and per-process state. This provides a concrete native
owner hypothesis for the extra observed ViewBridgeAuxiliary filter.

Address-bounded static disassembly of `endByUserRequestAfterPendingOperations`
contains a call to `ComputerUseAppController.deactivate` at `0x100072480`.
Separate controller/focus-enforcer destructor and deactivate regions are
preserved. These are compiled paths, not a proof that every filter reaches
cleanup, that the manager releases an instance on host Stop, or that the
historical duplicate-key callback is identified. No debugger attached and no
native method was invoked.

One changed-condition remote test then stopped only the disposable fixture app
after the verified real-host Stop/EOF and 15-second retention interval. Both
keyboard filters disappeared while helper PID 2576 and the same second client
remained alive. Independent snapshots one and five seconds after fixture exit
showed zero helper keyboard filters. The host cleanup result remains failed;
app termination is a separate successful cleanup boundary. This supports the
native app-lifetime hypothesis for this fixture. It does not justify quitting
Claude to clean every request or prove the historical physical-key callback.

Remote run `run-1792352881902-3c70a408`, thread
`01a1508e-8e13-7122-b885-d40addd8345d`, turn
`01a1508e-8e1a-7f61-a8e3-ec41b70e7afd` retained its real context and exact
one-attempt synthetic text proof. The fixture used its own stop file, not a
process kill. The remaining client then ended normally. Final inventory has no
owned process/helper/filter, the original four non-helper taps and unchanged
Switchboard/caffeinate PIDs 508/510 and old remote repository.

The returned public CUA documentation exposes no App stop/dispose/release
method. Its optional `close()` belongs to browser Tab, not App. The reviewed
Mac client exposes app state/actions/start/policy requests, without a public
instance-end method. Do not call the compiled user-end method through a private
pipe, fabricate a human stop, kill a shared helper or treat a symbol name as a
supported API. The [official Computer Use guide](https://learn.chatgpt.com/docs/computer-use)
also did not supply a scoped filter-release or helper-instance contract.

## A concrete logging improvement

The driver's existing audit discarded helper keyboard filters whose target was
not Claude. In the retained native test, the same helper owned two active filters:
one targeted the fixture and one targeted ViewBridgeAuxiliary. A Claude-only
result could therefore omit useful evidence even though its target-specific
gate was behaving as written.

`inputFilterInventory` now retains `otherTargetFilters` as sanitized tap metadata
alongside the existing Claude `filters`. It explicitly marks the assessment scope
and `nativeInputReleaseAssessed:false`. It does not log app contents, process
arguments or other app paths, add a native query, change the existing Claude
health gate, infer that an unrelated caller's filters are stale or clear a human
quarantine. Existing callers still receive the same Claude filter list.

Replaying the original settled native snapshot through the production inventory
retains both other-target filters; no new native operation was used for that
check. Focused tests cover retained secondary targets, unknown target PIDs,
look-alike helper names, original Claude leak gating, audit failure and unchanged
quarantine semantics. This improves future diagnosis, not native cleanup.

Five focused tests passed. The complete 191-file isolated suite passed once in
47.9 seconds on source
`4d2c654e092301b6369f1027a87267ac539543287ea22934ba31d41123e1e17a`,
with unchanged source/suite/installed identity:
`pressure/v2-2026-10-18T19-47-35-408Z.json`. No broad suite repetition or local
native test was used. The actual loaded MCP/native service proofs remain tied
to their earlier builds; this logging change does not relabel them.

Private evidence is under
`.runtime/state/pressure/input-investigation-20261018/native-owner-20261018/`:
source-hashed client snippets, complete selected symbol names, address-bounded
disassembly, recorded-native inventory replay and the owned fixture-exit
experiment. This work does not qualify physical typing or real Claude recovery.
The additional remote-evidence manifest verifies 12 files; no live handle,
fixture cleanup or human prompt remains pending.
