"""Theo: the Switchboard receptionist voice agent.

Runs as a LiveKit Agents worker named `receptionist`. The LiveKit dispatch rule
`receptionist-inbound` sends every call to +1 484-295-1665 into a per-caller room
and dispatches this agent into it.

Pieces (all cloud, nothing listens on this machine):
  STT  LiveKit Inference (Deepgram nova-3), billed to the LiveKit project
  LLM  OpenAI mini model via OPENAI_API_KEY (swap with SWITCHBOARD_LLM_MODEL / an
       OpenAI-compatible base URL such as Groq; no Anthropic API key is used)
  TTS  Cartesia sonic-3 with a `speak` voice profile (CARTESIA_API_KEY)

Observability: every call appends JSON lines to
~/.local/state/switchboard/calls.jsonl (start, each utterance, end).
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import cartesia, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

HERE = Path(__file__).resolve()
ENV_FILE = Path(os.getenv("SWITCHBOARD_ENV", HERE.parents[3] / ".env"))  # dotfiles/.env by default
load_dotenv(ENV_FILE)

log = logging.getLogger("switchboard")
STATE_DIR = Path(os.getenv("SWITCHBOARD_STATE", Path.home() / ".local/state/switchboard"))
STATE_DIR.mkdir(parents=True, exist_ok=True)
CALL_LOG = STATE_DIR / "calls.jsonl"

AGENT_NAME = "receptionist"
PERSONA = os.getenv("SWITCHBOARD_PERSONA_NAME", "Theo")
OWNER = os.getenv("SWITCHBOARD_OWNER_NAME", "Taylor")
LLM_MODEL = os.getenv("SWITCHBOARD_LLM_MODEL", "gpt-4.1-mini")
VOICE_ID = os.getenv("SWITCHBOARD_VOICE_ID", "47c38ca4-5f35-497b-b1a3-415245fb35e1")  # speak profile "init-alt" (Daniel)
ALLOWED = {n.strip() for n in os.getenv("SWITCHBOARD_ALLOWED_NUMBERS", "").split(",") if n.strip()}

INSTRUCTIONS = f"""You are {PERSONA}, {OWNER}'s receptionist, answering his dedicated line by phone.
You are talking, not writing: short plain sentences, no lists, no markdown, no emoji.
Be warm, direct and quick. One question at a time. Confirm what you heard when it matters.
You cannot yet take actions on {OWNER}'s computer; if asked for something that needs work,
say you'll note it and {OWNER} will get a text when it's done. Keep every reply under three sentences
unless asked to explain something."""


def record(event: str, **fields) -> None:
    row = {"ts": time.time(), "event": event, **fields}
    with CALL_LOG.open("a") as f:
        f.write(json.dumps(row) + "\n")


class Receptionist(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=INSTRUCTIONS)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    attrs = participant.attributes or {}
    caller = attrs.get("sip.phoneNumber", "") or participant.identity
    callee = attrs.get("sip.trunkPhoneNumber", "")
    call_id = ctx.room.name
    record("call_start", call=call_id, caller=caller, callee=callee)
    log.info("call %s from %s", call_id, caller)

    session = AgentSession(
        stt="deepgram/nova-3",  # LiveKit Inference; no Deepgram account needed
        llm=openai.LLM(model=LLM_MODEL),
        tts=cartesia.TTS(model="sonic-3", voice=VOICE_ID),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    @session.on("conversation_item_added")
    def _on_item(ev):  # noqa: ANN001
        item = ev.item
        record("utterance", call=call_id, role=getattr(item, "role", "?"), text=getattr(item, "text_content", "") or "")

    await session.start(room=ctx.room, agent=Receptionist())

    if ALLOWED and caller not in ALLOWED:
        record("call_rejected", call=call_id, caller=caller)
        await session.say(f"Sorry, this line only takes calls from {OWNER}. Goodbye.", allow_interruptions=False)
        await ctx.room.disconnect()
        return

    await session.generate_reply(
        instructions=f"Greet the caller in one short sentence as {PERSONA}, {OWNER}'s receptionist, and ask what you can do for them."
    )

    async def _on_shutdown():
        record("call_end", call=call_id, caller=caller)

    ctx.add_shutdown_callback(_on_shutdown)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=AGENT_NAME))
