# Synthetic mobile audio probes

Use `ios_audio_probe action=plan` for the operating contract. This is an on-demand
DEV experiment, separate from the production transcription/guidance service.
The three paths are PCM/WebSocket, Opus/WebSocket and native Opus/WebRTC.

## Prepare once per call

1. Use the existing synthetic call-rig fixture. Before joining either UI, run
   `dev-tools/call-rig/ensure-insurance-room.cjs` through the canonical local
   container/stdin command in `dev-tools/call-rig/README.md`. Independently inspect
   the exact provider room: recording disabled, exclusion rules and zero recordings.
   Never use a stale saved room SID or a real customer's room.
2. Start the receiver with `/Users/taylor/dotfiles/bin/ios-audio-lab start`.
   It manages only its own user LaunchAgent on loopback3044, with no sudo.
   Private Tailscale Serve10522 must point to3044; preserve all other routes and
   keep Funnel off. The call app remains private10520→3020/4020.
3. Enroll Safari or Chrome using `ios_web_enroll profile=call-rig` and the
   fixture's meeting path with `?legacyTranscript=1`. Keep the coach in desktop
   Chrome. The panel is opt-in, fixed synthetic fixture and development only.
   Existing authenticated cookies must match the fixture identity; do not silently
   sign in as another client. If changing a temporary cookie, preserve/restore it
   privately and never print it.
4. Join through normal product controls. Handle a genuine permission dialog using
   the bounded `ios_system_*` fallback, then stop XCTest and reacquire the page.
   `ios_web_verify gate=web-call callPhase=paired` checks page state; provider
   participant/recording readback is separate. Enable the client microphone.

## Run one explicit experiment

On an owned page session:

- `ios_audio_probe action=select strategy=opus-ws fault=none sessionId=...`
- `ios_audio_probe action=run sessionId=...` exactly once.
- `ios_audio_probe action=read sessionId=...` for the terminal result after about10s.
- `ios_audio_probe action=stop sessionId=...` only to interrupt a known running probe.

PCM slow-reader, Opus drop-10 and WebRTC outage are useful distinct edges.
`disable-opus` applies only to Opus/WebSocket; `drop-10` does not apply to WebRTC.
A rejected/unknown command is never repeated automatically. Read current state.
The receiver keeps128 fixed signal records in memory; no audio/SDP/transcript is
retained. Enable AUDIO_PIPE_SIGNAL_LOG only for explicit fixed-signal collection.

## Interpret the result

Safari physically delivered all three baselines on11October2026. Opus/WebSocket
used about9.5% of PCM payload bytes in these short probes. PCM uses24k samples/s;
Opus decode counters use48k samples/s. Do not compare their raw sample counts.
The drop fault discards decoded payload every tenth frame; sequence-gap counts
stay zero because the receiver still acknowledges those frames. Sender drops
report separate local buffer pressure. WebRTC outage stopped its own peer after
about3s and preserved the primary call and source track.

RTT is acknowledgment timing, not end-to-end audible latency. Byte counts omit
transport overhead. Event-loop lag is not CPU or memory. The WebRTC probe uses
host ICE with no TURN/STUN server: nearby success does **not** qualify cellular
or arbitrary-network reachability. Use WSS as the qualified remote transport
shape until a separate off-LAN WebRTC relay experiment passes. This tool does
not automatically choose or ship an app transport policy.

## Finish

Exit both call UIs, leave the client's meeting route and require
`web-call callPhase=released`. Restore any temporary auth state. End the page
session in finally. A probe started under ownership also stops when that
ownership disappears; normal manual probes retain their own ten-second limit.
Check receiver active=0/peerConnections=0, then `ios-audio-lab stop` when no other
agent uses it. Return Home through a qualified driver and verify XCTest stopped.
