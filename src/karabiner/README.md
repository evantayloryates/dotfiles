# Karabiner-Elements config

`~/.config/karabiner` links to this entire directory. Karabiner requires a
directory symlink: linking only `karabiner.json` can break change detection.
The active profile is in `karabiner.json`, and the reusable rule is in
`assets/complex_modifications/`. Karabiner's automatic backups remain local
and Git-ignored.

Run `./install.sh` here to check or install the link. It refuses to replace
another directory or a link to a different source. After moving the directory,
restart the user server once so it monitors the new path:

```sh
launchctl kickstart -k "gui/$(id -u)/org.pqrs.service.agent.Karabiner-Console-User-Server"
```
