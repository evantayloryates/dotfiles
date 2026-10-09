import { EngineError } from './client.mjs'

// Read-only guidance. These observations are not resource admission, a user
// grant, app readiness, a menu detector or an automatic capture operation.
export const productionPlanSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    target: { type: 'object', additionalProperties: false, properties: {
      type: { type: 'string', enum: ['window', 'display', 'rect'] },
      window_id: { type: 'integer', minimum: 1, maximum: 4294967295 },
      display_id: { type: 'integer', minimum: 1 },
      x: { type: 'number' }, y: { type: 'number' },
      w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
      include_child_windows: { type: 'boolean' },
      exclude_apps: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 256 } },
    }, required: ['type'], description: 'Use an exact window_id from windows; no fuzzy app/title resolution.' },
    mode: { type: 'string', enum: ['background', 'cooperative', 'reserved_interval'] },
    activity: { type: 'string', enum: ['passive_capture', 'agent_ui'] },
    duration_s: { type: 'number', minimum: 1, maximum: 86400 },
    fps: { type: 'integer', minimum: 1, maximum: 120, default: 30 },
    max_width: { type: 'integer', minimum: 0, maximum: 16384, default: 1000 },
    show_cursor: { type: 'boolean', default: false },
    input_enabled: { type: 'boolean', default: false },
    redundancy: { type: 'string', enum: ['none', 'window_display'], default: 'none' },
    alignment_until: { type: 'string', description: 'Optional ISO time of the user-agreed production interval. Caller-reported; never an authenticated permission grant.' },
  }, required: ['target', 'mode', 'activity', 'duration_s'],
}

const bad = message => { throw new EngineError('bad_production_plan', message) }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k))) bad('Unknown or invalid production-plan field')
}
function number(value, low, high, integer = false) {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high && (!integer || Number.isInteger(value))
}

export function validateProductionRequest(args) {
  keys(args, Object.keys(productionPlanSchema.properties))
  const a = { fps: 30, max_width: 1000, show_cursor: false, input_enabled: false, redundancy: 'none', ...args }
  for (const k of ['mode', 'activity', 'redundancy']) if (!productionPlanSchema.properties[k].enum.includes(a[k])) bad(`Invalid ${k}`)
  if (!number(a.duration_s, 1, 86400) || !number(a.fps, 1, 120, true) || !number(a.max_width, 0, 16384, true)) bad('Invalid duration, fps or max_width')
  if (typeof a.show_cursor !== 'boolean' || typeof a.input_enabled !== 'boolean') bad('Cursor and input settings must be booleans')
  keys(a.target, Object.keys(productionPlanSchema.properties.target.properties))
  const t = a.target
  if (!['window', 'display', 'rect'].includes(t.type)) bad('Invalid target type')
  if (t.type === 'window' && !number(t.window_id, 1, 4294967295, true)) bad('Window planning requires an exact window_id')
  if (t.display_id !== undefined && !number(t.display_id, 1, Number.MAX_SAFE_INTEGER, true)) bad('Invalid display_id')
  if (t.type === 'rect' && (!number(t.x, -1e7, 1e7) || !number(t.y, -1e7, 1e7) || !number(t.w, Number.MIN_VALUE, 16384) || !number(t.h, Number.MIN_VALUE, 16384))) bad('Rect planning requires finite positive dimensions and finite desktop coordinates')
  const relevant = t.type === 'window' ? ['type', 'window_id', 'include_child_windows'] : t.type === 'rect' ? ['type', 'x', 'y', 'w', 'h', 'include_child_windows', 'exclude_apps'] : ['type', 'display_id', 'include_child_windows', 'exclude_apps']
  if (Object.keys(t).some(k => !relevant.includes(k))) bad('Target fields do not match this capture type')
  if (t.include_child_windows !== undefined && typeof t.include_child_windows !== 'boolean') bad('Invalid child-window option')
  if (t.exclude_apps !== undefined && (!Array.isArray(t.exclude_apps) || t.exclude_apps.length > 8 || t.exclude_apps.some(v => typeof v !== 'string' || v.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(v)))) bad('Invalid exact helper bundle exclusions')
  if (a.redundancy === 'window_display' && t.type !== 'window') bad('The measured paired profile requires an exact base window; it does not invent a backup target')
  if (a.alignment_until !== undefined && (typeof a.alignment_until !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(a.alignment_until) || !Number.isFinite(Date.parse(a.alignment_until)))) bad('alignment_until needs an absolute ISO timestamp with timezone')
  return a
}

