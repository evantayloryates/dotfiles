# Pressure-test scenarios

One JSON file per scenario, under `<tier>/<name>.json`. Run with
`node scripts/pressure.mjs`; the plan is in `../docs/pressure-testing.md`.

```json
{
  "id": "t0/finder-read",            // default: <tier>/<file name>
  "tier": "t0",
  "track": "M",                       // M (mechanical), A (agentic), both
  "surfaces": ["runtime", "bridge"],  // which surfaces this scenario stresses
  "risk": "read",                     // read | write-scratch | write-app
  "raises_windows": false,            // skipped when the desktop-owner marker exists
  "never_run_unattended": false,      // skipped unless --attended
  "session": "fresh",                 // fresh (new thread per run) | reuse:<name>
  "task": "...",                      // the codex_computer_use task text
  "args": { "apps": ["Finder"], "screenshots": "last", "timeout_sec": 120 },
  "preconditions": {
    "apps_installed": ["Finder"],
    "files_exist": ["$SCRATCH/input.pdf"],
    "commands": ["test -d \"$SCRATCH\""]
  },
  "expect": {
    "status": "completed",
    "contains": ["Desktop|Finder"],   // regexes, case-insensitive, against the result text
    "not_contains": ["not approved"],
    "steps": [1, 4],                  // inclusive range of recorded steps
    "no_denials": true,
    "denied": [],                     // apps that MUST have been denied
    "screenshots_min": 1,
    "failed_steps_max": 0,
    "files_exist": [], "files_absent": []
  },
  "ground_truth": [                   // shell commands that must exit 0; $SCRATCH is set
    { "name": "file has three lines", "command": "test $(wc -l < \"$SCRATCH/note.txt\") -eq 3" }
  ],
  "cleanup": [ { "command": "rm -f \"$SCRATCH/note.txt\"" } ],
  "grade": ["..."]                    // Track A only: what the transcript reviewer checks
}
```

`$SCRATCH` is `~/.local/state/codex-bridge/pressure/scratch/`, also the
thread cwd for fresh sessions. `~` expands in file paths.

A run's verdict: `pass` when every expectation and ground-truth command
holds; `partial` when the turn completed but something did not hold;
`fail` otherwise; `blocked` when skipped. The reviewer fills `surface`,
`finding` and `follow_up` in the ledger row afterwards for anything that
is not a pass.

Rules for writing scenarios: writes go to `$SCRATCH`, a `Scratch` folder
in Notes, or a `Scratch` list in Reminders; the task text leads with a
posture line; apps are named the way Computer Use names them; every
scenario that opens or raises a window sets `raises_windows`; anything
that could touch real mail, messages, purchases or settings does not get
written.
