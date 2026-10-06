// Live pressure test against staging, through the real launcher over MCP
// stdio. Prints a verdict, time and answer size per case, never row data.
//   node src/mcps/kickoff-stage-db/test/online.mjs [--only name,name] [--vpn]
// --vpn also disconnects Tunnelblick (and quits it) to prove recovery.

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const LAUNCHER = new URL('../../kickoff-stage-db-mcp', import.meta.url).pathname
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const withVpn = args.includes('--vpn')
const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'stage-db-test-'))

function startServer(env = {}) {
  const p = spawn(LAUNCHER, [], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  const waiting = new Map()
  let id = 0
  let stderr = ''
  p.stderr.on('data', (d) => { stderr += d })
  createInterface({ input: p.stdout }).on('line', (line) => {
    const m = JSON.parse(line)
    waiting.get(m.id)?.(m)
    waiting.delete(m.id)
  })
  const rpc = (method, params) =>
    new Promise((res) => {
      const i = ++id
      waiting.set(i, res)
      p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`)
    })
  const call = async (name, a = {}) => {
    const t = Date.now()
    const m = await rpc('tools/call', { name, arguments: a })
    const text = m.result?.content?.[0]?.text ?? m.error?.message ?? ''
    return { text, isError: !!m.result?.isError || !!m.error, ms: Date.now() - t }
  }
  return { p, rpc, call, raw: (s) => p.stdin.write(s), stderr: () => stderr, stop: () => p.stdin.end() }
}

const results = []
async function check(name, fn) {
  if (only && !only.includes(name)) return
  const t = Date.now()
  try {
    const note = await fn()
    results.push({ name, ok: true, ms: Date.now() - t, note })
    console.log(`PASS ${name} (${Date.now() - t} ms)${note ? ` — ${note}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, note: e.message })
    console.log(`FAIL ${name} (${Date.now() - t} ms) — ${e.message}`)
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
const firstLine = (s) => s.split('\n')[0].slice(0, 160)
const tb = (script) => execFileSync('/usr/bin/osascript', ['-e', script]).toString().trim()

const s = startServer()
const init = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'online-test', version: '1' } })

await check('initialize', async () => {
  expect(init.result?.serverInfo?.name === 'kickoff-stage-db', 'bad serverInfo')
  expect(/STAGING/.test(init.result.instructions), 'instructions do not say STAGING')
  const list = await s.rpc('tools/list', {})
  const names = list.result.tools.map((t) => t.name)
  expect(names.join() === 'stage_guide,stage_tables,stage_describe,stage_query,stage_status', names.join())
  expect(list.result.tools.every((t) => t.description.startsWith('[STAGING')), 'a description does not lead with STAGING')
  return `${JSON.stringify(list.result).length} chars of tool schema`
})

await check('guide', async () => {
  const r = await s.call('stage_guide')
  expect(!r.isError && /NOT production/.test(r.text) && /zdr_ask/.test(r.text) && /Sanitized/.test(r.text), 'guide missing routing')
  return `${r.text.length} chars`
})

await check('status', async () => {
  const r = await s.call('stage_status')
  expect(/read only=yes/.test(r.text) && /kickoff_stage_ro/.test(r.text), r.text)
  return r.text.split('\n').find((l) => l.startsWith('latency'))
})

await check('aggregate', async () => {
  const r = await s.call('stage_query', { sql: 'SELECT status, COUNT(*) n FROM clients GROUP BY status ORDER BY n DESC' })
  expect(!r.isError && r.text.startsWith('columns: ["status","n"]'), firstLine(r.text))
  return `${r.ms} ms, ${r.text.length} chars`
})

await check('params', async () => {
  const r = await s.call('stage_query', { sql: 'SELECT COUNT(*) n FROM clients WHERE id IN (?) AND status = ?', params: [[1, 2, 3, 94359], 1] })
  expect(!r.isError && /^\[\d+\]$/m.test(r.text), r.text)
  const bad = await s.call('stage_query', { sql: 'SELECT ? a, ? b', params: [1] })
  expect(bad.isError, `mismatched params should fail: ${bad.text}`)
  const obj = await s.call('stage_query', { sql: 'SELECT ?', params: [{ a: 1 }] })
  expect(obj.isError && /params/.test(obj.text), obj.text)
  return firstLine(bad.text)
})

await check('row-cap-and-recover', async () => {
  const r = await s.call('stage_query', { sql: 'SELECT id FROM clients', limit: 5 })
  expect(!r.isError && /stopped at 5 rows/.test(r.text), firstLine(r.text))
  const again = await s.call('stage_query', { sql: 'SELECT 1 AS one' })
  expect(!again.isError, 'next call after an abandoned stream failed')
  return `cap answered in ${r.ms} ms, next call ${again.ms} ms`
})

await check('default-cap-size', async () => {
  const r = await s.call('stage_query', { sql: 'SELECT id, status, coach_id, signed_up FROM clients ORDER BY id' })
  expect(/stopped at 100 rows/.test(r.text), 'no cap note')
  return `${r.text.length} chars for 100 rows x 4 cols`
})

await check('timeout', async () => {
  const r = await s.call('stage_query', { sql: "SELECT COUNT(*) FROM sms WHERE body LIKE '%qqzzxx%'", timeout_seconds: 2 })
  expect(r.isError && /2 s limit/.test(r.text), r.text)
  return r.text
})

await check('explain-analyze-bounded', async () => {
  const r = await s.call('stage_query', { sql: "EXPLAIN ANALYZE SELECT COUNT(*) FROM sms WHERE body LIKE '%qqzzxx%'", timeout_seconds: 1 })
  // MAX_EXECUTION_TIME bounds EXPLAIN ANALYZE too (a truncated run comes back).
  expect(r.ms < 25_000, `took ${r.ms} ms`)
  const after = await s.call('stage_query', { sql: 'SELECT 1' })
  expect(!after.isError, 'server unusable after a kill')
  return `${r.ms} ms: ${r.text.slice(0, 120)}`
})

await check('writes-refused', async () => {
  for (const sql of ['UPDATE clients SET status=status WHERE id=-1', 'CREATE TEMPORARY TABLE t (a int)', 'SET SESSION transaction_read_only=OFF', 'SELECT 1; DELETE FROM clients WHERE id=-1', "SELECT 1 INTO OUTFILE '/tmp/x'", 'WITH a AS (SELECT 1) DELETE FROM clients WHERE id=-1', "SELECT GET_LOCK('x',1)"]) {
    const r = await s.call('stage_query', { sql })
    expect(r.isError, `not refused: ${sql}`)
  }
  const sys = await s.call('stage_query', { sql: 'SELECT * FROM mysql.user' })
  expect(sys.isError && /DENIED/.test(sys.text), sys.text)
  return 'checker + grants'
})

await check('types', async () => {
  const r = await s.call('stage_query', {
    sql: "SELECT UNHEX('DEADBEEF') b, REPEAT('x', 700) big, CAST('{\"a\":1}' AS JSON) j, 9223372036854775807 bi, 1.25 d, CURDATE() dt, NULL n, 1 AS id, 2 AS id",
  })
  expect(!r.isError && /0xdeadbeef/.test(r.text) && /…<\+200 chars>/.test(r.text) && /"9223372036854775807"/.test(r.text), r.text.slice(0, 300))
  expect(/cut at 500/.test(r.text), 'no cut note')
  return 'binary, long, json, bigint, decimal, date, null, duplicate names'
})

await check('show-explain-describe', async () => {
  for (const sql of ['SHOW TABLES LIKE "%call%"', 'EXPLAIN SELECT * FROM clients WHERE coach_id = 1', 'DESCRIBE payers', 'SHOW PROCESSLIST', 'TABLE payers']) {
    const r = await s.call('stage_query', { sql, limit: 3 })
    expect(!r.isError, `${sql}: ${r.text}`)
  }
})

await check('tables-describe', async () => {
  const a = await s.call('stage_tables', { like: 'call', limit: 5 })
  expect(!a.isError && a.text.split('\n').length <= 6, a.text)
  const b = await s.call('stage_tables', { column_like: 'kickoff_call_id' })
  expect(!b.isError && /\[.*kickoff_call_id/.test(b.text), b.text.slice(0, 200))
  const c = await s.call('stage_describe', { tables: ['clients', 'payers', 'nope_table'] })
  expect(!c.isError && /indexes:/.test(c.text) && /No table named nope_table/.test(c.text), c.text.slice(-200))
  const d = await s.call('stage_describe', { table: 'clients; drop' })
  expect(d.isError, 'bad ident accepted')
  const e = await s.call('stage_describe', { tables: Array(11).fill('x') })
  expect(e.isError, '11 tables accepted')
  return `tables ${a.ms} ms, column_like ${b.ms} ms, describe x3 ${c.ms} ms (${c.text.length} chars)`
})

await check('bad-arguments', async () => {
  const a = await s.call('stage_query', { sql: 'SELECT 1', limt: 5 })
  expect(a.isError && /Unknown argument limt/.test(a.text), a.text)
  const b = await s.call('stage_query', { sql: 'SELECT 1', limit: 5000 })
  expect(b.isError && /1 to 1000/.test(b.text), b.text)
  const c = await s.call('nope_tool', {})
  expect(c.isError, 'unknown tool accepted')
  const d = await s.call('stage_query', {})
  expect(d.isError && /required/.test(d.text), d.text)
  const pe = await new Promise((res) => {
    s.p.stdout.once('data', (dd) => res(String(dd)))
    s.raw('{not json}\n')
  })
  expect(/Parse error/.test(pe), pe)
})

await check('concurrency-40', async () => {
  const t = Date.now()
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => s.call('stage_query', { sql: `SELECT COUNT(*) FROM clients WHERE id % 40 = ${i}` })))
  const bad = rs.filter((r) => r.isError)
  expect(!bad.length, `${bad.length} failed: ${bad[0]?.text}`)
  return `40 parallel in ${Date.now() - t} ms`
})

await check('export-csv', async () => {
  const out = join(dir, 'clients.csv')
  const r = await s.call('stage_query', { sql: 'SELECT id, status, coach_id, signed_up FROM clients WHERE id <= 300000', output_path: out })
  expect(!r.isError && existsSync(out), r.text)
  const lines = readFileSync(out, 'utf8').split('\n').length - 2
  const mode = (statSync(out).mode & 0o777).toString(8)
  expect(mode === '600', `mode ${mode}`)
  const n = Number(r.text.match(/Wrote ([\d,]+)/)[1].replace(/,/g, ''))
  expect(n === lines, `said ${n}, file has ${lines}`)
  return `${n} rows in ${r.ms} ms; answer ${r.text.length} chars`
})

await check('export-guards', async () => {
  const exists = await s.call('stage_query', { sql: 'SELECT 1', output_path: join(dir, 'clients.csv') })
  expect(exists.isError && /exists/.test(exists.text), exists.text)
  const over = await s.call('stage_query', { sql: 'SELECT 1 a', output_path: join(dir, 'clients.csv'), overwrite: true })
  expect(!over.isError, over.text)
  const rel = await s.call('stage_query', { sql: 'SELECT 1', output_path: 'x.csv' })
  expect(rel.isError && /absolute/.test(rel.text), rel.text)
  const ext = await s.call('stage_query', { sql: 'SELECT 1', output_path: join(dir, 'x.txt') })
  expect(ext.isError && /\.csv/.test(ext.text), ext.text)
  const repo = await s.call('stage_query', { sql: 'SELECT 1', output_path: '/Users/taylor/src/github/kickoff/node/stage-rows.csv' })
  expect(repo.isError && /git work tree/.test(repo.text), repo.text)
  const ignored = await s.call('stage_query', { sql: 'SELECT 1 a', output_path: '/Users/taylor/src/github/kickoff/.scratch/stage-db-test/one.jsonl', overwrite: true })
  expect(!ignored.isError, `git-ignored .scratch refused: ${ignored.text}`)
  rmSync('/Users/taylor/src/github/kickoff/.scratch/stage-db-test', { recursive: true, force: true })
  const tilde = await s.call('stage_query', { sql: 'SELECT 1 a', output_path: '~/Downloads/../Downloads/.stage-db-test.tsv', overwrite: true })
  expect(!tilde.isError, tilde.text)
  rmSync(join(process.env.HOME, 'Downloads/.stage-db-test.tsv'), { force: true })
  const empty = await s.call('stage_query', { sql: 'SELECT id FROM clients WHERE id < 0', output_path: join(dir, 'empty.jsonl') })
  expect(!empty.isError && /Wrote 0 rows/.test(empty.text), empty.text)
  const failed = await s.call('stage_query', { sql: 'SELECT nope FROM clients', output_path: join(dir, 'bad.csv') })
  expect(failed.isError && !existsSync(join(dir, 'bad.csv')), 'failed export left a file')
})

await check('client-cancel-kills-query', async () => {
  // Send a slow call, then notifications/cancelled for its id, as Claude does on Esc.
  const t = Date.now()
  const pending = new Promise((res) => {
    const handler = (d) => {
      for (const line of String(d).split('\n')) {
        if (!line.trim()) continue
        const m = JSON.parse(line)
        if (m.id === 'slow-1') { s.p.stdout.off('data', handler); res(m) }
      }
    }
    s.p.stdout.on('data', handler)
  })
  s.raw(`${JSON.stringify({ jsonrpc: '2.0', id: 'slow-1', method: 'tools/call', params: { name: 'stage_query', arguments: { sql: "SELECT COUNT(*) FROM sms WHERE body LIKE '%qqzzxx%'", timeout_seconds: 60 } } })}\n`)
  await new Promise((r) => setTimeout(r, 1500))
  s.raw(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'slow-1', reason: 'test' } })}\n`)
  const m = await pending
  const text = m.result?.content?.[0]?.text || ''
  expect(Date.now() - t < 10_000, `cancel took ${Date.now() - t} ms`)
  expect(/cancelled/i.test(text), text.slice(0, 200))
  return `stopped after ${Date.now() - t} ms: ${text.slice(0, 80)}`
})

await check('wide-row-capped', async () => {
  const r = await s.call('stage_query', { sql: "SELECT REPEAT('x', 300000) a, REPEAT('y', 300000) b, REPEAT('z', 300000) c", max_cell_chars: 20000 })
  expect(!r.isError && r.text.length < 110_000, `answer ${r.text.length} chars`)
  return `${r.text.length} chars`
})

await check('bad-sql-message', async () => {
  const r = await s.call('stage_query', { sql: 'SELECT nope FROM clients' })
  expect(r.isError && /ER_BAD_FIELD_ERROR/.test(r.text), r.text)
  const t = await s.call('stage_query', { sql: 'SELECT * FROM no_such_table' })
  expect(t.isError && /ER_NO_SUCH_TABLE/.test(t.text), t.text)
  return r.text
})

// Configuration failures, each in its own server process.
async function oneShot(env, tool = 'stage_status', a = {}) {
  const x = startServer(env)
  await x.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  const r = await x.call(tool, a)
  x.stop()
  return r
}

await check('config-failures', async () => {
  const out = []
  // The launcher reads dotfiles .env; point it at temporary .env files.
  const mk = (body) => {
    const d = mkdtempSync(join(dir, 'env-'))
    writeFileSync(join(d, '.env'), body, { mode: 0o600 })
    return { DOTFILES_DIR: d }
  }
  const real = readFileSync(join(process.env.HOME, 'dotfiles/.env'), 'utf8').match(/^KICKOFF_STAGE_DB_URL=(.*)$/m)[1]
  const noUrl = await oneShot(mk('OTHER=1\n'), 'stage_query', { sql: 'SELECT 1' })
  expect(noUrl.isError && /KICKOFF_STAGE_DB_URL is not set/.test(noUrl.text), noUrl.text)
  out.push('no url')
  const badPw = await oneShot(mk(`KICKOFF_STAGE_DB_URL=${real.replace(/:[^:@]+@/, ':wrongpassword@')}\n`), 'stage_query', { sql: 'SELECT 1' })
  expect(badPw.isError && /rejected the kickoff_stage_ro password/.test(badPw.text), badPw.text)
  out.push('bad password')
  const prod = await oneShot(mk('KICKOFF_STAGE_DB_URL=mysql://u:p@kickoff-production-mysql-read.example.com:3306/kudos_production\n'), 'stage_query', { sql: 'SELECT 1' })
  expect(prod.isError && /refusing/.test(prod.text), prod.text)
  out.push('prod url refused')
  const dns = await oneShot(mk('KICKOFF_STAGE_DB_URL=mysql://u:p@no-such-host.invalid:3306/kudos_staging\n'), 'stage_query', { sql: 'SELECT 1' })
  expect(dns.isError && /resolve/.test(dns.text), dns.text)
  out.push(`dns (${dns.ms} ms)`)
  const quoted = await oneShot(mk(`export KICKOFF_STAGE_DB_URL="${real}"\nKICKOFF_STAGE_DB_VPN='taylor-vpn'\n`), 'stage_query', { sql: 'SELECT 1' })
  expect(!quoted.isError, `quoted/exported .env line failed: ${quoted.text}`)
  out.push('quoted .env')
  const noVpnCfg = await oneShot(mk(`KICKOFF_STAGE_DB_URL=${real}\nKICKOFF_STAGE_DB_VPN=nope-vpn\n`), 'stage_status')
  expect(/NO_CONFIG/.test(noVpnCfg.text), noVpnCfg.text)
  out.push('unknown vpn name')
  return out.join(', ')
})

if (withVpn) {
  await check('vpn-disconnected', async () => {
    tb('tell application id "net.tunnelblick.tunnelblick" to disconnect "taylor-vpn"')
    for (let i = 0; i < 20 && tb('tell application id "net.tunnelblick.tunnelblick" to get state of first configuration where name = "taylor-vpn"') !== 'EXITING'; i++) await new Promise((r) => setTimeout(r, 500))
    await new Promise((r) => setTimeout(r, 2000))
    const r = await s.call('stage_query', { sql: 'SELECT COUNT(*) FROM payers' })
    expect(!r.isError, r.text)
    return `recovered in ${r.ms} ms`
  })
  await check('tunnelblick-quit', async () => {
    tb('tell application id "net.tunnelblick.tunnelblick" to disconnect all')
    await new Promise((r) => setTimeout(r, 3000))
    tb('tell application id "net.tunnelblick.tunnelblick" to quit')
    await new Promise((r) => setTimeout(r, 4000))
    const fresh = startServer()
    await fresh.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })
    const r = await fresh.call('stage_query', { sql: 'SELECT COUNT(*) FROM payers' })
    fresh.stop()
    expect(!r.isError, r.text)
    return `cold start after quit: ${r.ms} ms`
  })
  await check('vpn-drop-mid-query', async () => {
    const pending = s.call('stage_query', { sql: "SELECT COUNT(*) FROM sms WHERE body LIKE '%qqzzxx%' AND id < 3000000", timeout_seconds: 20 })
    await new Promise((r) => setTimeout(r, 1500))
    tb('tell application id "net.tunnelblick.tunnelblick" to disconnect "taylor-vpn"')
    const r = await pending
    return `${r.isError ? 'error' : 'ok'} after ${r.ms} ms: ${r.text.slice(0, 140)}`
  })
}

s.stop()
rmSync(dir, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (process.env.SHOW_STDERR) console.log(s.stderr())
process.exit(failed.length ? 1 : 0)
