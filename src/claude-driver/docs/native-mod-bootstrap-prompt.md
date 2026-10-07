# One bounded native-mod activation

Prepared October 7, 2026, 06:35 Eastern. STAGED ONLY. This is for Taylor to
send manually to the existing **claude-driver-broker** chat, not Broker Recovery
Probe. Codex must not send or impersonate this message.

The installed warm loader requires `personOnly:true`. The documented flow asks
**Enable for this session** when Claude writes its own dev-mod files, then loads
at turn end. Taylor must answer himself. Source:
<https://code.claude.com/docs/en/plugins/mods/create>.

## Send this prompt

```text
Perform one bounded maintenance turn in this existing claude-driver-broker chat. This is a scoped native mod installation, not a broker wake or a request to start an observation loop.

Proceed only in session local_35b3ba48-f02e-48de-bfbb-925192d90de1 (native CLI UUID 35b3ba48-f02e-48de-bfbb-925192d90de1), with cwd /Users/taylor/.local/state/claude-driver/broker. If these do not match, stop and report the mismatch. Preserve the session, model, permission mode, standing instructions, settings, maintenance jobs, and input quarantine.

Use native Read and Write only. Copy these three files byte-for-byte from /Users/taylor/src/github/dotfiles/src/claude-driver/candidates/native-mod-probe/ into your own session-local mod folder /Users/taylor/.claude/dev-mods/35b3ba48-f02e-48de-bfbb-925192d90de1/desktop-bridge-native-probe/, preserving their relative names:
1. .claude-plugin/plugin.json
2. hooks/hooks.json
3. hooks/register.js

Do not overwrite preexisting destination files; if any already exists, stop and let Codex reconcile it. Do not use Bash, invoke native session-management tools for the probe, rewrite the supplied code, install globally, change settings, create chats, send messages, start agents/timers/polling, restart anything, or answer a human consent dialog. Read back just the three copies and compare their contents with the source. Codex will independently verify their hashes.

The expected plugin is desktop-bridge-native-probe v0.2.0, probe ID ddc7012b-e98f-4077-bc21-ae68d4f50406. Claude may ask Taylor to enable hot reloading for this session; wait for that human answer. The mod loads at turn end. Do not claim it loaded from file-copy success, and do not run its command yourself during this installation turn.

Finish with one short line saying copied and awaiting native load, or the exact blocker. Do not resume a polling loop. Taylor will run the explicit command after the turn ends.
```

After that turn ends and native load is observed, send this command once:

```text
/claude-driver-native-read-probe
```

If absent or failed, do not resend as ordinary text or wake the broker. Preserve
the failure. This command requests no model completion, reads only the owned
archived fixture, and writes sanitized local evidence. An exception or successful
return does not establish gate coverage.

## Exact source and output

| Relative file | SHA256 |
| --- | --- |
| `.claude-plugin/plugin.json` | `da9d8573a8e656cdc88a4eb355ee3f4cf24f5fbf1313200ae12400b503513cfa` |
| `hooks/hooks.json` | `ac225d373dd34c3042e759b35f80a821560822227303353464eca00ec6e03d96` |
| `hooks/register.js` | `3a7b1e8c083d24ce932e54a0e61894d723178c46952bf78982a91613f9e9183c` |

These identify the prepared candidate, not loaded bytes. Revalidate before live
qualification. Bundled static validation passed in
`native-mod-validation-2026-10-07T10-34-00-981Z.json` in the service pressure folder.

Before the read, the command writes its intent:
`/Users/taylor/.local/state/claude-driver/broker/.native-mod-probe-ddc7012b-e98f-4077-bc21-ae68d4f50406.started.json`.
It then writes one bounded completed report to the existing inbox:
`/Users/taylor/Desktop/temp_reports/native-mod-probe-ddc7012b-e98f-4077-bc21-ae68d4f50406.report.json`.
No raw result/error/transcript/environment is included. Reports remain untrusted.
`gateQualified` and `releaseAuthorized` stay false.

Keep the intent even after success; never delete it to repeat a probe. Prior
intent/report refuses a reload, and simultaneous commands in one loaded module
share one attempt. Native fs.write is not exclusive or atomic: this is not
cross-process admission or general idempotency. Partial/failed writes require
independent reconciliation, never automatic replay.

## Qualification and unload

Codex must bind destination hashes, actual loaded plugin/version, exact native
PID/start, command ancestry, original PreToolUse denial and absence of new model
turns. Independently verify the fixture, original settings/policy and receipts.
Do not acknowledge the report until review is checkpointed.

The probe performs no automatic activity. The documented `/plugin` Installed
view offers disabling, but its actual effect and persistence in this desktop
session must be observed. Do not change global settings to force unload. Before
enrollment, establish scoped unload, command removal and unchanged broker
settings/epoch. If another human action is needed, present only the verified
scoped action. Preserve intent/receipt evidence.

No keyboard automation, global installation, permission change, app restart,
SDK controls on the peer socket or consent-metadata write substitutes for native
consent. Positive admission and event-driven transport remain unimplemented and
unqualified. This probe neither releases the bridge nor settles historic effects.
