#!/usr/bin/env node
// codex-bridge MCP server: lets Claude delegate macOS Computer Use tasks to
// the local Codex agent over the Codex app-server protocol. See README.md.

import { Bridge, BridgeError } from './lib/bridge.mjs'
import { serveMcp } from './lib/mcp-stdio.mjs'
import { BRIDGE_VERSION } from './lib/appserver.mjs'

const log = (...args) => console.error('[codex-bridge]', ...args)
const bridge = new Bridge({ log })

const SESSION = { type: 'string', description: 'Session name. Each session is one persistent Codex thread; reuse a name to continue a conversation with context. Default "default".' }

const TOOLS = [
  {
    name: 'codex_computer_use',
    title: 'Delegate a macOS task to Codex Computer Use',
    description:
      'Hand a task to the local Codex agent, which can operate any macOS app through Computer Use (accessibility tree, screenshots, clicks, typing) on this Mac. ' +
      'Use it for things your own tools cannot reach: native apps, system dialogs, menus, apps with no API or browser surface. ' +
      'The call blocks until Codex finishes and returns its final report plus a step log. Follow-ups on the same session keep Codex\'s context. ' +
      'Apps Codex may touch are gated: pass apps=[...] to grant access for the session, or the result will list what was denied. ' +
      'Describe the goal and the acceptance criteria, not the clicks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What to accomplish, with any constraints and what to report back.' },
        session: SESSION,
        apps: { type: 'array', items: { type: 'string' }, description: 'App names or bundle ids Codex may use for this session, e.g. ["Finder", "com.apple.Notes"]. Unlisted apps are denied unless policy allows them.' },
        new_thread: { type: 'boolean', description: 'Start a fresh Codex thread for this session instead of continuing the previous one.' },
        cwd: { type: 'string', description: 'Working directory for the Codex thread (default: this process cwd). Only matters for new threads.' },
        images: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of images to attach to the task (e.g. a screenshot of what you want).' },
        screenshots: { type: 'string', enum: ['none', 'last', 'all'], description: 'Which of Codex\'s screenshots to attach to the result as images. Default "last". All are saved to disk regardless.' },
        allow_commands: { type: 'boolean', description: 'Let Codex run shell commands that escape the read-only sandbox and apply file changes. Default false.' },
        sandbox: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'], description: 'Filesystem sandbox for shell commands this turn. Default read-only (Computer Use itself is not sandboxed).' },
        output_schema: { type: 'object', description: 'JSON Schema for the final message; Codex then answers with a JSON object matching it.' },
        timeout_sec: { type: 'number', description: 'Interrupt the turn after this many seconds. Default 900.' },
        model: { type: 'string', description: 'Override the Codex model for this turn and later ones on the session.' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh'], description: 'Reasoning effort override.' },
      },
      required: ['task'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'codex_steer',
    title: 'Redirect a running Codex task',
    description: 'Inject a message into a Codex turn that is still running in this bridge (a pending codex_computer_use call on the same session). Codex reads it within a couple of seconds and changes course without restarting.',
    inputSchema: { type: 'object', properties: { session: SESSION, message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  {
    name: 'codex_interrupt',
    title: 'Stop a running Codex task',
    description: 'Interrupt the active turn on a session. The pending codex_computer_use call returns with status=interrupted; the thread stays usable.',
    inputSchema: { type: 'object', properties: { session: SESSION }, additionalProperties: false },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  {
    name: 'codex_approve_app',
    title: 'Pre-approve an app for Computer Use',
    description: 'Record that Codex may use an app the next time it asks: scope "session" (that Codex thread) or "always" (Computer Use stores it permanently). Use "revoke": true to drop a bridge grant.',
    inputSchema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'App display name or bundle id, e.g. "Notes" or "com.apple.Notes".' },
        scope: { type: 'string', enum: ['session', 'always'], description: 'Default "session".' },
        revoke: { type: 'boolean' },
      },
      required: ['app'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  {
    name: 'codex_status',
    title: 'Bridge and session status',
    description: 'Connection to the Codex app-server, policy in force, app grants, and every session with its thread id and whether a turn is running.',
    inputSchema: { type: 'object', properties: { session: SESSION }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

function handlerFor(name) {
  switch (name) {
    case 'codex_computer_use':
      return async (args, ctx) => {
        if (typeof args.task !== 'string' || !args.task.trim()) throw new BridgeError('task is required')
        const { result, text } = await bridge.run(args, ctx)
        const content = [{ type: 'text', text }]
        const mode = args.screenshots || 'last'
        const shots = mode === 'all' ? result.screenshots : mode === 'last' ? result.screenshots.slice(-1) : []
        for (const s of shots) content.push({ type: 'image', data: s.data, mimeType: s.mimeType })
        return { content, isError: !['completed'].includes(result.status) }
      }
    case 'codex_steer':
      return (args) => bridge.steer(args.session || 'default', args.message)
    case 'codex_interrupt':
      return (args) => bridge.interrupt(args.session || 'default')
    case 'codex_approve_app':
      return (args) => (args.revoke ? bridge.revokeApp(args.app) : bridge.approveApp(args.app, args.scope || 'session'))
    case 'codex_status':
      return (args) => bridge.status(args)
    default:
      throw new Error(`no handler for ${name}`)
  }
}

for (const t of TOOLS) t.handler = handlerFor(t.name)

await serveMcp({
  name: 'codex-bridge',
  version: BRIDGE_VERSION,
  instructions:
    'codex_computer_use delegates macOS UI work to the local Codex agent. Reach for it when a task needs a native app, a system dialog, or anything outside the browser and shell. ' +
    'Grant apps explicitly with apps=[...]; read the "denied" section of results and re-run with grants rather than retrying blindly.',
  tools: TOOLS,
  log,
})
bridge.close()
process.exit(0)
