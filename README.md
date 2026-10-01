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

**Finder** — `AppleShowAllFiles` on, so dotfiles and other hidden entries are
visible. Gated exactly like the Dock: `killall Finder` closes every open Finder
window, so it only fires when the key actually moved.

**Modifier keys** — Caps Lock → Control for each connected keyboard, matching
System Settings → Keyboard → Keyboard Shortcuts → Modifier Keys. Setup detects
keyboard vendor/product IDs, preserves other modifier mappings, and writes
`com.apple.keyboard.modifiermapping.<vendor>-<product>-0` in the current host's
global preferences. `activateSettings -u` applies the saved mapping immediately;
macOS retains the preference across logins and reboots. Run setup again when
adding a different keyboard. Requires `python3` (provided by Xcode Command Line
Tools on this Mac).

To apply only the keyboard mapping:

```bash
python3 ~/dotfiles/src/python/macos_keyboard.py
```

The [Apple key-code reference](https://developer.apple.com/library/archive/technotes/tn2450/)
defines Caps Lock as `0x700000039`. On macOS 26.5.1, choosing Control in System
Settings writes `0x7000000E4` (Right Control). The persistent preference and live
`HIDEventServiceProperties.HIDKeyboardModifierMappingPairs` were checked against
the UI on that version. A standalone `hidutil UserKeyMapping` is a separate,
temporary mapping, so setup uses the persistent Modifier Keys preference.

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

### Save the clipboard with `cs`

`cs [name]` (or `clipsend [name]`) saves clipboard content to `~/Desktop`,
prints the saved path, and copies that path back to the clipboard.

```zsh
cs my-json-results  # Valid JSON -> ~/Desktop/my-json-results.json
cs                  # Valid JSON -> ~/Desktop/clipsend-HHMMSS-N-lines.json
cs notes.txt        # Explicit extension wins; content stays unchanged
```

Extension inference runs for both custom names without an extension and the
generated default name. It preserves the original bytes, including whitespace,
line endings, and BOMs. Existing names get `-1`, `-2`, etc. before the extension.
A leading dot alone is not an extension (`.notes` can become `.notes.json`);
a trailing dot is replaced by the inferred suffix (`notes.` becomes `notes.json`).

The ordered detection strategy is:

1. Recognizable binary signatures: PNG, JPEG, GIF, TIFF, WebP, PDF, ZIP, gzip,
   and WAV. These identify the format/container; they do not validate the file.
2. Fully parsed JSON (including scalar values), then JSONL with at least two
   object/array records, one per line. Invalid JSON and nonstandard `NaN`/`Infinity`
   do not qualify.
3. Parsed XML/SVG and HTML documents or recognizable XML-compatible HTML fragments.
   XML entity declarations are rejected. HTML document markers also identify HTML
   that does not follow XML syntax.
4. RTF, vCard, iCalendar markers; recognized shell, Python, Node, Ruby, Perl, or
   Fish shebangs; parsed TOML when Python 3.11+ is available.
5. Markdown with a closed fenced code block, or a heading plus another Markdown
   construct.
6. Parser-backed formats: unified diffs (`.diff`, including matching hunk counts),
   TypeScript (`.ts`), JSX (`.jsx`), and TypeScript with JSX (`.tsx`), GraphQL
   operations/schema definitions (`.graphql`), common PostgreSQL/MySQL/SQLite/
   T-SQL statements (`.sql`), and CSS stylesheets (`.css`). Complete syntax must
   parse. These checks do not execute code, access databases, or check a GraphQL
   schema. CSS needs declaration blocks; incomplete blocks are rejected. SQL
   dialect extensions outside the parsers' support can fall back to text.
7. Rectangular TSV/CSV with at least two rows and two columns. CSV additionally
   requires a unique, simple header and avoids typical comma-separated prose.
   Headerless CSV and ambiguous prose can intentionally fall back to text.
8. YAML (`.yaml`) must parse with no errors, duplicate keys, unresolved aliases,
   or unknown tags. It needs a collection plus structural evidence: multiple
   mapping entries, nested collections, typed values, block scalars, flow syntax,
   or an explicit document marker. A lone `Note: remember groceries` and plain
   shopping lists remain `.txt`. Multi-document YAML is supported; aliases are
   inspected without expansion. Malformed JSON is not reclassified as YAML.
9. Source snippets without shebangs: Python (`.py`) must parse and include a
   recognizable construct such as an import, function/class, comprehension, or
   `print(...)`. JavaScript (`.js`) uses declarations, arrow functions, imports,
   exports, and `console` calls. Ruby (`.rb`) uses `puts`/`require` with strings,
   accessors, and `def`/class/iterator blocks. Shell (`.sh`) uses recognizable
   command forms, exports, functions, and `if`/loop blocks. Comments and quoted
   content do not supply language signatures. JavaScript is also syntax-checked
   when the parser dependencies are available. Ruby and shell detection remains
   heuristic. Valid Python statements can take precedence over a YAML match;
   code embedded in YAML values stays YAML.
   Conflicting language signals and ambiguous snippets such as `hello(world)`
   fall back to `.txt`. Shebangs remain authoritative, and structured formats
   and Markdown take precedence over source heuristics. JSX-specific expressions,
   components, fragments, or React attributes distinguish standalone JSX from
   ordinary HTML/XML before XML parsing. Plain HTML and SVG keep their extensions.
   Ambiguous TypeScript/GraphQL enums and YAML/GraphQL aliases fall back to `.txt`;
   conventional built-in type/value spellings can disambiguate them.

Everything else gets `.txt`. Detection failure also falls back to `.txt`.

Text inference examines complete content up to 16 MiB. Larger content uses only
binary signatures or `.txt`; a partial JSON/XML prefix never counts as valid.
The original detectors use Python's standard library. The extended detectors use
Node.js and pinned dependencies in `src/javascript/package-lock.json`: Babel's
parser, `yaml`, `graphql`, `css-tree`, `node-sql-parser`, and `diff`. Install them
once on a new checkout, or after dependency updates:

```bash
npm ci --prefix ~/dotfiles/src/javascript --ignore-scripts
```

No installation or network access occurs during `cs`. Parser calls have a
three-second timeout and suppress diagnostics that might contain clipboard data.
If Node or these dependencies are unavailable, the original detectors still work
and content that cannot be recognized falls back to `.txt`.

Finder files keep their source extensions when renamed without one; extensionless
files use inference, even without a custom name. Directories keep their names.
Multiple Finder files ignore a custom name. Clipboard images retain the existing
behavior: PNG by default, with explicit `.jpg`/`.jpeg`, `.tif`/`.tiff`, `.gif`,
or `.bmp` selecting conversion. Unsupported image suffixes get `.png` appended.
Finder files take precedence over text, and text over an accompanying image.

The shell entry point is `src/functions/clipsend.sh`; content inference is in
`src/python/clipsend.py` and `src/javascript/clipsend-infer.js`; macOS pasteboard access is in
`src/javascript/clipsend-pasteboard.js`. Reload an existing terminal with
`source ~/dotfiles/src/functions/clipsend.sh`, or open a new terminal.

Run the inference and isolated shell regression tests (without changing the
system clipboard or your Desktop):

```bash
python3 -B -m unittest discover -s src/python/tests -p 'test_clipsend.py' -v
```

### Path functions

Edit `src/python/pathfuncs.py` to add directory/file helpers and aliases. For
example, `p('home', '~', aliases=['Home'])` makes both `home` and `Home` change to
your home directory. Run `paths` to list helpers, then open a new shell or run
`reload_dotfiles` after editing the configuration.

- Paths beginning with `~`, `$HOME`, or `${HOME}` use the invoking shell's home
  directory. `$DOTFILES_DIR` and `${DOTFILES_DIR}` use the active dotfiles checkout.
  These roots resolve on each invocation, so generation does not bake in a username
  or checkout location. Absolute paths remain absolute; `~user` uses Python's
  normal named-user expansion when generating. Other environment variables are
  treated literally.
- Custom command templates use `<path>` for the safely quoted target and `<args>`
  for separate arguments (including spaces and empty arguments). Use
  `<args_text>` only for commands expecting all arguments joined into one string.
  Do not add quotes around these placeholders; suffixes such as `<path>/scripts/run`
  can be appended directly. Command templates themselves are trusted shell code.
- Commands such as `home git status` run inside the target and restore the caller's
  directory afterward. An explicit directory change, such as `home cd`, stays put.
  For file targets, passthrough commands use the file's parent directory, checked
  at invocation time. Missing targets report an error without running the command.
- Compound helpers inherit their parent's default and its custom handler when
  no child default is specified. The handler uses the child's target path;
  an explicit child default or handler takes precedence. For example, `skills`,
  `skills cc` (Claude), and `skills codex` each show a picker in their own folder.
  Use `skills cc cd` to change directory instead.
- The `html`, `skills`, and `conversations` pickers show the full alphabetical
  list above five recent entries, based on modification time. The newest recent
  entry is number 1, closest to the prompt. Plain selections copy an absolute
  path: the resolved HTML file, the skill's `SKILL.md` (directory fallback), or
  the conversation directory. A command after a selection, such as `1 open`,
  runs that command on the selected path. `convo`, `convos`, and `chats` are
  aliases for `conversations`; `convo cd` changes to the conversations root.

Run the generated-shell regression checks with:

```bash
python3 -B -m unittest discover -s src/python/tests -p 'test_pathfuncs*.py' -v
```

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

### Shared 1Password CLI session

The macOS `bin/op` override routes CLI calls through a persistent user LaunchAgent
so ordinary calls from different Codex tasks share one terminal authorization.
Install with `./install_op_agent.sh` (also included in `install.sh`). Source and
configuration, including shell and GUI PATH wiring, are tracked here. Existing
GUI apps need a restart to inherit the new PATH. See
[`src/onepassword/README.md`](src/onepassword/README.md) for details and tests.
