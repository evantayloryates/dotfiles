import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archiveStatus, decideTick, latestStates, openArchive, reconcileCrashed, runArchive, summarizeObject, Throttle } from '../terra-archive.mjs'
import { terraClient, topLevelFields } from '../terra-payloads.mjs'

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const key = (day, n) => `production/${day}/${uuid(n)}.json`
const NOW = Date.parse('2026-10-12T12:00:00Z')

// Fake S3 with Range support, and `failEvery`: every Nth object GET answers 503 SlowDown.
function fakeS3(objects, { pageSize = 3, failEvery = 0 } = {}) {
  const stats = { gets: 0, ranged: 0, full: 0, lists: 0, slowdowns: 0 }
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/' && u.searchParams.get('list-type') === '2') {
      stats.lists++
      const prefix = u.searchParams.get('prefix')
      const keys = Object.keys(objects).filter((k) => k.startsWith(prefix)).sort()
      const start = Number(u.searchParams.get('continuation-token') || 0)
      const page = keys.slice(start, start + pageSize)
      const more = start + pageSize < keys.length
      res.writeHead(200)
      return res.end(
        `<ListBucketResult>${page.map((k) => `<Contents><Key>${k}</Key><Size>${Buffer.byteLength(objects[k].body)}</Size><LastModified>${objects[k].modified}</LastModified></Contents>`).join('')}` +
          `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : ''}</ListBucketResult>`
      )
    }
    stats.gets++
    if (failEvery && stats.gets % failEvery === 0) {
      stats.slowdowns++
      res.writeHead(503)
      return res.end('<Error><Code>SlowDown</Code></Error>')
    }
    const k = decodeURIComponent(u.pathname.slice(1))
    if (!objects[k]) {
      res.writeHead(404)
      return res.end('<Error><Code>NoSuchKey</Code></Error>')
    }
    const body = Buffer.from(objects[k].body)
    const m = /^bytes=0-(\d+)$/.exec(req.headers.range || '')
    if (m) {
      stats.ranged++
      const part = body.subarray(0, Number(m[1]) + 1)
      res.writeHead(206, { 'content-range': `bytes 0-${part.length - 1}/${body.length}`, 'content-length': part.length })
      return res.end(part)
    }
    stats.full++
    res.writeHead(200, { 'content-length': body.length })
    res.end(body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, stats, client: terraClient({ accessKeyId: 'AKIATEST', secretAccessKey: 's', endpoint: `http://127.0.0.1:${server.address().port}` }) })))
}

const body = (type, user_id, provider, scopes, pad = 0) =>
  JSON.stringify({ type, user: user_id ? { user_id, reference_id: `ref-${user_id}`, provider, scopes, active: true, last_webhook_update: null } : undefined, version: '2022-03-16', data: [{ samples: 'x'.repeat(pad) }] })

function world() {
  const o = {}
  let n = 0
  const add = (day, b, mod) => { o[key(day, ++n)] = { body: b, modified: mod || `${day}T10:00:00.000Z` }; return n }
  // Oldest day: two users, one with a big object (data far past 4 KB).
  add('2026-10-01', body('activity', 'u1', 'GARMIN', 'activity,sleep', 50_000))
  add('2026-10-01', body('auth', 'u2', 'FITBIT', 'heartrate,sleep'))
  add('2026-10-01', body('healthcheck'))
  // Later: u1's scopes change; u2 deauths.
  add('2026-10-10', body('permission_change', 'u1', 'GARMIN', 'activity,sleep,daily', 0), '2026-10-10T09:00:00.000Z')
  add('2026-10-10', body('deauth', 'u2', 'FITBIT', 'heartrate,sleep'), '2026-10-10T11:00:00.000Z')
  add('2026-10-11', body('sleep', 'u1', 'GARMIN', 'activity,sleep,daily', 20_000))
  return { o, add }
}

