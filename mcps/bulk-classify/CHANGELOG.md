# Changelog

## 2026-10-18.001

- Moved into the MCP fleet as `bulk-classify` (formerly the `classifier`
  server inside the ZDR harness). Tool names are unchanged (`classify_*`);
  the server is now registered as `bulk-classify`. The ZDR harness still
  mounts it under its `classifier` key, and the `classifier` CLI still works.
