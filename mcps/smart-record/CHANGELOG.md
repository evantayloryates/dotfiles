# Changelog

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/smart-record` (formerly `src/smart-record`).
  Server, CLI, engine and widget sources, builders, repair service and cursor
  renderer are in `src/`; the qualification kit (formerly `qualification/`) is
  `test/`; the long-form agent docs are in `docs/`; the human CLI is
  `bin/smart-record`. The MCP launcher `bin/smart-record-mcp` is now
  `src/launch`, and the server imports the fleet kernel and
  `mcps/codex-bridge/src/lib` directly.
- Claude Code and Codex start it with `mcps/_shared/bin/run smart-record`
  (registration name, tools and Codex `tool_timeout_sec = 3700` unchanged);
  `smart-record install` registers or repoints that form.
- The engine bundle, widget bundle and their LaunchAgents
  (`com.taylor.smart-record`, `com.taylor.smart-record.widget-host`) still
  run from `data/smart-record/`; the engine plist stays in `src/launchd/`.
  Path changes in `src/build.py` change the engine source hash, so the engine
  was rebuilt from the new location with unchanged Swift sources.
- `src/smart-record/` keeps compatibility links for running MCP servers,
  Claude desktop and older docs.