const tmpDb = () => openArchive(join(mkdtempSync(join(tmpdir(), 'terra-archive-')), 'archive.db'))
const DAYS = ['2026-10-01', '2026-10-10', '2026-10-11', '2026-10-12']

test('topLevelFields reads the header of a truncated object and refuses partial values', () => {
  const full = body('activity', 'u1', 'GARMIN', 'a,b', 10_000)
  const head = topLevelFields(full.slice(0, 4096), ['type', 'user', 'data'])
  assert.equal(head.fields.type, 'activity')
  assert.equal(head.fields.user.user_id, 'u1')
  assert.equal(head.fields.data, undefined, 'cut-off value is never returned')
  assert.equal(head.complete, false)
  assert.equal(topLevelFields(full, ['type']).complete, true)
  assert.deepEqual(topLevelFields('{"type": "a\\"b", "user": {"x": "}"}', ['type', 'user']).fields, { type: 'a"b', user: { x: '}' } })
})

test('summarizeObject: range read only for big payloads, full read for small connection events', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const big = await summarizeObject(s3.client, { key: key('2026-10-01', 1), size: Buffer.byteLength(o[key('2026-10-01', 1)].body) })
  assert.deepEqual([big.type, big.user_id, big.provider, big.scopes, big.raw], ['activity', 'u1', 'GARMIN', 'activity,sleep', null])
  assert.equal(s3.stats.full, 0, 'a 50 KB data payload is never downloaded')
  const auth = await summarizeObject(s3.client, { key: key('2026-10-01', 2), size: Buffer.byteLength(o[key('2026-10-01', 2)].body) })
  assert.equal(auth.type, 'auth')
  assert.ok(auth.raw && JSON.parse(auth.raw).user.user_id === 'u2', 'connection events are kept whole')
  const empty = await summarizeObject(s3.client, { key: key('2026-10-01', 9), size: 0 })
  assert.equal(empty.type, 'empty')
})

test('run: archives every day oldest first, scope history, idempotent rerun fetches nothing', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const db = tmpDb()
  const lines = []
  const r1 = await runArchive({ db, client: s3.client, log: (e) => lines.push(e), now: NOW, days: DAYS, runId: 'tr_1', overlapDays: 3 })
  assert.equal(r1.done, 6)
  assert.equal(r1.failed, 0)
  assert.deepEqual(r1.sealed, ['2026-10-01'], 'only days older than the overlap window seal')
  const listed = lines.filter((l) => l.event === 'day_listed').map((l) => l.day)
  assert.deepEqual(listed, DAYS, 'oldest first')

  const states = db.prepare("SELECT scopes, first_seen FROM user_states WHERE user_id = 'u1' ORDER BY first_seen").all()
  assert.deepEqual(states.map((s) => s.scopes), ['activity,sleep', 'activity,daily,sleep'], 'scope change kept as history')
  const latest = Object.fromEntries(latestStates(db).map((r) => [r.user_id, r]))
  assert.equal(latest.u1.scopes, 'activity,daily,sleep')
  assert.equal(latest.u2.provider, 'FITBIT')
  assert.equal(db.prepare("SELECT COUNT(*) n FROM conn_events").get().n, 3, 'auth, permission_change, deauth')
  assert.equal(db.prepare("SELECT events FROM user_day WHERE user_id = '' AND type = 'healthcheck'").get().events, 1)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM keys WHERE day = '2026-10-01'").get().n, 0, 'sealed day drops its key list')

  const getsBefore = s3.stats.gets
  const r2 = await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_2' })
  assert.equal(r2.done, 0, 'nothing reprocessed')
  assert.equal(s3.stats.gets, getsBefore, 'no object fetched again')
  assert.equal(db.prepare("SELECT SUM(events) n FROM user_day WHERE user_id = 'u1'").get().n, 3, 'no double counting')
})

