# dotfiles

order of zsh files 
1. ~/.zshenv
2. ~/.zprofile
3. ~/.zshrc
4. ~/.zlogin

for on logout functionality
~/.zlogout

A self-updating dotfiles system for VS Code dev containers that automatically syncs changes from GitHub without requiring container rebuilds.

## 🚀 Quick Start

### For Dev Containers

Add to your `.devcontainer/devcontainer.json`:

```json
{
  "postCreateCommand": "bash /workspaces/path-to-repo/install.sh"
}
```

Or run manually during container setup:
```bash
bash install.sh
```

### What install.sh Does

1. ✅ Checks for zsh (installs if missing on Debian/Ubuntu) and adds the auto-exec hooks
2. 🔗 Links `~/dotfiles` at this checkout (everything else hardcodes that path)
3. 📄 Installs `.zshrc` into your home directory — **only** if there isn't already a
   dotfiles-managed one there. An unmanaged `~/.zshrc` is backed up to
   `~/.zshrc.pre-dotfiles.<timestamp>` before being replaced; a managed one is left
   alone so machine-local edits survive.
4. 🌱 Appends the `.env` loader to `~/.zshenv` (idempotent)
5. 🍺 macOS only: installs Homebrew if missing, then the formulae this machine
   expects (see below)
6. 📚 Clones the expected GitHub repos into `~/src/github` (see below)
7. 🍎 macOS only: system preferences and wallpaper (see below), `~/.hushlogin`,
   and the `src/launchd/` user LaunchAgents

**install.sh is re-runnable.** Every step either no-ops or converges to the same
state, and nothing overwrites machine-local edits without taking a backup first.

### Homebrew (`install_brew.sh`)

Makes sure Homebrew itself and the image/video toolchain are present. macOS only —
Homebrew runs on Linux too, but pulling a full install into a devcontainer isn't
something setup should do behind your back.

| Formula | Why it's pinned explicitly |
|---|---|
| `libtiff` | TIFF decode, used directly — not just as an incidental dep |
| `webp` | `cwebp`/`dwebp`, and what `assets/wallpaper.webp` needs |
| `ffmpeg` | Video workhorse |
| `imagemagick` | Image workhorse |

`libtiff` and `webp` would arrive anyway as dependencies of the other two; listing
them keeps a future `brew autoremove` from taking them back out.

- **Missing Homebrew is installed**, non-interactively (`NONINTERACTIVE=1` skips the
  installer's RETURN prompt; `sudo` can still ask for your password once, to create
  the prefix). A fresh install doesn't put `brew` on the *current* process's PATH, so
  the script looks in both prefixes — `/opt/homebrew` (Apple Silicon) and
  `/usr/local` (Intel) — and then `eval`s `brew shellenv`, matching the shape
  `src/path/common.sh` gives interactive shells.
- **`brew update` only runs when something is actually missing.** It's the expensive
  step (it fetches every tap), so a re-run with all four formulae present makes zero
  network calls. Formulae install one at a time, so one broken formula can't take the
  rest of the list down with it.
- **Linking is converged too.** Homebrew records each linked keg under
  `var/homebrew/linked`; if one of ours isn't there, its binaries and headers aren't
  in `$(brew --prefix)/{bin,lib,include}` either and PATH won't find them. Only that
  case re-links — `brew link` on an already-linked formula is wasted work. None of
  these four are keg-only, so the keg-only branch is just a note.
- **Never fatal** — a failed install is logged and the run still exits 0.

Run it on its own:

```bash
bash ~/dotfiles/install_brew.sh
```

Override the list for a one-off run with `BREW_FORMULAE="jq ripgrep"`; to change it
for good, edit the `FORMULAE` array at the top of the script.

### Repo cloning (`install_repos.sh`)

`install.sh` calls `install_repos.sh`, which makes sure this machine has all the
repos it expects checked out under `~/src/github`.

- **Idempotent** — an existing clone is never touched, re-fetched, or reset. A path
  that exists but isn't a git repo is reported and left alone.
- **Access-aware** — reachability is probed for every missing repo *before* any
  cloning starts, so the run can't half-finish against an auth wall. Repos the
  current git credentials can't reach (e.g. `getrembrand/*` once that org access
  goes away) are logged and skipped; the install still exits 0.
- **Parallel** — probes and clones both fan out, 8 jobs at a time.
- **Crash-safe** — clones land in a scratch path and are renamed into place, so an
  interrupted run never leaves a half-populated directory behind. Leftover scratch
  dirs from a previous run are swept at the start of the next one.

To add or remove a repo, edit the `REPOS` array at the top of `install_repos.sh`.

| Env var | Default | Purpose |
|---|---|---|
| `GITHUB_DIR` | `~/src/github` | Where clones land |
| `REPO_CLONE_JOBS` | `8` | Max concurrent git jobs |

Run it on its own at any time:

```bash
bash ~/dotfiles/install_repos.sh
```

### macOS preferences (`install_macos_defaults.sh`)

No-ops entirely on Linux. Every setting is applied through a helper that compares
the stored value *read-back against read-back* — which sidesteps the type-coercion
traps (`-bool true` reads back as `1`, `-float 1.0` as `1`) — so it knows whether a
key genuinely moved.

**Dock** — right-hand side, auto-hide on, zero delay and zero animation.
`killall Dock` is a visible restart, so it fires **at most once per run, and only
if one of the four Dock keys actually changed**. A re-run with everything already
correct leaves the Dock process untouched.

**Key repeat** — `InitialKeyRepeat` 10, `KeyRepeat` 1 (in 1/60 s ticks: ~167 ms to
the first repeat, ~17 ms between repeats). The two surfaces that control this are
**independent stores**, and neither alone is enough:

