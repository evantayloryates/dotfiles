# Progress reporting for Runner’s iPhone qualification

Canonical report bundle: `/Users/taylor/src/docs/html/iphone-link-status-update`.
Taylor reads `index.html`; keep it consistent with `report.json`.

Refresh the report after every completed verification stage, meaningful status
or blocker change, and build/install identity change; also refresh before handing
work back to Taylor. This is part of the active qualification workflow, not a
separate scheduled task.

Record the observation timestamp and exact scope. Keep historical cellular
results separate from the newest binary. Host tests, simulator gates, credential
minting and Tailscale reachability do not establish physical-phone readiness or
a complete authenticated product workflow. Promote a step only after its stated
completion gate passes. Keep deferred staging/system-control work explicit.

Copy only sanitized counts, booleans, hashes and qualification explanations to
the report’s evidence folder. Never copy credentials, private device trees,
provider errors or private logs. Verify all relative links, the 16 numbered
steps, status counts, balanced disclosure/section tags and JavaScript syntax.
Record whether visual rendering was actually checked. Preserve the page’s
expandable execution order and existing design.

Completion discipline: one passing receipt closes its finite gate. Rerun only
changed code, a new runtime/transport required by the gate, or a diagnosed failed
case. Assign broader extensions to one later step instead of reopening the
delivered baseline. Supporting suite counts do not close a product workflow.
Record failed edges and their recovery cost before choosing another approach.
