# Shared 1Password CLI session

`~/dotfiles/bin/op` is the normal command. It sends each request to a per-user
LaunchAgent that owns one persistent controlling terminal (PTY). The broker
runs the official Homebrew `op` binary in that session. You authorize each
1Password account through the native desktop prompt.

1Password remains responsible for authorization: ten minutes of inactivity,
a twelve-hour maximum, and revocation when the desktop app locks. There are no
keepalive vault reads, stored session tokens, service accounts, or secret cache.
See https://www.1password.dev/cli/app-integration-security.

## Install

Requires macOS, `/usr/bin/python3` (Command Line Tools), Homebrew's 1Password CLI,
and the desktop app's **Integrate with 1Password CLI** setting. `~/dotfiles`
must point to this checkout. Run:

```sh
~/dotfiles/install_op_agent.sh
```

The broader `install.sh` also invokes this scoped installer. The scoped command
only installs startup hooks and the two relevant LaunchAgents. It is safe to
repeat: it does not restart an already loaded broker or invalidate its session.

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

- `com.taylor.op-agent` runs a small Python supervisor. Its worker owns a PTY and
  serially executes requests without replacing that terminal session.
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

## Runtime and maintenance

Runtime files live in `~/Library/Caches/com.taylor.op-agent/`: a lock, socket,
and non-secret status metadata (PID, session ID, TTY, executable path).
LaunchAgent symlinks live in `~/Library/LaunchAgents/` and point at the two
tracked plist files in `src/launchd/`. Runtime state is not source controlled.

Inspect launchd state:

```sh
launchctl print "gui/$(id -u)/com.taylor.op-agent"
```

After updating broker code, restart it when no command is running. This cancels
any active command and requires fresh 1Password authorization:

```sh
launchctl kickstart -k "gui/$(id -u)/com.taylor.op-agent"
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
singleton locking, malformed requests, unavailable service, installer
idempotence, and shell PATH precedence. Real Touch ID reuse must additionally
be checked against the installed 1Password desktop app.
