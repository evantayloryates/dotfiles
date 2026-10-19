# Framer connection learnings

- The official `@framer/agent` CLI uses a local relay and saved project
  authorization. Its `setup` command installs skills; the broker invokes
  pinned CLI commands directly, so it does not reinstall archived skills.
- A CLI session and the editor can point at different branches. Always read
  `getActiveBranch()` and require the requested branch ID before an edit.
  A browser tab can also remain on an older branch URL after switching.
- Reuse a project session while working on that project. Replacing a session
  can create another branch when auto-branching is enabled.
- Use `framer.agent.applyChanges` for canvas work when possible. Read back
  the changed nodes and branch before reporting completion. Publishing is a
  separate user-directed operation.
