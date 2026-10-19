# Anchor lab: findings

> **Moved 2026-10-19** from the scratch lab (`tmp/anchor-lab`) to
> `mcps/anchor` (Taylor's call). Entries below use the lab's layout:
> `anchor/` is now `src/`, `harness/` is now `test/`, fixtures are in
> `test/services/`, and test state is in `~/.cache/anchor-lab/test-state/`.


A minimal anchor built to find edge cases before real services move behind
it. Dependency-free Node; scratch only (`tmp/` is git-ignored).

## Layout

```
anchor/
  shim.mjs           MCP stdio front end, one per chat; 3 frozen tools
  daemon.mjs         shared daemon on a private Unix socket; single instance
  core.mjs           routing, sessions, jobs, notes, ledger, prompt composition
  supervisor.mjs     one supervised process per service; restart policy
  service-host.mjs   child process that hosts a service module
  context-worker.mjs runs services' sessionContext generators off the core
  store.mjs          crash-safe journals; lock.mjs: stale-safe directory lock
  policy.mjs         per-operation idempotency and manifest validation
  release-check.mjs  release gate (library and CLI)
  channels.mjs       release channels and per-call routing
  release.mjs        release, promote, status
  tickets.mjs        ticket book: filing, clustering, priority, verify, reopen
  dispatch.mjs       hotfix and standard lanes: hands tickets to a fixer
  fixer-claude.mjs   fixer adapter: a work order as a desktop session (claude-driver)
  fixer-headless.mjs fixer adapter: a work order as a headless Claude session
  sandbox.mjs        Seatbelt profile and wrapper confining fixer sessions
  alerts.mjs         alert episodes: one alert, hourly repeats until clicked, one resolve
harness/run-all.sh   every suite in order, alerts forced to the log backend
services/            echo (healthy), flaky, chaos, slow (lab fixtures)
harness/             coerced harness (client.mjs) and scenario suites
state/               runtime: socket, lock, ledger, jobs journal, caches
```

Run a suite: `node harness/scenarios-basic.mjs` (also `-supervision`,
`-recovery`, and `race.mjs`).

## Status (2026-10-19)

| Suite | Result |
|---|---|
| basic: tools, discover, bulk describe/run, images, jobs, progress, sessions | 26/26 |
| supervision: crash, op quarantine, flapping, start backoff, timeouts, hot reload, idempotency, 200-call bulk | 21/21 |
| recovery: daemon death mid-call, idempotent retry, lost jobs, 2 chats x 150 parallel, degraded mode and recovery | 13/13 |
| race: 5 chats starting at once, before and after a hard kill | 1 daemon in 9/9 runs |
| persistence (iteration 2): static ops, drift, sessions/notes/idempotency/jobs across daemon restarts, torn journals | 22/22 |
| policy (iteration 3): per-operation idempotency, release check, records across daemon and degraded mode | 20/20 |
| channels (iteration 4): promotion gates, nightly fallback, changed actions, release gate, max nightly age, hotfix, release race | 23/23 |
| tickets (iteration 5): filing, clustering, agent reports, hotfix lane end to end, regression reopen, retries, escalation, per-service serialization | 20/20 |
| fixer (iteration 6): Claude fixer adapter against a fake claude-driver | 12/12 |
| real end-to-end with claude-driver | blocked: see iteration 6 |
| headless (iteration 7): headless fixer backend against a fake runner | 13/13 |
| real end-to-end with a headless Claude session | fixed, verified, root-cause ticket opened |
| sandbox (iteration 8): scripted escapes plus a sandboxed fake fixer probing 9 routes | all denied; headless suite 16/16 |
| modern (grind phase 1): anchor driven as a 2026-07-28 client | 5/5 |
| alerts (grind 6.1): episodes, repeats, acks, degraded across chats, no-fixer hotfix, manual resolve | 10/10 |
| kernel protocol suite (`mcps/_shared/kernel/test/protocol.test.mjs`) | 6/6 |

## Findings and what changed

1. **Prompt generators must not live in the service process.** Running
   `sessionContext` inside the service meant building a chat's instructions
   would cold-start every service, or lag one session behind. Generators now
   live in `services/<id>/context.mjs`, run in one worker thread with a
   300 ms budget; a hung generator gets the worker replaced, and the service
   falls back to its last good text, then its manifest line.
2. **Instructions were built before the harness identified itself.** The
   front end asked the daemon for instructions at process start, before MCP
   `initialize` carried `clientInfo`. The shared kernel
   (`mcps/_shared/kernel/mcp-stdio.mjs`) now accepts `instructions` as a
   function of the client, computed per connection. Static strings still work.
3. **Notes broadcast to everyone.** Quarantine notices reached chats that never
   used the service. Service notes now reach only sessions that used that
   service; fleet-wide notes (degraded mode) reach all.
4. **Start failures reported Node's version banner** instead of the thrown
   error, which also made fingerprints useless. Error-line extraction now
   skips the banner.
5. **A crash explained by a quarantined operation should not back off the
   whole service.** Once the crashing op is quarantined, the service restarts
   immediately for its other operations.
6. **Hung handlers leak.** Timed-out calls whose handlers ignore cancellation
   keep running inside the process. After 3, the supervisor recycles the
   process as soon as nothing else is in flight.
7. **Two daemons could start at once** (5 chats starting together), the second
   deleting the first's socket and leaving it running unreachable. Fixed with
   an atomic lock directory; a dead holder's lock is taken over by rename, so
   only one contender can win even when a crash left stale files behind.
8. **Service processes must exit when the daemon dies.** `service-host`
   now exits on IPC disconnect (none were found orphaned, but nothing
   guaranteed it).
9. **Lab hygiene:** a test that crashes midway can leave fixtures (like
   `CRASH_ON_START`) behind; suites now reset their fixtures first.

## Iteration 2 (2026-10-19): static operations and persistence

- **Operations are declared in `service.json`** (`operations`: description,
  inputSchema, class, strategy). Discover, describe, unknown-operation and
  bad-argument rejection all work from the manifest: none of them starts a
  service. A manifest without `operations` is reported as broken.
- **Drift check on every start.** Declared but unimplemented operations
  return `not_implemented` and are announced to chats using the service;
  implemented but undeclared handlers are never callable. `anchor:status`
  shows both lists.
- **Journals** (`store.mjs`) for sessions (with pending notes and services
  used), idempotency records and durable job results: append-only, a torn
  last line is skipped and recorded in the ledger, compaction on start drops
  expired entries via temp-file-and-rename.
- **Idempotency semantics:** a finished key replays its stored result (across
  restarts); a key running in this process attaches concurrent duplicates to
  the one run; a key started by a daemon that died is rerun and flagged
  `rerunAfterRestart`. That is at-least-once, so the key is passed to the
  service (`ctx.idempotencyKey`) for it to dedupe real side effects. The same
  key with different arguments is `idempotency_conflict`.
- **Only calls that outlive their deadline become durable jobs**, which keeps
  journal writes off the fast path.

### New finding fixed in iteration 2

10. **A call sent into a just-dead connection was reported as "outcome
    unknown"** even though the daemon never received it. The daemon now
    acknowledges each request on arrival; a connection lost before the ack
    means nothing ran, and the front end retries on a fresh daemon. Only an
    acknowledged call that is then lost is "outcome unknown".

## Iteration 3 (2026-10-19): idempotency policy and release check

- **Each operation declares `idempotency`** in `service.json`
  (`anchor/policy.mjs`):
  - `natural`: harmless to repeat. Rerun whenever the outcome is unknown, key
    or not. Default for class `read`.
  - `keyed`: the service dedupes on `ctx.idempotencyKey`. Rerun only when the
    call carried a key.
  - `none`: never rerun blindly. Default for `write` and `destructive`. An
    interrupted call stays `outcome_unknown` for that key, even on retry; a new
    key runs it again on purpose.
  - A `write`/`destructive` op declared `natural`, an unknown value, a bad
    version slug, a reserved name (`guide`, `status`) or a non-object schema
    makes the manifest invalid; the service shows as unavailable.
- **The same policy drives both retry points:** the front end resending a
  call lost after the daemon acknowledged it, and the core deciding whether a
  key it saw start before a crash may run again.
- **Release check** (`node anchor/release-check.mjs <id>... | --all`):
  - Errors (exit 1): manifest problems; module fails to load (loaded in a
    throwaway process with a 5 s limit); declared but not implemented;
    implemented but not declared; handler not a function.
  - Warnings: a `keyed` handler that never reads `ctx.idempotencyKey`; a
    context generator that fails, takes over 150 ms or returns over 600 chars;
    no `GUIDE.md`.

### New finding fixed in iteration 3

11. **Degraded mode ignored the daemon's idempotency records**, so a `none`
    operation the daemon had started ran a second time once the front end fell
    back to its own core. Each anchor process now consults the other's records
    on a key it has never seen: the degraded core reads the daemon's journal,
    and the recovered daemon reads journals written in degraded mode.

## Iteration 4 (2026-10-19): release channels

- **Releases** are immutable copies in `services/<id>/dist/<slug>/` with a
  `release.json` holding a hash of every operation's handler. They are staged
  in a temporary folder and renamed into place, so the router never sees a
  half-copied release. Channel pointers live in `state/channels/<id>.json`
  with a full history.
- **Release tool** (`node anchor/release.mjs release|promote|status <id>`):
  - Every release passes the release check first.
  - `release` makes a new nightly. Refused while the nightly is past its
    maximum age, unless `--fix`.
  - `release --hotfix` makes a new stable at once and clears any older nightly,
    which must then be rebuilt on top of the hotfix.
  - `promote --auto` moves nightly to stable only when the gates pass: calls
    served, failure rate, minimum age. Counts come from the call ledger,
    per release. Promotion re-runs the release check on the release itself.
  - Stable only moves forward: no command sets an older release, and the
    history is checked to be strictly increasing.
- **Routing per call** (`anchor/channels.mjs`):
  - No releases: the working folder serves (dev mode).
  - Only a nightly: it serves.
  - Reads (`natural`) go to nightly and fall back to stable on any
    infrastructure failure, invisibly to the caller except for a `fellBack`
    field.
  - Actions go to nightly only when nightly did not change them (same handler
    hash and declaration), and fall back only on failures before the operation
    ran. A changed action stays on stable until promotion.
  - An operation only in nightly goes to nightly; one removed in nightly stays
    on stable.
  - A quarantined nightly sends everything to stable.
  - Every result says which release `served` it.
- **Hotfix trigger:** stable failing with an infrastructure error and nothing
  left to fall back to records `hotfix_needed` (once per fingerprint) and
  tells the chats using the service.
- **Overdue nightly** is announced once to chats using the service, and
  freezes feature releases.

### New findings fixed in iteration 4

12. **The promotion gate saw no traffic.** The job wrapper stripped the
    per-attempt record before the call log was written, so `promote --auto`
    always found 0 calls. Attempts are now kept on the job for the log.
13. **Two simultaneous releases of one service collided** on the same version
    number; one crashed and left a staging folder, and the channel history was
    written twice. Release and promote now share a per-service lock
    (`anchor/lock.mjs`, the same stale-safe lock design as the daemon's), and a
    failed copy removes its staging folder.

## Iteration 5 (2026-10-19): tickets and the hotfix lane

- **Every failure signal files a ticket occurrence** (`anchor/tickets.mjs`):
  - crashes, backoff and quarantine (with the chats affected and the stderr
    tail);
  - drift; overdue nightlies;
  - `hotfix_needed` (lane `hotfix`);
  - agent reports through `anchor:ticket.report`.
- **Clustering:** an occurrence joins an active ticket of the same kind and
  service with the same or a similar fingerprint (token overlap of at least
  75%), so a crash whose message varies per call is one ticket, and similar
  agent reports merge.
- **Merging:** a new hotfix ticket absorbs active crash tickets for the same
  failure (they become `merged`). Merged tickets are hidden from listings.
- **Priority:** severity × log(occurrences) × chats affected × 2 for a
  regression, plus age. Listings are sorted by it.
- **Lifecycle:**
  - open → dispatched → fixed (in a release) → verified, the last by the next
    successful call on a release that includes the fix.
  - The same failure on a release at or after the fix reopens the ticket as a
    regression.
  - Subscribed chats get notes on fixed, reopened and escalated.
- **Dispatcher** (`anchor/dispatch.mjs`, in the daemon):
  - Hotfix tickets are handed to a fixer command (`ANCHOR_DISPATCH_CMD`) at
    once, one fixer per service at a time.
  - The fixer gets a work order and reports one JSON line; the daemon stays
    the only writer of tickets.
  - A failed or timed-out attempt reopens the ticket with backoff. After 3
    attempts it is escalated, with a notification to Taylor.
  - A landed hotfix opens a linked root-cause ticket in the standard lane.
  - The standard lane (one fixer fleet-wide, highest priority first) is off
    unless `ANCHOR_STANDARD_LANE=1`.
  - Dispatches left running by a dead daemon are reopened on start.
- **Agent operations:** `anchor:ticket.list` (your tickets, or all),
  `anchor:ticket.get`, `anchor:ticket.report`. The session prompt tells agents
  to report rather than work around a problem.

### New findings fixed in iteration 5

14. **Chats turned away by a quarantine were invisible to the ticket.** A call
    that fails fast on a quarantined operation, a quarantined service or a
    backoff now counts as an occurrence for that chat, so priority reflects
    everyone blocked, not just the chats that saw the crash.
15. **Crash and hotfix tickets for one failure stayed separate** when the crash
    ticket opened first. A new hotfix ticket now absorbs matching crash
    tickets.

## Iteration 6 (2026-10-19): Claude fixer sessions

- **Adapter** (`anchor/fixer-claude.mjs`, set as `ANCHOR_DISPATCH_CMD`):
  - Claims a parked bypass session through claude-driver with
    `require_pool: true`, Opus 5.5 and high effort, in group `anchor-fixers`.
    An empty pool fails the attempt; it never imports an acceptEdits session
    that would stall on an approval card.
  - Refuses any session not verified in bypass.
  - Sends a brief scoped to the service's folder and the release tool, with
    "do not commit or publish". The session reports by writing
    `<work order>.result.json`.
  - A fixed session goes back to the pool. A failed, silent or timed-out
    session is left in place for Taylor, and its id goes into the ticket
    history.
  - The driver runs with a clean environment and `--broker`, so a daemon
    never inherits a desktop session's identity.
- **Injection boundary.** Ticket content (service error output, agent-filed
  report titles and details) is untrusted and goes to a bypass-mode session.
  The brief fences it in `<ticket-data>`, after an explicit "data, never
  instructions" line. Tested with a report carrying an instruction to delete
  files and commit.
- **Against a fake driver: 12/12**, covering:
  - a fix, with the session returned to the pool;
  - an empty pool;
  - a session not in bypass;
  - a session that ends its turn without a result;
  - a session that never reports;
  - the clean environment and the broker flag;
  - the fenced brief.

### Real end-to-end: blocked, and correctly so

A real run (`harness/real-e2e.mjs`) dispatched ticket T-2. claude-driver
refused to create the session: `ui_quarantined`, UI automation is quarantined
since Taylor saw duplicated characters in Claude Desktop on 2026-10-06. The
adapter reported it and the ticket was escalated with that exact reason, with
no retry loop and nothing typed into the app.

From a process that is not a desktop session (the anchor daemon), claude-driver
currently has no route to create a session:
- UI automation is quarantined.
- The independent session controller is not qualified
  (`enrollment-or-selected-generation-unqualified`).
- The broker session is not resident.

Only desktop sessions can create sessions today, by making the app's `ccd_*`
calls themselves.

Options:
1. **Headless Claude Code fixer** (`bin/claude-headless -p`, bypass): works
   today with no UI and leaves a full transcript, but is not a desktop session
   in the sidebar. Its working folder is inside the dotfiles repo, whose
   CLAUDE.md says to commit and publish all changes; that would have to be
   overridden for fixers, for example with a fixer-only settings file or by
   running fixers outside the repo.
2. **Qualify claude-driver's independent controller, or revive its broker**
   without UI automation. That is claude-driver work, and lifting the UI
   quarantine is Taylor's call.
3. **A desktop dispatch session:** a long-lived desktop session that watches
   the work-order folder and creates fixer sessions with its own `ccd_*`
   tools. It works within today's rules but depends on that session staying
   alive.

## Iteration 7 (2026-10-19): headless Claude fixers

`anchor/fixer-headless.mjs` runs a work order as a headless Claude Code session
(`bin/claude-headless -p`).

**Least privilege by construction:**
- **Isolated copy.** The session works on a copy of the service in
  `~/.cache/anchor-lab/fixers/<ticket>-<attempt>-<time>/`, outside the
  dotfiles repo, so the repo's commit-and-publish instructions never load. It
  never sees the live working folder or the release tool.
- **Validate, then report.** It gets `./check` (the release check on its copy)
  and reports by writing `./result.json`.
- **The adapter applies, not the session:**
  - It copies back only changed top-level `.mjs`, `.js`, `.json` and `.md`
    files, and refuses deleted files, new folders and other file types.
  - It runs the release itself (`--hotfix` in the hotfix lane), gated by the
    release check.
  - A refused release restores the working folder byte for byte.
- **Locked-down run:** Opus 5.5 in bypass mode, user settings only with all
  hooks disabled, no MCP servers, a fixed tool list (Read, Edit, Write, Bash,
  Glob, Grep), a clean environment and a timeout.
- **Untrusted data:** ticket data is fenced as data, as in iteration 6.

**Against a fake runner (13/13):**
- a fix, applied and released;
- the run's location, flags and environment;
- "ready" with no change;
- a change the release check rejects, with the working folder restored;
- a hang killed at the timeout;
- no result file; an errored run;
- a folder-structure change refused;
- no other service touched.

**Real end-to-end** (`harness/real-e2e.mjs`):
- A released `mend` service crashed on stable. The crash ticket merged into a
  hotfix ticket, which was dispatched.
- A real headless Claude session (Opus 5.5) read its copy, emptied the crash
  list, ran `./check` and wrote its result: 4 turns, about 10 seconds, $0.17.
  Its three tool calls all stayed inside its workspace, and the repo had no
  changes.
- The adapter applied the change and released hotfix `2026-10-19.002`.
- The failing call then succeeded on that release, the ticket moved to
  `verified`, and a linked root-cause ticket opened in the standard lane.
- Transcript: the session id is in the ticket's history.

**Still open about fixers:**
- **Bypass Bash is still the user's full shell.** The workspace bounds what
  gets applied, not what the session could do. A sandboxed run (Claude Code's
  sandbox, or a separate macOS user) would bound that too.
- **Root-cause tickets have no lane yet.** The standard lane is off by
  default; when on, it uses the same backend with a nightly release instead of
  a hotfix.

## Iteration 8 (2026-10-19): sandboxed fixers

`anchor/sandbox.mjs` runs the whole Claude Code process tree of a fixer under
macOS `sandbox-exec`. Every tool and every child process shares one boundary.

- **Writes:** only the fixer's workspace, plus device files. The session's
  Claude config and temp folder are redirected into the workspace
  (`CLAUDE_CONFIG_DIR`, `TMPDIR`), so its transcript lives there too, and it
  never writes your real `~/.claude` or `~/.claude.json`.
- **Reads:** everything except secrets:
  - `~/.ssh`, `~/.aws`, `~/.gnupg`, Gmail tokens, `~/.zdr-harness`;
  - 1Password data, the keychain;
  - the real Claude and Codex configs;
  - dotfiles `.env`, the ZDR harness `.env`, the host config folder.
- **No acting through other processes:** AppleEvents and LaunchServices
  (`open`) are denied. launchd job submission was refused as well.
- **Token handling:** `bin/claude-headless` reads the API token outside the
  sandbox, then runs the sandboxed CLI with it through `CLAUDE_HEADLESS_CLI`.
- **On by default** in `fixer-headless.mjs` (`ANCHOR_FIXER_SANDBOX=0` turns
  it off). Ticket history says whether a fix ran sandboxed.

**Verified denied, from inside the sandbox:**
- writing to home, the repo, `/tmp`, the live service folder and a
  `.claude.json` neighbour, by shell, by a child Node process and by Python
  file APIs;
- reading `~/.ssh`, dotfiles `.env` and Gmail tokens, directly, through a
  symlink, a hard link, `cp` and `mv`;
- AppleEvents (`osascript` hangs rather than erroring; the fixer timeout
  covers it);
- `open` of an app (no app launched);
- `launchctl submit` of a job.

Claude Code runs normally inside the profile: Opus 5.5, bypass mode.

**Not done:** an adversarial attempt driven by a live Claude session. The
boundary is verified by scripted probes and by a sandboxed fake fixer that
attempts nine routes, all denied.

**Remaining exposure, by design:**
- **Network is open**, because the model API needs it. A session can send out
  what it can read, which is bounded by the read rules.
- **The session holds its API token** in its environment.
- **Reads are a deny list**, so a new secret location needs adding to
  `SECRET_READS`. An allow list for reads would be stricter, at the cost of
  tracking everything Node and Claude Code need.

## Grind phase 1 (2026-10-19): the kernel speaks both MCP versions

Published as dotfiles `8874af6`. `mcps/_shared/kernel/mcp-stdio.mjs` serves:
- legacy clients through the `initialize` handshake, unchanged;
- 2026-07-28 clients on the same process: `server/discover`, identity from
  each request's `_meta`, `resultType`, list cache hints, `-32022` for an
  unsupported version.

`ping` and resource-not-found `-32002` are kept for legacy requests only.

16. **Claude Code already speaks 2026-07-28.** Captured with a recording stub:
    Claude Code 2.1.292 sends `server/discover` first and falls back to
    `initialize` (2025-11-25) only when that is refused. So answering
    `server/discover` switched every kernel server to the modern protocol in
    Claude the moment this shipped. Codex 0.159.3 sends only `initialize`
    (2025-06-18). The captures are fixtures in `mcps/_shared/kernel/test/fixtures/`.

**Verified:**
- the protocol suite replays both captured Claude sessions and the Codex one,
  plus both eras on one process with their own identities, the unsupported
  version error, era-specific `ping` and resource errors, and modern progress
  and cancellation;
- zdr-agent, bulk-classify, codex-bridge, smart-record and claude-driver on
  both eras through `mcps/_shared/bin/run` (discover or initialize, then
  tools/list, then one read-only call);
- a real Claude Code session calling zdr-agent over the modern protocol;
- the anchor front end as a modern client: `scenarios-modern.mjs`.

**Out of scope:** ios-agent uses the official SDK, and framer has its own
relay; neither uses the kernel.

## Grind 6.1 (2026-10-19): alerts that are hard to miss

`anchor/alerts.mjs` groups alerts into episodes, recorded in a journal shared
by every anchor process:
- **One alert per episode.** The episode keys are `degraded`,
  `ticket:<id>` for escalations, `hotfix:<id>` for a hotfix ticket with no
  fixer configured, and any key passed to the CLI, for example
  `grind-blocked`.
- **Repeats:** an episode repeats every `ANCHOR_ALERT_REPEAT_MS` (default one
  hour) until it is clicked.
- **Click to acknowledge:** the click runs a fixed acknowledgement command for
  that episode only.
- **Resolve:** one "resolved" alert when the episode ends: the daemon is back,
  or the ticket is fixed or verified, including by hand through the new
  `anchor:ticket.resolve`.

Delivery uses the notify-macos helper with terminal-notifier. `--group` per
episode replaces the previous banner. Whether an alert stays on screen until
dismissed is Taylor's macOS setting for terminal-notifier (Alerts versus
Banners), which the framework does not change. Suites force
`ANCHOR_ALERT_BACKEND=log`, so tests never alert Taylor.

17. **The click's acknowledgement lost its state folder.** The command a click
    runs did not carry `ANCHOR_STATE_DIR`, so an alert raised from any state
    folder other than the default would have acknowledged nothing. The command
    now passes it explicitly.
18. **Alert senders are detached, never killed on a timer.** With a click
    action, terminal-notifier handles the click itself. The daemon no longer
    kills the sender after 15 seconds, which could have dropped the click.

**Live check:** one real alert ("Anchor alert test", episode
`3196ef1a5cd6`, state in `~/.cache/anchor-lab/live-alert/`) was sent on
2026-10-19. Taylor confirmed it stays on screen; the test episodes were then resolved.

## Grind 6.2: subscription-only fixers

Taylor's rule (2026-10-19): fixers run on his Claude subscription, never on
API billing, and need no cost limits while they do. Each headless fixer now
runs with `--output-format stream-json --verbose`, reads its start-up event
and is killed at once unless `apiKeySource` is `none` (the long-lived
subscription token). Its environment carries no API key. The cost Claude
reports is recorded on the ticket as notional. A stopped fixer reports a
fatal failure, so the dispatcher escalates it once instead of retrying.
Headless suite: 18/18 (an API-key fixer is stopped before it writes,
escalated after one attempt; the fix records subscription auth).

19. **Claude Code's Bash tool has its own temp folder.** The first real run
    under the guard (`apiKeySource: none`) wrote a correct fix but could not
    run `./check`: every Bash call failed with EPERM creating
    `/private/tmp/claude-503/…`, outside the sandbox's writable workspace.
    `TMPDIR` does not move it; `CLAUDE_CODE_TMPDIR` does. The sandbox now sets
    it to the workspace's `.tmp`. The release check refused the unchecked fix
    and the ticket escalated, which is the safe outcome. Rerun: the fixer
    fixed `mend` and released 2026-10-19.002 (subscription auth, notional
    $0.07), ticket T-2 fixed in about one minute.

## Grind phase 2: real services behind anchor

db-kickoff-stage and zdr-agent run behind anchor as gateway services
(`scenarios-gateway.mjs`, now in `run-all.sh`). zdr-agent is imported with
`--sensitive` (Taylor, 2026-10-19). Its parity set is `zdr_whats_new`,
`zdr_guide` and `zdr_status` only. `zdr_ask`, `zdr_read`, `zdr_sessions` and
`zdr_exports` can carry client data or list exports, so tests never call them.
The plan's `zdr_exports list` call was dropped for that reason. A distinctive
line of each zdr-agent answer appears in no file under anchor's state. Added
latency is about 1 ms, and cold start is about 280 ms for each service.

20. **Live answers race the parity check.** `zdr_status` reports live
    connection state. One run saw it change between the direct call and the
    anchor call. That was not an anchor fault: two later runs passed 10/10.
    The suite now asks directly again on a mismatch and accepts a match with
    either answer. Its failure detail names the first line that differs.
    `harness/diff-op.mjs` diffs any one operation, direct versus anchor.
22. **Measure anchor's cost on a local operation.** In the full run,
    db-kickoff-stage failed "added latency under 50 ms" because staging
    round trips swing by hundreds of milliseconds (direct median 589 ms in
    one run). The suite now times each service's guide, which is answered
    locally. Added cost is about 1 ms; the run is 17/17.
21. **Alert sounds are off by default.** Taylor asked on 2026-10-19 for
    sounds to stay muted until his wireless setup is done.
    `ANCHOR_ALERT_SOUND=on` turns them back on.

## Grind phase 3: live pilot

Pilot project: `~/.cache/anchor-lab/pilot/` (`harness/pilot/setup.mjs`).
- **Services:** echo and slow from the lab; `ledger`, a pilot service with
  two seeded bugs and two deprecation notices; db-kickoff-stage; and
  zdr-agent, trimmed to `zdr_whats_new`, `zdr_guide` and `zdr_status`.
- **Tasks:** 20 in `harness/pilot/tasks.json`.
- **Runner:** `harness/pilot/run.mjs` runs Claude through `claude-headless`
  (subscription token, `--tools ""`, only the pilot servers) and Codex
  through `codex exec` (`--ignore-user-config`, read-only sandbox,
  gpt-6-sol high).
- **Baseline:** `harness/pilot/direct-server.mjs` registers the same
  services directly. zdr-agent goes through a filtering proxy that refuses
  `zdr_ask`.
- **Scorer:** `harness/pilot/score.mjs`.

23. **A crash blamed every operation in flight.** In the first pilot task, a
    batch of `ledger:balance` (crashes) and `ledger:net` (fine) failed both.
    The agent then filed a ticket saying both crash. Now, when a crash is
    shared, no operation gets a strike and the crash does not count toward
    the same-failure backoff. Each suspect runs alone until it has an outcome
    of its own. Reads, and keyed calls that carry a key, are rerun once,
    alone. Supervision 27/27: the innocent read answers, and only the
    crasher is quarantined.
24. **Operations can carry a notice.** A manifest's `notice` (a deprecation,
    a changed meaning) reaches each chat once, as a note on its first call to
    that operation, and is shown by `describe`. The direct baseline puts the
    same text in the tool's description.
