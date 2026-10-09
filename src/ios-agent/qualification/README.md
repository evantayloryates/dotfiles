# Historical iOS agent qualification scripts

`archive-2026-10-08/` preserves 15 one-off scripts that were written under the private iOS agent runtime state during device and web qualification. They are archived source, not installed services or a reusable test suite. Several scripts expect their former neighboring private receipts and can mutate local development reports or device state; do not run them from this directory without reviewing and adapting their inputs.

The live iOS agent source and launch-agent installer remain under `src/ios-agent/`. The Metro app source remains in the Kickoff mobile checkout. `~/Library/Application Support/ios-agent/` holds runtime state, generated adapters, local receipts, and build products; `~/Library/LaunchAgents/` contains installed invocation plists.