export function planProduction(args, status, windowResult = { windows: [], total: 0 }) {
  const a = validateProductionRequest(args), blocks = [], unknown = [], expectations = []
  const now = Date.parse(status?.clock?.wall), t = a.target
  const windows = windowResult?.windows ?? []
  const base = t.type === 'window' ? windows.find(w => w.window_id === t.window_id) : null
  const displays = Array.isArray(status?.displays) ? status.displays : []
  const display = t.type === 'display' ? displays.find(d => t.display_id === undefined ? d.main : d.id === t.display_id) : null
  if (!Number.isFinite(now)) blocks.push('Engine wall clock unavailable; production interval cannot be assessed')
  if (status?.permission?.screen_recording !== 'granted') blocks.push('Screen Recording access is not reported granted')
  if (status?.maintenance?.reserved === true) blocks.push('Engine maintenance reservation is active')
  if (status?.capture_health?.discovery?.quarantined === true) blocks.push('Capture discovery is quarantined; preserve existing state and use status recovery')
  if (status?.capabilities?.source_journal !== 1) blocks.push('Loaded engine does not advertise source journal v1; synchronized source coverage cannot be assumed')
  if (t.type === 'window' && !base) blocks.push(windowResult?.total > windows.length ? 'Target not found in bounded window inventory; narrow the inventory before reuse' : 'Exact target window is absent')
  if (t.type === 'display' && !display) blocks.push('Requested display is absent')
  if (t.type === 'rect' && !displays.some(d => d.frame && t.x < d.frame.x + d.frame.w && t.x + t.w > d.frame.x && t.y < d.frame.y + d.frame.h && t.y + t.h > d.frame.y)) blocks.push('Requested rectangle has no observed display intersection')
  const alignmentRequired = a.mode === 'reserved_interval' || (a.activity === 'agent_ui' && a.mode === 'cooperative')
  if (alignmentRequired && (!Number.isFinite(now) || a.alignment_until === undefined || Date.parse(a.alignment_until) < now + a.duration_s * 1000)) blocks.push('Caller-reported user alignment must cover the intended production interval; request or shorten that interval')
  if (a.activity === 'agent_ui') {
    if (a.mode === 'background') blocks.push('Background mode cannot promise undisturbed user work while the agent drives UI; choose an agreed cooperative or reserved interval')
    if (base && base.on_screen !== true) blocks.push('Target is off screen; native UI readiness has not been established')
    unknown.push('Even an on-screen window does not prove native input delivery or focus readiness; verify the provider and actual target before dispatch')
    expectations.push('UI actions can take focus and global shortcuts can affect either display. A display reservation is cooperation, not input isolation.')
  }
  if (t.type === 'window') {
    expectations.push('Window capture can preserve covered content; hidden/minimized/closed windows and app-specific child fitting still require observation.')
    unknown.push('Consult exact app/OS/provider/display capability facts; child inclusion does not guarantee every context menu or popup')
  } else expectations.push('Visible occlusion and unrelated desktop pixels can enter display/rect footage. Keep the required region visible; preserve interrupted evidence.')
  if (a.redundancy !== 'none') {
    unknown.push('Backup crop, popup overflow, clocks and decodable coverage must be verified for this app; no automatic backup, rescue or semantic ownership is inferred')
    expectations.push('Redundancy adds capture and storage cost. Start both verified sources on the same interval and preserve a dense backup timeline through primary gaps.')
  }
  if (a.input_enabled) {
    if (status?.capabilities?.input_timeline !== 1) blocks.push('Loaded engine does not advertise input timeline v1')
    if (status?.input_timeline?.listen_access !== true) blocks.push('Input Monitoring listen access is not last observed granted; a fresh listener/permission check is needed before relying on event capture')
    unknown.push('Listen access is last observed; a fresh listener/delivered-event canary is required. Protected input, provider gaps and human/agent ownership remain explicit.')
  }
  for (const [field, capability] of [['include_child_windows', 'target_capture_options'], ['exclude_apps', 'target_capture_options']]) if (Object.hasOwn(t, field) && status?.capabilities?.[capability] !== 1) blocks.push(`Loaded engine does not advertise ${capability} v1 for explicit ${field}`)
  if (t.exclude_apps?.length && status?.capabilities?.exclusion_identity !== 1) blocks.push('Helper-excluded recordings require observed exclusion identity v1')
  const measuredProfile = {
    qualification: 'One authored 50-second point-resolution display/window pair; not an admission budget, production duration estimate or capacity guarantee',
    engine_build: 'f314bb340344', os_build: '25F80', display_scale: 2,
    width: 1000, height: 732, fps: 30, duration_s: 50, input_enabled: false,
    pressure_level: 2, exact_muxed_samples: 2371, dropped_frames: 0,
    recorder_cpu_cores: 0.06317, recorder_peak_rss_mib: 51.703,
    primary_bytes: 8291792, backup_bytes: 8303598,
    evidence: 'qualification/GATES.md#thirtieth-pass',
    representative_for_requested_app: false,
  }
  const profileDifferences = []
  if (a.redundancy !== 'window_display') profileDifferences.push('different stream configuration')
  for (const k of ['fps', 'duration_s', 'input_enabled']) if (a[k] !== measuredProfile[k]) profileDifferences.push(`different ${k}`)
  if (a.max_width !== measuredProfile.width || base?.frame?.w !== 1000 || base?.frame?.h !== 732) profileDifferences.push('different or unobserved encoded geometry')
  if (status?.engine?.build !== measuredProfile.engine_build) profileDifferences.push('different engine build')
  unknown.push('Encoder/GPU attribution, thermal plateau, longer-duration capacity and P80 production-time estimates are unqualified')
  return {
    schema: 'record-screen-production-plan/v1', assessment_only: true, mutates: false,
    assessment: blocks.length ? 'needs_resolution' : 'candidate_requires_source_check',
    request: a, observed_at: status?.clock ?? null,
    engine: status?.engine ? { build: status.engine.build, pid: status.engine.pid } : null,
    target_observation: base ? { window_id: base.window_id, pid: base.pid, bundle_id: base.bundle_id, on_screen: base.on_screen, frame: base.frame } : display,
    blocking_reasons: blocks, unknowns: unknown, user_expectations: expectations,
    alignment: { until: a.alignment_until ?? null, provenance: 'caller_reported_unverified; not an authenticated permission grant', input_lock: false },
    cursor_layers: {
      system_pointer: a.show_cursor ? 'requested_visible' : 'capture_pointer_hiding_requested; inspect actual source',
      helper_window: t.exclude_apps?.length ? 'explicit helper exclusions requested; identity changes can interrupt' : 'separate overlays may remain; use explicit qualified helper exclusions',
      app_drawn_pointer: 'app content remains; capture pointer hiding does not remove it',
      text_caret: 'app content remains; capture pointer hiding does not remove it',
    },
    resource_guidance: { unfinished_recordings: status?.capture_health?.recordings?.unfinished ?? null, quarantined_recordings: status?.capture_health?.recordings?.quarantined ?? null, configured_max_concurrent: status?.capture_health?.recordings?.max_concurrent ?? null, configured_limit_is_capacity: false, measured_profile: measuredProfile, profile_differences: profileDifferences, duration_p80_s: null },
    recovery: ['Mark and preserve the disrupted interval plus exact journals', 'Trim or select independently verified alternative source coverage', 'Reshoot from an application checkpoint when replayable; preserve unrecoverable live gaps'],
    next: 'Verify actual native target and encoded source pixels, consult shared exact-environment facts, then explicitly schedule the chosen sources. This plan starts no recording and authorizes no UI.',
  }
}
