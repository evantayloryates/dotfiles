// Fake claude-driver CLI for adapter tests. Behaviour by service name in the
// session title: mend -> fixes; quiet -> ends its turn without a result;
// nopool -> pool empty; lowperm -> imported in acceptEdits; slowpoke -> never
// finishes. Records every call (with env markers) in fake-driver.log.
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
// The real driver call gets a clean environment (HOME and PATH only), so the
// fake keeps its record in a fixed place the fixer suite reads.
const DIR = join(process.env.HOME, '.cache/anchor-lab/fake-driver')
mkdirSync(DIR, { recursive: true })
const [tool, , json] = process.argv.slice(2)
const args = JSON.parse(json)
appendFileSync(join(DIR, 'calls.log'), JSON.stringify({ tool, args, broker: process.argv.includes('--broker'), envLeak: Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE')).length }) + '\n')
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o)); process.exit(code) }
if (tool === 'create_session') {
  const svc = args.title.split(': ').pop()
  if (svc === 'nopool') { process.stderr.write('create_session failed [pool_empty]: no parked bypass session in folder\n'); process.exit(1) }
  const id = `local_fake_${svc}_${Date.now()}`
  if (svc === 'lowperm') out({ sessionId: id, permissionMode: 'acceptEdits', permissionGap: 'pool empty', verified: false })
  writeFileSync(join(DIR, `${id}.json`), JSON.stringify({ live: { status: 'busy' }, completedTurns: 0 }))
  writeFileSync(join(DIR, `${id}.brief.txt`), args.first_message)
  spawn(process.execPath, [new URL(import.meta.url).pathname, 'agent', '--json', JSON.stringify({ id, svc, brief: args.first_message })], { detached: true, stdio: 'ignore' }).unref()
  out({ sessionId: id, permissionMode: 'bypassPermissions', verified: true, via: 'pool' })
}
if (tool === 'agent') {
  const { id, svc, brief } = args
  const result = brief.match(/^\s+(\/\S+\.result\.json)$/m)[1]
  await new Promise((r) => setTimeout(r, 800))
  if (svc === 'slowpoke') { setInterval(() => {}, 1000); await new Promise(() => {}) }
  if (svc === 'mend') {
    // Like a real fixer: the folder and the release command come from the brief.
    const folder = brief.match(/working folder: (\S+) /)[1]
    const env = Object.fromEntries([...brief.match(/run `([^`]*) node src\/release\.mjs/)[1].matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]))
    const src = join(folder, 'index.mjs')
    writeFileSync(src, readFileSync(src, 'utf8').replace(/const CRASH = \[[^\]]*\]/, 'const CRASH = []'))
    const rel = JSON.parse(execFileSync(process.execPath, ['src/release.mjs', 'release', svc, '--hotfix'], { env: { ...process.env, ...env } }).toString())
    writeFileSync(result, JSON.stringify({ outcome: 'fixed', release: rel.slug, note: 'emptied the crash list' }))
  }
  writeFileSync(join(DIR, `${id}.json`), JSON.stringify({ live: { status: 'idle' }, completedTurns: 1 }))
  process.exit(0)
}
if (tool === 'get_session') {
  const p = join(DIR, `${args.session}.json`)
  out(existsSync(p) ? { sessionId: args.session, ...JSON.parse(readFileSync(p, 'utf8')) } : { error: 'unknown' })
}
if (tool === 'pool_release') out({ sessionId: args.session, phase: 'recycle' })
out({ error: `fake driver: unknown tool ${tool}` }, 1)
