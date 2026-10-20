# Private host invocation files

The real Codex and Claude configuration files live here, with symlinks at their app-required paths. They contain private app state and are intentionally ignored by Git. Canonical shareable fleet registrations remain in ../client-registrations.json, generated from mcps/*/mcp.json. Claude desktop's config is app-owned and is a plain file, not a symlink. Do not force-add these private files. Run the registration installer to update the resolved files without replacing their symlinks.
