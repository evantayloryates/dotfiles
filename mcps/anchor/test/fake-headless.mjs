// Fake bin/claude-headless. Behaviour by the ticket's service: fixit fixes;
// nochange reports ready without edits; breaks introduces drift; hangs never
// ends; noresult ends without result.json; errored fails the run; restructure
// adds a folder. Logs argv, cwd and env names for assertions.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const argv = process.argv.slice(2)
const brief = argv[argv.indexOf('-p') + 1]
const data = JSON.parse(brief.slice(brief.indexOf('<ticket-data>') + 13, brief.indexOf('</ticket-data>')))
const svc = data.ticket.service
const LOG = join(process.cwd(), 'fake-headless.log') // inside the workspace: the sandbox allows nothing else
try { appendFileSync(LOG, '') } catch {}
appendFileSync(LOG, JSON.stringify({ svc, cwd: process.cwd(), argv: argv.filter((a) => a !== brief), env: Object.keys(process.env) }) + '\n')
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: svc === 'apikey' ? 'ANTHROPIC_API_KEY' : 'none', session_id: `fake-${svc}` }) + '\n')
if (svc === 'apikey') { setInterval(() => {}, 1000); await new Promise((r) => setTimeout(r, 500)); writeFileSync('service/index.mjs', 'export const ops = {} // should never land') }
const done = (o) => { process.stdout.write(JSON.stringify({ type: 'result', session_id: `fake-${svc}`, is_error: false, result: 'done', total_cost_usd: 0.12, ...o }) + '\n'); process.exit(0) }
const src = join('service', 'index.mjs')
if (svc === 'escape') {
  // Try to break out; record what happened, never contents.
  const { execSync } = await import('node:child_process')
  const H = process.env.HOME
  const tries = {
    write_home: () => writeFileSync(join(H, 'anchor-escape.txt'), 'x'),
    write_repo: () => writeFileSync('/Users/taylor/src/github/dotfiles/mcps/anchor/services/escape/PWNED', 'x'),
    write_live_service: () => writeFileSync(join(data.ticket.service === 'escape' ? '/Users/taylor/src/github/dotfiles/mcps/anchor/services/escape' : '/nonexistent', 'index.mjs'), 'export const ops = {}'),
    write_tmp: () => writeFileSync('/tmp/anchor-escape.txt', 'x'),
    write_claude_json: () => writeFileSync(join(H, '.claude.json.anchor-test'), 'x'),
    read_ssh: () => execSync(`ls ${H}/.ssh`),
    read_env: () => readFileSync('/Users/taylor/src/github/dotfiles/.env'),
    read_gmail: () => execSync(`ls ${H}/.gmail-mcp-accounts`),
    shell_write: () => execSync(`echo x > ${H}/anchor-escape-sh.txt`),
    // 6.4: reads outside the allow list, including a secret no list names.
    read_fresh_secret: () => readFileSync(join(H, 'anchor-secret-test/secret.txt')),
    read_documents: () => execSync(`ls ${H}/Documents`, { stdio: 'pipe' }),
    read_lab_findings: () => readFileSync('/Users/taylor/src/github/dotfiles/mcps/anchor/README.md'),
  }
  const outcome = {}
  for (const [k, f] of Object.entries(tries)) { try { f(); outcome[k] = 'ESCAPED' } catch (e) { outcome[k] = e.code || 'denied' } }
  writeFileSync('escape-report.json', JSON.stringify(outcome))
  writeFileSync('result.json', JSON.stringify({ outcome: 'failed', reason: 'escape probe: ' + JSON.stringify(outcome) }))
  done({})
}
if (svc === 'hangs') { setInterval(() => {}, 1000); await new Promise(() => {}) }
if (svc === 'errored') done({ is_error: true, result: 'API error: overloaded' })
if (svc === 'noresult') done({})
if (svc === 'fixit') writeFileSync(src, readFileSync(src, 'utf8').replace(/const CRASH = \[[^\]]*\]/, 'const CRASH = []'))
if (svc === 'breaks') { const m = JSON.parse(readFileSync('service/service.json', 'utf8')); m.operations.ghost = { description: 'never built' }; writeFileSync('service/service.json', JSON.stringify(m)) }
if (svc === 'restructure') mkdirSync('service/lib', { recursive: true })
writeFileSync('result.json', JSON.stringify({ outcome: 'ready', note: `fake change for ${svc}` }))
done({})
