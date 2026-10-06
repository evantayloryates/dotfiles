# notify-curator

Claude desktop notifications, trimmed to what Taylor wants: **an agent
finished its turn or needs input**, with a click that opens that session.
It hides the app's session-management notices and the turns of automation
sessions.

| Hidden | Shown |
|---|---|
| Claude archived / deleted / cleared / stopped / unarchived / moved: … | Turn finished (`idle-…`, the app's summary as the body) |
| Claude changed the model / effort / permission mode / fast mode / output style for: … | Claude has a question (`ask-question-…`) |
| Claude turned Remote Control on/off for: … | Permission request (`permission-…`) |
| Claude scheduled / updated / deleted a task, started/stopped watching | Scheduled task completed / failed |
| Turns of claude-driver automation: the broker, probes and pressure fixtures, pool recycle turns, `pool · … · idle` sessions | Anything else the app sends (SSH reconnect, fast-mode credits, …) |

A pool recycle that the session **declined** ("recycle declined: …") is shown:
it means the session is holding something for Taylor.

## Why it is built this way

- **No app setting covers these.** Claude 2.19675 builds the lifecycle
  notices in its main process (`index.chunk-*.js`: `agent-archive-<id>`,
  `agent-delete-<id>`, `agent-session-<action>-<id>`) and shows them whenever
  an agent ran the action without an approval card and Taylor was not watching
  the acting session. They go through the generic path, which no
  `notificationLevels` key (permission / idle / question) gates. The claude.ai
  Settings toggles (Response completions, Code notifications, …) do not reach
  them either.
- **The app cannot be patched.** Its Electron fuses enforce asar integrity and
  disable `NODE_OPTIONS` and `--inspect`.
- **So the app keeps deciding *when*, and this daemon decides *which*.** With
  Claude's macOS alert style set to **None**, its notifications land silently in
  Notification Center, which is also a SQLite database
  (`~/Library/Group Containers/group.com.apple.usernoted/db2/db`). The daemon
  reads new Claude records, classifies them by identifier, and re-posts the
  wanted ones with `terminal-notifier` (same title, same body, Claude icon,
  click opens `claude://claude.ai/epitaxy/<session>`). The app's own rules
  still apply: no notification for the session on screen, none for self-resume
  wakeups or scheduled-task sessions, and its notification is replaced or
  withdrawn when a newer turn lands or Taylor opens the session. Withdrawals are
  mirrored, so a mirrored notification disappears when Claude's does.
- **Shadow mode until the switch.** While Claude's alert style is not None the
  daemon posts nothing (no doubles) and logs `would-show` / `would-hide`.
  It reads the style from
  `~/Library/Group Containers/group.com.apple.usernoted/Library/Preferences/group.com.apple.usernoted.plist`
  (`(flags >> 3) & 7`: 0 None, 1 Banners, 2 Alerts) every few seconds and goes
  live by itself. Switching Claude back to Banners or Alerts withdraws the
  mirrors and returns to shadow.
- **Started from Claude Code hooks, not launchd.** Reading usernoted's database
  needs Full Disk Access. The bundled `claude` CLI has it, a launchd job does
  not (`authorization denied`, verified). A process started from a Claude Code
  hook inherits the CLI's grant and keeps it after the CLI exits (verified:
  reads kept working with the spawning CLI gone). `SessionStart` and `Stop`
  hooks in `~/.claude/settings.json` run `bin/notify-curator ensure`, which
  exits in ~15 ms when the daemon is up and restarts it when this code changes.

## Install

```bash
/Users/taylor/src/github/dotfiles/src/notify-curator/install.sh
```

It adds the hooks, starts the daemon, and opens Claude's pane in System
Settings > Notifications. There, set **Alert style: None** and leave
**Allow notifications** and **Show in Notification Center** on (the daemon reads
what lands there). The mirrored notifications come from **terminal-notifier**;
its alert style (currently Alerts, which stay until dismissed) is set in the
same pane list.

## Use

```bash
/Users/taylor/dotfiles/bin/notify-curator status      # mode, health, last decisions
/Users/taylor/dotfiles/bin/notify-curator classify    # dry-run the filter over Notification Center now
/Users/taylor/dotfiles/bin/notify-curator stop
```

State lives in `~/.local/state/notify-curator/`: `decisions.jsonl` (one line
per notification: identifier, session, title, action, reason; no bodies),
`daemon.log` (start, mode changes, errors; `BROKEN:` lines mean it exited and
the next hook restarts it).

Optional `~/.config/notify-curator.json`:

```json
{
  "mode": "auto",
  "hide_prefixes": ["ssh-reconnect-"],
  "show_prefixes": ["agent-delete-"],
  "automation_title_patterns": ["^Stage DB evals\\b"],
  "filter_automation": true,
  "sound": true
}
```

`mode`: `auto` (default: live only when Claude's style is None), `active`,
`shadow`, `off`.

## Known limits

- Claude's own section of Notification Center still collects everything,
  lifecycle notices included, silently. The app withdraws its turn
  notifications when a session is opened; clear the rest from Notification
  Center when it gets long.
- A turn notification the app replaces faster than the 0.4 s poll is mirrored
  once, with the newer text.
- Identifiers and the alert-style bits are the app's and macOS's internals.
  After a Claude or macOS update, `notify-curator classify` and `status` show
  whether they still decode. Unknown identifiers are shown, not hidden.

## Tests

```bash
/usr/bin/python3 -m unittest discover -s /Users/taylor/src/github/dotfiles/src/notify-curator -v
```

They build a synthetic usernoted database and fake both notifiers; nothing
touches the real Notification Center.
