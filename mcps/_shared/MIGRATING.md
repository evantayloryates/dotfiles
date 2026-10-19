# Moving a service into the fleet

The playbook used for zdr-agent, db-kickoff-stage, notion-kickoff, gmail,
bulk-classify, framer and the prod databases (2026-10-18). Read `../README.md`
(layout) and `mcp.schema.json` (manifest) first.

## Target shape

```
mcps/<id>/
  mcp.json        required; validate against _shared/mcp.schema.json
  README.md       required (for people); move the project's README here
  CHANGELOG.md    first entry: ## 2026-MM-DD.001 saying where it came from
  GUIDE.md        optional (for agents)
  tools/          only for services served by the shared runtime
  src/            all of the project's own code: server, daemons, native code,
                  helpers, sealed-release machinery
  test/           the project's tests (fix their relative imports)
  docs/           long-form material (findings, briefs, audits)
  bin/            human CLIs only; link them onto PATH where the old ones were
```

Large projects keep their code as-is under `src/`. Do not rewrite servers into
`tools/` as part of a move; that is later work.

## How it starts

Every registration runs `mcps/_shared/bin/run <id> [profile]`:

- `mcp.json` `"entry"`: a JS module the shared launcher imports in-process
  after loading the env keys `mcp.json` declares (framer, notion-kickoff).
- `mcp.json` `"launcher": "src/launch"`: an executable script `bin/run` execs
  with `MCP_ID`, `MCP_PROFILE`, `MCP_DIR`, `MCP_REPO` set and the profile as
  `$1` (`shift` it when `MCP_PROFILE` is set). Use this when the start needs a
  clean environment, a secret broker, a credential check or several modes
  (db-kickoff-stage, gmail, bulk-classify).
- Neither: the shared runtime serves `tools/` (zdr-agent).

Relative paths to shared code: `src/lib` is `${MCP_REPO}/src/lib` (from
`mcps/<id>/src/` that is `../../../src/lib`); the protocol kernel is
`mcps/_shared/kernel/mcp-stdio.mjs` (from `mcps/<id>/src/` that is
`../../_shared/kernel/mcp-stdio.mjs`). `src/lib/node/mcp-stdio.mjs` is a shim
that re-exports it.

## Steps

1. **Coordinate first.** Find sessions working on the project
   (`mcp__ccd_session_mgmt__list_sessions`, `search_session_transcripts` for the
   path) and uncommitted or worktree work (`git status`, `git worktree list`).
   Message the active owner with what you will move and when; wait for their
   in-flight work to land. Never move files out from under another session.
2. **Inventory every reference** to the old path: `git grep`, LaunchAgent
   plists (`src/launchd/`, `~/Library/LaunchAgents/`), `~/.claude.json`,
   `~/.codex/config.toml`, Claude desktop's config (read only), `bin/` links,
   `~/.local/bin`, and agent docs (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`,
   `~/.cursor/rules/global.mdc`, `~/.claude/skills`, `~/.codex/skills`,
   `~/.claude/projects/*/memory`). Include ignored files (`.env`,
   `node_modules`, build output, `.runtime` state): `git mv` does not move
   them, so `mv` the directory and let `git add -A` record the renames.
3. **Quiesce** any LaunchAgent or daemon the move affects: check it is idle,
   `launchctl bootout`, move, fix paths, repoint the plist symlink,
   `launchctl bootstrap`, verify it runs.
4. **Move**, then fix relative paths, write `mcp.json`, `CHANGELOG.md`, and
   move the README.
5. **Verify live** through `mcps/_shared/bin/run <id>`: initialize,
   `tools/list`, and one real read-only tool call. Run the project's tests.
6. **Re-register** in Claude Code (`claude mcp remove/add -s user`) and Codex
   (edit only that `[mcp_servers.<name>]` block; keep its timeouts and other
   keys; check the file still parses with `tomllib`). Keep the registration
   name unless the id changed. Never edit Claude desktop's config while Claude
   runs; leave a compatibility symlink at the old launcher path instead.
7. **Leave compatibility symlinks** at old paths that running processes or
   other sessions still use, and list them in your report for later removal.
8. **Update docs** that named the old path.
9. **Commit and publish** with `/Users/taylor/dotfiles/bin/dotfiles-publish`
   (see the repo's CLAUDE.md). One commit per service.

Report: what moved, what was verified and how, compatibility links left,
anything skipped and why.