25. **The ticket shape belongs in the session prompt.** The first real
    `ticket.report` guessed its field names (`operation`, `summary`,
    `details`) and was refused. The preamble now gives
    `{service, title, detail?, op?}`. The three tools are unchanged.
26. **Codex needs per-server tool approval in exec.** With a read-only
    sandbox and `approval_policy="never"`, every MCP call was refused as
    needing approval. Passing
    `mcp_servers.<id>.default_tools_approval_mode="approve"` lets them run.
    Bare TOML keys are required: a quoted key becomes part of the server's
    name.
27. **Suites stopped every lab daemon, the pilot's included.** Each suite
    ran `pkill -f anchor/daemon.mjs`. The daemon's command line now carries
    `--state <folder>`, and suites stop only their own.

**Pilot round 1** (r1, 20 tasks per configuration; success, valid
arguments, median calls, notes acted on, bugs ticketed):

- Claude through anchor: 95%, 100%, 2 calls, 100%, 100%.
- Claude direct: 100%, 100%, 1 call, 100%.
- Codex through anchor: 90%, 100%, 2 calls, 0%, 100%.
- Codex direct: 85%, 100%, 1 call, 0%.

Missed targets: calls per task (agents describe before they run), Codex
acting on notes, and Claude's success against its baseline. No lab
processes were left running.

