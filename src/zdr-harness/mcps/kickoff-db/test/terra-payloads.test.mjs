import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkKey, dayCounts, readPayload, recentDays, scopesExport, summarizePayload, terraClient, TerraError, writeScopesFile } from '../terra-payloads.mjs'

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const key = (day, n) => `production/${day}/${uuid(n)}.json`

// A fake S3: objects { key: { body, modified } }, pages of `pageSize`.
function fakeS3(objects, { pageSize = 2 } = {}) {
  const requests = []
  const server = createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization || '' })
    if (!/^AWS4-HMAC-SHA256 Credential=AKIATEST\//.test(req.headers.authorization || '')) {
      res.writeHead(403)
      return res.end('<Error><Code>AccessDenied</Code></Error>')
    }
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/' && u.searchParams.get('list-type') === '2') {
      const prefix = u.searchParams.get('prefix')
      if (!prefix.startsWith('production/')) {
        res.writeHead(403)
        return res.end('<Error><Code>AccessDenied</Code></Error>')
      }
      const keys = Object.keys(objects).filter((k) => k.startsWith(prefix)).sort()
      const start = Number(u.searchParams.get('continuation-token') || 0)
      const page = keys.slice(start, start + pageSize)
      const more = start + pageSize < keys.length
      res.writeHead(200, { 'content-type': 'application/xml' })
      return res.end(
        `<ListBucketResult>${page.map((k) => `<Contents><Key>${k}</Key><Size>${objects[k].body.length}</Size><LastModified>${objects[k].modified}</LastModified></Contents>`).join('')}` +
          `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : ''}</ListBucketResult>`
      )
    }
    const k = decodeURIComponent(u.pathname.slice(1))
    if (!objects[k]) {
      res.writeHead(404)
      return res.end('<Error><Code>NoSuchKey</Code></Error>')
    }
    res.writeHead(200, { 'content-length': Buffer.byteLength(objects[k].body) })
    res.end(objects[k].body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, endpoint: `http://127.0.0.1:${server.address().port}` })))
}
const creds = { accessKeyId: 'AKIATEST', secretAccessKey: 'secret' }
const payload = (user_id, provider, scopes, type, extra = '') => JSON.stringify({ type, user: { user_id, reference_id: '123', provider, scopes, active: true }, data: [extra] })

test('key and day checks refuse anything outside production/<day>/<uuid>.json', () => {
  assert.equal(checkKey(key('2026-10-11', 1)), key('2026-10-11', 1))
  for (const bad of ['staging/2026-10-11/x.json', `production/2026-10-11/../${uuid(1)}.json`, 'production/2026-10-11/notauuid.json', `other-bucket/${key('2026-10-11', 1)}`, '', null]) {
    assert.throws(() => checkKey(bad), TerraError, String(bad))
  }
  assert.deepEqual(recentDays(3, Date.parse('2026-10-12T05:00:00Z')), ['2026-10-12', '2026-10-11', '2026-10-10'])
  assert.equal(recentDays(500).length, 31, 'never past the 30-day lifecycle window')
})

