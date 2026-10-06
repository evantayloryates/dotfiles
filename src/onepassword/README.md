# Shared 1Password CLI session

`~/dotfiles/bin/op` is the normal command. It sends each request to a per-user
LaunchAgent that owns one persistent controlling terminal (PTY). The broker
runs the official Homebrew `op` binary in that session. A locally signed background
app, **1Password CLI Broker**, hosts the worker so macOS shares its App Data
permission across CLI calls for the lifetime of that app process. You authorize each 1Password account through the native desktop prompt.

There are two independent approvals: macOS's access-to-other-apps-data prompt
once per broker app lifetime, and 1Password's per-account Touch ID authorization.
A naked launchd/Python worker caused macOS to ask about each new `op` process;
the native app host fixes that attribution. Apple explicitly limits this data
access consent to the lifetime of the requesting app. A broker restart, crash,
or Mac logout/reboot requires this approval again, even with unchanged code.
Restarting Codex does not restart the independent broker. Ten minutes of CLI
inactivity only expires 1Password authorization, not this macOS app permission.
Full Disk Access is not required or configured. See:
https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox

1Password remains responsible for authorization: ten minutes of inactivity,
a twelve-hour maximum, and revocation when the desktop app locks. There are no
stored session tokens, service accounts, or secret cache. A metadata-only
keepalive (below) stops the ten-minute window from expiring while the app is
unlocked; it never reads an item. See
https://www.1password.dev/cli/app-integration-security.

## Install

Requires macOS, `/usr/bin/python3` (Command Line Tools), Homebrew's 1Password CLI,
and the desktop app's **Integrate with 1Password CLI** setting. `~/dotfiles`
must point to this checkout. Run:

```sh
~/dotfiles/install_op_agent.sh
```

The broader `install.sh` also invokes this scoped installer. The scoped command
builds/registers the app host, installs startup hooks, and installs two LaunchAgents.
An unchanged reinstall preserves the running broker and its authorization.
Changing the broker/app sources rebuilds its bundle and restarts the service;
installation refuses that update while a command is running. Any restarted broker app needs a new macOS privacy approval on its first CLI
access. No signing certificate or
Apple developer account is required; the installer uses ad-hoc local signing.

All implementation and configuration live in this repository. Outside it, the
installer creates source lines in shell startup files, LaunchAgent symlinks,
backups of modified startup files, and private runtime files. No hand-maintained
configuration outside the repo is required.

The installer sources `src/path/overrides.sh` from zsh's `.zshenv`, `.zprofile`,
`.zshrc`, and `.zlogin`, plus bash's `.bashrc`, `.profile`, and its existing
preferred login profile. It respects `ZDOTDIR` when set at installation. It
never creates `.bash_profile` merely to override an existing `.profile`.
Reapplying the idempotent snippet after startup PATH changes keeps the repo's
`bin/` before Homebrew. The zsh templates and `src/path/common.sh` also apply it.

`com.taylor.dotfiles-path` exports the same PATH precedence to the user launchd
session at login. Existing GUI apps must be fully restarted to inherit it.
Noninteractive bash/sh and programs launched without a shell inherit PATH;
they do not need shell functions or agent instructions. The override is macOS
only so Linux/devcontainer shells retain their normal behavior.

Verify from a new shell or Codex task:

```sh
command -v op  # /Users/taylor/dotfiles/bin/op
op --version
/usr/bin/python3 -B ~/dotfiles/src/onepassword/op_agent.py status
```

Shells that replace PATH, change ZDOTDIR after installation, or explicitly call
`/opt/homebrew/bin/op` can bypass the wrapper. `sudo` may replace PATH and should
not be used with this user broker. PATH routing is a default, not an execution
sandbox. No Homebrew binary or symlink is modified.

## Process and data handling

Claude and Codex share the same broker, not separate MCP credential connectors.
Their user-level instructions use the contract in [agent-contract.md](agent-contract.md).
After changing that contract, run `python3 src/onepassword/sync-agent-guidance.py`
from the dotfiles checkout. It updates only the marked 1Password section in
`~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`, preserving the other instructions.
The updater is idempotent and refuses ambiguous section markers. Existing chats
may retain old instructions; use a fresh chat to verify a changed contract.

