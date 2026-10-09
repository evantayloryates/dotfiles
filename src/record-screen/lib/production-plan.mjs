import { EngineError } from './client.mjs'
import { fileURLToPath } from 'node:url'
import { frameMapHealth } from './frame-map.mjs'
import { inputQueryHealth } from './input-query.mjs'

const evidencePath = fileURLToPath(new URL('../qualification/GATES.md', import.meta.url))

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
      include_apps: { type: 'array', minItems: 1, maxItems: 1, items: { type: 'string', maxLength: 256 } },
    }, required: ['type'], description: 'Use an exact window_id from windows; no fuzzy app/title resolution.' },
    mode: { type: 'string', enum: ['background', 'cooperative', 'reserved_interval'] },
    activity: { type: 'string', enum: ['passive_capture', 'agent_ui'] },
    duration_s: { type: 'number', minimum: 1, maximum: 86400 },
    fps: { type: 'integer', minimum: 1, maximum: 120, default: 30 },
    max_width: { type: 'integer', minimum: 0, maximum: 16384, default: 1000 },
    show_cursor: { type: 'boolean', default: false },
    input_enabled: { type: 'boolean', default: false },
    redundancy: { type: 'string', enum: ['none', 'window_display', 'window_app_display'], default: 'none' },
    backup_rect: { type: 'object', additionalProperties: false, properties: {
      x: { type: 'number' }, y: { type: 'number' },
      w: { type: 'number', exclusiveMinimum: 0, maximum: 16384 }, h: { type: 'number', exclusiveMinimum: 0, maximum: 16384 },
    }, required: ['x', 'y', 'w', 'h'], description: 'Explicit fixed crop shared by app-filtered and display backups. Required only for window_app_display; never follows the window or expands automatically.' },
    backup_max_width: { type: 'integer', minimum: 0, maximum: 16384, description: 'Explicit backup pixel-width cap for window_app_display; 0 means native pixels. No capture setting is applied by planning.' },
    codec: { type: 'string', enum: ['h264', 'hevc'], description: 'Optional encoder choice. Triple-source candidate settings default to h264; changed encoders remain outside that measured profile.' },
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
  if (a.codec !== undefined && !productionPlanSchema.properties.codec.enum.includes(a.codec)) bad('Invalid codec')
  keys(a.target, Object.keys(productionPlanSchema.properties.target.properties))
  const t = a.target
  if (!['window', 'display', 'rect'].includes(t.type)) bad('Invalid target type')
  if (t.type === 'window' && !number(t.window_id, 1, 4294967295, true)) bad('Window planning requires an exact window_id')
  if (t.display_id !== undefined && !number(t.display_id, 1, Number.MAX_SAFE_INTEGER, true)) bad('Invalid display_id')
  if (t.type === 'rect' && (!number(t.x, -1e7, 1e7) || !number(t.y, -1e7, 1e7) || !number(t.w, Number.MIN_VALUE, 16384) || !number(t.h, Number.MIN_VALUE, 16384))) bad('Rect planning requires finite positive dimensions and finite desktop coordinates')
  const relevant = t.type === 'window' ? ['type', 'window_id', 'include_child_windows'] : t.type === 'rect' ? ['type', 'x', 'y', 'w', 'h', 'include_child_windows', 'exclude_apps', 'include_apps'] : ['type', 'display_id', 'include_child_windows', 'exclude_apps', 'include_apps']
  if (Object.keys(t).some(k => !relevant.includes(k))) bad('Target fields do not match this capture type')
  if (t.include_child_windows !== undefined && typeof t.include_child_windows !== 'boolean') bad('Invalid child-window option')
  if (t.exclude_apps !== undefined && (!Array.isArray(t.exclude_apps) || t.exclude_apps.length > 8 || t.exclude_apps.some(v => typeof v !== 'string' || v.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(v)))) bad('Invalid exact helper bundle exclusions')
  if (t.include_apps !== undefined && (!Array.isArray(t.include_apps) || t.include_apps.length !== 1 || t.include_apps.some(v => typeof v !== 'string' || v.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(v)))) bad('App inclusion requires one exact bundle')
  if (t.include_apps !== undefined && t.exclude_apps?.length) bad('App inclusion and exclusion cannot be combined')
  if (a.redundancy !== 'none' && t.type !== 'window') bad('Redundant planning requires an exact base window; it does not invent a backup target')
  if (a.redundancy === 'window_app_display') {
    keys(a.backup_rect, ['x', 'y', 'w', 'h'])
    const r = a.backup_rect
    if (!number(r.x, -1e7, 1e7) || !number(r.y, -1e7, 1e7) || !number(r.w, Number.MIN_VALUE, 16384) || !number(r.h, Number.MIN_VALUE, 16384) || !number(a.backup_max_width, 0, 16384, true)) bad('Triple-source planning requires an explicit finite backup rectangle and pixel-width cap')
  } else if (Object.hasOwn(a, 'backup_rect') || Object.hasOwn(a, 'backup_max_width')) bad('Backup rectangle/width apply only to window_app_display')
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
  } else if (t.include_apps) {
    expectations.push('App-filtered display/rect capture keeps a fixed crop. Same-app user actions/windows can change pixels; hidden/minimized/off-Space drawing and menus remain app-specific. Identity changes interrupt rather than silently replacing the source.')
    unknown.push('Included app identity and native UI readiness need live source checks; this planning inventory does not prove app presence, drawing, menu capture or clean coverage. Crop does not follow window movement or expand overflow.')
  } else expectations.push('Visible occlusion and unrelated desktop pixels can enter display/rect footage. Keep the required region visible; preserve interrupted evidence.')
  if (a.redundancy !== 'none') {
    unknown.push('Backup crop, popup overflow, clocks and decodable coverage must be verified for this app; no automatic backup, rescue or semantic ownership is inferred')
    expectations.push('Redundancy adds capture and storage cost. Start both verified sources on the same interval and preserve a dense backup timeline through primary gaps.')
  }
  const triple = a.redundancy === 'window_app_display'
  let plannedSources = null
  if (triple) {
    const bundle = typeof base?.bundle_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9.-]{0,255}$/.test(base.bundle_id) ? base.bundle_id : null
    const limit = status?.capture_health?.recordings?.max_concurrent, unfinished = status?.capture_health?.recordings?.unfinished
    if (Number.isInteger(limit) && limit > 0 && Number.isInteger(unfinished) && unfinished >= 0 && unfinished + 3 > limit) blocks.push('Three planned sources exceed currently observed configured recording slots; this snapshot is not a capacity guarantee or reservation')
    if (status?.capabilities?.application_filter !== 1 || status?.capabilities?.target_capture_options !== 1) blocks.push('Triple-source app backup requires guarded application_filter and target_capture_options v1')
    if (!bundle) blocks.push('Exact base-window app bundle identity is unavailable; no app backup target is invented')
    const r = a.backup_rect
    if (!displays.some(d => d.frame && r.x < d.frame.x + d.frame.w && r.x + r.w > d.frame.x && r.y < d.frame.y + d.frame.h && r.y + r.h > d.frame.y)) blocks.push('Explicit backup rectangle has no observed display intersection')
    if (base?.frame && !(r.x < base.frame.x + base.frame.w && r.x + r.w > base.frame.x && r.y < base.frame.y + base.frame.h && r.y + r.h > base.frame.y)) blocks.push('Explicit backup rectangle does not intersect the observed base window; resolve the backup surface before scheduling')
    if (base?.frame && !(r.x <= base.frame.x && r.y <= base.frame.y && r.x + r.w >= base.frame.x + base.frame.w && r.y + r.h >= base.frame.y + base.frame.h)) unknown.push('Explicit backup crop does not contain the entire observed base window; intended partial coverage and later movement/overflow need source checks')
    expectations.push('The app backup excludes other-app occlusion, while the display backup includes it and unrelated desktop pixels. Both use the caller-specified fixed crop; neither follows window movement or guarantees every popup.')
    const shared = { preset: 'evidence', codec: a.codec ?? 'h264', fps: a.fps, show_cursor: a.show_cursor, input: { enabled: a.input_enabled } }
    if (bundle) plannedSources = [
      { role: 'window', target: { ...t }, settings: { ...shared, max_width: a.max_width } },
      { role: 'app', target: { type: 'rect', ...r, include_apps: [bundle] }, settings: { ...shared, max_width: a.backup_max_width } },
      { role: 'display', target: { type: 'rect', ...r }, settings: { ...shared, max_width: a.backup_max_width } },
    ]
  }
  if (a.input_enabled) {
    if (status?.capabilities?.input_timeline !== 1) blocks.push('Loaded engine does not advertise input timeline v1')
    if (status?.input_timeline?.listen_access !== true) blocks.push('Input Monitoring listen access is not last observed granted; a fresh listener/permission check is needed before relying on event capture')
    unknown.push('Listen access is last observed; a fresh listener/delivered-event canary is required. Protected input, provider gaps and human/agent ownership remain explicit.')
  }
  for (const [field, capability] of [['include_child_windows', 'target_capture_options'], ['exclude_apps', 'target_capture_options']]) if (Object.hasOwn(t, field) && status?.capabilities?.[capability] !== 1) blocks.push(`Loaded engine does not advertise ${capability} v1 for explicit ${field}`)
  if (t.exclude_apps?.length && status?.capabilities?.exclusion_identity !== 1) blocks.push('Helper-excluded recordings require observed exclusion identity v1')
  if (Object.hasOwn(t, 'include_apps') && status?.capabilities?.application_filter !== 1) blocks.push('App-filtered capture requires guarded application_filter v1; old engines have not applied this selection')
  const measuredProfile = {
    qualification: 'One authored 50-second point-resolution display/window pair; not an admission budget, production duration estimate or capacity guarantee',
    engine_build: 'f314bb340344', os_build: '25F80', display_scale: 2,
    width: 1000, height: 732, fps: 30, duration_s: 50, input_enabled: false,
    pressure_level: 2, exact_muxed_samples: 2371, dropped_frames: 0,
    recorder_cpu_cores: 0.06317, recorder_peak_rss_mib: 51.703,
    primary_bytes: 8291792, backup_bytes: 8303598,
    evidence: evidencePath, evidence_section: 'Thirtieth pass',
    representative_for_requested_app: false,
  }
  const profileDifferences = []
  if (a.redundancy !== 'window_display') profileDifferences.push('different stream configuration')
  for (const k of ['fps', 'duration_s', 'input_enabled']) if (a[k] !== measuredProfile[k]) profileDifferences.push(`different ${k}`)
  if (a.max_width !== measuredProfile.width || base?.frame?.w !== 1000 || base?.frame?.h !== 732) profileDifferences.push('different or unobserved encoded geometry')
  if (status?.engine?.build !== measuredProfile.engine_build) profileDifferences.push('different engine build')
  if (a.codec === 'hevc') profileDifferences.push('different or unqualified encoder choice')
  const measuredSingleWindowProfile = {
    qualification: 'One authored 110-second point-resolution window take with motion then static pixels; not capacity, P80 or requested-app representativeness',
    engine_build: 'f314bb340344', os_build: '25F80', display_scale: 2,
    width: 1000, height: 732, fps: 30, requested_duration_s: 110, input_enabled: false,
    exact_muxed_samples: 3221, dropped_frames: 0, journal_rows_lost: 0,
    moving_span_s: 89.238544598, static_span_s: 20.245941292,
    resource_samples: 109, pressure_level: 2,
    recorder_cpu_cores: 0.052431, recorder_peak_rss_mib: 49.0625, video_bytes: 15281232,
    evidence: evidencePath, evidence_section: 'Thirty-second pass',
    representative_for_requested_app: false,
    resource_join: 'Approximate wall interval; observer monotonic clock is not capture clock',
  }
  const measuredRetinaPairProfile = {
    qualification: 'One authored 330-second Retina window/display pair with motion then static pixels; not capacity, thermal equilibrium, P80 or requested-app representativeness',
    engine_build: 'f314bb340344', os_build: '25F80', display_scale: 2,
    width: 2000, height: 1464, parent_width_points: 1000, parent_height_points: 732,
    fps: 60, requested_duration_s: 330, input_enabled: false,
    exact_muxed_samples: 35345, dropped_frames: 0, journal_rows_lost: 0,
    moving_span_s: [306.28661132, 306.297736144], static_span_s: [22.963437182, 22.960603152],
    resource_samples: 327, pressure_level: 1, thermal_state: 'nominal',
    recorder_cpu_cores: 0.12952542734272976, recorder_peak_rss_mib: 47.734375,
    fixture_cpu_cores: 0.10571337571180638, fixture_peak_rss_mib: 80.21875,
    shared_windowserver_cpu_cores: 0.4554320295371804, shared_windowserver_peak_rss_mib: 127.890625,
    process_attribution: 'Cumulative process observations; recorder CPU excludes fixture/WindowServer/GPU, and shared WindowServer work is not attributable solely to capture',
    primary_video_bytes: 310959374, backup_video_bytes: 202558831,
    primary_journal_bytes: 11037570, backup_journal_bytes: 11593393,
    primary_journal_rows: 35725, backup_journal_rows: 37193,
    primary_muxed_packets: 17671, backup_muxed_packets: 17674,
    measured_source_journal_limit_bytes: 64 * 1024 * 1024,
    evidence: evidencePath, evidence_section: 'Thirty-seventh pass',
    representative_for_requested_app: false,
    resource_join: 'Approximate wall interval; coarse ProcessInfo thermal, no GPU attribution or temperature measurement',
  }
  const retinaDifferences = []
  if (a.redundancy !== 'window_display') retinaDifferences.push('different stream configuration')
  if (a.fps !== 60) retinaDifferences.push('different fps')
  if (a.duration_s !== 330) retinaDifferences.push('different duration_s')
  if (a.input_enabled !== false) retinaDifferences.push('different input_enabled')
  if (a.show_cursor !== false) retinaDifferences.push('different pointer setting')
  // Inventory can identify a candidate parent backing scale; it cannot prove
  // eventual child fitting, encoded geometry or the backup crop's coverage.
  const containingDisplays = base?.frame ? displays.filter(d => d.frame &&
    base.frame.x >= d.frame.x && base.frame.y >= d.frame.y &&
    base.frame.x + base.frame.w <= d.frame.x + d.frame.w &&
    base.frame.y + base.frame.h <= d.frame.y + d.frame.h) : []
  const backingScale = containingDisplays.length === 1 ? containingDisplays[0].scale : null
  if (a.max_width !== 0 || base?.frame?.w !== 1000 || base?.frame?.h !== 732 || backingScale !== 2) retinaDifferences.push('different or unobserved native parent geometry/scale')
  if (status?.engine?.build !== measuredRetinaPairProfile.engine_build) retinaDifferences.push('different engine build')
  if (a.codec === 'hevc') retinaDifferences.push('different or unqualified encoder choice')
  const measuredPointTripleProfile = {
    qualification: 'One authored 75-second moving/animated window and independent obstruction with three sources; not long-duration capacity, GPU attribution, P80 or requested-app representativeness',
    engine_build: '9bfabf2dbb5c', os_build: '25F80', display_scale: 2,
    parent_width_points: 1000, parent_height_points: 732, primary_width: 1000, primary_height: 732,
    backup_width: 1140, backup_height: 850, fps: 30, requested_duration_s: 75,
    input_enabled: false, show_cursor: false, include_child_windows: true, codec: 'h264',
    exact_muxed_samples: 5719, dropped_frames: 0, journal_rows_lost: 0,
    resource_samples: 90, pressure_level: 2, thermal_state: 'nominal',
    recorder_peak_rss_mib: 463.0625, recorder_later_idle_rss_mib: 30.34375,
    recorder_interval_cpu_percent_p50: 8.8970958161128, recorder_interval_cpu_percent_max: 103.6415785360207,
    cpu_percent_basis: 'One core; interval cumulative ps observations, approximate wall join; not recorder-owned encoder/GPU work',
    source_video_bytes: { window: 11205246, app: 14729976, display: 14904437 },
    source_journal_bytes: { window: 1382019, app: 1335172, display: 1331659 },
    source_journal_rows: { window: 4483, app: 4171, display: 4172 },
    source_muxed_packets: { window: 2181, app: 1767, display: 1771 },
    measured_source_journal_limit_bytes: 64 * 1024 * 1024,
    obstruction: { logged_duration_ns: '20003650334', edge_exclusion_ns: '200000000',
      checked_packets: { window: 570, app: 565, display: 567 }, app_patch_unique_hashes: 565,
      paired_boundary_segments: 803, qualification: 'All checked interior packets preserve authored app/window marker; display shows cover. Geometry containment and decoded content are separate; not arbitrary whole-shot rescue.' },
    evidence: evidencePath, evidence_section: 'Sixty-sixth pass', representative_for_requested_app: false,
    resource_join: 'Observer starts during the take; no pre-take baseline or incremental memory attribution. Host workload concurrent; requested fps differs from actual packet cadence.',
  }
  const tripleDifferences = []
  if (!triple) tripleDifferences.push('different stream configuration')
  if ((a.codec ?? 'h264') !== measuredPointTripleProfile.codec) tripleDifferences.push('different codec')
  for (const k of ['fps', 'duration_s', 'input_enabled', 'show_cursor']) if (a[k] !== (k === 'duration_s' ? measuredPointTripleProfile.requested_duration_s : measuredPointTripleProfile[k])) tripleDifferences.push(`different ${k}`)
  if (t.include_child_windows !== true) tripleDifferences.push('different or undeclared primary child-window option')
  if (a.max_width !== 1000 || base?.frame?.w !== 1000 || base?.frame?.h !== 732 || backingScale !== 2) tripleDifferences.push('different or unobserved primary geometry/scale')
  const backupDisplay = a.backup_rect ? displays.filter(d => d.frame && a.backup_rect.x >= d.frame.x && a.backup_rect.y >= d.frame.y && a.backup_rect.x + a.backup_rect.w <= d.frame.x + d.frame.w && a.backup_rect.y + a.backup_rect.h <= d.frame.y + d.frame.h) : []
  if (a.backup_rect?.w !== 1140 || a.backup_rect?.h !== 850 || a.backup_max_width !== 1140 || backupDisplay.length !== 1 || backupDisplay[0].scale !== 2 || containingDisplays.length !== 1 || backupDisplay[0].id !== containingDisplays[0].id || backupDisplay[0].main !== true) tripleDifferences.push('different or unobserved backup geometry/display')
  if (status?.engine?.build !== measuredPointTripleProfile.engine_build) tripleDifferences.push('different engine build')
  const referenceProfile = triple ? measuredPointTripleProfile : measuredRetinaPairProfile
  const durationRatio = a.duration_s / referenceProfile.requested_duration_s
  const scaleSources = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.ceil(value * durationRatio)]))
  const journalsBySource = scaleSources(triple ? referenceProfile.source_journal_bytes : { primary: referenceProfile.primary_journal_bytes, backup: referenceProfile.backup_journal_bytes })
  const journalScenarioExceeds = Object.values(journalsBySource).some(v => v > referenceProfile.measured_source_journal_limit_bytes)
  const mappingBounds = frameMapHealth(), inputBounds = inputQueryHealth()
  const rowsBySource = scaleSources(triple ? referenceProfile.source_journal_rows : { primary: referenceProfile.primary_journal_rows, backup: referenceProfile.backup_journal_rows })
  const packetsBySource = scaleSources(triple ? referenceProfile.source_muxed_packets : { primary: referenceProfile.primary_muxed_packets, backup: referenceProfile.backup_muxed_packets })
  const scenarioBudgetFlags = {
    native_journal_bytes: journalScenarioExceeds,
    source_reader_rows: Math.max(...Object.values(rowsBySource)) > Math.min(mappingBounds.max_rows, inputBounds.max_rows),
    media_reader_packets: Math.max(...Object.values(packetsBySource)) > mappingBounds.max_packets,
  }
  const storageGuidance = {
    qualification: 'Reference-scene linear duration scenario only; not a prediction, bound, disk-space reservation or admission decision',
    reference: triple ? 'measured_point_triple_profile' : 'measured_retina_pair_profile', requested_duration_s: a.duration_s,
    reference_settings_differences: triple ? tripleDifferences : retinaDifferences,
    scenario_video_bytes: Math.ceil((triple ? Object.values(referenceProfile.source_video_bytes).reduce((n, v) => n + v, 0) : referenceProfile.primary_video_bytes + referenceProfile.backup_video_bytes) * durationRatio),
    scenario_journal_bytes_by_source: journalsBySource,
    scenario_journal_rows_by_source: rowsBySource, scenario_muxed_packets_by_source: packetsBySource,
    consumer_bounds: { frame_mapping: { max_packets: mappingBounds.max_packets, max_rows: mappingBounds.max_rows, max_journal_bytes: mappingBounds.max_journal_bytes }, retained_input: { max_rows: inputBounds.max_rows, max_journal_bytes: inputBounds.max_journal_bytes } },
    scenario_exceeds_budgets: scenarioBudgetFlags,
    measured_per_source_journal_limit_bytes: referenceProfile.measured_source_journal_limit_bytes,
    scenario_exceeds_measured_journal_limit: journalScenarioExceeds,
    free_disk_bytes: null, disk_space_reserved: false, safe_continuous_duration_s: null,
    assumptions: [triple ? 'Same authored scene and all three reference sources scaled linearly by duration only; actual app/input/geometry/fps can change costs substantially' : 'Same authored scene and both reference sources scaled linearly by duration only; actual app/input/geometry/fps can change costs substantially',
      'No extrapolation of CPU, RSS, thermal equilibrium or production P80',
      'Measured journal limit belongs to the measured engine build; inspect the actual source descriptor for every take',
      'Consumer limits belong to this loaded adapter; its bounded readers can refuse a long source even if video is intact',
      'A full/lost source journal does not imply video stopped; later metadata and event coverage can be missing'],
    next: 'Check available disk space and live source bytes/max_bytes/rows_lost. For longer work choose explicit shorter takes at application checkpoints, preserve actual coverage and verify each source; this tool schedules no chunks or backup.',
  }
  if (Object.values(scenarioBudgetFlags).some(Boolean)) unknown.push('Requested duration exceeds source or consumer budgets in the reference-scene scenario; use explicit shorter takes or verify a different capture/telemetry budget. This is a scenario warning, not a predicted failure time.')
  unknown.push('Actual encoded geometry, requested-app costs, disk availability, encoder/GPU attribution, thermal plateau, broader workload capacity and P80 production-time estimates remain unqualified')
  return {
    schema: 'record-screen-production-plan/v1', assessment_only: true, mutates: false,
    assessment: blocks.length ? 'needs_resolution' : 'candidate_requires_source_check',
    request: a, observed_at: status?.clock ?? null,
    ...(triple ? { planned_sources: plannedSources, planned_sources_qualification: 'Explicit candidate targets/settings only; no scheduling, automatic crop tracking, app identity lease or source readiness. Apply settings explicitly and verify actual sources.' } : {}),
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
    resource_guidance: { unfinished_recordings: status?.capture_health?.recordings?.unfinished ?? null, quarantined_recordings: status?.capture_health?.recordings?.quarantined ?? null, configured_max_concurrent: status?.capture_health?.recordings?.max_concurrent ?? null, configured_limit_is_capacity: false, measured_profile: measuredProfile, measured_single_window_profile: measuredSingleWindowProfile, measured_retina_pair_profile: measuredRetinaPairProfile, measured_point_triple_profile: measuredPointTripleProfile, profile_differences: profileDifferences, retina_pair_profile_differences: retinaDifferences, point_triple_profile_differences: tripleDifferences, storage_guidance: storageGuidance, duration_p80_s: null },
    recovery: ['Mark and preserve the disrupted interval plus exact journals', 'Trim or select independently verified alternative source coverage', 'Reshoot from an application checkpoint when replayable; preserve unrecoverable live gaps'],
    next: 'Verify actual native target and encoded source pixels, consult shared exact-environment facts, then explicitly schedule the chosen sources. This plan starts no recording and authorizes no UI.',
  }
}
