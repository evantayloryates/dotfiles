// Terra webhook payloads: read-only access to the raw production webhook
// archive in S3, inside the ZDR harness only.
//
// Why it exists: a connection's granted scopes (what a client let a wearable
// share) are not stored in the database. They only exist in raw Terra webhook
// payloads, as `user.scopes`. The bucket keeps 30 days (lifecycle rule), about
// 3.8 TB and 6.2M objects, so nothing here ever downloads it wholesale.
//
// Every payload pairs a Kickoff client id with health data: PHI. Bucket,
// prefix and key shape are fixed here and enforced before any request, on top
// of the IAM policy (src/zdr-harness/iam/zdr-harness-policy.json).

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { join } from 'node:path'

export const TERRA_BUCKET = 'kickoff-terra-event-payloads-production'
export const TERRA_PREFIX = 'production/'
export const TERRA_KEY = /^production\/\d{4}-\d{2}-\d{2}\/[0-9A-Fa-f-]{36}\.json$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
export const RETENTION_DAYS = 30
const MAX_GET_BYTES = 5_000_000

export class TerraError extends Error {}

const sha256hex = (v) => createHash('sha256').update(v).digest('hex')
const hmac = (k, v) => createHmac('sha256', k).update(v).digest()
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function checkKey(key) {
  if (typeof key !== 'string' || !TERRA_KEY.test(key)) throw new TerraError('key must look like production/<YYYY-MM-DD>/<uuid>.json')
  return key
}
export function checkDay(day) {
  if (typeof day !== 'string' || !DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new TerraError('day must be YYYY-MM-DD')
  return day
}

// Newest first: today back `n` days (UTC), never further than the 30-day
// lifecycle window.
export function recentDays(n, now = Date.now()) {
  const days = []
  for (let i = 0; i < Math.min(Math.max(1, n), RETENTION_DAYS + 1); i++) days.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10))
  return days
}

// A tiny SigV4 S3 client bound to the one bucket. `endpoint` and `fetchImpl`
// exist for tests only.
export function terraClient({ region = 'us-west-1', accessKeyId, secretAccessKey, sessionToken, fetchImpl = fetch, endpoint } = {}) {
  if (!accessKeyId || !secretAccessKey) throw new TerraError('No AWS credentials for S3: set KICKOFF_ZDR_AWS_ACCESS_KEY_ID and KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY')
  const host = endpoint ? new URL(endpoint).host : `${TERRA_BUCKET}.s3.${region}.amazonaws.com`
  const base = endpoint ? endpoint.replace(/\/$/, '') : `https://${host}`

  async function request(path, params = {}, extraHeaders = {}) {
    const query = Object.keys(params)
      .sort()
      .map((k) => `${enc(k)}=${enc(params[k])}`)
      .join('&')
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = sha256hex('')
    const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
    if (sessionToken) headers['x-amz-security-token'] = sessionToken
    const names = Object.keys(headers).sort()
    const canonical = ['GET', path, query, names.map((k) => `${k}:${headers[k].trim()}\n`).join(''), names.join(';'), payloadHash].join('\n')
    const scope = `${dateStamp}/${region}/s3/aws4_request`
    let k = hmac(`AWS4${secretAccessKey}`, dateStamp)
    for (const part of [region, 's3', 'aws4_request']) k = hmac(k, part)
    const signature = createHmac('sha256', k).update(['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n')).digest('hex')
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
    let res
    try {
      res = await fetchImpl(`${base}${path}${query ? `?${query}` : ''}`, { headers: { ...headers, ...extraHeaders } })
    } catch (err) {
      throw new TerraError(`S3 is not reachable (${err.cause?.code || err.message})`)
    }
    if (!res.ok) {
      const text = await res.text()
      const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || `HTTP ${res.status}`
      if (code === 'AccessDenied') {
        throw new TerraError(
          'S3 AccessDenied on the Terra payload bucket: the zdr-harness IAM user needs s3:ListBucket (prefix production/*) and s3:GetObject on ' +
            `${TERRA_BUCKET}/production/*. Apply src/zdr-harness/iam/zdr-harness-policy.json (see iam/README.md).`
        )
      }
      if (code === 'NoSuchKey') throw new TerraError('No such payload (the bucket keeps 30 days)')
      throw new TerraError(`S3 request failed: ${code}`)
    }
    return res
  }

  // One ListObjectsV2 page under production/<day>/.
  async function listPage(day, token) {
    const params = { 'list-type': '2', prefix: `${TERRA_PREFIX}${checkDay(day)}/`, 'max-keys': '1000' }
    if (token) params['continuation-token'] = token
    const xml = await (await request('/', params)).text()
    const items = []
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = (m[1].match(/<Key>([^<]+)<\/Key>/) || [])[1]
      if (!key || !TERRA_KEY.test(key)) continue
      items.push({ key, size: Number((m[1].match(/<Size>(\d+)<\/Size>/) || [])[1] || 0), modified: (m[1].match(/<LastModified>([^<]+)<\/LastModified>/) || [])[1] || '' })
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
    const next = truncated ? (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] : undefined
    return { items, next }
  }

  async function get(key) {
    checkKey(key)
    const res = await request(`/${key.split('/').map(enc).join('/')}`)
    const len = Number(res.headers.get('content-length') || 0)
    if (len > MAX_GET_BYTES) throw new TerraError(`payload is ${len} bytes; over the ${MAX_GET_BYTES}-byte limit`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_GET_BYTES) throw new TerraError(`payload is over the ${MAX_GET_BYTES}-byte limit`)
    return buf
  }

  // The first `bytes` of an object (HTTP Range; the range header is not part
  // of the signature, which S3 accepts). Returns { buf, total }.
  async function head(key, bytes) {
    checkKey(key)
    const res = await request(`/${key.split('/').map(enc).join('/')}`, {}, { range: `bytes=0-${bytes - 1}` })
    const total = Number(((res.headers.get('content-range') || '').split('/')[1]) || res.headers.get('content-length') || 0)
    return { buf: Buffer.from(await res.arrayBuffer()), total }
  }

  return { listPage, get, head }
}