The Kickoff Cloudinary launcher resolves its verified restricted credential pair
with short captured broker calls before starting the server. The cloud name alone
comes from the ignored `.env`; an obsolete token or API key there is not used.
Either credential lookup failing prevents the server from starting. Do not wrap
the long-running MCP in `op run`, which would occupy the shared serial queue.

- `com.taylor.op-agent` runs the native background app from
  `data/op-agent/1Password CLI Broker.app`. Its Python worker owns a PTY and
  serially executes requests without replacing that terminal session. The app
  launches Python with a minimal environment instead of forwarding launchd's
  globally exported credentials; requests still carry their caller environment.
- A file lock prevents duplicate brokers. The Unix socket is mode 600 inside a
  mode-700 directory owned by the current user. Both endpoints check peer UID.
- Arguments, environment, cwd, and umask belong to the individual request.
  Unix descriptor passing preserves stdin, stdout, stderr, binary output, and
  exit status. Secrets and command output are never written to broker logs or
  response files. `op read` still prints a secret if explicitly requested;
  the wrapper is not an output-redaction layer.
- SIGINT, SIGTERM, SIGHUP and SIGQUIT are forwarded to the command process group.
  Cancellation escalates to SIGKILL after two seconds. Disconnecting a caller
  cancels its running command; cancelled queued requests do not execute.
- A command nested inside `op run` detects that it already belongs to the
  broker's session and invokes the real CLI there, avoiding queue deadlock.
- Long-running `op run` commands occupy the serial queue. Background descendants
  in the command's process group are cleaned up when the command finishes.
  Interactive full-screen programs, shell job control, and programs reading
  `/dev/tty` directly are not supported: `/dev/tty` is the broker's private PTY,
  while ordinary standard input/output remain attached to the caller.
- Any process running as this macOS user can use the broker's authorized session.
  The Unix socket does not distinguish individual Codex tasks or applications.
- If the broker is unavailable, the wrapper exits 125 and gives a repair hint.
  It never silently falls back to an independently authorized terminal session.

## Keepalive, app watchdog and audit log

The broker app host runs `keepalive.py` (sealed into the bundle next to
`op_agent.py`) as a child from login, restarting it if it dies. Running it
inside the broker app matters: 1Password's log lives in its group container,
which macOS only lets the approved broker app read. Every 20 seconds it relaunches the 1Password
desktop app in the background if it is not running (the CLI integration needs
it), reads the app lock state from 1Password's own log, and, when the app and
the Mac console are unlocked, makes one `op vault list --account <id>` call
per configured account whenever that account's last successful call is older
than the interval (default 7 minutes). While 1Password's authorization is valid
the call is silent and extends the ten-minute inactivity window. When it is not
(login, app relaunch, app lock, the twelve-hour cap) the call raises the Touch
ID prompt immediately and a notification says it is the keepalive's, so the
prompt happens while Taylor is at the Mac rather than when an agent needs a
secret. While the app or console is locked nothing is attempted; once per lock
episode the app is brought forward so its unlock screen is visible. After an
unanswered prompt (`authorization timeout`) the interval doubles up to 30
minutes until the next unlock event resets it.

Config lives outside the repo in `~/.config/op-keepalive.json`:

```json
{"accounts": [{"id": "<user id or email>", "label": "personal"}],
 "interval_minutes": 7, "notify": true}
```

Use account user ids or emails, not `my.1password.com`: the URL matches every
account on that server and `op` refuses an ambiguous `--account`.

Tradeoff: an unlocked 1Password now keeps the CLI authorized for up to twelve
hours instead of ten idle minutes. The audit log is the compensating control.
Two JSONL logs live in `~/Library/Logs/op-broker/` (mode 600):

- `requests-YYYY-MM.jsonl`: one line per broker request with timestamp, caller
  pid and process chain, cwd, sanitized arguments (`--session`/`--token`
  values and any `key=value` argument are redacted), the optional
  `OP_BROKER_CALLER` label from the caller's environment, exit code and
  duration. Never the environment, output or secrets.
