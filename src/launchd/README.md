# launchd user agents

macOS LaunchAgents kept in source control and symlinked into
`~/Library/LaunchAgents/` by `install.sh`.

## `com.taylor.mcp-tokens`

Bridges **every variable** defined in the gitignored `dotfiles/.env` into the
**launchd per-user environment** at login, via `export-mcp-tokens.sh`.

### Why

Apps launched from Finder / Dock / Spotlight (the **Claude desktop app**, among
others) do not read `~/.zshenv` or `~/.zshrc`. Tokens defined only in the shell
are therefore invisible to them. Claude's MCP config (`~/.claude.json`)
references these tokens with `${VAR}`:

- **Linear** (`type: http`) authenticates at connect time — a missing token
  becomes `Authorization: Bearer ` → **HTTP 401** → the server silently never
  appears in the session.
- **rollbar / webflow** (`type: stdio`) spawn regardless, so they *look*
  connected but run unauthenticated and fail on the first real tool call.

`launchctl setenv` writes the values into the launchd user session, which any
GUI app launched **afterward** inherits.

### No secrets in git

The plist and script contain no secret values. They read them at runtime from
`dotfiles/.env` (gitignored) using the same `src/exports/dotenv.sh` loader the
shell uses. `.env` is the single source of truth: **add the variable to `.env`
and it is exported automatically** — no edit to `export-mcp-tokens.sh` needed.

### Install / activate

`install.sh` symlinks the plist and loads it. Manually:

```sh
ln -sf "$HOME/dotfiles/src/launchd/com.taylor.mcp-tokens.plist" \
       "$HOME/Library/LaunchAgents/com.taylor.mcp-tokens.plist"
launchctl bootstrap gui/$(id -u) \
       "$HOME/Library/LaunchAgents/com.taylor.mcp-tokens.plist"
launchctl kickstart -k gui/$(id -u)/com.taylor.mcp-tokens   # run now
```

Verify: `launchctl getenv LINEAR_TOKEN` prints the token.

After (re)loading, **fully quit and relaunch** any GUI app that needs the
tokens — a running process keeps the environment it started with.

### Caveats

- Paths in the plist are absolute (`/Users/taylor/...`); launchd does not
  expand `~`/`$HOME`. Adjust for a different `$HOME`.
- `launchctl setenv` exposes these values to *all* GUI apps in the session.
  Because the script now exports **every** `.env` variable (not a curated
  allowlist), treat `.env` as "anything here becomes GUI-visible" — keep
  non-secret or app-specific junk out of it.

## `com.taylor.docker-prune`

Runs `docker-prune.sh` **every 4 hours** (`StartInterval 14400`, plus once at
load) to stop Docker's disk footprint from creeping.

### Why

Docker accumulates GB of reclaimable junk over time — untagged `<none>` image
layers, anonymous volumes orphaned every time a container is recreated, and
unused build cache. Cleaning it by hand is easy to forget. This agent does it
automatically.

### What it removes (and what it never touches)

It reuses the same `docker-prune` shell function as the interactive command
(`src/functions/docker.sh`), so there is one definition of "safe":

- **Removes:** dangling images, detached anonymous volumes, unused build cache
  (down to a 5GB floor via `--reserved-space`).
- **Never touches:** tagged images, **named** volumes (Postgres data, gems,
  node_modules, etc. — `docker volume prune` without `--all` leaves them alone),
  or any container, running or stopped.

### Safe to fire anytime

Docker runs **on-demand** on this machine (its Login Items are off), so most
fires happen while Docker is down. `docker-prune` detects that (`docker info`)
and no-ops. The wrapper always exits 0, so a Docker-off fire is not a launchd
"failure". It complements the build-cache GC in `~/.docker/daemon.json`
(`reservedSpace 5GB` / `maxUsedSpace 20GB`), which caps cache but not images or
volumes.

### Logs

Appended to `~/Library/Logs/com.taylor.docker-prune.log`, self-trimmed to the
last ~1000 lines. Check the last run with:

