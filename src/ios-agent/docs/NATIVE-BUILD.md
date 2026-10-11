# Durable native DEV builds through MCP

`ios_build {action:"plan"}` describes the fixed recipe.
`ios_build {action:"start"}` starts one signed generic-iOS DEV build using the
existing private `dev-runtime.json` checkout and tailnet endpoints. It returns a
`jobId` immediately. Poll `{action:"status",jobId}` from this or another fresh
MCP connection. Status without a jobId lists ten recent jobs. Never replay a
start after an uncertain response: inspect status first.

The job uses the existing `build_app.py`, with a new private derived-data and log
directory under `~/Library/Application Support/ios-agent/build-jobs/<jobId>`.
It snapshots validated runtime configuration, checks the built DEV identifier,
agent symbols, callback registration, signature and unchanged native build
sources. Its terminal result includes an executable SHA256; that is specifically
the executable, not a claim that every bundled resource was hashed.
Require `state:"completed"`, `ok:true`, verified signature/agent binary/product,
and `sourceChangedDuringBuild:false`. Private detailed logs/manifest remain
outside Git; routine MCP results contain structural evidence only.

A process-held global build lock serializes cooperating jobs, including across
MCP reconnects. The worker and build consumer retain the lock. The 20-minute
build deadline stops its dedicated process group, with a bounded kill fallback;
an absent worker without a terminal receipt is **unconfirmed**, not successful.
Inspect that state before starting more work. This lock does not coordinate
unrelated manually invoked Xcode builds; source-change detection remains useful.

No phone lease, install, launch, XCTest, sudo, shared service restart, arbitrary
command/path/checkout, or periodic suite is part of this tool. MCP EOF does not
cancel an explicitly requested build. Build success does not prove the installed
phone identity or readiness. **Installation is separate and is now exposed through `ios_install`;
its signed-identity and physical Home/readiness qualification is recorded below.** The existing signed build/install
workflow remains available for that subsequent, explicitly chosen step.

Use build jobs for native adapter changes or required delivery, not ordinary
web/JS edits. Those should keep using the live network development workflow.

Each new start uses fresh derived data for isolation, so it can take a full
cold build. Keep it off the normal JS/web edit path. Build products and logs are
retained for the following install/diagnosis step; they are not the one-hour rich
capture buffer and are not automatically deleted while delivery is pending.

A terminal failed job can be explicitly retried with `{action:"retry",jobId}`.
This creates a new job/receipt/log while reusing only that failed job’s fixed
derived data if the runtime snapshot is unchanged. Running or uncertain jobs
cannot be retried. New terminal success requires a fresh build manifest; an old
manifest cannot make a failed retry pass. This avoids repeating compilation for
a known bundling/environment failure without replaying an uncertain install.

Real signed-build qualification: native-build-mcp-2026-10-10.json. A fresh MCP
connection recovered the running job; a competing start was refused. The first
build failed at source-map output because GUI clients lacked TMPDIR. The fixed
private temp directory allowed an explicit terminal-failure retry to finish in
50.4 seconds; an independent codesign readback passed. No install occurred.

A failed receipt that has a newer job sharing its derived data cannot be retried.
Use the latest failed receipt or start fresh. This prevents an old retry from
overwriting a newer completed product prepared for delivery.

## Guarded delivery candidate

New builds receive a unique signed `IOSAgentDeliveryId` in their built Info.plist.
`ios_install` accepts their completed jobId and retains a durable installId receipt.
It validates the product again under the phone owner, checks actual lock state,
installs once, launches DEV once, and checks a fresh matching running identity.
Status recovers receipts across clients. Unknown inputs are never replayed.
Use a 180-second client request timeout. A dead interrupted handler is unconfirmed;
inspect current device state before deciding any next action.

Installation is still separate from JS readiness and cleanup. After `ios_begin`,
inspect capabilities/React. The new explicit native Home handoff clears control
before own-app suspension; physical qualification is recorded separately.


Physical delivery passed: signed stamp matched both fresh host registration and
native capabilities; React readiness and 986 components reconstructed. App-owned
Home was independently viewed, idle passed, paired relaunch reached ready again,
then Home/idle passed a second time. No sudo, XCTest or Mirroring was used.
`ios_begin nativeOnly=true` verifies foreground native capabilities while leaving
ready=false, allowing diagnosis/Home when JS startup has not registered. Normal
begin still requires app/domain readiness. Start React inspection with ios_react
status before asking ios_verify for react-tree. See the physical receipt.

## Updated product prepared — 11 October

Job `e9f862ef121c447987d7fed37767aace` completed a signed generic-device
DEV build in249.2seconds. The new bridge, refresh diagnostics and capture factory
were included with stable source hashes. Independent signed-product validation
passed, and a fresh MCP connection recovered the completed job. No installation,
phone input, owner acquisition or XCTest startup occurred.

Use this completed job for the subsequent guarded install rather than building
these unchanged sources again. The receipt is
`native-build-prepared-2026-10-11.json`. Installed identity, React readiness and
new adapter qualification remain separate physical gates.
