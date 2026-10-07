# Staged native mods gate probe

This package is not installed or enabled. It targets only the existing owned
broker and archived fixture. It registers one explicit command and performs no
automatic work, model calls, session messages, timers or permission changes.

The command calls one harmless `ccd_session_mgmt/get_session` through the mods
API without a dispatch checkpoint. Existing native admission should refuse it.
Neither an exception nor command output proves the gate ran: a live experiment
must independently verify the exact broker epoch, command ancestry, actual
PreToolUse denial, zero new model turns and unchanged fixture/settings.

The installed adapters have isolated evidence; live activation is unqualified.
Do not install globally, reload plugins, reset context or change permissions as
a workaround. Establish a scoped native loading/command path and a safe unload
before enrollment. Preserve all historic uncertain effects and release gates.

Validation without loading:

```sh
# Use resolveClaudeBinary() from the service to select the exact bundled CLI.
<bundled-cli> plugin validate /Users/taylor/src/github/dotfiles/src/claude-driver/candidates/native-mod-probe
```

Installed-admission pressure (synthetic dependencies only):

```sh
node /Users/taylor/src/github/dotfiles/src/claude-driver/scripts/mod-admission-contract-v2.mjs
```

The native warm loader asks a person for consent. The existing peer inbox does
not support SDK reload or custom-command controls. Do not write consent metadata
or impersonate human input. The function-hook reducer and downstream adapter have
different denial-order behavior in isolated tests; bind the actual loaded native
chain before claiming denial dominance. See docs/mechanical-native-route.md.
