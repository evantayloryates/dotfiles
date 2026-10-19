# Changelog

## 2026-10-18.001

- Moved into the MCP fleet as `mcps/ios-agent` (formerly `src/ios-agent`),
  service release 1.10.6 unchanged. Code, the MCP adapter (`src/mcp/`, with its
  own npm package and `src/mcp/test/`), native and web code, the React provider
  and both LaunchAgent plists are in `src/`; Python and fixture tests in
  `test/`; docs and the qualification archive in `docs/`; human CLIs
  (`ios-agent`, `ios-agent-signals`, `ios-audio-lab`) in `bin/`. Claude Code
  and Codex start it with `mcps/_shared/bin/run ios-agent`; the registration
  name and tools are unchanged. `bin/ios-agent-mcp` (Claude desktop) links to
  `src/launch`. `src/ios-agent/` keeps one compatibility link per old entry for
  MCP servers that were running before the move.
