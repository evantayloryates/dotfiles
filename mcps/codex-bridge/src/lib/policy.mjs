// Who gets to say yes.
//
// Codex asks the client three kinds of questions mid-turn. Computer Use
// per-app access arrives as an MCP elicitation from the `cua_repl` server
// ("Allow Computer Use to use Finder?"), shell escapes as
// item/commandExecution/requestApproval, edits as item/fileChange/requestApproval.
// Claude is blocked inside the tool call while these arrive, so the bridge
// answers from a policy file plus per-call grants, and reports every decision
// back so Claude can re-run with the right grants.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_POLICY_PATH = process.env.CODEX_BRIDGE_POLICY || join(HERE, '..', 'policy.json')

export const DEFAULT_POLICY = {
  apps: { always: [], session: [], deny: [], unknown: 'deny' },
  commands: 'deny',
  fileChanges: 'deny',
  sandbox: 'read-only',
  // The most a single call may ask for with `sandbox`. Raising it is a human
  // edit to policy.json; a call can never lift itself past it.
  maxSandbox: 'workspace-write',
  mcpRoster: 'trim', // 'trim' = Computer Use only on bridge threads; 'full' = whatever config.toml enables
  // sandbox_approval: true lets Codex ASK to escape the read-only sandbox; the
  // bridge then decides from `commands` / allow_commands and the result shows
  // the denial. With false, Codex silently gives up and nothing is recorded.
  approvalPolicy: { granular: { mcp_elicitations: true, rules: false, sandbox_approval: true } },
}

export function loadPolicy(path = DEFAULT_POLICY_PATH) {
  if (!existsSync(path)) return { ...DEFAULT_POLICY, source: null }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return {
    ...DEFAULT_POLICY,
    ...raw,
    apps: { ...DEFAULT_POLICY.apps, ...(raw.apps || {}) },
    source: path,
  }
}

const norm = (s) => String(s || '').trim().toLowerCase()

// An elicitation names the app twice: bundle id in tool_params.app, display
// name in tool_params_display. Match either, case-insensitively.
export function appIdentifiers(elicitationParams) {
  const meta = elicitationParams?._meta || {}
  const ids = new Set()
  const bundle = meta.tool_params?.app
  if (bundle) ids.add(norm(bundle))
  for (const d of meta.tool_params_display || []) if (d?.name === 'app' && d.value) ids.add(norm(d.value))
  const m = /use "(.+?)"\?/.exec(elicitationParams?.message || '')
  if (m) ids.add(norm(m[1]))
  return {
    ids,
    bundleId: bundle || null,
    displayName: (meta.tool_params_display || []).find((d) => d?.name === 'app')?.value || (m ? m[1] : bundle) || '?',
    tool: meta.tool_name || null,
    risk: meta.riskLevel || null,
  }
}

const listHas = (list, ids) => (list || []).some((entry) => ids.has(norm(entry)))

// grants: { [normalizedApp]: 'session' | 'always' } from codex_approve_app and
// the per-call `apps` argument. Returns {decision:'accept', persist} or {decision:'decline', reason}.
export function decideApp(policy, grants, elicitationParams) {
  const app = appIdentifiers(elicitationParams)
  if (listHas(policy.apps.deny, app.ids)) return { app, decision: 'decline', reason: 'listed under apps.deny in policy' }
  for (const [name, scope] of Object.entries(grants || {})) {
    if (app.ids.has(norm(name))) return { app, decision: 'accept', persist: scope, reason: `granted for this ${scope}` }
  }
  if (listHas(policy.apps.always, app.ids)) return { app, decision: 'accept', persist: 'always', reason: 'apps.always in policy' }
  if (listHas(policy.apps.session, app.ids)) return { app, decision: 'accept', persist: 'session', reason: 'apps.session in policy' }
  if (policy.apps.unknown === 'session') return { app, decision: 'accept', persist: 'session', reason: 'apps.unknown=session in policy' }
  return { app, decision: 'decline', reason: 'not in policy or per-call apps grants' }
}

export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

export class SandboxPolicyError extends Error {}

// The per-call `sandbox` capped by policy: returns the mode to use (undefined
// keeps the thread's policy.sandbox) or throws. The ceiling is the larger of
// policy.sandbox and policy.maxSandbox; an unrecognised ceiling fails closed
// to read-only.
export function capSandbox(policy, requested) {
  if (requested === undefined || requested === null) return undefined
  if (!SANDBOX_MODES.includes(requested)) throw new SandboxPolicyError(`unknown sandbox "${requested}"; use one of ${SANDBOX_MODES.join(', ')}`)
  const rank = (mode) => Math.max(0, SANDBOX_MODES.indexOf(mode))
  const ceiling = Math.max(rank(policy?.sandbox), rank(policy?.maxSandbox))
  if (rank(requested) > ceiling) {
    throw new SandboxPolicyError(`sandbox "${requested}" exceeds the policy ceiling "${SANDBOX_MODES[ceiling]}" (maxSandbox in ${policy?.source || 'the built-in policy'}); only a human edit to policy.json can raise it`)
  }
  return requested
}

export function decideCommand(policy, overrides, params) {
  const allow = overrides?.allowCommands === true || policy.commands === 'accept'
  return allow
    ? { decision: 'accept', reason: overrides?.allowCommands ? 'allow_commands=true for this call' : 'commands=accept in policy' }
    : { decision: 'decline', reason: 'commands are denied by default; pass allow_commands=true to permit' }
}

export function decideFileChange(policy, overrides, params) {
  const allow = overrides?.allowCommands === true || policy.fileChanges === 'accept'
  return allow ? { decision: 'accept', reason: 'allowed' } : { decision: 'decline', reason: 'file changes are denied by default; pass allow_commands=true to permit' }
}
