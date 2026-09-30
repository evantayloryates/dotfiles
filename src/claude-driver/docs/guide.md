# claude-driver guide (for any harness)

claude-driver drives Taylor's Claude desktop app from Claude Code, Codex,
Cursor, OpenCode or a script. This is the usage contract; the README has the
mechanisms and evidence.

## 1. Rules

1. **Verify on disk, never the UI.** Every write op re-reads the app's own
   session records (`verified: true/false` in results). Treat `false` as a
   failure. Screenshots and chat claims are not verification.
2. **Focus is Taylor's.** Navigating ops (create, fork, open, unarchive,
   broker revival) take a fresh snapshot of the main window's session and the
   frontmost app right before they navigate, and restore both afterwards
   (`focus: "restore"`, the default) — unless Taylor moved in the meantime, in
   which case they leave it alone. Use `focus: "show"` only when Taylor asked
   to see the result. Batch work so the window flickers once.
3. **Archive, don't delete.** `delete_sessions` always shows Taylor one
   approval card, in every permission mode, by design. Never click that card
   (or any approval card) yourself, by computer use or otherwise. Queue
   candidates with `delete_sessions {queue: true}` and present the queue in
   one batch (`from_queue: true`) when Taylor asks.
4. **Projects are gated.** `archive_project` is a dry run unless
   `dry_run: false`, and refuses anything but scratch folders, the driver's
   own folders and folders it created, unless Taylor explicitly approved
   `override: true` for that folder.
5. **Self-archive ends your conversation.** `archive_session` on your own
   session requires `confirm_self: true`.
6. **Never write the app's files.** The app holds its state in memory and
   rewrites them; the driver only reads them.

## 2. Tiers

| Tier | Mechanism | Latency | Ops |
|------|-----------|---------|-----|
| A | disk reads, bundled CLI bootstrap turn, `claude://` deep links | 0–5 s | list/get/live sessions, window_state, create, fork, open, unarchive (driver-created) |
| B | the app's own `ccd_*` tools, run by the driver's **broker** session (or by you, if you are a desktop session) | ~8–20 s via broker | rename (locks title), pin/unpin, archive, unarchive (native), model/effort/permission mode, send_message, groups, delete, precise window layout |
| C | Codex Computer Use through codex-bridge | 20–60 s, visible | broker revival when the app will not warm-spawn it, window management |

**If you are a Claude desktop session** (you have `mcp__ccd_*` tools), Tier B
ops return `handedBack: true` with the exact `ccd_*` calls to make yourself;
make them, then verify with `get_session`. Pass `via_broker: true` to force
the broker instead.

**The broker** is a Haiku session titled `claude-driver-broker` in the
`claude-driver` sidebar group, running in bypassPermissions. The app reaps its
process after 30 min idle; the driver revives it automatically (focus it so
the app warm-spawns it; if the app's CLI governor is at cap, Codex types a
wake line into it). First op after idle is therefore slower.

## 3. Choosing an op

- New session with a task: `create_session {folder | no_project, title,
  model, first_message, lock_title: true}`. The bootstrap turn is trivial; the
  real task goes in `first_message` so it runs visibly in the desktop.
- Continue from an existing session's context: `fork_session`.
- Tell a running session something: `send_message`.
- Tidy up: `archive_session` (per session) or `archive_project` (folder,
  gated). Undo with `unarchive_session`.
- What is Taylor looking at: `window_state` (cheap) or `{precise: true}`.
- Health: `driver_status`; broken mechanisms show in the capability matrix.

## 4. Session references

`local_<uuid>` (desktop id), a bare uuid (desktop or CLI id), an exact title
(refused if ambiguous), or `"self"` for the desktop session hosting you.

## 5. When something surprises you

Check `driver_learnings` first. If it is new, `driver_record_learning` with
evidence (versions, session ids, `main.log` lines, the result you got). It
stays pending until re-verified and promoted into `docs/findings.md`.
