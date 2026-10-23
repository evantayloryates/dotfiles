// Separate Codex-native local fleet. Never reads or changes Claude fleet state.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateConfig } from './watcher.mjs'
import { threadStatus } from './thread.mjs'

const root = join(homedir(), '.local', 'state', 'guidance-fleet-codex')
const configPath = join(root, 'config.json')
const labels = { board: 'com.taylor.codex-local-fleet-board', watcher: 'com.taylor.codex-local-fleet-watcher' }
const boardDir = '/Users/taylor/Desktop/call_guidance/kanban'
const boardServer = join(boardDir, 'server', 'index.mjs')
const watcherScript = '/Users/taylor/dotfiles/src/local-fleet-codex/watcher.mjs'
const node = '/opt/homebrew/bin/node'
const agentsDir = join(homedir(), 'Library', 'LaunchAgents')

function xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }
function strings(values) { return values.map(value => `<string>${xml(value)}</string>`).join('') }
function plist(label, args, env = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${strings(args)}</array><key>EnvironmentVariables</key><dict>${Object.entries(env).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(join(root, `${label}.out.log`))}</string><key>StandardErrorPath</key><string>${xml(join(root, `${label}.err.log`))}</string></dict></plist>\n`
}
function serviceLoaded(label) {
  try { execFileSync('/bin/launchctl', ['print', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' }); return true }
  catch { return false }
}
function loadConfig() { return existsSync(configPath) ? validateConfig(JSON.parse(readFileSync(configPath, 'utf8'))) : null }

export function prepare(managerThreadId, { takeover = false } = {}) {
  const existing = loadConfig()
  if (existing && existing.managerThreadId !== managerThreadId && !takeover) throw new Error('manager differs; use --takeover only after verifying prior owner and open cards')
  if (!existsSync(boardServer)) throw new Error(`board server missing: ${boardServer}`)
  if (!existsSync(node)) throw new Error(`Node runtime missing: ${node}`)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  mkdirSync(agentsDir, { recursive: true })
  const config = validateConfig({ fleetId: existing?.fleetId || `codex-${randomUUID()}`,
    boardUrl: 'http://127.0.0.1:4871', consumer: 'codex-local-fleet', managerThreadId,
    deliveryStateDir: join(root, 'delivery') })
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  const boardPlist = join(agentsDir, `${labels.board}.plist`)
  const watcherPlist = join(agentsDir, `${labels.watcher}.plist`)
  writeFileSync(boardPlist, plist(labels.board, [node, boardServer], {
    KANBAN_PORT: '4871', KANBAN_DATA_DIR: join(root, 'board'), KANBAN_PUBLIC_URL: config.boardUrl,
  }))
  writeFileSync(watcherPlist, plist(labels.watcher, [node, watcherScript, configPath]))
  return { config, boardPlist, watcherPlist }
}

async function start(managerThreadId, options) {
  const manager = await threadStatus(managerThreadId)
  if (manager.id !== managerThreadId) throw new Error('manager chat ID did not resolve exactly')
  const prior = loadConfig()
  const domain = `gui/${process.getuid()}`
  if (prior && prior.managerThreadId !== managerThreadId && options.takeover && serviceLoaded(labels.watcher)) {
    // Avoid a window in which the old watcher reads a newly assigned manager.
    execFileSync('/bin/launchctl', ['bootout', `${domain}/${labels.watcher}`])
  }
  const { config, boardPlist, watcherPlist } = prepare(managerThreadId, options)
  if (!serviceLoaded(labels.board)) execFileSync('/bin/launchctl', ['bootstrap', domain, boardPlist])
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${config.boardUrl}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) break }
    catch {}
    if (i === 49) throw new Error('Codex board did not become healthy')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!serviceLoaded(labels.watcher)) {
    // A new consumer begins at the current end. Subscribe before loading the
    // watcher, with no second process already able to send the same event.
    execFileSync(node, [watcherScript, configPath, '--subscribe', '--once'], { stdio: 'ignore' })
    execFileSync('/bin/launchctl', ['bootstrap', domain, watcherPlist])
  } else {
    // launchd replaces this exact service. Do not run a second --once sender.
    execFileSync('/bin/launchctl', ['kickstart', '-k', `${domain}/${labels.watcher}`])
  }
  return status()
}

async function status() {
  const config = loadConfig()
  let boardHealthy = false, consumers = []
  if (config) {
    try {
      const response = await fetch(`${config.boardUrl}/api/health`, { signal: AbortSignal.timeout(1000) })
      boardHealthy = response.ok
      if (boardHealthy) consumers = await (await fetch(`${config.boardUrl}/api/consumers`, { signal: AbortSignal.timeout(1000) })).json()
    } catch {}
  }
  return { config, boardHealthy, boardServiceLoaded: serviceLoaded(labels.board),
    watcherServiceLoaded: serviceLoaded(labels.watcher), consumer: consumers.find(row => row.name === config?.consumer) || null }
}

function stop() {
  const domain = `gui/${process.getuid()}`
  for (const label of [labels.watcher, labels.board]) {
    if (serviceLoaded(label)) execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`])
  }
  return { stopped: true, statePreserved: root }
}

async function main() {
  const [action, id] = process.argv.slice(2)
  if (action === 'status') return console.log(JSON.stringify(await status()))
  if (action === 'stop') return console.log(JSON.stringify(stop()))
  if (action === 'start' && id) return console.log(JSON.stringify(await start(id, { takeover: process.argv.includes('--takeover') })))
  throw new Error('usage: node fleetctl.mjs status|stop|start <manager-thread-id> [--takeover]')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
