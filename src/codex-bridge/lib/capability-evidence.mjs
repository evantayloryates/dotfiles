// Shared, local evidence for native agents and bridge consumers. No transport,
// model turn, UI action, grant or source-event collector is started here.
import { createHash } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { STATE_DIR } from './state.mjs'
import { outcomeValue, auditOutcomes, validateOutcomeRequest } from './workflow-outcomes.mjs'

export const EVIDENCE_DIR = join(STATE_DIR, 'capability-evidence')
export const ENTITY_FIELDS = ['bundle_id', 'app_version', 'app_build', 'os_build', 'provider', 'provider_version', 'surface', 'capture_mode', 'display_profile']
const fail = message => { throw new Error(`capability evidence: ${message}`) }
function fields(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object')
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unsupported field ${key}`)
  for (const key of required) if (!(key in value)) fail(`missing field ${key}`)
}
function string(value, name, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) fail(`invalid ${name}`)
  return value
}
function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`invalid ${name}`)
  return value
}
function refs(value) {
  if (!Array.isArray(value) || value.length > 16) fail('evidence_refs must be an array of at most 16 absolute paths')
  return value.map(path => { string(path, 'evidence reference', 2048); if (!isAbsolute(path)) fail('evidence references must be absolute paths'); return path })
}
function date(value, name) {
  string(value, name, 64)
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`invalid ${name}`)
  return new Date(value).toISOString()
}
function ns(value) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value) || BigInt(value) > 18446744073709551615n) fail('host_ns must be an unsigned decimal string')
  return BigInt(value).toString()
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex')

export function validateEntity(entity) {
  fields(entity, ENTITY_FIELDS)
  return Object.fromEntries(ENTITY_FIELDS.map(key => [key, string(entity[key], key)]))
}

export function validateQuery(input, kind) {
  const fact = kind === 'facts'
  if (!fact && kind !== 'receipts') fail('invalid kind')
  fields(input, fact ? ['entity', 'include_expired', 'limit'] : ['session_id', 'limit'], fact ? ['entity'] : ['session_id'])
  if (fact) validateEntity(input.entity)
  else string(input.session_id, 'session_id')
  if (input.include_expired !== undefined && typeof input.include_expired !== 'boolean') fail('include_expired must be boolean')
  if (input.limit !== undefined) integer(input.limit, 'limit', 1, 100)
  return input
}

export function validateFact(input) {
  fields(input, ['entity', 'capability', 'result', 'sample_count', 'observed_at', 'expires_at', 'evidence_refs', 'limits'])
  const entity = validateEntity(input.entity)
  const observed = date(input.observed_at, 'observed_at'), expires = date(input.expires_at, 'expires_at')
  if (Date.parse(expires) <= Date.parse(observed)) fail('expiry must be after observation')
  if (!['pass', 'fail', 'mixed', 'unknown'].includes(input.result)) fail('invalid fact result')
  return { ...input, entity, capability: string(input.capability, 'capability', 128),
    sample_count: integer(input.sample_count, 'sample_count', 1, 1000000), observed_at: observed, expires_at: expires,
    evidence_refs: refs(input.evidence_refs), limits: string(input.limits, 'limits', 1000), provenance: 'reported_observation' }
}

export function validateReceipt(input, { intentMax = 1000 } = {}) {
  fields(input, ['session_id', 'caller', 'action_id', 'provider', 'target', 'clock_domain', 'start_ns', 'end_ns', 'intent', 'result', 'evidence_refs'],
    ['session_id', 'caller', 'action_id', 'provider', 'target', 'clock_domain', 'start_ns', 'end_ns', 'intent', 'result', 'evidence_refs'])
  fields(input.target, ['bundle_id', 'pid', 'window_id'], ['bundle_id'])
  const target = { bundle_id: string(input.target.bundle_id, 'target bundle') }
  for (const key of ['pid', 'window_id']) if (input.target[key] !== undefined) target[key] = integer(input.target[key], key, 1, 4294967295)
  if (input.clock_domain !== 'CLOCK_UPTIME_RAW') fail('manual receipts require the qualified recorder host-clock domain')
  const start = ns(input.start_ns), end = ns(input.end_ns)
  if (BigInt(end) < BigInt(start)) fail('receipt end precedes start')
  if (!['dispatched', 'delivered', 'verified', 'failed', 'interrupted', 'unknown'].includes(input.result)) fail('invalid receipt result')
  return { ...input, target, start_ns: start, end_ns: end,
    session_id: string(input.session_id, 'session_id'), caller: string(input.caller, 'caller'),
    action_id: string(input.action_id, 'action_id'), provider: string(input.provider, 'provider'),
    intent: string(input.intent, 'intent', intentMax), evidence_refs: refs(input.evidence_refs),
    provenance: 'caller_claimed', ownership: 'Not verified agent identity; joins require delivery and source evidence' }
}

// A recorder reply is imported evidence, not authenticated agent ownership.
// Keep the exact engine stamps and restart uncertainty instead of promoting a
// caller-supplied receipt to an independently verified native-provider claim.
export function validateRecordedAction(input) {
  const allowed=['schema','action_token','action_id','session_id','caller','provider','intent','context','target',
    'clock_domain','start_ns','deadline_ns','end_ns','state','result','engine_instance','engine_build','engine_pid',
    'clock_provenance','ownership','limits','evidence_refs','end_kind','target_lifetime_at_end','clock']
  fields(input,allowed,['schema','action_token','action_id','session_id','caller','provider','intent','context','target',
    'clock_domain','start_ns','deadline_ns','end_ns','state','result','engine_instance','engine_build','engine_pid','clock_provenance'])
  if(input.schema!=='record-screen-action/v1' || input.clock_provenance!=='recorder_service_stamped') fail('invalid recorder action contract')
  if(!/^act_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.action_token)) fail('invalid recorder token')
  if(!['closed','expired','interrupted'].includes(input.state)) fail('only terminal recorder actions can be imported')
  const unknown=input.end_ns===null
  if(unknown && (input.state!=='interrupted' || input.result!=='interrupted' || input.end_kind!=='unknown_after_engine_restart')) fail('unknown end requires restart interruption')
  const base=validateReceipt(Object.fromEntries(['session_id','caller','action_id','provider','target','clock_domain','start_ns','end_ns','intent','result','evidence_refs']
    .map(key=>[key,key==='end_ns' && unknown ? input.start_ns : key==='evidence_refs' ? (input[key] ?? []) : input[key]])),{intentMax:3000})
  const deadline=ns(input.deadline_ns)
  if(BigInt(deadline)<BigInt(base.start_ns) || (!unknown && BigInt(base.end_ns)>BigInt(deadline))) fail('recorder scope bounds invalid')
  fields(input.context,['purpose','before_state','expected_change','verification_plan'],[])
  const context=Object.fromEntries(Object.entries(input.context).map(([key,value])=>[key,string(value,key,1500)]))
  return {...base,context,end_ns:unknown ? null : base.end_ns,deadline_ns:deadline,state:input.state,
    recorder_action_token:input.action_token,engine_instance:string(input.engine_instance,'engine instance'),
    engine_build:string(input.engine_build,'engine build'),engine_pid:integer(input.engine_pid,'engine pid',1,2147483647),
    end_kind:string(input.end_kind,'end kind'),provenance:'recorder_reply_imported',
    clock_provenance:'recorder_service_stamped_claim_in_reply',ownership:'Caller and result unverified; corroborate against source and delivery evidence'}
}

export class EvidenceStore {
  constructor(root = EVIDENCE_DIR) { this.root = root }
  put(kind, input) {
    const value = kind === 'facts' ? validateFact(input) : kind === 'receipts' ? validateReceipt(input) : fail('invalid kind')
    return this.putValidated(kind,value)
  }
  putRecordedAction(reply) { return this.putValidated('receipts',validateRecordedAction(reply)) }
  putOutcome(input) {
    validateOutcomeRequest(input)
    const receipts = this.list('receipts', digest(input.session_id), { maxFiles: 1000, maxBytes: 65536 })
    const value = outcomeValue(input, receipts.find(r => r.id === input.receipt_id))
    if (Buffer.byteLength(canonical(value)) > 64000) fail('workflow outcome exceeds bounded payload; entry not published')
    return this.putValidated('outcomes', value)
  }
  workflowAudit(session, { limit = 20, now = Date.now() } = {}) {
    string(session, 'session_id')
    const bucket = digest(session)
    const receipts = this.list('receipts', bucket, { maxFiles: 1000, maxBytes: 65536 })
    const outcomes = this.list('outcomes', bucket, { maxFiles: 1000, maxBytes: 65536 })
    if ([...receipts, ...outcomes].some(e => e.value.session_id !== session)) fail('workflow evidence outside exact session scope')
    return auditOutcomes(receipts, outcomes, { now, limit })
  }
  putValidated(kind,value) {
    const bucket = digest(kind === 'facts' ? value.entity : value.session_id)
    const id = digest(value), directory = join(this.root, kind, bucket), file = join(directory, `${id}.json`)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    // Publish a complete immutable entry atomically. A concurrent same-ID
    // writer verifies the content instead of overwriting it.
    const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
    let fd
    try {
      fd = openSync(temp, 'wx', 0o600)
      writeFileSync(fd, canonical({ schema: 'computer-use-evidence/v1', id, kind, value }) + '\n')
      fsyncSync(fd); closeSync(fd); fd = undefined
      // hard link is an atomic, no-replace publication even across processes.
      this.publish(temp, file)
    } finally {
      if (fd !== undefined) closeSync(fd)
      try { unlinkSync(temp) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return { id, path: file, value }
  }
  publish(temp, file) { publishNoReplace(temp, file) }
  list(kind, bucket, { maxFiles, maxBytes } = {}) {
    if (!['facts', 'receipts', 'outcomes'].includes(kind)) fail('invalid kind')
    if (!/^[a-f0-9]{64}$/.test(bucket)) fail('query requires an exact entity or session bucket')
    const directory = join(this.root, kind, bucket)
    let names
    try { names = readdirSync(directory) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
    const eligible = names.filter(name => /^[a-f0-9]{64}\.json$/.test(name))
    if (maxFiles !== undefined && eligible.length > integer(maxFiles, 'maxFiles', 1, 1000)) fail('observation bucket exceeds bounded planning scan; inspect/archive explicitly, no reuse recommendation')
    if (maxBytes !== undefined) integer(maxBytes, 'maxBytes', 1, 65536)
    const entries = []
    for (const name of eligible) {
      const path = join(directory, name)
      if (maxBytes !== undefined) {
        const stat = lstatSync(path)
        if (!stat.isFile() || stat.size > maxBytes) fail('planning requires bounded regular evidence files')
      }
      const entry = JSON.parse(readFileSync(path, 'utf8'))
      if (entry.schema !== 'computer-use-evidence/v1' || entry.kind !== kind || digest(entry.value) !== entry.id || name !== `${entry.id}.json`) fail('corrupt evidence entry')
      entries.push(entry)
    }
    return entries
  }
  factSnapshot(entity, { now = Date.now() } = {}) {
    const wanted = digest(validateEntity(entity))
    if (!Number.isFinite(now)) fail('invalid query clock')
    const all = this.list('facts', wanted, { maxFiles: 1000, maxBytes: 65536 })
    for (const entry of all) {
      const { provenance, ...input } = entry.value
      if (canonical(validateFact(input)) !== canonical(entry.value) || digest(entry.value.entity) !== wanted) fail('invalid scoped planning observation')
    }
    const future = all.filter(entry => Date.parse(entry.value.observed_at) > now)
    const eligible = all.filter(entry => Date.parse(entry.value.observed_at) <= now)
      .sort((a, b) => Date.parse(b.value.observed_at) - Date.parse(a.value.observed_at) || a.id.localeCompare(b.id))
    return { total: all.length, future_withheld: future.length, truncated: eligible.length > 100,
      entries: eligible.slice(0, 100).map(entry => ({ ...entry, expired: Date.parse(entry.value.expires_at) <= now })) }
  }
  facts(entity, { now = Date.now(), includeExpired = false, limit = 20 } = {}) {
    const wanted = digest(validateEntity(entity)); integer(limit, 'limit', 1, 100)
    if (!Number.isFinite(now)) fail('invalid query clock')
    if (typeof includeExpired !== 'boolean') fail('includeExpired must be boolean')
    return this.list('facts', wanted).filter(entry => digest(entry.value.entity) === wanted)
      .map(entry => ({ ...entry, expired: Date.parse(entry.value.expires_at) <= now,
        future_observation: Date.parse(entry.value.observed_at) > now }))
      .filter(entry => !entry.future_observation && (includeExpired || !entry.expired))
      .sort((a, b) => Date.parse(b.value.observed_at) - Date.parse(a.value.observed_at) || a.id.localeCompare(b.id)).slice(0, limit)
  }
  receipts(session, { limit = 20 } = {}) {
    string(session, 'session_id'); integer(limit, 'limit', 1, 100)
    return this.list('receipts', digest(session)).filter(entry => entry.value.session_id === session)
      .sort((a, b) => BigInt(a.value.start_ns) > BigInt(b.value.start_ns) ? -1 : BigInt(a.value.start_ns) < BigInt(b.value.start_ns) ? 1 : a.id.localeCompare(b.id)).slice(0, limit)
  }
}

// Keep publication separate to make fault injection possible without starting
// the bridge or replacing the live store.
function publishNoReplace(temp, file) {
  try { linkSync(temp, file) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (readFileSync(temp, 'utf8') !== readFileSync(file, 'utf8')) fail('immutable identity collision')
  }
}