// ---- per-day counts (metadata only)

export async function dayCounts(client, days, { maxPagesPerDay = 50 } = {}) {
  const out = []
  for (const day of days) {
    let objects = 0
    let bytes = 0
    let pages = 0
    let token
    let complete = true
    do {
      const { items, next } = await client.listPage(day, token)
      objects += items.length
      for (const i of items) bytes += i.size
      token = next
      pages++
      if (token && pages >= maxPagesPerDay) {
        complete = false
        break
      }
    } while (token)
    out.push({ day, objects, bytes, complete })
  }
  return out
}

// ---- bounded single-payload reader

export async function readPayload(client, key, { maxChars = 20_000, offset = 0 } = {}) {
  const buf = await client.get(checkKey(key))
  let text
  try {
    text = JSON.stringify(JSON.parse(buf.toString('utf8')), null, 1)
  } catch {
    text = buf.toString('utf8')
  }
  const start = Math.max(0, Math.min(offset, text.length))
  return { key, bytes: buf.length, total_chars: text.length, offset: start, text: text.slice(start, start + maxChars), more: start + maxChars < text.length }
}

// ---- scopes export: each Terra user's latest provider, scopes, status and
// event, newest day first and smallest objects first, stopping as soon as
// more fetching stops finding new users (or a target count is reached).

export function summarizePayload(p) {
  const u = p && typeof p === 'object' ? p.user : null
  if (!u || typeof u !== 'object' || !u.user_id) return null
  const scopes = typeof u.scopes === 'string' ? u.scopes.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(u.scopes) ? u.scopes : []
  return {
    user_id: String(u.user_id),
    reference_id: u.reference_id == null ? null : String(u.reference_id),
    provider: u.provider == null ? null : String(u.provider),
    scopes,
    scopes_reported: scopes.length > 0,
    active: typeof u.active === 'boolean' ? u.active : null,
    last_event_type: p.type == null ? null : String(p.type),
    last_webhook_update: u.last_webhook_update ?? null,
  }
}