| Store | Applies immediately | Survives reboot |
|---|---|---|
| `defaults write -g …` | ✗ — not read mid-session | ✓ |
| `hidutil property --set` | ✓ — live and session-wide | ✗ |

Confirmed empirically, not assumed: deleting both `NSGlobalDomain` keys left
`hidutil` reporting its previous values unchanged, and writing them back did not
move the live value.

So the coverage is split in two, and **no logout or manual re-run is needed at any
point**:

- **This session** — `install_macos_defaults.sh` writes the preference *and*
  pushes it live via `hidutil`.
- **Every session after** — the `com.taylor.keyrepeat` LaunchAgent re-reads that
  same preference at login and applies it. See
  [`src/launchd/README.md`](src/launchd/README.md).

The preference is the single source of truth; the agent hardcodes no rate, so
changing it in one place is enough. Units differ between the stores — ticks vs.
nanoseconds — and the conversion is done with integer math so it matches what
`hidutil` reports back exactly (10 ticks is 166666666 ns, *not* 10 × 16666666).

Run it on its own:

```bash
bash ~/dotfiles/install_macos_defaults.sh
```

### Wallpaper (`install_wallpaper.sh`)

Sets every desktop to `assets/wallpaper.webp`. macOS only.

Setting the picture is a visible flash on every space, so the setter is gated on real
change: System Events is asked what each desktop is *currently* showing and the run
no-ops unless at least one differs.

The path is normalized to its physical location first. System Events echoes back
verbatim whatever path it was set with — it does not resolve symlinks — so without
normalizing, a run through `~/dotfiles` and a run from the real checkout would each
see the other's path as a mismatch and re-set it, flip-flopping forever. Normalizing
means both entry points converge on the same string and every run after the first
does nothing.

A missing asset, or a System Events refusal (Automation permission not granted yet),
is logged and still exits 0. Point `WALLPAPER` at another image to override.

```bash
bash ~/dotfiles/install_wallpaper.sh
```

## 📁 Structure

```
.
├── install.sh              # Machine setup entrypoint (safe to re-run)
├── install_zsh.sh          # zsh install + bash/profile auto-exec hooks
├── install_brew.sh         # Homebrew + image/video formulae (macOS only)
├── install_repos.sh        # Clones the expected GitHub repos into ~/src/github
├── install_macos_defaults.sh # Dock + key-repeat prefs (macOS only)
├── install_wallpaper.sh    # Desktop wallpaper from assets/ (macOS only)
├── assets/                 # Static assets (wallpaper.webp)
├── src/launchd/            # User LaunchAgents (mcp-tokens, docker-prune, keyrepeat)
├── .zshrc                  # Template .zshrc (copied to ~/ on first install)
└── src/
    ├── index.sh           # Main loader (sources all subdirectory files)
    ├── aliases/           # Alias definitions (*.sh files)
    ├── exports/           # Environment variables (*.sh files)
    ├── functions/         # Shell functions (*.sh files)
    ├── hooks/             # Shell hooks (*.sh files)
    └── path/              # PATH modifications (*.sh files)
```

## 🔄 How Auto-Update Works

1. **On shell startup**: `.zshrc` checks for repo updates (every 5 minutes, in background)
2. **If updates found**: Silently pulls latest changes from GitHub
3. **Always sources**: `src/index.sh` which loads all your configs
4. **Important**: Background updates complete after the shell loads, so changes appear in the **next** new terminal

### Getting Updates Immediately

After pushing changes to GitHub, you have two options:

**Option 1 - Reload in current shell:**
```bash
reload_dotfiles  # or use the alias: dr
```

**Option 2 - Open a new terminal:**
```bash
# Just open a new terminal tab/window
# Updates will be pulled automatically (if 5+ minutes have passed)
```

## ✍️ Making Changes

### Typical Workflow

1. Edit a file in `src/` (e.g., add an alias to `src/aliases/common.sh`)
2. Commit and push to GitHub
3. In your container, run `reload_dotfiles` (or `dr`) to apply changes immediately
4. Or wait 5+ minutes and open a new terminal

### Files that live-update (edit these!)
- `src/aliases/*.sh` - Add/modify aliases
- `src/exports/*.sh` - Environment variables
- `src/functions/*.sh` - Custom functions
- `src/hooks/*.sh` - Shell hooks
- `src/path/*.sh` - PATH modifications
- `src/index.sh` - Loader logic

### Files that DON'T live-update
- `.zshrc` - Only copied once during initial setup (local changes preserved)
- `install*.sh` - Only run when you run them

## 🎯 Customization

### Add a new alias
Create `src/aliases/myaliases.sh`:
```bash
#!/bin/zsh
alias deploy='npm run deploy'
alias dev='npm run dev'
```

### Add environment variables
Create `src/exports/myenv.sh`:
```bash
#!/bin/zsh
export MY_VAR="value"
export PATH="$HOME/bin:$PATH"
```

### Change update interval
Edit `.zshrc` and modify:
```bash
CHECK_INTERVAL=300  # Change to desired seconds
```

## 🔧 Advanced

### Force immediate update
```bash
reload_dotfiles  # Pulls latest changes and reloads the current shell
```

Or force update on next shell startup:
```bash
rm ~/.dotfiles_last_check  # Bypasses the 5-minute interval
```

### Repo location
Set custom location before running install:
```bash
export DOTFILES_REPO_PATH="/custom/path"
bash install.sh
```

## 📝 Notes

- The system uses zsh-specific syntax in `src/index.sh` for efficient file loading
- All `*.sh` files in src subdirectories are automatically sourced
- Update checks run in background to keep shell startup fast
- Git operations are silenced to avoid noise during normal shell use
