# claude-driver scenarios

One JSON file per scenario under `<tier>/`, run by `node scripts/smoke.mjs
[tiers] [--attended]` through the MCP launcher as a non-desktop harness.
Ground truth is always the driver's own disk reads (`get_session`,
`window_state`), never screenshots. Every session a scenario creates lives in
`<state>/probe/smoke-<ts>/`, is archived in `cleanup`, and is queued for the
single batched delete card in t6.

| Tier | Covers |
|------|--------|
| t0 | read-only |
| t1 | create / import |
| t2 | broker ops |
| t3 | navigation and focus restore |
| t4 | fork and unarchive |
| t5 | Tier C (attended only) |
| t6 | destructive: gates, delete card (attended only) |

```json
{
  "tier": "t2",
  "description": "…",
  "never_run_unattended": false,
  "steps": [
    {
      "name": "optional label",
      "tool": "rename_session",
      "args": { "session": "${sid}", "title": "x ${TS}" },   // ${var} from save, plus SCRATCH, STATE, TS, HOME
      "save": { "sid": "sessionId" },                       // dotted path into the result
      "expect": {
        "error": false,                                     // default false
        "equals": { "verified": true },                     // dotted path → exact JSON value
        "matches": { "delivery": "delivered|queued", "$text": "regex on raw text" }
      },
      "continue_on_fail": false
    }
  ],
  // { "tool": "_sleep", "args": { "ms": 5000 } } pauses (e.g. let a turn finish before archiving)
  "cleanup": [ { "tool": "archive_session", "args": { "session": "${sid}" } } ]
}
```