export async function scopesExport(client, opts = {}, onProgress = () => {}) {
  const { days = recentDays(RETENTION_DAYS), maxObjects = 50_000, targetUsers, saturation = 5000, concurrency = 32 } = opts
  const best = new Map() // user_id -> { row, day, modified }
  let fetched = 0
  let bytes = 0
  let failed = 0
  let sinceNew = 0
  let stop = 'scanned every day in range'
  const done = () => {
    if (targetUsers && best.size >= targetUsers) return (stop = `reached ${targetUsers} users`)
    if (fetched >= maxObjects) return (stop = `reached max_objects ${maxObjects}`)
    if (sinceNew >= saturation && best.size > 0) return (stop = `${saturation} objects in a row found no new user`)
    return false
  }
  outer: for (const day of days) {
    const items = []
    let token
    do {
      const page = await client.listPage(day, token)
      items.push(...page.items)
      token = page.next
    } while (token)
    items.sort((a, b) => a.size - b.size)
    for (let i = 0; i < items.length; i += concurrency) {
      if (done()) break outer
      const batch = items.slice(i, i + concurrency)
      const got = await Promise.all(
        batch.map(async (it) => {
          try {
            const buf = await client.get(it.key)
            bytes += buf.length
            return { it, p: JSON.parse(buf.toString('utf8')) }
          } catch {
            failed++
            return null
          }
        })
      )
      for (const g of got) {
        fetched++
        if (!g) continue
        const row = summarizePayload(g.p)
        if (!row) {
          sinceNew++
          continue
        }
        const prev = best.get(row.user_id)
        if (!prev) {
          best.set(row.user_id, { row: { ...row, last_event_day: day }, day, modified: g.it.modified })
          sinceNew = 0
        } else {
          sinceNew++
          // Newest day wins; within the same day the later write wins.
          if (prev.day === day && g.it.modified > prev.modified) best.set(row.user_id, { row: { ...row, last_event_day: day }, day, modified: g.it.modified })
        }
      }
      onProgress({ fetched, users: best.size, day })
    }
  }
  const rows = [...best.values()].map((v) => v.row)
  const byProvider = {}
  for (const r of rows) {
    const k = r.provider || 'unknown'
    byProvider[k] ??= { users: 0, with_scopes: 0 }
    byProvider[k].users++
    if (r.scopes_reported) byProvider[k].with_scopes++
  }
  return { rows, stats: { users: rows.length, objects_fetched: fetched, bytes_fetched: bytes, failed, stop_reason: stop, by_provider: byProvider } }
}

// Writes rows to <exportDir>/ts_<8hex>.jsonl (700/600, atomic rename).
export function writeScopesFile(exportDir, rows) {
  mkdirSync(exportDir, { recursive: true, mode: 0o700 })
  const id = `ts_${randomBytes(4).toString('hex')}`
  const path = join(exportDir, `${id}.jsonl`)
  const tmp = `${path}.part`
  const fd = openSync(tmp, 'w', 0o600)
  try {
    for (const r of rows) writeSync(fd, `${JSON.stringify(r)}\n`)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  return { id, path }
}

// Pull complete top-level fields out of the start of a JSON object that may be
// cut off. Returns { fields: {name: value}, complete: bool }: a field appears
// only once its whole value is inside `text`.
export function topLevelFields(text, wanted) {
  const out = {}
  let i = text.indexOf('{')
  if (i < 0) return { fields: out, complete: false }
  i++
  const n = text.length
  const skipWs = () => { while (i < n && /\s/.test(text[i])) i++ }
  const readString = () => {
    const start = i
    i++
    while (i < n) {
      if (text[i] === '\\') i += 2
      else if (text[i] === '"') { i++; return text.slice(start, i) }
      else i++
    }
    return null
  }
  const skipValue = () => {
    skipWs()
    if (i >= n) return null
    const start = i
    if (text[i] === '"') return readString() === null ? null : text.slice(start, i)
    if (text[i] === '{' || text[i] === '[') {
      let depth = 0
      while (i < n) {
        const ch = text[i]
        if (ch === '"') { if (readString() === null) return null; continue }
        if (ch === '{' || ch === '[') depth++
        else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { i++; return text.slice(start, i) } }
        i++
      }
      return null
    }
    while (i < n && !/[,}\s]/.test(text[i])) i++
    return i < n ? text.slice(start, i) : null
  }
  for (;;) {
    skipWs()
    if (i >= n) return { fields: out, complete: false }
    if (text[i] === '}') return { fields: out, complete: true }
    if (text[i] === ',') { i++; continue }
    if (text[i] !== '"') return { fields: out, complete: false }
    const rawKey = readString()
    if (rawKey === null) return { fields: out, complete: false }
    skipWs()
    if (text[i] !== ':') return { fields: out, complete: false }
    i++
    const v = skipValue()
    if (v === null) return { fields: out, complete: false }
    const key = JSON.parse(rawKey)
    if (wanted.includes(key)) { try { out[key] = JSON.parse(v) } catch { return { fields: out, complete: false } } }
  }
}