test('overlap window: late keys on recent days are picked up; sealed days are never relisted', async (t) => {
  const { o, add } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const db = tmpDb()
  await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_1' })
  add('2026-10-11', body('daily', 'u3', 'OURA', 'daily'))
  add('2026-10-01', body('daily', 'u9', 'OURA', 'daily')) // after sealing: out of scope by design
  const lists = []
  const r = await runArchive({ db, client: s3.client, log: (e) => e.event === 'day_listed' && lists.push(e.day), now: NOW, days: DAYS, runId: 'tr_2' })
  assert.equal(r.done, 1)
  assert.ok(!lists.includes('2026-10-01'))
  assert.ok(latestStates(db).some((x) => x.user_id === 'u3'))
  // Four days later every day older than the 3-day window seals.
  const later = await runArchive({ db, client: s3.client, log: () => {}, now: NOW + 4 * 86_400_000, days: DAYS, runId: 'tr_3' })
  assert.deepEqual(later.sealed, ['2026-10-10', '2026-10-11', '2026-10-12'])
})

test('throttling: SlowDown halves concurrency, retries succeed, nothing lost', async (t) => {
  const o = {}
  for (let i = 1; i <= 120; i++) o[key('2026-10-11', i)] = { body: body('activity', `u${i % 7}`, 'GARMIN', 'activity'), modified: '2026-10-11T01:00:00.000Z' }
  const s3 = await fakeS3(o, { pageSize: 50, failEvery: 9 })
  t.after(() => s3.server.close())
  const db = tmpDb()
  const r = await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: ['2026-10-11'], runId: 'tr_t', startConcurrency: 32 })
  assert.ok(s3.stats.slowdowns > 0)
  assert.equal(r.done, 120)
  assert.equal(r.failed, 0)
  assert.ok(r.throttles > 0 && r.final_concurrency < 32, `concurrency backed off to ${r.final_concurrency}`)
  const th = new Throttle({ start: 8, max: 16 })
  for (let i = 0; i < 400; i++) th.ok()
  assert.equal(th.limit, 16, 'grows back on sustained success, capped')
})

test('budget and failures: a stopped run resumes; persistently failing keys retry then settle', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const db = tmpDb()
  let calls = 0
  const r1 = await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_a', shouldStop: () => ++calls > 3 })
  assert.equal(r1.stop, 'stopped by signal')
  const r2 = await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_b' })
  assert.equal(r1.done + r2.done, 6, 'resumed exactly where it stopped')

  // A key that always errors (non-transient) is recorded failed, retried on later runs, then sealed as dead.
  const bad = { ...s3.client, head: async (k, b) => { if (k.endsWith('000000000077.json')) throw new Error('S3 request failed: InvalidObjectState'); return s3.client.head(k, b) } }
  o[key('2026-10-02', 77)] = { body: body('activity', 'u1', 'GARMIN', 'activity'), modified: '2026-10-02T00:00:00.000Z' }
  for (let i = 0; i < 5; i++) await runArchive({ db, client: bad, log: () => {}, now: NOW, days: ['2026-10-02'], runId: `tr_f${i}` })
  const day = db.prepare("SELECT sealed, failed FROM days WHERE day = '2026-10-02'").get()
  assert.equal(day.sealed, 1)
  assert.equal(day.failed, 1, 'dead key counted on the sealed day')
  const st = archiveStatus(db)
  assert.ok(st.days.sealed >= 2)
})

test('AccessDenied stops the run with the IAM pointer instead of retrying', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const denied = { ...s3.client, listPage: async () => { throw new Error('S3 AccessDenied on the Terra payload bucket: …') } }
  await assert.rejects(runArchive({ db: tmpDb(), client: denied, log: () => {}, now: NOW, days: DAYS, runId: 'tr_d' }), /AccessDenied/)
})

test('logs hold counts and codes only', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const lines = []
  await runArchive({ db: tmpDb(), client: s3.client, log: (e) => lines.push(JSON.stringify(e)), now: NOW, days: DAYS, runId: 'tr_l' })
  const text = lines.join('\n')
  for (const leak of ['u1', 'u2', 'ref-', 'GARMIN', 'heartrate', uuid(1)]) assert.ok(!text.includes(leak), `log leaks ${leak}`)
  assert.ok(readFileSync(new URL('../terra-archive.mjs', import.meta.url), 'utf8').includes('statfsSync'), 'disk guard present')
})

