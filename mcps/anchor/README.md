# anchor

One front end to the MCP fleet. A chat loads one server with three tools,
`anchor_discover`, `anchor_describe` and `anchor_run`. Anchor reaches the
fleet's services on its behalf: it starts them on first use, supervises
them, serves them through release channels, files tickets for what breaks,
and can send a sandboxed fixer to repair them.

**Status:** built and tested, registered nowhere (`mcp.json` has empty
`harnesses`). Putting it in front of the fleet is Taylor's decision; see
`~/src/docs/plans/anchor-fleet-framework/migration-proposal.md`.

## How it fits together

- **Front end** (`src/shim.mjs`): the stdio MCP server a chat starts. It
  hands every call to the daemon and acknowledges delivery, so a call that
  was never delivered can be retried safely. If the daemon is unreachable,
  it runs a minimal anchor inside its own process (degraded mode).
- **Daemon** (`src/daemon.mjs`, `src/core.mjs`): one per state folder, on
  a Unix socket. It holds sessions, notes, jobs, idempotency records,
  release pins and tickets.
- **Services:** each runs in its own supervised process
  (`src/service-host.mjs`): a module service, or a gateway to a fleet
  server's own MCP process. Restart policy, crash attribution and
  quarantine are in `src/supervisor.mjs`.
- **Releases** (`src/release.mjs`, `src/channels.mjs`): stable only moves
  forward, and a nightly is under observation. Each chat is pinned to the
  releases it first used.
- **Tickets and fixers** (`src/tickets.mjs`, `src/dispatch.mjs`,
  `src/fixer-headless.mjs`, `src/sandbox.mjs`): fixers run headless Claude
  Code on the subscription only, inside a Seatbelt sandbox with a read
  allow list.
- **Code review gate** (`src/reviewer.mjs`, `src/review/TEMPLATE.md`):
  before a fixer's change touches a live folder, an independent reviewer
  checks it. The reviewer is a separate headless session, read only,
  sandboxed and on the subscription. It sees the files before and after,
  the diff and what the change is for, but not the fixer's reasoning. A
  rejection, or no verdict, escalates the ticket to Taylor. The template is
  generic: any path that releases without a person can call
  `reviewChange()`. `ANCHOR_REVIEW=off` disables it. The desktop fixer
  (`src/fixer-claude.mjs`) cannot be reviewed, so it is off unless
  `ANCHOR_ALLOW_DESKTOP_FIXER=1` is set for a supervised run.
- **Discovery** (`src/discovery.mjs`): a keyword first pass over service
  manifests, with per-service relevance hooks.
- **Signals** (`src/signals.mjs`): one event stream (`events.jsonl`,
  schema v1) of calls, errors, fallbacks, crashes, restarts, releases, pin
  moves, tickets, discovery and upgrades (counts, codes and versions, never
  arguments or results), plus each service's current state.
  `anchor:signals {since}` returns what changed after a cursor and where
  everything stands, so a digest or dashboard is only a question of
  presentation.
- **Updates** (`src/build.mjs`): the daemon drains and restarts itself when
  the code on disk changes; open chats move to it on their next call.
- **Alerts and dashboard** (`src/alerts.mjs`, `src/export-dashboard.mjs`).

## Using it

Anchor is registered in Claude Code (`claude mcp add -s user anchor --
<repo>/mcps/_shared/bin/run anchor`) and Codex (`[mcp_servers.anchor]` in
`~/.codex/config.toml`), beside the fleet's direct registrations. A chat
sees the three tools and a short list of services. Check health and
configuration with `anchor:status`, and what changed with
`anchor:signals {since}`.

**Rollback:** `claude mcp remove -s user anchor`, and delete the
`[mcp_servers.anchor]` block from `~/.codex/config.toml`. Nothing else
changes: the fleet's own registrations are untouched.

## Running

```sh
mcps/_shared/bin/run anchor
```

Runtime state: `~/.local/state/mcps/anchor/` (`ANCHOR_STATE_DIR` overrides).
Services: `services/` (`ANCHOR_SERVICES_DIR` overrides). To bring a fleet
server in as a gateway service, run `node src/import-service.mjs <fleet-id>`,
adding `--sensitive` for one whose results must never reach disk.

## Tests

```sh
sh test/run-all.sh
```

Runs every scenario suite against the fixture services in
`test/services/`, with state in `~/.cache/anchor-lab/test-state/`. It never
uses the real state folder, and it sends no real alerts. Other entry points:
- the live pilot: `test/pilot/` (`setup.mjs`, `run.mjs`, `score.mjs`);
- the discovery evaluation: `test/discovery/eval.mjs`.

Findings from building it: `docs/FINDINGS.md`.
