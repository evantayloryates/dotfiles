# Lease-scoped console, fetch and error metadata

The development adapter gives agents bounded event metadata without changing the
app's layout. Original console functions and React Native's global error handler
still run with their original arguments and receiver. Their return values and
thrown errors are preserved. The adapter never reads console arguments or the
runtime error object.

Each owning session begins empty and ends by clearing all records and counters.
Console, fetch completion and runtime/protocol errors each have a 64-record ring.
Overflow counts describe lost records; a ring is not an audit log. Publication is
coalesced with a 200 ms timer. Old fetch completions and already queued publication
callbacks cannot enter a newer session. Observer, clock and scheduling failures
are isolated from application fetch execution. An unavailable clock produces a
null duration instead of preventing the request.

## Metadata boundary and transport behavior

- Console: level, sequence and at most three numeric line/column positions.
- Fetch: allowlisted method, status, duration, failure flag and sequence; active
  requests have a count only. No URL, headers, body or response consumption.
- Errors: fatal boolean, sequence and the fixed source `runtime` or `protocol`.
  No message, name, stack, error object or handler argument is exported.

Only global `fetch` is observed. A 404 or 500 is a fulfilled fetch with its HTTP
status, not a rejected promise. Cancellation, timeout and transport rejection are
all recorded as failed with null status; the agent cannot distinguish their
causes from this metadata. Requests are never retried or aborted by telemetry.
An unresolved request stays in-flight until it settles or the session ends;
telemetry does not introduce a network timeout. The readiness probe owns its
separate timeout and AbortController.

Idle fetch calls return the original promise unchanged. Active observation
returns a chained promise that preserves the resolved response or rejected error
identity, including unhandled rejection behavior. Promise-object identity is
different while active. Methods with accessors or unknown request shapes are
reported as `OTHER`; instrumentation does not invoke the method getter itself.
Later third-party console, fetch or error-handler wrappers are preserved during
disposal rather than overwritten.

## Host verification

Run from the dotfiles checkout:

```sh
node --test src/ios-agent/tests/test_telemetry.cjs
```

Twelve tests pass in the 8 October 2026 verification pass. They include a real
loopback HTTP server and Node's actual fetch for 200/404/500, response-body
availability, caller cancellation and caller timeout; a separate Node process
checks unhandled rejection behavior. Other gates cover original call arguments,
receiver, return/throw and error identity, privacy with hostile argument proxies,
numeric positions, bounded rings, detached snapshots, idle and new-session reset,
late fulfillment/rejection, queued timer fencing and diagnostic failure isolation.
These tests qualify the JavaScript observer logic, not the installed iPhone's
Hermes fetch implementation or React Native global-handler chain.

## Installed-phone gates and exact currently supported operations

Keep results private and use a new lease file for each session. On a freshly
built/installed runtime containing the current adapter:

1. Acquire a lease and request `state`. Assert JavaScript readiness, the expected
   bundle marker and active diagnostics with fresh empty rings before the probe.
   Ambient app activity can legitimately produce records, so compare before/after
   counters rather than requiring an always-empty active app.
2. Run the fixed command below once. It logs one synthetic warning and submits
   only `query IOSAgentReadiness { __typename }` to the configured local backend.
   Poll `state` until the registered probe reports ready and HTTP 200. Assert
   warning count advanced and a POST/200 fulfilled completion appeared. Assert
   no messages, URLs, headers, bodies or raw error fields are present.

   ```sh
   /Users/taylor/dotfiles/bin/ios-agent action diagnostics-probe \
     --lease-file '<private-current-lease-file>' \
     --output '<new-private-probe-result-file>'
   /Users/taylor/dotfiles/bin/ios-agent action state \
     --lease-file '<private-current-lease-file>' \
     --output '<new-private-state-file>'
   ```

3. Release and wait for no lease, no React inspection process, no pending cleanup
   and no glow. Acquire a fresh lease and prove records from the earlier probe
   are gone; do not reuse its retired capability.
4. Repeat the successful probe on cellular/Tailscale with USB unplugged and
   Wi-Fi disabled by the qualified phone-local shortcut actuator. Restore Wi-Fi
   after the run. Tailnet reachability alone does not pass the app-response gate.

The fixed `diagnostics-matrix` command now runs an opt-in development acceptance
fixture. It accepts no arguments. Metro serves only fixed synthetic 200/404/500
responses and a one-second delay; slow requests are capped at two concurrent
connections. It neither reads app data nor proxies caller-selected URLs. The
matrix uses the actual device global fetch transport through an isolated instance
of the same telemetry adapter. It checks status/body availability, caller abort,
timeout, late-completion fencing, history reset and original handler restoration.

Its synthetic ErrorUtils object preserves the real app handler untouched and
checks the observer's forwarding on an isolated sentinel handler. That is narrower
than invoking React Native's installed crash-reporter chain: the report explicitly
labels its scope `isolated-adapter-with-device-global-fetch`. No fatal app exception
is triggered. Host real-HTTP fixture and lease-cancellation tests pass; the exact
installed-phone matrix passed all ten checks on the current adapter, recorded in physical-resume-smoke.json.

```sh
/Users/taylor/dotfiles/bin/ios-agent action diagnostics-matrix \
  --lease-file '<private-current-lease-file>' \
  --output '<new-private-matrix-ack-file>'
```

The native acknowledgment means queued to JavaScript. Poll `state` for
`telemetryFixture.passed` and every fixed check; a queued acknowledgment alone is
not success. Ending the lease aborts owned requests/timers and fences old fixture
completion from a newer lease. Release in `finally`, then verify native cleanup.
Captured fetch references, native networking and WebSockets remain outside this
adapter. Do not add arbitrary URL or eval control to pass missing coverage.

For every physical result record the exact adapter/bundle fingerprint, current
transport, assertions and cleanup. Keep older installed results separate from
newer host-only changes. That earlier bounded code-verification pass did not access a physical phone. Later physical global-fetch matrix and the newest unplugged GraphQL gate passed; the actual crash-reporter chain remains outside the isolated sentinel-handler scope.
