# Real Safari/Chrome call smoke: service postmortem

## Result

The page-control lane worked through both real iOS browsers. The next release is1.10.1: it fixes intermediate browser handoff behavior and makes diagnostic coverage/failures easier to assess. This does not claim passcode-free XCTest, a new physical network qualification or a transcription-product fix.

## Evidence

Completed Claude Runner local_09539507-c7a9-4a0a-bea9-9191f3b1c90c, CLI session2d8cf90b-d453-4102-97b6-fdbffc5bb265; local smoke notes at Kickoff .scratch/ios-transcription-smoke/results.md. Host signals were copied before retention could prune them into the existing report bundle evidence/postmortem-1-10-0/.

The retained window is12October01:23:00–01:43:37UTC (11October Eastern).492records:286browser,116host,20web app,66call app and4MCP-hook records.86browser command terminal reports:85completed,1stale_snapshot rejection;53state reads,18snapshots,13clicks and2evaluations.19host lease acquisitions and19releases. Counts represent records, not independent workflow correctness.

The actual ios_guide receipt reported connected MCP1.9.51 (40tools/10resources), while the loaded host matched the published1.10.0 source. All86browser commands lacked a traceId. The4MCP records came from separate Stop-hook requests, not the driver's main connection. This proves the connection was stale; it does not prove hooks or logging in1.10.0 failed to execute after admission.

## Findings and changes

| Finding | Evidence and response |
| --- | --- |
| Long-lived MCP stayed old | Added loaded-versus-installed connection comparison in guide/status, connection startup/outdated signals, loaded worker serviceRelease, and coalesced host client_trace_missing notices. Existing1.9.51 code cannot acquire new behavior retroactively: reconnect before the next run. |
| Warning-only review missed a failed input | The host correctly rejected stale_snapshot, but logged it at info. Rejected/unknown page terminals now warn; MCP completion includes fixed error reason as well as outcome. Unknown input is still never replayed. |
| Permission detour unexpectedly sent browser Home | Managed web_end formerly always requested Home. New home=false explicitly retires ownership/capture/transport and verifies glow-off without requesting Home. system_end home=false reports intentional handoff rather than pending Home. Reacquire the same enrolled page with web_begin; web_open launches/reloads and can repeat prompts. Default final cleanup still requests Home. |
| Call disconnected but lobby owned live preview tracks | released correctly failed, rather than claiming microphone release. Diagnostics now expose actual mic/camera track state separately from permission state and identify disconnected_with_live_tracks only from observed live tracks. Guidance directs the agent off the meet route, followed by same-document release verification. No product track behavior changed. |
| Chrome Permissions API reported prompt with a live mic | This was a projection disagreement, not proof of an active OS dialog. Track/permission diagnostics remain separate; neither new code nor instructions should ask for another permission based on prompt alone. |
| Large trails were hard to summarize | ios_signals view=summary and CLI --summary report matching retained totals, outcomes, command trace coverage and eight recent notable rows. It also finds historical info-level rejected/unknown outcomes. Text is byte-bounded; no payload/audio capture. Routine event names no longer repeat the kck scope. |
| Agent fabricated a Claude prompt owner | One request used a human-readable string as promptId and was correctly refused by schema. Do not weaken the owner fence. Use exact harness-provided tuple through its hook or explicit connection ownership/end in finally; never invent IDs. Most run sessions used mcp-connection, so automatic exact-prompt cleanup is not established by this run. |

## Remaining opportunities, with boundaries

- **High: permission fallback on real phones.** New preserve-foreground handoff needs the next physical smoke. It avoids our Home/reload disruption; it cannot exempt Apple's XCTest authentication. Safari fallback succeeded without a fresh passcode once; later Chrome fallback required one. These are distinct observed states, not a general authentication unlock.
- **High, transcription project: call-protection jitter onset.** Claude reported isolated1.3–1.5second coach jitter samples after silence, partial refinement audio and protection pauses. Service logs do not carry the gateway's policy evidence; do not turn this into a confirmed service root cause or loosen a product guard here. The transcription owner should compare its existing gateway signals and debounce choices separately.
- **High, transcription project: direct iPhone publishing.** Existing tailnet route gates the client's new caption/direct-publishing path off; the run exercised coach relay. Enabling the gateway on the private tailnet requires explicit origin/Host/auth design and its own test. Not an iOS-agent control failure; no route widened in this release.
- **Useful: quieter synthetic input.** Ambient speech contaminated the acoustic client fixture. Use a quiet room or controlled input; advancing RTP and coach relay success do not validate the intended spoken fixture. No raw audio or transcript content was imported into this postmortem.
- **Next-use qualification: cleanup and owner wiring.** The run's last browser end was unconfirmed after foreground loss/reload. The agent reported independently seeing Home afterward. Do not equate that with full media release or successful same-document glow feedback. Next run should record explicit release, final Home and exact owner mode separately.

## Verification and rollout

Focused no-phone checks cover app/reflected handoff without Home, default cleanup, ownership loss, fresh glow fencing, actual MCP forwarding, summary bounds/coverage, rejected terminal severity, trace propagation, loaded-release metadata and live-preview diagnostics. 35focused Node checks,33Python checks and13changed-source syntax checks passed. See postmortem-release-1.10.1.json. No new browser JS/native binary is required. Restart the Python broker only at verified idle; refresh the consuming harness's MCP connection. The next real phone run qualifies the new handoff. No live phone input, provider call, recording, permission or network-setting mutation was used to verify this patch.