28. **The standard `status` said "stopped" for a service not yet started.**
    Claude t15 called `zdr-agent:status` (anchor's view of the process) and
    told the user zdr-agent was down. It now reports `idle`: it is not
    running and starts on its next call. The answer says this is not a
    health check and points to the service's own status operation.
29. **Operation signatures go in the session prompt.** Every service line
    now lists `name(arg:type, optional?:type)`, up to 12 operations and 400
    characters. The preamble says to call `anchor_run` directly when that is
    enough. The aim is to drop the describe step that doubled calls per
    task. The three tools are unchanged.
30. **Two pilot tasks tested obedience, not notes.** t10 and t17 named the
    deprecated operation themselves ("Use ledger:total"). Codex, in both
    modes, kept to the user's words and only mentioned the warning. The
    tasks now state the need, not the operation. Scorer fix: "Four tables"
    counts as 4.

44. **Rewording t10 and t17 changed what Codex was measured on.** Rerun
    with their original wording ("Use ledger:total…", "Use ledger:export…")
    against the final interface, twice per setup (runs o1 and o2):
    - Claude acted on the deprecation note 4 of 4 times, through anchor and
      direct alike.
    - Codex acted on it 1 of 4 times, through anchor and direct alike. It
      keeps to the user's named operation and only mentions the warning.

    So anchor does no worse than direct registration. But under the
    original wording Codex misses the 80% notes target in both modes, and
    the final pilot meets it only with the tasks phrased as a need. r7 and
    r8 also each meet every target on their own, not only pooled.
45. **Fresh live checks.** zdr-agent, bulk-classify, claude-driver and
    smart-record pass on both protocol eras. The kernel's last change is
    `8874af6`; it is published (`HEAD` equals `origin/master`) and nothing
    under `mcps/` is uncommitted. Anchor's prompt and status changes live
    only in the lab's `core.mjs`. db-kickoff-stage runs its own server and
    answers the legacy handshake only, which is Claude Code's fallback. Two
    more full passes of every suite: `SUITES_FAILED=0` both times, nothing
    left behind.

46. **Notices now ride on the call's own result.** Taylor asked for the
    Codex gap in finding 44 to be fixed first. A notice was delivered only
    as a trailing "[anchor notes]" block. It now also travels as `notice` on
    the result of the call it concerns, right beside the value. When it
    names a replacement, it says to call that and answer with its result.
    - Original wording (runs o3 to o6): Codex acted on the note 8 of 8
      times (was 1 of 4), Claude 4 of 4.
    - Full pilot through anchor (r9 and r10, against the r5 and r6
      baselines): every target met in both harnesses, in each run.
    - Suites: supervision 28/28; all suites `SUITES_FAILED=0`, nothing left
      behind.

47. **Each kernel commit was verified live on its own code.** Both kernel
    commits were checked out into temporary worktrees in
    `~/.cache/anchor-lab/` (since removed):
    - at 13f13d9, claude-driver, smart-record and codex-bridge pass the
      legacy era; the modern era starts at 8874af6;
    - 8874af6's kernel equals the current one, which passes on four
      servers.

    zdr-agent and bulk-classify, given a symlink (not a copy) to the main
    checkout's `apps/zdr-agent/.env`, also pass at 13f13d9 (legacy era). Final suite run:
    `SUITES_FAILED=0`, nothing left running, no artifact watches.

48. **The move found a real fixer bug.** A Claude fixer's brief said to
    run `node src/release.mjs …` without naming anchor's state or services
    folder. In the lab the defaults happened to be the lab's own, so it
    worked. Once the default state became `~/.local/state/mcps/anchor`, a
    fixer would have released into the wrong place. The brief now passes
    `ANCHOR_STATE_DIR` and `ANCHOR_SERVICES_DIR` explicitly, and the test
    fixer takes its folder and release command from the brief, as a real
    one does. The headless fixer already passed the work order's folders.
    The move:
    - layout per `mcps/README.md` and `MIGRATING.md`: an `mcp.json` with
      launcher `src/launch` and empty `harnesses` (registered nowhere),
      `README.md`, `CHANGELOG.md` (2026-10-19.001), and an empty
      `services/` for real use;
    - tests run on their own state (`test/env.mjs`, `run-all.sh`), never on
      the real state;
    - all 15 suites pass in place;
    - the launcher answers through `mcps/_shared/bin/run anchor`.

49. **Security review: three fixes.** An automated review of the published
    code raised three findings.
    - **Ticket service names.** `ticket.report` accepted any `service`
      string, which later becomes a folder path for fixers. It now accepts
      only a known service id, and both fixers refuse a ticket whose
      service is not a plain id (tickets suite 21/21).
    - **Fixer sandbox.** Outbound Unix sockets are now denied: anchor's own
      daemon, the 1Password broker and other agents' sockets. The only
      exception is mDNSResponder, which macOS needs to resolve names.
      Pasteboard lookups are denied too.
    - **Fixer code checked outside the sandbox.** The release check loaded
      a fixer's code unsandboxed. Under `ANCHOR_CHECK_SANDBOX=1` (set by
      both fixers) its probes now run with no network, no writes outside
      temp and the home-folder read allow list.

    Headless 22/22: socket and pasteboard probes denied, and a fix that
    writes a file the moment it loads passes the check without the file
    appearing. The first real fixer under the new profile failed: denying
    every Unix socket also blocked DNS, which the fake fixer could not
    reveal. With mDNSResponder allowed, a real fixer fixed `mend` on the
    subscription.

