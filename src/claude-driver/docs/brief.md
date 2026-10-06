# claude-driver — build brief

From: the session "Claude desktop app session creation tests" (local_84871321-f588-4da1-9858-229a6cd7a1d4), which did the research and smoke tests on 2026-09-29 against Claude desktop 2.9939.4 and bundled CLI 2.1.284. Taylor asked me to hand the build to you. Your first step: save this brief verbatim as `src/claude-driver/docs/brief.md` and commit it, since the copy in my session is temporary.

## 1. Goal

Build a persistent, robust capability in this dotfiles repo that lets any harness (Claude Code desktop, Claude Code CLI, Codex, Cursor, OpenCode) drive the Claude desktop app. It must be ready whenever Taylor's Mac is logged in and active.

Required capabilities:
- create sessions in a chosen folder, or with no folder, with an exact title and model
- rename; pin/unpin; archive/unarchive; delete (rare; for accidental or empty sessions)
- fork
- set model, effort and permission mode
- send a message into a session
- focus control, and window management where possible
- archive a "project" (a folder's sessions), with strong safety gates
- groups: nice to have, low priority

Taylor's stance on computer use: codex-bridge Computer Use is a legitimate fallback tier. Prefer non-UI mechanisms first, but do not gate computer use behind user approval.

## 2. Decisions already made (change them only with evidence)

- **Name.** Core is `claude-driver` at `src/claude-driver/`, the sibling of `src/codex-bridge/`, and it copies codex-bridge's conventions: Node ≥ 20 ESM, zero npm dependencies, `bin/claude-driver` (CLI) and `bin/claude-driver-mcp` (stdio MCP launcher that sources `src/lib/resolve-binary.sh`), a hand-rolled MCP stdio server (reuse or share codex-bridge's `lib/mcp-stdio.mjs`/`jsonrpc.mjs` rather than forking them silently), and state in `~/.local/state/claude-driver/` (override: `CLAUDE_DRIVER_STATE_DIR`).
- **Interface.** The MCP server is the primary interface. The CLI mirrors every MCP tool one to one, for scripts and debugging. Register the server in all four harnesses:
  - Claude Code: `claude mcp add claude-driver -s user -- /Users/taylor/dotfiles/src/claude-driver/bin/claude-driver-mcp`
  - Codex: `~/.codex/config.toml` `[mcp_servers.claude-driver]`
  - Cursor: `~/.cursor/mcp.json`
  - OpenCode: `~/.config/opencode/opencode.json`, `mcp` key
  - Put registration in an idempotent `install` subcommand, or an `install_claude_driver.sh` in the style of `install_op_agent.sh`, and add it to the `src/mcps/README.md` server table.
