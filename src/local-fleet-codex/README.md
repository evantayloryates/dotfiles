# Codex local fleet

This is the Codex-only local build fleet runtime. It uses the Call Guidance
kanban implementation as a board engine, with a separate data directory and
port from the existing Claude fleet. The manager and all workers are Codex
desktop chats. No Claude session, claude-driver, or Claude skill file is needed.

## Entry points

```sh
node /Users/taylor/dotfiles/src/local-fleet-codex/fleetctl.mjs status
node /Users/taylor/dotfiles/src/local-fleet-codex/fleetctl.mjs start <manager-codex-thread-id>
node /Users/taylor/dotfiles/src/local-fleet-codex/fleetctl.mjs start <new-manager-id> --takeover
node /Users/taylor/dotfiles/src/local-fleet-codex/fleetctl.mjs stop
node --test /Users/taylor/dotfiles/src/local-fleet-codex/*.test.mjs
```

`start` installs or restarts two per-user launchd services: the board on
`127.0.0.1:4871` and the watcher. Their config, board data, logs, and durable
delivery receipts live in `~/.local/state/guidance-fleet-codex`. `stop` leaves
that state in place. A manager change requires `--takeover`; inspect open cards
and worker ownership before using it. The separate Claude board on port 4870
and its services are untouched.

The watcher uses a board consumer cursor. It skips writes by `fleet`, sends
other events to the exact manager chat via the local Codex app-server queue,
and acknowledges only after the manager turn completes. Delivery keys and
message hashes are durable: an uncertain submission fails closed rather than
being resent under a fresh ID. Event payloads contain immutable fields so a
card edit cannot change a retry's identity. Every minute the watcher checks
Active cards; after 20 minutes without activity it alerts for no structured
`Assigned: <Codex thread ID>` comment or an idle/unavailable assignee.

The manager sends worker briefs through `queue.mjs`, then verifies the worker's
own card comment. Queue consumption is not task acceptance. `thread.mjs`
provides bounded read-only turn status when native chat tools are unavailable.
The user-facing operating contract is in
`/Users/taylor/.codex/skills/taylor-local-fleet/SKILL.md`.