test('a dropped connection while listing retries the page instead of skipping the day', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  let drops = 2
  const flaky = { ...s3.client, listPage: async (d, tok) => { if (drops-- > 0) throw new Error('S3 is not reachable (UND_ERR_SOCKET)'); return s3.client.listPage(d, tok) } }
  const lines = []
  const r = await runArchive({ db: tmpDb(), client: flaky, log: (e) => lines.push(e), now: NOW, days: DAYS, runId: 'tr_ls' })
  assert.equal(r.done, 6)
  assert.equal(lines.filter((l) => l.event === 'list_retry').length, 2)
  assert.equal(lines.filter((l) => l.event === 'list_error').length, 0)
})

// ---- resilience

// A client whose every request fails like a dead network until `up()` is called.
function outageClient(base, { downFor = Infinity } = {}) {
  let down = true
  let calls = 0
  const fail = async () => { throw new Error('S3 is not reachable (ENETUNREACH)') }
  const gate = (fn) => async (...a) => { calls++; if (down && calls <= downFor) return fail(); down = false; return fn(...a) }
  return { client: { listPage: gate(base.listPage), head: gate(base.head), get: gate(base.get) }, up: () => { down = false } }
}

test('an outage mid-day pauses the run, keeps every payload pending, and resumes when S3 answers', async (t) => {
  const o = {}
  for (let i = 1; i <= 60; i++) o[key('2026-10-11', i)] = { body: body('activity', `u${i % 5}`, 'GARMIN', 'activity'), modified: '2026-10-11T01:00:00.000Z' }
  const s3 = await fakeS3(o, { pageSize: 100 })
  t.after(() => s3.server.close())
  const db = tmpDb()
  // List works, then the network is down until the run has probed it twice.
  let lists = 0
  const c = {
    listPage: async (d, tok) => { if (++lists === 1 || lists > 3) return s3.client.listPage(d, tok); throw new Error('S3 is not reachable (ENETUNREACH)') },
    head: async (k, b) => { if (lists <= 3) throw new Error('S3 is not reachable (ENETUNREACH)'); return s3.client.head(k, b) },
    get: s3.client.get,
  }
  const lines = []
  const r = await runArchive({ db, client: c, log: (e) => lines.push(e), now: NOW, days: ['2026-10-11'], runId: 'tr_o', probeMs: 100, outageMinutes: 1, startConcurrency: 8 })
  assert.equal(r.done, 60, 'every payload archived after the outage')
  assert.equal(r.failed, 0, 'no attempt spent on the outage')
  assert.ok(r.outages >= 1)
  assert.ok(lines.some((l) => l.event === 'outage_start') && lines.some((l) => l.event === 'outage_end'))
  assert.equal(db.prepare("SELECT MAX(attempts) a FROM keys").get().a, 1, 'only the successful attempt counted')
})