```sh
tail -n 40 ~/Library/Logs/com.taylor.docker-prune.log
```

### Install / activate

`install.sh` symlinks the plist and loads it (same loop as the agent above).
Manually:

```sh
ln -sf "$HOME/dotfiles/src/launchd/com.taylor.docker-prune.plist" \
       "$HOME/Library/LaunchAgents/com.taylor.docker-prune.plist"
launchctl bootstrap gui/$(id -u) \
       "$HOME/Library/LaunchAgents/com.taylor.docker-prune.plist"
launchctl kickstart -k gui/$(id -u)/com.taylor.docker-prune   # run now
```

Verify it is loaded: `launchctl print gui/$(id -u)/com.taylor.docker-prune`.

### Tuning the interval

Edit `StartInterval` in the plist (seconds), then re-run the install steps (or
`install.sh`) to reload. To pause it: `launchctl bootout
gui/$(id -u)/com.taylor.docker-prune`.

## `com.taylor.keyrepeat`

Runs `key-repeat.sh` **at login** to push the persisted key-repeat preference
into the live HID event system.

### Why

The two surfaces that control key repeat are **independent stores**, and neither
one alone does the job:

| Store | Applies immediately | Survives reboot |
|---|---|---|
| `NSGlobalDomain` `InitialKeyRepeat` / `KeyRepeat` (`defaults write -g`) | ✗ | ✓ |
| HID event system `HIDInitialKeyRepeat` / `HIDKeyRepeat` (`hidutil property`) | ✓ | ✗ |

That they are genuinely independent was confirmed empirically: deleting **both**
`NSGlobalDomain` keys left `hidutil` reporting its previous values unchanged, and
writing them back did not move the live value. So `defaults write` alone cannot be
relied on to reach the live system, and `hidutil` alone evaporates on reboot.

This agent is the bridge. At every login it reads the persisted preference and
applies it live, so **no manual `hidutil` re-run is ever needed after a reboot**.
`install_macos_defaults.sh` handles the *current* session; this agent handles
every session after it.

### The preference is the single source of truth

The script hardcodes no rate — it reads `defaults read -g InitialKeyRepeat` and
`KeyRepeat`. Change the rate with `install_macos_defaults.sh`, a plain
`defaults write -g`, or even the System Settings slider, and the next login picks
it up. Because both halves read the same preference, it does not matter whether
macOS applies its own value before or after this agent runs — they agree.

Degenerate inputs no-op rather than forcing a rate: an **unset** preference leaves
the system default alone, and a non-numeric one is skipped with a log line.

Units differ between the two stores — the `NSGlobalDomain` keys count 1/60 s
ticks, `hidutil` wants nanoseconds. The conversion runs through `awk`
(`ticks * 1000000000 / 60`, truncated) so it matches what `hidutil` reports back
exactly: 10 ticks is `166666666` ns, *not* 10 × `16666666`.

### Logs

Appended to `~/Library/Logs/com.taylor.keyrepeat.log`, self-trimmed to the last
~100 lines.

```sh
tail -n 10 ~/Library/Logs/com.taylor.keyrepeat.log
```

### Install / activate

`install.sh` symlinks the plist and loads it (same loop as the agents above).
Manually:

```sh
ln -sf "$HOME/dotfiles/src/launchd/com.taylor.keyrepeat.plist" \
       "$HOME/Library/LaunchAgents/com.taylor.keyrepeat.plist"
launchctl bootstrap gui/$(id -u) \
       "$HOME/Library/LaunchAgents/com.taylor.keyrepeat.plist"
launchctl kickstart -k gui/$(id -u)/com.taylor.keyrepeat   # run now
```

Verify the live values match the preference:

```sh
hidutil property --get HIDKeyRepeat        # 16666666 when KeyRepeat=1
hidutil property --get HIDInitialKeyRepeat # 166666666 when InitialKeyRepeat=10
```