51. **Security review, second pass: the check sandbox.** The new check
    profile let checked code inherit the daemon's environment, write to
    shared temp folders and start other programs. Starting `launchctl`
    could submit a job that runs outside the sandbox.
    - **Check profile:** it may now run only node itself. It gets
      `HOME`, `PATH` and a private temp folder (deleted afterwards) as its
      whole environment, and the LaunchServices and quarantine denials
      match the fixer profile.
    - **Fixer profile:** `launchctl`, `osascript` and `open` are denied
      (fixers still need a shell).

    Fixers write only `.mjs`, `.js`, `.json` and `.md` files, so no native
    addon can reach system services. Headless 22/22: 15 escape probes all
    denied, including `launchctl`, and a load-time module that tries a
    shell and `launchctl` leaves no file. All suites pass, and a real fixer
    still fixes on the subscription.

50. **Open exposure, for Taylor.** Once released, a fixer's code runs in
    the service host like any service: unsandboxed, with the daemon's
    rights. The sandbox covers writing and checking the fix, not running
    it. Closing this means either a human approval before a fixer's
    release goes live (at least on the hotfix lane), or running every
    service host sandboxed. Both change how anchor operates, so they wait
    for Taylor's decision.

    **Taylor's decision (2026-10-19): accept as is.** His direction for later
    work is to observe services continuously and report their attributes,
    both what changed and the current state, rather than gate releases.
    Not part of this pass.