test('an outage longer than outageMinutes ends the run as "network down" with nothing lost', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const db = tmpDb()
  const { client } = outageClient(s3.client)
  const r = await runArchive({ db, client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_down', probeMs: 50, outageMinutes: 0.01 })
  assert.match(r.stop, /^network down/)
  assert.equal(r.failed, 0)
  // Back online: the next run picks up everything.
  const r2 = await runArchive({ db, client: s3.client, log: () => {}, now: NOW, days: DAYS, runId: 'tr_up' })
  assert.equal(r2.done, 6)
})

test('a key that keeps failing on the network while others succeed is counted failed, not deferred forever', async (t) => {
  const { o } = world()
  const s3 = await fakeS3(o)
  t.after(() => s3.server.close())
  const db = tmpDb()
  const badKey = key('2026-10-01', 2)
  const c = { ...s3.client, head: async (k, b) => { if (k === badKey) throw new Error('S3 is not reachable (ECONNRESET)'); return s3.client.head(k, b) } }
  const r = await runArchive({ db, client: c, log: () => {}, now: NOW, days: ['2026-10-01'], runId: 'tr_k', probeMs: 20, outageMinutes: 1 })
  assert.equal(r.done, 2)
  assert.equal(r.failed, 1, 'gave up on the one key after its deferrals')
})

test('a stalled socket times out instead of hanging', async (t) => {
  const { createServer: cs } = await import('node:http')
  const server = cs(() => {}) // accepts, never answers
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => { server.closeAllConnections?.(); server.close() })
  const c = terraClient({ accessKeyId: 'AKIATEST', secretAccessKey: 's', endpoint: `http://127.0.0.1:${server.address().port}`, timeoutMs: 200 })
  const t0 = Date.now()
  await assert.rejects(c.head(key('2026-10-11', 1), 4096), /not reachable/)
  assert.ok(Date.now() - t0 < 2000)
})

test('decideTick: runs only when behind, backs off after trouble, waits out a full disk', () => {
  const db = tmpDb()
  const now = Date.parse('2026-10-14T12:00:00Z')
  const H = 3_600_000
  const seal = (days) => { for (const d of days) db.prepare('INSERT OR REPLACE INTO days (day, sealed) VALUES (?, 1)').run(d) }
  const addRun = (id, ago, status, summary) => db.prepare('INSERT INTO runs (run_id, started, finished, status, trigger, summary) VALUES (?, ?, ?, ?, ?, ?)').run(id, new Date(now - ago - 60_000).toISOString(), new Date(now - ago).toISOString(), status, 'tick', JSON.stringify(summary))
  const window = Array.from({ length: 27 }, (_, i) => new Date(now - (i + 4) * 86_400_000).toISOString().slice(0, 10))

  assert.match(decideTick(db, { now }).reason, /catching up: 27 unsealed days/)
  seal(window)
  assert.equal(decideTick(db, { now }).reason, 'first complete pass')
  addRun('r1', 1 * H, 'ok', { stop: 'all days current' })
  assert.deepEqual(decideTick(db, { now }), { run: false, reason: 'current: last complete pass 60 min ago' })
  assert.match(decideTick(db, { now: now + 6 * H }).reason, /^refresh/)
  assert.match(decideTick(db, { now, freeGb: 3 }).reason, /disk floor/)

  addRun('r2', 0.1 * H, 'ok', { stop: 'network down (no answer from S3 for 20 min)' })
  assert.match(decideTick(db, { now }).reason, /backing off after 1 troubled run/)
  assert.match(decideTick(db, { now: now + 0.2 * H }).reason, /^retry after 1/)
  addRun('r3', 0.05 * H, 'crashed', { stop: 'watchdog: no progress for 10 min' })
  const two = decideTick(db, { now: now + 0.4 * H })
  assert.equal(two.run, false, '2nd trouble waits 30 min')
  assert.equal(decideTick(db, { now: now + 0.6 * H }).run, true)
  addRun('r4', 0.01 * H, 'failed', { error: 'S3 AccessDenied on the Terra payload bucket' })
  assert.match(decideTick(db, { now: now + 2 * H }).reason, /AccessDenied/)
  assert.equal(decideTick(db, { now: now + 2 * H }).run, false, 'AccessDenied waits 6 h')
})

test('reconcileCrashed marks runs a dead process left running', () => {
  const db = tmpDb()
  db.prepare("INSERT INTO runs (run_id, started, status) VALUES ('old', '2026-10-14T01:00:00Z', 'running'), ('me', '2026-10-14T02:00:00Z', 'running')").run()
  assert.equal(reconcileCrashed(db, 'me'), 1)
  assert.equal(db.prepare("SELECT status FROM runs WHERE run_id = 'old'").get().status, 'crashed')
  assert.equal(db.prepare("SELECT status FROM runs WHERE run_id = 'me'").get().status, 'running')
})
