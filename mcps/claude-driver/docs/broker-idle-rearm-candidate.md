# Broker IDLE reconciliation — implementation and retained candidate

Prepared October 6 at 23:35 Eastern; implemented during Taylor's resumed
qualification turn. V7 explicitly reconciles after IDLE; the waiter additionally
keeps a nine-minute deadline from the last native list across requests, returning
IDLE before claiming work. The twelve-minute freshness guard remains unchanged.
Intermediate-source native IDLE/list/rewait reused one job at
03:52:17.280Z / 03:52:18.832Z / 03:52:20.377Z. Final-source IDLE/list/rewait at 04:03:06.882Z / 04:03:09.251Z /
04:03:10.919Z reused job922e4a9e, preserved PID71262 and created no duplicate.
Ten-minute observation retained fresh evidence, unchanged source and zero input
filters; no natural governor pressure, so the full pressure check remains false.
See resume.md for report paths. Historical candidate follows.

The owned broker's current-process journal records its first wait returning
`IDLE` at 03:34:06.557Z and the next wait starting at 03:34:08.879Z, without
an intervening CronList. Its last list remains 03:24:59.974Z. The service
correctly refuses that evidence once twelve minutes old. This is evidence
freshness loss, not proof that the job was deleted or the broker evicted.

The standing v6 maintenance section requires reconciliation after every IDLE,
but step 2 says `IDLE → go back to step 1 immediately`. The trace supports
this conflict as a cause; one observed model behavior does not prove causality.
Preserved failure: `<state>/pressure/native-idle-rearm-2026-10-07.json`.

Proposed change to the broker template, for a controlled subsequent load:

```diff
-   - `IDLE` → go back to step 1 immediately.
+   - `IDLE` → perform the maintenance reconciliation above before waiting:
+     call CronList, reuse the exact existing job or create it only if absent,
+     and immediately CronList after any successful creation. Only after the
+     native result is available, go back to step 1. Never skip this list.
```

Keep the existing maintenance prompt, cron, allowlist, permission mode and
request/checkpoint format. Do not loosen the evidence freshness limit to hide
the missing list, recreate an existing job, or spoof sender identity.

For future handoffs, reconcile broker activity and any unresolved dispatch. The
previous hot protocol upgrade was ignored, so changing a file or sending a
new version alone does not establish that the live model loaded this fix.
A report-review heartbeat still forbids cross-chat sends and competing wakes.
The explicitly resumed user turn authorized controlled warm qualification. Verify the actual loaded behavior, same PID, one owned job, CronList
between IDLE and the next wait, and fresh evidence beyond twelve minutes.
Retain the failure if those checks do not pass. Natural governor pressure
survival remains a separate requirement.
