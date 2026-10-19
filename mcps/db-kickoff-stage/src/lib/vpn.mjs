// Staging's database is private: this Mac reaches it over Taylor's
// Tunnelblick VPN, a split tunnel that routes only the staging VPC. When a
// connection fails for want of a route, the server checks the VPN and, if it
// is down, connects it and tries again, so a laptop that slept, rebooted or
// dropped Wi-Fi recovers on the next call instead of failing every call.

import { execFile } from 'node:child_process'
import { connect } from 'node:net'

const run = (cmd, args, timeout = 15_000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || err?.message || '').trim(), code: err?.code })
    })
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// True when a TCP connection to host:port opens within the timeout.
export function reachable(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = connect({ host, port })
    const done = (ok, code) => { s.destroy(); resolve({ ok, code }) }
    s.setTimeout(timeoutMs, () => done(false, 'ETIMEDOUT'))
    s.once('connect', () => done(true))
    s.once('error', (e) => done(false, e.code))
  })
}

const osa = (script) => run('/usr/bin/osascript', ['-e', script])

// Tunnelblick's state for one configuration: CONNECTED, EXITING, WAIT, AUTH,
// GET_CONFIG, ... or NOT_RUNNING / NO_CONFIG / NOT_INSTALLED / NOT_AUTHORIZED.
export async function vpnState(name) {
  if (process.platform !== 'darwin') return { state: 'NOT_MACOS' }
  // One AppleScript round trip (~0.1 s); "is running" never launches the app.
  const r = await osa(
    `if application id "net.tunnelblick.tunnelblick" is running then\n` +
      `tell application id "net.tunnelblick.tunnelblick" to return state of first configuration where name = "${name.replace(/["\\]/g, '')}"\n` +
      `else\nreturn "NOT_RUNNING"\nend if`
  )
  if (r.ok) return { state: r.out || 'UNKNOWN' }
  if (/-1743|not authori[sz]ed/i.test(r.err)) return { state: 'NOT_AUTHORIZED', detail: r.err.slice(0, 200) }
  if (/-1728/.test(r.err)) return { state: 'NOT_INSTALLED' }
  if (/-1719/.test(r.err)) return { state: 'NO_CONFIG' }
  return { state: 'UNKNOWN', detail: r.err.slice(0, 200) }
}

// Tunnelblick reports a closed tunnel as EXITING.
export const VPN_DOWN_STATES = new Set(['EXITING', 'NOT_RUNNING'])

let inflight = null

// Bring the VPN up (single flight: concurrent callers share one attempt).
// Resolves to { ok, state, action, ms, message }.
export function ensureVpn(name, { waitMs = 45_000 } = {}) {
  if (!inflight) inflight = bringUp(name, waitMs).finally(() => { inflight = null })
  return inflight
}

async function bringUp(name, waitMs) {
  const started = Date.now()
  let { state, detail } = await vpnState(name)
  if (state === 'CONNECTED') return { ok: true, state, action: 'none', ms: Date.now() - started }
  const fix = `Connect "${name}" in Tunnelblick yourself, then retry.`
  if (state === 'NOT_MACOS' || state === 'NOT_INSTALLED') return { ok: false, state, message: `Tunnelblick is not available on this machine (${state}). The staging database is only reachable over the VPN.` }
  if (state === 'NOT_AUTHORIZED') {
    return {
      ok: false,
      state,
      message:
        'macOS has not allowed this app to control Tunnelblick (Apple-event permission). Allow it in System Settings > Privacy & Security > Automation, ' +
        `or ${fix.charAt(0).toLowerCase()}${fix.slice(1)}`,
    }
  }
  if (state === 'NOT_RUNNING') {
    await run('/usr/bin/open', ['-g', '-b', 'net.tunnelblick.tunnelblick'])
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      ;({ state, detail } = await vpnState(name))
      if (state !== 'NOT_RUNNING') break
    }
    if (state === 'CONNECTED') return { ok: true, state, action: 'launched Tunnelblick (it reconnected on its own)', ms: Date.now() - started }
  }
  if (state === 'NO_CONFIG') return { ok: false, state, message: `Tunnelblick has no configuration named "${name}". Set KICKOFF_STAGE_DB_VPN to the right name in dotfiles .env.` }
  if (state === 'NOT_AUTHORIZED') return { ok: false, state, message: `macOS blocked control of Tunnelblick. ${fix}` }
  // Already on its way up (WAIT, AUTH, GET_CONFIG, RECONNECTING...): just wait.
  if (!/^(CONNECTING|WAIT|AUTH|GET_CONFIG|ASSIGN_IP|ADD_ROUTES|RESOLVE|TCP_CONNECT|RECONNECTING)$/.test(state)) {
    const c = await osa(`tell application id "net.tunnelblick.tunnelblick" to connect "${name}"`)
    if (!c.ok) return { ok: false, state, message: `Tunnelblick refused to connect "${name}": ${c.err.slice(0, 200)}. ${fix}` }
  }
  const deadline = started + waitMs
  while (Date.now() < deadline) {
    await sleep(1000)
    ;({ state, detail } = await vpnState(name))
    if (state === 'CONNECTED') return { ok: true, state, action: `connected the "${name}" VPN`, ms: Date.now() - started }
  }
  return {
    ok: false,
    state,
    message: `The "${name}" VPN did not connect within ${Math.round(waitMs / 1000)} s (state ${state}${detail ? `: ${detail}` : ''}). ` +
      'Tunnelblick may be waiting for a password, a certificate prompt or a network. ' + fix,
  }
}
