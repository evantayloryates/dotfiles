# Sudo session cache

Taylor's personal Mac configuration: one successful sudo authentication is usable
for 60 minutes across his terminal and agent sessions. This removes the default
per-terminal/per-parent-process isolation that otherwise prompts fresh agent
shells again. It does not add a passwordless command grant or store a password.

Install with `python3 /Users/taylor/dotfiles/src/sudo-session/install.py`.
The installer requests administrator authentication once, validates the existing
sudoers and candidate with `visudo`, atomically installs the root-owned 0440
`/private/etc/sudoers.d/90-taylor-session`, and validates the complete policy.
A failed final validation restores the previous drop-in.

After installation, `sudo -v` authenticates the new global cache once. Fresh
shells can check it with `sudo -n /usr/bin/true`. `sudo -k` invalidates it early.
This is a sliding sudo cache, not an exact wall-clock limit from the first command.
It leaves Touch ID, iPhone passcodes and Apple authorization rules unchanged.

The iOS-agent MCP runtime runs as Taylor and does not call sudo. Do not add sudo
to native/browser sessions or recovery. If a future feature actually needs root,
separate one-time installation from runtime and use a narrow, auditable helper.
Do not add blanket `NOPASSWD: ALL` or a privileged general-purpose shell.
