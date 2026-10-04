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
