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
  `reviewChange()`. `ANCHOR_REVIEW=off` disables it.
- **Discovery** (`src/discovery.mjs`): a keyword first pass over service
  manifests, with per-service relevance hooks.
- **Alerts and dashboard** (`src/alerts.mjs`, `src/export-dashboard.mjs`).

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
