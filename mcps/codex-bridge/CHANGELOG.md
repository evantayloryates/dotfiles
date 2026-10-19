# Changelog

## 2026-10-18.002

- A call's `sandbox` is now capped by `maxSandbox` in `src/policy.json`
  (default `workspace-write`, never below `sandbox`). A call asking for more,
  such as `danger-full-access`, is rejected before any thread or turn starts;
  only a human edit to the policy raises the cap. Enforced in `Bridge.run`,
  `startAsync` and `runTurn`. `codex_status` and `preflight` show the cap.

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/codex-bridge` (formerly `src/codex-bridge`).
  Code is in `src/`, tests and pressure scenarios in `test/`, the capability
  evidence contract and pressure-testing notes in `docs/`. Claude Code starts
  it with `mcps/_shared/bin/run codex-bridge`; the registration name and tools
  are unchanged. `src/codex-bridge/` keeps compatibility links (`lib`, `bin/`,
  `server.mjs`, `evidence.mjs`, `policy.json`, `native`) for running servers
  and for claude-driver and smart-record, which import its `lib/`.
