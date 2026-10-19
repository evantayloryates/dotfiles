// One allowlist for the headless fixture and its transport filter.
export const FIXTURE_TOOLS = ['driver_guide', 'get_session', 'session_events', 'driver_submit', 'driver_job', 'driver_wait', 'driver_cancel', 'driver_memory_record', 'driver_memory_query']
export function permittedFixtureCall(session, name, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false
  if (!FIXTURE_TOOLS.includes(name)) return false
  if (['get_session', 'session_events'].includes(name)) return args.session === session
  if (name === 'driver_submit') return ['get_session', 'session_events', 'session_wait'].includes(args.operation) && args.arguments?.session === session
  if (name === 'driver_memory_record') return args.topic === 'cross-harness-fixture'
  return true
}
