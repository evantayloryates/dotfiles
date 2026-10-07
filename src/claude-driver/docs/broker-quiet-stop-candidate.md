# Candidate: wait for service work inside the native command Stop hook

Prepared October7,02:16 Eastern. NOT implemented or native-qualified.

Update02:35 Eastern: native effects after dispatch:false/cancellation require
mechanical actual-tool admission first. The installed native gate now has scoped
positive/negative proofs; hook timeout/fault qualification and prior uncertain
effect reconciliation remain open. Final f824 full suite consumed one Stop rescue
but still ended without tools, then cleanup expired. Quiet waiting must not use
that failure as permission for repeated continuations or bypass native admission.

Pressure on4af08654 reproduced an acceptance gap at native query termination:
a first control completed, the next idle peer wake had no correlated user record
or dispatch and expired. Immediate routing bypassed a synthetic stalled receiver
chain and restored one stable-window native read, but repeated handoffs and
concurrent controls still failed. Queue-order VM proof is not root-cause proof.
Neither pointer activation nor public idle status establishes incoming readiness.

Explore a mechanical command Stop hook which waits quietly for owned durable
work before returning a fixed continuation. This could avoid inference for idle
polling and avoid needing peer input to restart every natural end-turn. It must
retain the existing native process/cwd/SID/start/version/ancestry/inventory gates,
request deadlines/cancellation, dispatch checkpoints, native result receipts,
UI quarantine, and platform permissions. No prompt/agent hook or permission allow.

Required experiment boundaries:

1. Use a separate immutable handler package and explicit service-local policy.
   Verify command-hook timeout/foreground semantics in installed source first.
2. A waiting hook has no native effects and reads no message bodies. Publish
   bounded metadata with its real helper PID/start/native ancestry; accept a
   resident marker only while that exact owned helper is verified alive.
3. Return one fixed continuation only for one exact admitted unexpired,
   undispatched durable request. Consume a unique attempt atomically before
   returning it. A continued hook may never rescue the same request twice;
   a different request must be independently admitted and rate bounded.
4. STOP/cancellation/app exit/version drift must end ordinary waiting. Never
   clear STOP, kill a session process, change auth, or bootstrap a new chat.
5. Treat deployment separately: an owned STOP may permit a bounded handoff
   barrier with zero effects, preserving fresh native cleanup. Continuation
   after activation requires the exact nonce/current pointer and no STOP;
   no ordinary work may run while STOP exists. Do not weaken release admission.
6. Preserve unknown effects without replay. Test cancellation/expiry/STOP,
   helper death, simultaneous clients, native continued-hook flags, native
   input usability, source drift and distinct-build rollback. Prove inference
   is absent during quiet waits and replies/effects occur once during bursts.

Use the existing approved broker and owned fixture. Do not create competing
observers or consume Claude turns on unchanged polling. Cold recovery at the
native cap and natural governor survival remain separate qualification gates.
