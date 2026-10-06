#!/usr/bin/env node
// claude-driver MCP server: lets any harness (Claude Code, Codex, Cursor,
// OpenCode) drive the Claude desktop app. See README.md and docs/guide.md.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { serveMcp } from '../lib/node/mcp-stdio.mjs'
import { DRIVER_VERSION, OPS, ROOT, guideText, runOp, txt } from './lib/driver.mjs'
import { callerHostSession } from './lib/sessions.mjs'

const log = (...args) => console.error('[claude-driver]', ...args)

const tools = OPS.map((op) => ({
  name: op.name,
  title: op.title,
  description: op.description,
  inputSchema: { type: 'object', properties: op.schema.properties || {}, required: op.schema.required || [], additionalProperties: false },
  annotations: { readOnlyHint: !!op.readOnly, destructiveHint: ['delete_sessions', 'archive_project'].includes(op.name), openWorldHint: false },
  handler: async (args, ctx) => {
    const harness = ctx.client ? `${ctx.client.name}${ctx.client.version ? `@${ctx.client.version}` : ''}` : 'mcp'
    try {
      const out = await runOp(op.name, args, { harness, progress: ctx.progress, signal: ctx.signal })
      const structured = out && typeof out === 'object' && !Array.isArray(out) ? out : undefined
      return { content: [{ type: 'text', text: txt(out) }], ...(structured && { structuredContent: structured }), isError: false }
    } catch (err) {
      const text = `${op.name} failed [${err.category || 'internal'}]: ${err.message}${err.detail ? `\n${txt(err.detail).slice(0, 1500)}` : ''}`
      if (!err.expected) log(err.stack)
      return { content: [{ type: 'text', text }], structuredContent: { error: { category: err.category || 'internal', message: err.message, ...(err.detail ? { detail: err.detail } : {}) } }, isError: true }
    }
  },
}))

const desktop = callerHostSession()
const instructions =
  'claude-driver drives the Claude desktop app: create/fork/open/rename/pin/archive/unarchive/delete sessions, set model/effort/permission mode, send messages, groups, window state. ' +
  'Call driver_guide once before your first write op. Verification is always against the app\'s files on disk, never the UI; results say verified:true/false. ' +
  'Navigating ops restore Taylor\'s window and front app by default (focus:"restore"). Default to archive over delete; deletes always go through Taylor\'s approval card, which you must never click. ' +
  (desktop
    ? `You are running inside Claude desktop session ${desktop}: for Tier B ops (rename, pin, archive, model, send) the driver hands you back the exact ccd_* tool calls to make yourself, skipping the broker.`
    : 'Tier B ops go through the driver\'s broker session; if it is asleep the driver revives it (can take ~20 s and briefly shows it on screen).') +
  ' Record surprises with driver_record_learning.'

const resources = [
  { uri: 'claude-driver://guide', name: 'guide', description: 'How to use claude-driver', mimeType: 'text/markdown', read: guideText },
  { uri: 'claude-driver://findings', name: 'findings', description: 'Curated, dated findings log', mimeType: 'text/markdown', read: () => readFileSync(join(ROOT, 'docs', 'findings.md'), 'utf8') },
  { uri: 'claude-driver://readme', name: 'readme', description: 'claude-driver README', mimeType: 'text/markdown', read: () => readFileSync(join(ROOT, 'README.md'), 'utf8') },
]

await serveMcp({ name: 'claude-driver', version: DRIVER_VERSION, instructions, tools, resources, log })
process.exit(0)
