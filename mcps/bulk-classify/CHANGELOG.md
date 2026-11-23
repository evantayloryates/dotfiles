# Changelog

## 2026-11-22.001 (branch ety/bulk-classify-decisions-routing, proof of concept)

- Stage two on the API key moves to the Decisions API (`POST /v1/decisions`):
  one choice question per text, a predicate per label for a second label, the
  model's confidence folded into `confidence`. `CLASSIFIER_STAGE2=chat` rolls
  back to chat completions.
- Routing between the API key and Taylor's ChatGPT subscription
  (`src/lib/route.mjs`): any PHI signal (harness scope, harness environment,
  paths under `~/.zdr-harness`, the process chain, job and profile records,
  the `phi` flag) forces the API key, fail closed; everything else runs stage
  two through `codex exec` (`src/lib/codex.mjs`), falling back to the API key
  when Codex fails. New `phi` argument on `classify_texts` / `classify_start`
  (`--phi` in the CLI) and a `classifier route` command.
- Every result line, summary and usage record names its engine and the route
  reasons. Profiles record the scopes that touched them; profiles saved
  before this change use the API key.

## 2026-10-18.001

- Moved into the MCP fleet as `bulk-classify` (formerly the `classifier`
  server inside the ZDR harness). Tool names are unchanged (`classify_*`);
  the server is now registered as `bulk-classify`. The ZDR harness still
  mounts it under its `classifier` key, and the `classifier` CLI still works.
