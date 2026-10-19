# Changelog

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/codex-bridge` (formerly `src/codex-bridge`).
  Code is in `src/`, tests and pressure scenarios in `test/`, the capability
  evidence contract and pressure-testing notes in `docs/`. Claude Code starts
  it with `mcps/_shared/bin/run codex-bridge`; the registration name and tools
  are unchanged. `src/codex-bridge/` keeps compatibility links (`lib`, `bin/`,
  `server.mjs`, `evidence.mjs`, `policy.json`, `native`) for running servers
  and for claude-driver and smart-record, which import its `lib/`.