- `keepalive-YYYY-MM.jsonl`: keepalive calls with status (`ok`, `ok_queued`
  for a call that waited behind an agent command, `ok_prompted` when
  1Password logged a Touch ID challenge during the call, `prompt_timeout`,
  `broker_unavailable`, `error`), app
  relaunches, lock and console transitions, nudges and backoff resets.

`bin/op-audit` summarizes both plus 1Password's own Touch ID challenges, and
attributes each challenge to the request that triggered it:

```sh
op-audit                 # last 24 h: requests by caller/account/command, prompts
op-audit --since 7d      # longer window; --json for machine output
op-audit status          # broker, keepalive state, last ok/prompt per account
op-audit tail 50         # raw recent request records
```

## Runtime and maintenance

Runtime files live in `~/Library/Caches/com.taylor.op-agent/`: a lock, socket,
and non-secret status metadata (PID, session ID, TTY, executable path).
LaunchAgent symlinks live in `~/Library/LaunchAgents/` and point at the two
tracked plist files in `src/launchd/` (PATH export and broker; the keepalive
is a child of the broker). Native source and Info.plist are in
`src/onepassword/app/`; `build_app.py` builds and signs them into ignored
`data/op-agent/`, with a sealed copy of the Python worker as an app resource.
Runtime state and generated binaries are not source controlled.

Inspect launchd state:

```sh
/usr/bin/python3 -B ~/dotfiles/src/onepassword/op_agent.py status
```

Do not dump raw `launchctl print` output: it can include inherited credentials.
The status command above reports only non-secret process metadata.

After updating broker code, rerun `~/dotfiles/install_op_agent.sh` to rebuild the
sealed app resource. To restart unchanged code, use this when no command is
running; it cancels active work and requires fresh Touch ID authorization:

```sh
launchctl kill SIGTERM "gui/$(id -u)/com.taylor.op-agent"
```

To disable the override, remove the tracked `bin/op` wrapper from PATH (or move
it aside), then unload the agent. Do not merely stop the broker while leaving
its wrapper active: commands intentionally fail closed. Removing generated
startup hooks and the GUI PATH entry also removes the broader dotfiles `bin/`
override. The `*.pre-op-agent.*` startup backups preserve pre-install contents.

## Tests

```sh
cd ~/dotfiles
/usr/bin/python3 -B -m unittest discover -s src/onepassword -p 'test_*.py' -v
```

Tests launch isolated brokers with a fake `op`, and use temporary HOME
folders for shell startup checks. They never open vaults or request biometrics.
They cover persistent terminal identity, request isolation, cwd/umask,
binary streams, cancellation/disconnection, queue cancellation, nested calls,
singleton locking, malformed requests, unavailable service, the audit log's
redaction, keepalive call classification and backoff, installer idempotence,
and shell PATH precedence. Real Touch ID reuse must additionally
be checked against the installed 1Password desktop app. Verify macOS App Data
approval separately: subsequent calls in one app lifetime should not prompt,
whereas the first call after an unchanged app restart does prompt by design.
Touch ID reuse alone does not establish macOS privacy permission behavior.

## Automatic recovery and incident records (2026-10-06)

Every keepalive alert immediately launches `recovery.py --automatic` as
an independent, bounded worker, which sends the notification and starts diagnosis. Diagnosis no longer waits for a notification
click. This path does **not** request another authorization attempt. The banner
has a fixed `recovery.py --click <episode>` action. That FIRST click releases the
prepared fix, independently opens 1Password, and requests a keepalive wake.
Diagnosis/tests start immediately, but candidate code stays isolated until
`recovery.py --gate <episode>` confirms release. The click queues one follow-up
in the same incident; repeated clicks cannot replay it. A stale banner cannot
release a different incident. No second fix approval is requested.

Keepalive checks the pending notification every 20 seconds and repeats it after
one hour without a click, then hourly until release. Failed notification attempts
also back off for an hour. A verified no-change settlement stops reminders.
A prepared fix awaiting the first click stays unarchived; the agent ends its turn
and resumes on the queued release message, rather than polling. Touch ID and macOS consent
still belong to Taylor; software repair authorization cannot replace them.

Recovery sends only sanitized diagnostic categories and slot numbers. It uses
the existing Codex daemon without starting, upgrading or restarting it. New
incident chats use an advertised strongest desktop model with high effort,
`approvalPolicy: never`, the dotfiles project and the actual Pinned section UUID.
The sandbox and 1Password permissions are not loosened. Refused platform access
remains a failure to report, not something the dispatcher approves itself.