- **Harness-agnostic guidance.** Every harness gets usage guidance through the MCP server itself: the `instructions` field of the initialize result, a `driver_guide` tool, and resources. It must not depend on a Claude-only skill.
- **Skill.** One global Claude skill, `taylor-claude-drive` (Taylor's `taylor-<entity>-<action>` convention). It is a real directory in `~/.claude/skills/` like the others; skills are not in dotfiles. It follows the taylor-computer-use shape: `## 0. Hard rules`, then decide → check → act → verify → capture memory. It has `MEMORY.md` plus `memories/`, and it points at the core README instead of repeating it. No workspace extensions or bifurcation.
- **Plugin: considered and rejected as the primary vehicle.** A plugin would bundle the skill, MCP and hooks with versioning, but only for Claude Code. Taylor also uses Codex, Cursor and OpenCode, and his dotfiles-registered MCP pattern already gives one consistent interface everywhere. It adds no capability the MCP plus skill lack. Revisit only if the capability is shared with other people; a thin wrapper around the same MCP would then suffice.

## 3. Verified mechanisms

Everything in this section was proven on 2026-09-29.

### 3a. Tier A: deterministic, no LLM, works from any process

**Create a session with an exact title in any folder.** Run one headless bootstrap turn with the app's bundled CLI, then import it with a deep link.

```
B=newest numeric dir of ~/Library/Application Support/Claude/claude-code/<ver>/claude.app/Contents/MacOS/claude
cd <folder> && env -i HOME=$HOME USER=$USER PATH=/usr/bin:/bin TERM=dumb \
  "$B" -p "<bootstrap prompt>" --session-id <uuid> -n "<title>" --model <id> --strict-mcp-config
open "claude://resume?session=<uuid>"
```

- The app imports it as `local_<uuid>`, with cwd from the transcript, the title from `-n`, and the model from the bootstrap.
- Import takes about 1 s, and the whole create about 4 s with Opus 5.5.
- It worked for dotfiles, kickoff, a folder the app had never seen, and "no folder".
- Opening the link again is a no-op ("already imported").
- A valid uuid with no transcript logs `Failed to import CLI session … category: 'transcript_missing'` to `~/Library/Logs/Claude/main.log`.

Gotchas that each cost a failed run:
- **Use `env -i` plus the .env token.** A desktop-spawned process inherits a stale `CLAUDE_CODE_OAUTH_TOKEN`, and the CLI then fails with a 401. `cleanEnv()` starts clean and passes the long-lived `setup-token` token from dotfiles .env (`KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN`; 1Password: Kickoff vault, "Anthropic: Kickoff", expires about 2027-10-05). It never uses the macOS Keychain login, and it fails closed without the token (2026-10-06).
- **Use the bundled CLI, not Homebrew's.** Homebrew's `claude` is 2.1.170, and that version rejects `claude-opus-5-5` ("2.1.280 or newer is required").
- **Pick the account from the newest record.** Three account/org stores exist under `claude-code-sessions/`. The active account is the one with the newest `local_*.json`. When verifying, look in every store.
- **"No folder"** means a cwd matching `scratch-workspaces/<acct>/<org>/scratch-YYYY-MM-DD-<6 hex>` under `~/Library/Application Support/Claude/`. That is the app's own regex. Create the directory first.

**Fork.** Run `"$B" -p "<prompt>" --resume <source cliSessionId> --fork-session --session-id <new uuid> -n "<title>"` in the source's cwd, then import with the same deep link. The full history carried over. For a native desktop session, read `cliSessionId` from its record: native sessions have `local_<X>` ≠ cli id, while imported ones share the uuid. The UI's own convention for forks is the title `<title> (fork)`.

**Unarchive.** `open "claude://resume?session=<cliSessionId>"` on an archived, imported session restored it (`isArchived: false`). For native sessions, I'll report the outcome of a self-archive test separately.

**Open or focus a session.** `open "claude://claude.ai/epitaxy/<local_id>"`. Other routes in the app's URL handler:
- `claude://code/continue?session=<id|last>`
- `claude://code/needs-input`
- `claude://code/new?folder=<abs>&q=<prompt>`, which only fills in the composer and creates nothing until Enter is pressed

**Read state from disk.** This is the ground truth for every verification; never parse the UI.
- **Session records:** `~/Library/Application Support/Claude/claude-code-sessions/<acct>/<org>/local_<id>.json`. Fields: `title`, `titleSource` (`auto` / `user` / `tool`), `cwd`, `originCwd`, `isArchived`, `model`, `permissionMode`, `cliSessionId`, `worktreePath`. A deleted session's file is gone.
- **Pins:** `claude_desktop_config.json`, at `.preferences.epitaxyPrefs["starred-local-code-sessions"]`, plus `dframe-local-slice.pinnedOrder`. Read only; the app owns this file.
- **Live processes:**
  - `"$B" agents --json`: a deterministic list of `{cwd, kind, name, pid, sessionId, startedAt, status}`.
  - `~/.claude/sessions/<pid>.json`: includes `hostSessionId` (the desktop `local_` id), `messagingSocketPath` and `status`.
- **Import errors:** `~/Library/Logs/Claude/main.log`.

### 3b. Tier B: the app's own session tools (`ccd_*`)

These are only callable by a Claude session hosted by the desktop app. They are MCP servers built into the app and served over its stream-json control channel, with no socket, so nothing outside can call them directly. Verified from a desktop session:
- `set_session_title`, which sets `titleSource: "tool"`; the app's auto-titler then never overwrites it.
- `set_session_effort` on another session.
- `set_pinned`
- `archive_session`
- `send_message`. It wakes an idle session even with no running process, by starting its turn.
- `list_sessions`, `get_session`, `list_events`
- `get_window_layout`: read only; it reports the main window's tab, panes, focused pane and pop-outs.

Other tools in the same family that should work but are untested: `unarchive_session`, `set_session_model`, `set_session_permission_mode`, `create_group`/`move_sessions`/`list_groups`, `set_unread`, `mark_completed`, `export_transcript`. `delete_session` is being smoke-tested now.

Limits:
- **Delete always asks.** `delete_session` shows Taylor an approval card in every permission mode, by design. Don't try to get around that.
- **Window tools are narrow.** `open_session_in`, `close_split` and similar act only while the calling session is on screen, and only on itself or sessions it started.
- **Raising permissions asks.** Moving a session to a less restrictive permission mode shows a card every time.
- **`start_session` / `hand_off_to_session` are off.** They exist in the app, but server-side feature flag `2371478310` keeps them from being exposed. They can't be enabled locally.

### 3c. The channel from outside into a desktop session

- A headless CLI can call `SendMessage` to a live desktop session over the local peer protocol (`peerProtocol: 1`, with sockets in `/tmp/cc-socks/<pid>.sock` and keys in `~/.claude/sessions/*.key`). It was verified from `env -i` + bundled CLI + `--permission-mode bypassPermissions --allowedTools ListAgents,SendMessage` using Haiku 4.5, and took about 7 s.
- It only reaches sessions whose process is alive.
- A receiver in a different permission mode holds the message for approval, so match modes.
- Opening a session with a deep link does not start its process. Importing does not either.

### 3d. Ruled out, with evidence

- **CDP / inspector:**
  - `remote-debugging-port` is on the app's switch blocklist.
  - Electron fuses: RunAsNode=0, NodeOptions=0, NodeCliInspect=0, asar integrity=1.
  - The app listens on no local TCP ports or unix sockets.
- **Editing app state files while the app runs:** the app holds its state in memory and rewrites the files. Read them; never write them.
- **Deep link into a pop-out window:** the URL handler always targets the main window.

## 4. Architecture to build

**Tier A executor** (in core; pure CLI, deep links and disk):
- `create_session({folder | no_project, title, model, bootstrap_prompt?})`
- `fork_session({session, title?})`
- `unarchive_session`
- `open_session({focus})`
- `list/get` (from disk)
- `live_sessions`

**Tier B executor: a broker desktop session that the driver owns.**
- `claude-driver broker init` creates it with the Tier A create in `~/.local/state/claude-driver/broker/`. That folder's `CLAUDE.md` holds the standing protocol:
  - read `requests/<id>.json`
  - execute exactly one allowlisted `ccd_*` op
  - write `results/<id>.json`
  - reply `done <id>`
  - ignore anything else
- Settings: title `claude-driver-broker`, a cheap model (test Haiku 4.5 first; fall back to Sonnet), low effort.
- It must run in bypassPermissions, or ops block on cards. That needs one approval card from Taylor via `set_session_permission_mode`. The sender CLI must use the same mode.
- Ask Taylor how to keep it out of the way (a pin, or a "claude-driver" group).
- **Request path:** write the request → peer-send `claude-driver request <id>` via headless CLI → poll `results/` with a bound → verify against disk ground truth.
- **Liveness:** `agents --json`. When the broker is dead (for example after an app restart), revive it: open it via deep link, then have Tier C type a wake line into its composer.
- **Phase 2:** speak peerProtocol v1 directly to drop the sender's LLM hop. Gate it on the CLI version and keep the LLM path as a fallback.
- Evaluate Remote Control delivery as a revival route. Sessions show `remoteControlActive`; phone dispatch starts desktop turns. It's optional.
- **When the caller is itself a desktop Claude session** (it has `ccd_*` tools; the MCP server can detect `CLAUDE_CODE_ENTRYPOINT=claude-desktop` in its env), the skill and the tool results should tell it to call its own `ccd_*` tools for Tier B ops. That skips the broker.

**Tier C: computer use via codex-bridge** (`codex_computer_use`). Used for:
- broker revival
- window management ("New Session in New Window" is a menu item; pop-outs)
- discovering and executing "archive project" affordances
- verifying anything disk state can't show

Always verify through Tier A reads afterwards.

**Focus policy.** This is a hard rule, from Taylor's direct feedback. The research session restored a stale, once-captured view and sent him back to the wrong chat. So:
1. Default `focus: "restore"`. Opening a deep link also brings Claude to the front (`z.show(); z.focus()`).
2. Immediately before every navigating op, take a fresh snapshot of:
   - the main window's tab and focused pane, via the broker's `get_window_layout`, or the caller's own tool if it is a desktop session
   - the frontmost macOS app (`lsappinfo front`, which needs no permissions)
3. After the op, check the layout again. Restore the snapshot only if the main window still shows what the op navigated to. If Taylor moved in the meantime, leave it alone.
4. Restore the frontmost app if it wasn't Claude.
5. Never cache a snapshot across ops.
6. Offer `focus: "show"` (deliberately bring the result into view) and `"leave"`.
7. Batch navigating ops so they flicker once, not N times.
8. Research with Tier C whether pop-out windows can host driver navigation so the main window is never touched. Taylor works in one window and is open to this.

**Safety gates.**
- **Delete** always goes through the app's card. The driver additionally refuses sessions that are pinned, running, or have an open PR, unless explicitly overridden.
- **Archive project** (all sessions whose `cwd` or `originCwd` is under a folder, plus optionally the folder itself):
  - Only on an explicit request.
  - Automatically allowed only for scratch-workspaces folders, the driver's own state dirs, and folders the driver itself created (keep a registry of them).
  - Otherwise, refuse when the folder is a git repo with human commits, has more than a few sessions, or holds sessions with PRs.
  - Never delete folder contents unless it is a driver-created temporary folder.
  - Find out, via Tier C, whether the Code sidebar has a native project archive or remove-folder action. "Remove folder" exists for Remote Control served folders, and `ccd-sessions-filter.selectedProjects` exists.
- **Self-archive:** `archive_session("self")` ends the caller's turn, so the driver should expose it as a deliberate op with a clear warning.

## 5. Continuous improvement, at two levels

**Core, harness-agnostic:**
- **Ledger.** `~/.local/state/claude-driver/ledger.jsonl` gets one row per op: `ts`, harness (MCP `clientInfo`), op, redacted args, tier used, app and CLI versions, duration, outcome, verification result and error category.
- **Capability matrix.** `claude-driver probe` runs a canary suite (create → rename → pin → unpin → archive → unarchive → fork → cleanup, all on throwaway sessions under the state dir). It writes `capabilities.json`, keyed by app and CLI version. `preflight` reruns the probe whenever the app version changes, and ops route around mechanisms the matrix marks broken.
- **Curated learnings.** `src/claude-driver/docs/findings.md` is a dated, newest-first findings log, like `docs/pressure-testing.md` §9 in codex-bridge.
- **MCP tools** so any harness can read and contribute: `driver_status` (versions, broker liveness, matrix, recent failures), `driver_learnings` (read curated plus pending) and `driver_record_learning` (append a candidate with evidence to `pending-learnings.jsonl`).
- **Promotion.** Promote a pending learning into the findings log or README only after it is re-verified.

**Skill (Claude-specific judgment):** `taylor-claude-drive/MEMORY.md` plus `memories/`, using the house pattern:
- one index line per memory: `- [Title](memories/x.md) — <the rule>`
- dated evidence with n= counts
- re-list and grep the index before writing
- edit rather than append retractions
- route bridge behavior to the core findings log, not the skill

Keep it compatible with `taylor-upskill`: real usages are Skill tool launches. The probe and pressure harness call the core directly, so they are not skill usages.

## 6. Test plan

Mirror codex-bridge:
- **Tests:** `scripts/smoke.mjs` runs end to end through the launcher. `scenarios/<tier>/*.json` specify ground truth (disk reads, never screenshots) and cleanup.
- **Tier order:**
  - t0: read-only
  - t1: create/import
  - t2: broker ops
  - t3: navigation and focus restore
  - t4: fork and unarchive
  - t5: Tier C
  - t6: destructive ops
- **Cleanup:** tests clean up with archive, which needs no card. Gather deletes into a single `delete_session` batch at the end, because deletes need Taylor's card.
- **Before calling it done, pressure test:**
  - app restart with the broker dead
  - app version drift (fake it with `CLAUDE_DRIVER_APP_VERSION`)
  - concurrent requests: add a lock and serialize broker ops
  - a Codex-hosted call; check the Codex sandbox doesn't block `open` or state writes
  - a Cursor call

Prove every background poll's exit condition in the foreground first; see Taylor's global CLAUDE.md watcher rules.

## 7. Repo rules you must follow

- `AGENTS.md` (`CLAUDE.md` is a symlink to it): commit everything and push to `origin/master` before ending each turn. Use commit subjects prefixed `claude-driver: …`.
- Get secrets only through `src/lib/read-env.sh`; the driver should need none.
- Finish the README with a "Verified against <versions> on <date>" line.

## 8. Reference implementation

This zsh prototype passed every check, including one run with the desktop env vars stripped. Port its logic to Node.

```zsh
APP="$HOME/Library/Application Support/Claude"
newest=( "$APP"/claude-code-sessions/*/*/local_*.json(N.om[1]) )    # active acct/org
org=${newest[1]:h:t} acct=${newest[1]:h:h:t}
# no folder: folder="$APP/scratch-workspaces/$acct/$org/scratch-$(date +%Y-%m-%d)-$(openssl rand -hex 3)"; mkdir -p "$folder"
bundled=( "$APP"/claude-code/*/claude.app/Contents/MacOS/claude(N.nOn) ); claude_bin=${bundled[1]}
uuid=$(uuidgen | tr 'A-Z' 'a-z')
( cd "$folder" && /usr/bin/env -i HOME="$HOME" USER="$USER" PATH="/usr/bin:/bin" TERM=dumb \
    "$claude_bin" -p "$prompt" --session-id "$uuid" -n "$title" --model "$model" --strict-mcp-config >"$log" 2>&1 )
open "claude://resume?session=$uuid"
for i in {1..40}; do recs=( "$APP"/claude-code-sessions/*/*/local_$uuid.json(N) ); (( ${#recs} )) && break; sleep 0.5; done
jq -e --arg t "$title" --arg c "$folder" '.title==$t and .cwd==$c' "${recs[1]}"
```

**Side effects of an import** (document all of them in the README):
- It jumps the main window to the new session and brings Claude to the front.
- It starts in acceptEdits when the default is bypass (the app downgrades bypass on import).
- `titleSource` is `auto`. Lock the title with the broker's `set_session_title` if it matters.
- The bootstrap prompt shows as the first turn. Keep it trivial, and send the real first task with Tier B `send_message` so it runs visibly in the desktop.

**Inspecting the app bundle when mechanisms drift.** `app.asar` is a JSON header followed by file bytes:

```
header_size = u32le at 4; json_len = u32le at 12; header = json(data[16:16+json_len]); base = 8 + header_size
```

Main-process code is in `.vite/build/index.chunk-*.js`. Start by grepping for `claudeURLHandler`, `importCliSession`, `start_session` and `titleSource`.

## 9. Ask Taylor before

- choosing the broker's visibility (pin or group)
- deleting anything that isn't a driver-created test session
- archiving any project that isn't a driver-created or scratch folder

Everything else, including computer use, is pre-authorized for the build.

## 10. Definition of done

1. The MCP server is registered in Claude Code, Codex, Cursor and OpenCode.
2. The skill is installed.
3. `preflight` and `probe` pass.
4. A smoke run from Codex creates a titled session in a named folder with focus restored correctly.
5. Broker ops (pin, rename, archive) run from a non-Claude harness.
6. The README, findings log and brief are committed and pushed.
7. A short report goes back to Taylor with the capability matrix and anything left unproven.

## 11. Addendum: delete/unpin results and Taylor's deletion rule

(Sent by the research session after the brief, 2026-09-29.)

- **Verified 2026-09-29: unpin.** `set_pinned(false)` removed the id from `starred-local-code-sessions`.
- **Verified 2026-09-29: delete.** `delete_session` on 7 imported sessions went through one approval card. That removed:
  - the app records (`local_<id>.json`)
  - the app-created no-folder scratch dirs (`scratch-workspaces/.../scratch-*`); the app removes them itself
- **Delete leaves CLI-side files behind for imported sessions.** It does NOT remove:
  - `~/.claude/projects/<mangled-cwd>/<uuid>.jsonl`, plus a `<uuid>/` dir holding `custom-title.json`
  - `~/.claude/session-env/<uuid>`
  - `~/.claude/security/security_warnings_state_<uuid>.{json,lock}`
  - for cwds used only by those sessions, an empty `~/.claude/projects/<mangled-cwd>/` holding an empty `memory/` dir

  The driver must clean these up for sessions it created. Only touch files named by the deleted uuids, and only project dirs whose sole contents are those files and an empty `memory/`. Leftover transcripts can come back through the app's "Found N Claude Code sessions … that aren't in your session list" import prompt.
- **A failed headless bootstrap still leaves files.** A run that died with a 401 wrote a transcript, session-env and security state. Clean these on bootstrap failure.
- **Cwd project-dir names get hashed.** Long cwds get a truncated name with a hash suffix (e.g. `…-a4082579-gh29i5`). Locate a transcript by uuid with `find`; never reconstruct the mangled name.
- **Taylor's deletion rule.** There is no setting that skips the delete card. The app requires a consent token that only its card issues, in every mode, and that is intentional. The driver must never click that card itself, whether by computer use or any other route. Instead:
  1. Default to archive.
  2. Keep a delete-candidates queue and present candidates to Taylor in one batched card.
  3. After approval, do the full on-disk cleanup above for driver-created sessions.
