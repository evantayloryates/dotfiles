# Session-owned production data and provisional composition

Taylor's direction: the session is the durable production workspace. Agents
control and orchestrate recording needs, inspect states and select useful
material. The service owns artifact bookkeeping, provenance and timing joins.
An agent should not have to remember a separate mapping/build step to make its
session usable for composition.

## Delivered in adapter 0.20.1

Every successful `record_export` already generates its exact frame/time manifest
automatically, publishing it alongside the media as `<export>.source.json`.
Its reply includes `derivative_source`. The native exporter publishes success
only after the output and map validate. No `export_time_map` call is necessary
to create, save or refresh that data. Completed exports are immutable; a new
export gets its own map rather than rewriting an earlier artifact's history.

`session_show` and `smart-record session <id>` now include `bundle`: a compact
live inventory of session/event files, each recording's current native state,
unfinished-work flags, source journal, recording manifest, video, exports and
their saved timing-map paths. Each read refreshes discovery; an export published
after the last read appears on the next read. Exact rows stay in private files.
There is no background polling, repeated media processing or extra agent tool.

The view includes an observation time and explicit scan budgets/truncation.
`bundle.complete` means inventory coverage, not production completion. Artifact
availability means nonempty regular files exist; it does not validate pixels,
map contents, journals or encoding success. Native recording state and existing
source health queries remain authoritative for their respective scopes. The
filesystem/native readback is not atomic. A missing or oversized map stays
explicit. Capture and export files are inventoried; provisional cursor outputs
still live at the paths returned by `cursor_render`, outside the session tree.

`export_time_map` remains an optional precision-query convenience: for example,
map a newly selected click at parent time 12.347s into an existing trimmed GIF's
rounded presentation clock, or report that the click is outside that export.
The query avoids loading a potentially large map into agent context or asking
agents to implement rational time conversion. It reads saved data; it is not a
required lifecycle step. The official compositor should invoke this internal
mapping logic itself when resolving recipe events. Review public tool retention
then, based on whether independent inspection still has value.

## Explicit provisional interfaces

`record_export` and `cursor_render` are useful delivered **placeholders for the
official composition interface**. They remain callable. MCP descriptions and
success receipts mark them provisional. Neither establishes the preferred
recipe-book schema, visual style, final-master format or future tool names.
The word `final` in cursor rendering selects encoding quality only.

When official session composition tools become usable, review both tools as a
required integration step: migrate useful export/mapping/renderer internals;
choose replacement, retirement or an explicitly documented compatibility role;
provide a migration path for saved recipes; remove superseded tool descriptions
and runbook examples; verify tool discovery and retained artifact readability.
Do not leave two undocumented competing composition interfaces indefinitely.

## Ready follow-up: official session workspace and composition contract

Design this with Taylor's preferred recipe book. This is planned work, not an
installed capability or a reason to restart capture qualification.

- Give scenes/sequences, source takes and derived jobs durable identities and
  dependencies in one versioned session manifest. Preserve prior revisions and
  exact original clocks; map source-to-scene-to-master time inside the service.
- Register artifact and timing-map references on successful job publication,
  including cursor outputs. Distinguish queued, running, published, failed and
  uncertain states; file presence alone must not become render success.
- Expose compact revision/change notifications and wait hooks so directors can
  continue other work and react when a source or render becomes usable. Keep
  large frame/event arrays in private artifacts and use bounded queries.
- Let recipes select sources, events, arrangement and output effort. Resolve
  clocks, gaps and mapping availability automatically; keep provenance and
  uncertainty through previews and final masters. Never invent missing frames
  or source coverage to satisfy a recipe.
- Complete the provisional-tool review above before calling the official
  composition integration complete. Public `export_time_map` remains optional
  unless this review establishes a better unified inspection interface.