Generated chats are named `⚙️ fix-1p-broker/<Eastern-date-time>`; each gets a
matching directory under [autofixes](autofixes/AGENTS.md). Names use the actual
month (`sept` in September), two-digit day and hour: `sept-25-5p`. Try the floor
first, then the next actual hour only when strictly past half past, then the
original minute (`sept-25-5.17p`). `America/New_York` handles DST and midnight.
Atomic folder creation and existing chat names prevent overwrite. Exhausting the
minute name fails closed; a later event can try again. UTC creation time and
year remain in `incident.json`.

An unsettled incident is reused. After settlement a new episode creates a new
chat; duplicate events do not resurrect archived incidents. Legacy undated chats
remain maintenance chats. An uncertain mutation is retained for reconciliation,
never blindly replayed or redirected to a competing fallback chat.

Before a generated chat self-archives, it must verify its conclusion, update
relevant agent docs, store sanitized supporting evidence under `artifacts/`, and
write `report.json`. The [settlement helper](autofix.mjs) validates the required
fields/evidence and generates `summary.html`, `summary.md` and `settled.json`.
It checks structure; agents must substantiate the claims. `applied` means verified
in service; `staged` means tested and fully ready for the explicitly documented
next safe load; `no_change` means a verified conclusion warranted no code change.
Unresolved diagnosis is not settled. After committing all changes and verifying
the push, the agent uses native `set_thread_archived` on itself. Daemon-created
chats without that desktop tool use `autofix-archive.mjs schedule <incident-dir>`
as their final command. The helper waits for turn completion, checks identity,
evidence and clean/pushed master, invokes the documented native `thread/archive`
API and reads back membership. It never cancels a turn; it times out after five
minutes and records a private receipt. Scheduling is not archive completion.
A failed archive must be reported, not inferred from the settlement marker. The maintenance chat
is not automatically archived.

Read [autofixes/AGENTS.md](autofixes/AGENTS.md) for the exact report contract and
settlement procedure. Private dispatch receipts remain in
`~/Library/Caches/com.taylor.op-keepalive/`; artifacts in this repository must
never include secrets, raw application logs, environment dumps or vault output.

`recovery-result.json` distinguishes a persisted auth request from app-open
acceptance. Neither proves a prompt appeared or was approved. The automatic path
records `kick: not_requested`. The keepalive consumes a click's short-lived wake
once, respecting app/console locks. Unknown console state suppresses calls.

Codex execution was qualified on October 6 for both callbacks queued during an
active turn and callbacks arriving at an already-idle desktop-owned chat. Queue
acceptance alone is never proof of execution. Physical banner clicking remains
unverified. Claude fallback honors UI quarantine and is only synthetically tested.
No live Claude driving or Computer Use is required by this workflow.

A controlled lifecycle qualification can carry `kind: authorization_or_unknown`
while the broker and both accounts are healthy. That category alone does not
establish an authorization failure. Check fresh keepalive state, deployed source
hashes and bounded metadata-only calls before deciding whether a repair is needed.
Record a verified healthy qualification as `no_change`; do not restart the
broker or request an authentication wake just to exercise recovery.

The false-lock fix uses timestamped lock/unlock events across bounded log tails;
`Client starting` is not evidence of a lock. Stale/rotated files cannot regress a
known newer state. For a tested keepalive-only change, safely activate with:

```sh
/usr/bin/python3 -B /Users/taylor/dotfiles/src/onepassword/activate_keepalive.py
```

The helper verifies provenance, idle process identities, signing and the running
child's source hash. It swaps the signed resource and replaces only the keepalive
child, preserving the native host, broker worker, PTY and auth. Changed host,
worker, plist or builder code requires the normal installer at a safe restart.
Do not cancel active work to force an update. The October 6 parser deployment
retained broker PID 1231 and `/dev/ttys000`, with both accounts authorized.

Additional isolated tests:

```sh
node --test src/onepassword/test_autofix*.mjs src/onepassword/test_recovery_dispatch.mjs
```

Protocol reference: [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).
