// Snapshot guidance only. Recheck the production gate before an action;
// time and gate state can change while this reply travels to its consumer.
const terminalStates = new Set(['done', 'failed', 'canceled', 'missed', 'interrupted']);
export function withWaitResult(reply, until = 'done') {
  const terminal = terminalStates.has(reply.state);
  const now = typeof reply.clock?.wall === 'string' ? Date.parse(reply.clock.wall) : NaN;
  const end = typeof reply.end_at === 'string' ? Date.parse(reply.end_at) : NaN;
  const remaining = Number.isFinite(now) && Number.isFinite(end) ? Math.max(0, (end - now) / 1000) : null;
  const observed = until === 'recording' ? reply.state === 'recording' : terminal;
  const mayBegin = reply.state === 'recording' && remaining !== null && remaining > 0 && reply.capture_quarantined !== true && reply.production_queue?.held !== true;
  return {...reply, wait_result: {
    requested_until: until, observed_state: reply.state, terminal,
    requested_state_observed: observed, remaining_s: remaining,
    may_begin_actions: mayBegin,
    reason: terminal ? (until === 'recording' ? 'terminal_before_observation' : 'terminal_observed')
      : reply.state !== 'recording' ? 'not_recording'
      : remaining === null ? 'remaining_time_unknown'
      : remaining <= 0 ? 'recording_deadline_reached'
      : !mayBegin ? 'capture_held_or_quarantined' : 'recording_observed',
    qualification: 'Engine-clock snapshot, not a reservation, delivered-input proof or successful finalization. Time decreases in transit; checkpoint the production gate and budget the next action. A terminal return can satisfy the wait without a successful take.'
  }};
}