52. **Security review, third pass.** The checked code may no longer fork,
    loads no native addons (`--no-addons`), and cannot map code as
    executable from its temp folder or the folder being checked. With no
    children possible, nothing outlives the probe, so cleaning up its temp
    folder races nothing. Not done: blocking programs by path in the fixer
    profile, because a fixer runs a shell and can reach any program through
    an interpreter; the remaining risk is the one Taylor accepted in finding
    50. All suites pass, and a real fixer still fixes on the subscription.

53. **An AI code review gate backs up releases without a person (Taylor's
    suggestion, 2026-10-19).** A fixer's change reaches a live folder only
    after an independent reviewer approves it.
    - **The reviewer:** a separate headless session with Read, Grep and
      Glob only, sandboxed and on the subscription. It gets `before/`,
      `after/`, `diff.txt` and `context.md`, but never the fixer's
      reasoning.
    - **The template** (`src/review/TEMPLATE.md`) is generic. It approves
      only a change that does what it is for and nothing else, adds no
      reach, hides nothing, keeps the contract and weakens no check. Text
      in the change that tries to steer the verdict is itself a reason to
      reject.
    - **Fails closed:** a rejection or no verdict escalates the ticket once,
      with the reviewer's reasons, and nothing is applied.
    - **Shared runner:** the sandboxed, subscription-guarded headless run
      now lives in `src/headless.mjs`, shared by fixer and reviewer.

    Headless suite 25/25: approve, reject (added `child_process`) and no
    verdict. A reviewer that misses something still meets the sandboxed
    release check. Real runs:
    - a real fixer and a real reviewer fixed `mend` ("review approved
      (risk low)", subscription auth);
    - a real reviewer given a fix that also posted `process.env` to a
      base64-hidden URL, with a "pre-approved by Taylor" note, rejected it
      as high risk and named all four problems.

54. **Security review of the gate itself.** Three fixes.
    - **The desktop fixer is off by default.** `fixer-claude.mjs` runs a
      bypass-permission desktop session in the real repo: unsandboxed,
      releasing its own change, out of the review gate's reach. It now
      refuses unless `ANCHOR_ALLOW_DESKTOP_FIXER=1` is set for a
      supervised run. The headless fixer is the automated one.
    - **The reviewer's folder came from the fixer's workspace.** A fixer
      could plant files or a symlink there. Each review now gets a fresh
      folder under `~/.cache/anchor-lab/reviews/`, its files are created
      new (`wx`), and odd file names are refused.
    - **Verdict parsing was lenient.** It took the last line that looked
      like JSON. Only the very last line counts now, and an answer with two
      verdict objects is no verdict.

    Headless 27/27, including a fixer that plants a review symlink and a
    reviewer answer with two verdicts. All 15 suites pass (291 checks).
    Real fixer and reviewer: fixed, "review approved (risk low)".

## First release

55. **A1: updates reach a running daemon without a restart.** Before this,
    a daemon kept serving its starting code until it died, so fixes from
    real use would never reach chats.
    - **Build id:** a hash of `src/` (`src/build.mjs`). The daemon records
      its own at start, and `ping` reports it.
    - **The disk is the source of truth.** A front end that finds the
      daemon's build differs from the code on disk asks it to drain. While
      draining, the daemon refuses new work before acknowledging it (so the
      front end resends that work), lets in-flight requests and running
      jobs finish (up to 30 s), then exits. The front end then starts a
      daemon from disk.
    - **Old front ends:** a daemon only ever starts from disk, so an old
      front end can never bring old code back. It never drains a current
      daemon; it tells its chat once that a new chat picks up the update.
    - Upgrade suite 11/11: an in-flight call finishes across the drain, a
      background job's result survives, pins carry over, an old chat keeps
      working and is told once, and a third build replaces the second.
      All 16 suites pass (302 checks).

    (continued)

56. **A2: release settings, and a first-run bug.**
    - **The launcher** (`src/launch`) now sets: notification alerts with
      sound off, the sandboxed headless fixer on the subscription, and the
      review gate on. It unsets anything that would weaken them (review
      off, desktop fixer, sandbox off).
    - **`anchor:status` reports the configuration** (`config`: build,
      folders, alerts, fixers, review, desktop fixer). Read back through
      `mcps/_shared/bin/run anchor`: notify, silent, headless, review on.
    - **The bug:** the front end opened the daemon's log in the state folder
      before creating the folder. The first real start would have failed,
      because `~/.local/state/mcps/anchor` did not exist yet; the suites
      never saw it because they create their state folder first. Fixed,
      with a first-run check in the basic suite (27/27). This landed before
      the front-end freeze takes effect at the restart.

57. **A3: registered in Claude Code beside the fleet** (2026-10-19). The
    command was `claude mcp add -s user anchor --
    <repo>/mcps/_shared/bin/run anchor`, the same form as every fleet
    entry, and `mcp.json` `harnesses` now has `claude`. Every other entry
    in `~/.claude.json` was compared before and after: unchanged, nothing
    removed. Rollback is `claude mcp remove -s user anchor`.

58. **A4: restart done; anchor is live in this session** (2026-10-19). After
    Taylor's restart the session had anchor's three tools and its
    instructions. The live daemon runs from `~/.local/state/mcps/anchor` on
    the build on disk, with the release settings, and 13 chats connected at
    once.
59. **B2: gateway services get tickets and alerts, never fixers.** A
    gateway service's code is the fleet server in `mcps/<id>`; a fixer's
    copy of the anchor service folder holds only its manifest. The
    dispatcher now escalates such a ticket at once, saying why no fixer was
    sent, and Taylor gets an alert. Headless 28/28, with a fake gateway
    server that releases fine and crashes on use: hotfix ticket escalated,
    never dispatched, alert raised.

60. **Open chats never triggered the build check.** Only a new connection
    made a front end compare builds. Chats hold one connection for their
    whole life, so after B2 was published the live daemon kept old code
    while 13 chats were open. The daemon now checks the build on disk every
    30 s and drains itself when it changes; open chats reconnect to a fresh
    daemon on their next call. Upgrade suite 12/12, with no new chat
    involved.

61. **B1: the first real services.** db-kickoff-stage, bulk-classify and
    notion-kickoff are imported as gateways, released and promoted to
    stable in the live anchor (2026-10-19.001 each).
    - **bulk-classify is `sensitive`:** its inputs and results are texts
      that may include client data, which must not land on anchor's disk.
      Checked: none of its results are in the state folder.
    - **notion-kickoff is read only:** 13 operations. Search and query are
      included as reads although the server marks them destructive (they
      are POST requests). `API-get-users` is left out, as Taylor's Codex
      config already does.
    - **Two mechanisms were needed:**
      - operation names are snake_case, so an import maps a tool like
        `API-get-self` to `api_get_self`, with `tool` naming the real tool;
      - a gateway now serves exactly its manifest's operations, so a
        subset passes the release check and any other tool is refused.
    - **Discovery keywords** are in each manifest. A release evaluation set
      (15 requests) scores 100% recall and 88.9% precision, and the
      discovery suite now runs it.
    - **The prompt still fits:** 1622 characters for Claude Code, 6374 for
      Codex.
    - **Live from this session:** a staging count (62), Notion's identity,
      and bulk-classify's saved profiles, each served from stable.
    - Gateway suite 21/21; all 16 suites pass. `run-all`'s leftover check
      now counts only test processes, since the live anchor's services may
      run.

    From here the front end is frozen (playbook rule): later changes go to
    the daemon side, which the drain delivers.

**Final pilot** (r7 and r8 through anchor, pooled; baselines r5 and r6
direct): every phase 3 target met in both harnesses.

| | Claude, anchor | Claude, direct | Codex, anchor | Codex, direct |
|---|---|---|---|---|
| Success | 100% | 100% | 100% | 95% |
| First-try valid arguments | 100% | 100% | 100% | 100% |
| Median calls | 1 | 1 | 1 | 1 |
| Mean calls per task | 1.45 | 1.48 | 1.9 | 1.68 |
| Notes acted on | 100% | 100% | 100% | 100% |
| Bugs ticketed | 100% | n/a | 100% | n/a |

Round 1 averaged 2.6 (Claude) and 2.75 (Codex) calls per task through
anchor, so phase 5's "fewer calls than phase 3" holds. All 15 suites pass
(281 checks), with nothing left running.

**Pilot repeats r5 and r6** (all four configurations, twice, pooled):
- Claude through anchor: median 1 call, notes and tickets 100%. Its only
  miss (t10, both runs) was a scorer error.
- Codex through anchor: success 100% against 95% direct, but a median of 2
  calls against 1: 87 calls in total against 67.

40. **Codex paid a describe call that direct registration gets free.** A
    direct server lists every tool's schema up front. Under the 2000-character
    budget made for Claude, db-kickoff-stage's signatures were dropped, so
    Codex described the service before querying it (t03, t16), and ledger's
    one-line signatures did not carry descriptions (t09, t12, t20). The
    prompt budget is now per client. Claude Code gets 2000 characters.
    Clients without the cap get up to 12000, with one line per operation:
    its signature, any notice and its description (Codex: 3976 characters
    over the pilot services). The discovery suite checks both: 16/16.
41. **Scorer: the "avoid" rule punished a correct explanation.** t10 failed
    whenever an answer quoted the overstated `ledger:total` figure while
    explaining why it gave `ledger:net` instead. The rule is gone; acting on
    the note is already checked by the call to `ledger:net`.

**Pilot round 4** (r4, anchor modes only, against the r3 baselines):
- Claude met every target: success 100%, median 1 call, 32 calls in total
  against 29 direct.
- Codex had a median of 2 calls and missed one ticket. One task (t19,
  "what version is running?") took 8 calls: status said the service was
  "not running", so Codex called `ledger:convert {cents: 0}` to start it.

39. **"Idle" read as "not running".** An idle service's status now says
    which version its next call starts. Every service line in the prompt
    carries its version. The ticket line now names wrong answers as well as
    crashes and says "then work around it".

**Pilot round 2** (r2): success 100% (Claude), 100% (Codex through anchor)
against 100% and 90% direct. Every target met except median calls (2
against 1). Describes before a run fell to 0.4 (Claude) and 0.1 (Codex).

33. **`job.wait {handle}` answered an empty list.** Claude polled a long
    job four times because the singular `handle` was ignored without an
    error. Job operations now accept `handle`, refuse a missing one, and a
    job's hint carries the exact wait call. The prompt mentions
    `deadline_ms` (already part of `anchor_run`; up to 110 s) for waiting
    inline.
34. **The standard `status` runs the service's own health check.** When a
    service has an argument-free read named `*_status` or `*_health`, the
    standard `status` includes its answer (`ownStatus`), so one call answers
    "is it healthy?".
35. **Claude Code truncates server instructions at 2048 characters.** This
    is `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`, default 2048, in 2.1.292.
    In round 3 the anchor prompt had grown to 2906 characters, with the
    service list starting at 1611. Claude lost most of the list and called
    `anchor_discover` in 16 of 20 tasks (2 in round 2), for a median of 3
    calls. Codex has no such cap and fell to a median of 1. The preamble is
    now terse, and the composed prompt is kept under 2000 characters: the
    longest signature lines go first, then service lines shrink to one
    sentence. A deprecation shows in its signature as `[deprecated, use
    ledger:net]`. The discovery suite checks the cap.

## Grind phase 4: release pins and fallback reporting

A chat is pinned, per service, to the stable and nightly it first used. The
pin is kept in the sessions journal and survives compaction and daemon
restarts. Pins move only forward:
- past a hotfix;
- when the pinned nightly is promoted (the chat moves to the current
  stable);
- when the pinned nightly is cleared;
- when a pinned release no longer exists.

The chat gets a note when its pin moves. A call's `version` overrides the
pin. `anchor:pin {action: show | refresh | release, service?}` manages pins;
`release` makes the chat follow the channels.

Fallbacks are counted per nightly and operation over a sliding window.
Past the threshold (3 in an hour, or 10% of at least 10 calls) one
standard-lane ticket opens. `anchor:status` lists them under `fallingBack`.
Pins suite: 20/20.

31. **A quarantined nightly hid its own fallbacks.** Once the broken nightly
    was quarantined, calls skipped it and were not counted, so no ticket
    opened. A skipped nightly now counts as a fallback.
32. **Similarity clustering would merge fallback tickets.** Ticket
    fingerprints drop digits and short words, so "nightly A falls back on
    get" and "nightly B falls back on get" looked identical. Fallback
    tickets now match on the exact fingerprint only.

## Grind phase 5: need-based discovery

`anchor/discovery.mjs` is a deterministic first pass. Each service's id,
operation names, description, `keywords` (a new manifest field), operation
descriptions and guide are scored with field weights and IDF. It settles a
request alone when the top match is clear, and still includes other
services whose operations the request names. Otherwise it returns a
generous ranked list. Every answer lists the remaining services by name
(`alsoAvailable`).

- **Relevance hooks:** a service's `relevance(ctx, need)` in `context.mjs`
  can narrow its operations, add a hint or drop itself. Each hook runs in
  the context worker with its own deadline.
- **Misses:** using a service discovery did not suggest is logged to
  `discovery-misses.jsonl`.
- **Privacy:** requests are logged only as `needHash`.

Evaluation set: `harness/discovery/eval.jsonl`, 85 items:
- 20 pilot tasks;
- 30 variants;
- 20 handwritten edge cases;
- 15 held-out items written after tuning.

Result: recall 96.5%, precision 80.9%, median 0.16 ms, held-out recall
100%, no plaintext request in any log. Discovery suite: 15/15. The model
router (step 3) and synthesis (step 5) wait for Taylor's decision on the
model and the ZDR key.

36. **One hanging relevance hook dropped every hook's answer.** The worker
    answered a batch only when every hook had finished, so a hung hook
    timed out the whole batch. Each hook now has its own deadline inside
    the worker. The hung promise still lives in the worker until the worker
    is replaced.

## Grind 6.3: dashboard

`node anchor/export-dashboard.mjs` writes sanitized aggregates:
- `state/dashboard.json`;
- one row file per dataset in `state/dashboard/`: operations, services,
  releases, tickets and fixer runs.

They hold counts, codes, timings and ticket fields, never call arguments or
results. Live figures come from the running anchor through its own front
end, so they match `anchor:status` and `anchor:ticket.list`. The dashboard
suite builds real state and checks the export against both, read
separately: 8/8. Covered: traffic, a crash, a nightly that falls back, a
reported bug, one fixed and one escalated fixer hotfix.

The page is a private Dashboard artifact:
https://claude.ai/artifact/3uQwGqfvwTRWbefjZCzVSr. To refresh it, run the
export, upload the five row files and point the datasets at them.

38. **Fallback rows matched every release of a service.** The services
    export attributed a nightly's fallbacks to every `dash@…` process. It now
    matches the exact nightly slug.

**Rendering check.** The built-in browser is not signed in to claude.ai,
and signing in is Taylor's. So the page code was rendered in headless
Chrome, over the same five data files, with a small stand-in for the
dashboard's runtime (`dash.data`, `dash.calc`, `dash.onData`):
`~/.cache/anchor-lab/dashboard-render/`.

Every figure matches the export: 34 calls, 8.8% failed, 5 active tickets, 1
nightly falling back, 2 fixer runs. The page also draws 7 operation bars,
and tables for 5 services, 3 releases, 6 tickets and 2 fixer runs.

42. **The first render showed layout faults, now fixed.** The two
    half-width cards left a grid column empty, release versions wrapped,
    and wide tables stretched their cards at phone width. Fixes: wider grid
    tracks, unwrapped table cells (ticket titles still wrap), and
    `minmax(0, 1fr)` card columns. At 368px of content nothing overflows
    except inside the tables' own scroll boxes. Headless Chrome's windows
    are at least 500px wide, which made the first phone screenshot look
    cropped.
43. **The published files had to be re-uploaded to match.** The last full
    suite run rebuilt the lab state after the first upload, so three of the
    five published files were an older snapshot. The live dashboard now
    points at the snapshot that was rendered and checked, and the replaced
    uploads are deleted.

## Grind 6.4: sandbox read allow list

Reads under `/Users` are now an allow list:
- the workspace;
- the Claude CLI install;
- the lab's `anchor/` code and the shared kernel (for `./check`);
- the folder of the command being run;
- metadata of their parent folders.

System paths stay readable, and the old deny list stays as defence in
depth. Results:
- **Escape probes:** 12/12 denied, including a fresh secret in
  `~/anchor-secret-test/` (created and removed by the suite and never named
  in the profile), `~/Documents` and other lab files. Headless suite 19/19.
- **Real fixer:** a real fixer under the allow list fixed `mend` and
  released it in about one minute (subscription auth).
- **Denials it hit:** `~/.claude`, `~/Library`, shell startup files, and
  zsh here-document temp files.

37. **zsh here-documents write to `/tmp`.** The fixer's shell could not
    create `/private/tmp/zsh*` for heredocs. The sandbox now sets
    `TMPPREFIX` inside the workspace. It also allows reading
    `~/.CFUserTextEncoding` (text-encoding preference), which every process
    reads.

Phase 5 checkpoint: Taylor decided on 2026-10-19 to stay keyword-only. The
model router and synthesis wait until the misses log shows a need.

## Open edges (next iterations)

- **Ticket clustering is lexical.** Similar-meaning reports with different
  wording stay separate; bulk-classify could cluster by meaning.
- **Remaining grind phases:** 3 to 5, and 6.3 to 6.4, per
  `~/src/docs/plans/anchor-fleet-framework/plan.md`.
