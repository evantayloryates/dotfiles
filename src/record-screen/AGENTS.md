# Qualification progress checklist

Taylor requested a maintained checklist alongside the capture-readiness report.
This applies to recorder and related shared computer-use qualification work.

- Read `qualification/checklist.json` and the latest checkpoint in
  `qualification/PRODUCTION-GOAL.md` when resuming this work.
- Whenever acceptance evidence changes an item's state or materially changes
  its limits, update its canonical checklist entry before ending the stage.
  Do not wait for Taylor to request another checklist refresh.
- Use `qualification/checklist.py update` to record the status, compact evidence,
  next acceptance step and any changed scope/evidence anchor. The command saves
  transition history and immediately republishes the checklist page.
- Completed means verified for the written scope; isolated candidate tests do
  not complete installation, universal behavior or final production readiness.
  Preserve failed evidence with `needs_retest`; distinguish partial, pending and
  deferred work. Do not silently promote a gate after unrelated tests pass.
- Add newly discovered acceptance gates with stable IDs. Keep existing IDs and
  transition history; do not delete a failure to improve completion counts.
- Update the human-visible workflow state on pause/resume and the production
  note after actual release/readback. This ledger does not control the app goal
  and cannot authorize UI work or override a user-requested pause.
- Keep raw footage, input rows and crash reports out of the checklist and Git.
  Link to the corresponding report evidence section, with compact scope/limits.
- The published pages belong in the existing directory:
  `/Users/taylor/src/docs/html/record-screen-strategies/`.
  `capture-readiness.html` links to `checklist.html`; the checklist links back.
- `qualification/render-report.py` republishes both pages. Verify schema,
  state counts, navigation targets and published data revision after updates.
  Follow the existing verification limits; do not bypass a browser refusal.

See `qualification/README.md` for update/render commands. Follow the repository's
commit/push policy at each stopping point.
