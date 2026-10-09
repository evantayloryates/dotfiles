# Hammerspoon in dotfiles

The complete active Lua, AppleScript, and SkillPicker source from the former
`~/.hammerspoon` checkout lives here. `~/.hammerspoon` is a symlink to this
directory, which keeps Hammerspoon's normal configuration path and the helper's
existing launch paths working. `install.sh` installs or checks that symlink; it
refuses to replace a real directory automatically.

The previous standalone repository had uncommitted work. This directory is a
copy of that working tree, including those changes and untracked source. The
18-commit history is retained in `legacy-history.bundle`. Logs, Python bytecode,
and `.DS_Store` files were excluded. `SkillPicker.app` is kept with its Swift
source and `SkillPicker/build.sh` so the current helper works immediately after
the move and can be rebuilt.

To verify a local install, run `./install.sh`, then reload Hammerspoon and
check `hs.configdir`, `SkillPicker`, and the catalog worker. Changes to this
directory are now committed with dotfiles rather than the old standalone repo.
