# zdr-agent

The fleet's single entry point to Kickoff's local ZDR harness (an OpenCode
server on `127.0.0.1:4096`, source in `src/zdr-harness/`). Agents outside the
harness ask questions; the harness runs the data tools on a zero-data-retention
OpenAI key and returns only its de-identified final answer.

- Reads only `ZDR_HARNESS_PASSWORD`, from `src/zdr-harness/.env` or
  `~/.zdr-harness/.env`. The ZDR OpenAI key never reaches this process.
- Only replies written by the harness's `zdr` agent are relayed. Sessions owned
  by the `analyst` agent (full detail, for the app) are refused.
- Contact details are scrubbed again on the way out as a second layer.

Run: `mcps/_shared/bin/run zdr-agent`. Formerly `src/mcps/zdr-ask`.