test('list pages, counts by day, bounded read, signed requests only', async (t) => {
  const objects = {
    [key('2026-10-11', 1)]: { body: payload('u1', 'OURA', 'daily,sleep', 'daily'), modified: '2026-10-11T01:00:00Z' },
    [key('2026-10-11', 2)]: { body: payload('u2', 'APPLE', '', 'body'), modified: '2026-10-11T02:00:00Z' },
    [key('2026-10-11', 3)]: { body: payload('u3', 'FITBIT', 'activity', 'activity'), modified: '2026-10-11T03:00:00Z' },
    'staging/2026-10-11/x.json': { body: '{}', modified: '2026-10-11T00:00:00Z' },
  }
  const { server, requests, endpoint } = await fakeS3(objects)
  t.after(() => server.close())
  const c = terraClient({ ...creds, endpoint })
  const counts = await dayCounts(c, ['2026-10-11', '2026-10-10'])
  assert.deepEqual(counts.map((d) => [d.day, d.objects, d.complete]), [['2026-10-11', 3, true], ['2026-10-10', 0, true]])
  const capped = await dayCounts(c, ['2026-10-11'], { maxPagesPerDay: 1 })
  assert.equal(capped[0].complete, false)
  const r = await readPayload(c, key('2026-10-11', 1), { maxChars: 40 })
  assert.equal(r.text.length, 40)
  assert.ok(r.more)
  await assert.rejects(readPayload(c, 'staging/2026-10-11/x.json'), TerraError)
  await assert.rejects(readPayload(c, key('2026-10-11', 9)), /No such payload/)
  assert.ok(requests.every((q) => q.auth.startsWith('AWS4-HMAC-SHA256')))
  assert.ok(requests.every((q) => !q.url.includes('staging')), 'never requested outside production/')
  const denied = terraClient({ accessKeyId: 'WRONG', secretAccessKey: 'x', endpoint })
  await assert.rejects(denied.listPage('2026-10-11'), /AccessDenied/)
})

test('scopes export: latest day per user, smallest first, saturation stop, stats only', async (t) => {
  const objects = {
    // newest day: u1 changed scopes; a large object fetched last
    [key('2026-10-12', 1)]: { body: payload('u1', 'OURA', 'daily,sleep,heart', 'auth'), modified: '2026-10-12T09:00:00Z' },
    [key('2026-10-12', 2)]: { body: payload('u1', 'OURA', 'daily', 'daily', 'x'.repeat(500)), modified: '2026-10-12T01:00:00Z' },
    [key('2026-10-12', 3)]: { body: '{"not":"a terra payload"}', modified: '2026-10-12T02:00:00Z' },
    // older day: u1 older, u2 only here
    [key('2026-10-11', 4)]: { body: payload('u1', 'OURA', 'old', 'daily'), modified: '2026-10-11T09:00:00Z' },
    [key('2026-10-11', 5)]: { body: payload('u2', 'APPLE', '', 'deauth'), modified: '2026-10-11T09:00:00Z' },
  }
  const { server, endpoint } = await fakeS3(objects)
  t.after(() => server.close())
  const c = terraClient({ ...creds, endpoint })
  const { rows, stats } = await scopesExport(c, { days: ['2026-10-12', '2026-10-11'], concurrency: 2 })
  const u1 = rows.find((r) => r.user_id === 'u1')
  assert.deepEqual(u1.scopes, ['daily', 'sleep', 'heart'], 'latest write within the newest day wins')
  assert.equal(u1.last_event_day, '2026-10-12')
  const u2 = rows.find((r) => r.user_id === 'u2')
  assert.equal(u2.scopes_reported, false)
  assert.equal(stats.users, 2)
  assert.deepEqual(stats.by_provider, { OURA: { users: 1, with_scopes: 1 }, APPLE: { users: 1, with_scopes: 0 } })
  const target = await scopesExport(c, { days: ['2026-10-12', '2026-10-11'], targetUsers: 1, concurrency: 1 })
  assert.match(target.stats.stop_reason, /reached 1 users/)
  assert.ok(target.stats.objects_fetched < 5)
  const sat = await scopesExport(c, { days: ['2026-10-12', '2026-10-11'], saturation: 1, concurrency: 1 })
  assert.match(sat.stats.stop_reason, /found no new user/)
  const dir = mkdtempSync(join(tmpdir(), 'terra-export-'))
  const { id, path } = writeScopesFile(dir, rows)
  assert.match(id, /^ts_[a-f0-9]{8}$/)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(readFileSync(path, 'utf8').trim().split('\n').length, 2)
})

test('summarizePayload ignores payloads without a user', () => {
  assert.equal(summarizePayload({ type: 'healthcheck' }), null)
  assert.equal(summarizePayload(null), null)
  assert.deepEqual(summarizePayload(JSON.parse(payload('u9', 'WITHINGS', ' a , b ', 'body'))).scopes, ['a', 'b'])
})
