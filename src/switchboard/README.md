# switchboard

The agent receptionist line. Round-1/2 research and decisions live in
`/Users/taylor/src/docs/plans/switchboard/`.

## agent/ — Theo, the voice agent

LiveKit Agents worker (`agent_name=receptionist`) for the LiveKit number +1 484-295-1665.

```bash
cd src/switchboard/agent
uv sync                              # once; also `uv run agent.py download-files` (VAD + turn-detector models)
uv run agent.py dev                  # run locally; the worker dials OUT to LiveKit Cloud, no open ports
uv run agent.py start                # production mode (launchd on the Air later)
```

Env (from `dotfiles/.env`, or `SWITCHBOARD_ENV=/path/.env`): `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `OPENAI_API_KEY`, `CARTESIA_API_KEY`. Optional:
`SWITCHBOARD_ALLOWED_NUMBERS=+19095381940` (comma list; empty = answer anyone),
`SWITCHBOARD_LLM_MODEL`, `SWITCHBOARD_VOICE_ID`, `SWITCHBOARD_PERSONA_NAME`, `SWITCHBOARD_OWNER_NAME`.

Calls log to `~/.local/state/switchboard/calls.jsonl`.

## Operating the Air (`theo-air`)

- `ssh theo-air` (alias in ~/.ssh/config → theo-air.local, key ~/.ssh/theo-air). Passwordless sudo as `theo`.
- GUI, two paths: (1) Screen Sharing app on Taylor's Mac (`open vnc://theo@theo-air.local`, account auth,
  remembered in keychain) driven by Codex computer use (session `theo-air-gui`, app "Screen Sharing",
  model override `gpt-6-sol` while the default `gpt-6.1-sol` is rejected); (2) headless `bin/theo-vnc`
  (capture/click/type/key over VNC-password auth; password from 1Password vault Theo at run time).
- Theo service on the Air: `launchd/me.taylor.switchboard.agent.plist` → `~/Library/LaunchAgents/`;
  deploy = `git pull` + `launchctl kickstart -k gui/$(id -u)/me.taylor.switchboard.agent`.
- Voicemail summaries: Air `bin/switchboard-notify.sh` (ssh to `macbook-pro-3.taile8fdd0.ts.net` first, `MacBook-Pro-3.local` fallback; log `~/.local/state/switchboard/notify.log`) → `bin/switchboard-enqueue.sh` → outbox dir → `bin/switchboard-outbox.sh`
  (launchd `me.taylor.switchboard.outbox` on Taylor's Mac, GUI session) → `~/.local/bin/switchboard-send.sh` (copy of
  Desktop/send.sh outside the TCC-protected Desktop) → Messages self-chat. Temporary until a real SMS channel exists.

## Tailnet
Both machines are on Taylor's tailnet (MagicDNS suffix `taile8fdd0.ts.net`): `theo-air` 100.114.57.113 (Homebrew
`tailscaled` daemon, auth key in 1Password Theo vault) and `macbook-pro-3` 100.89.79.39 (standalone Tailscale.app,
start-on-login enabled; the Network Extension approval in System Settings was the one step Taylor had to click).
`ssh theo-air` uses mDNS on the LAN, `ssh theo-air-ts` the tailnet from anywhere. Key expiry is disabled on both nodes.
