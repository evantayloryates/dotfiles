#!/usr/bin/env node
// exports: list, archive, unarchive and delete the ZDR harness's exports.
//
// Harness-only. It never reads an export's contents: it lists names, kinds,
// sizes and dates, and moves an export between active and archived (a
// marker; nothing moves on disk). Exports are persistent; an archived export
// is deleted by `zdr-harness prune` seven days after it was archived.
//
//   MCP stdio server (no arguments)
//   CLI: index.mjs list [--kind k] [--status s] | archive|unarchive|delete <id...> [--dry-run]
//        | archive|unarchive|delete --kind k [--status s] [--before ISO] [--dry-run] | prune [--days n] [--dry-run]

import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { ARCHIVE_DAYS, archive, ExportsError, KINDS, list, prune, remove, unarchive } from './lib.mjs'

const ROOT = process.env.ZDR_HARNESS_EXPORT_DIR || join((process.env.HOME || '').replace(/\/home$/, ''), 'exports')
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const kinds = KINDS.map((k) => k.kind)

const selection = {
  ids: { type: 'array', items: { type: 'string' }, description: 'export ids from exports_list (tx_…, fp_…, sp_…, rv_…), up to 5000' },
  select: {
    type: 'object',
    description: 'instead of ids: every export matching all given filters',
    properties: { kind: { type: 'string', enum: kinds }, status: { type: 'string', enum: ['active', 'archived'] }, modified_before: { type: 'string', description: 'ISO date' } },
    additionalProperties: false,
  },
  dry_run: { type: 'boolean', description: 'report what would happen, change nothing' },
}

const TOOLS = [
  {
    name: 'list',
    title: 'List exports',
    description:
      'List the harness exports (transcript exports, fixture packages, source pages, review files) with id, kind, status (active/archived), absolute path, size, file count, last change, and for archived ones the date they will be deleted. Never returns contents. Exports are kept until archived; an archived export is deleted ' +
      `${ARCHIVE_DAYS} days after archiving. To hand an export to Taylor, give him its path and \`open -R "<path>"\`.`,
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: kinds }, status: { type: 'string', enum: ['all', 'active', 'archived'] }, limit: { type: 'number' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'archive',
    title: 'Archive exports',
    description: `Mark exports archived (bulk, idempotent). Archived exports are deleted ${ARCHIVE_DAYS} days later by the nightly prune unless unarchived. Nothing moves on disk.`,
    inputSchema: { type: 'object', properties: selection, additionalProperties: false },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'unarchive',
    title: 'Unarchive exports',
    description: 'Return archived exports to active (kept indefinitely). Bulk, idempotent.',
    inputSchema: { type: 'object', properties: selection, additionalProperties: false },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'delete',
    title: 'Delete exports now',
    description:
      'Delete exports immediately and permanently (bulk, idempotent: an already-missing export reports absent). Only whitelisted export kinds inside the exports root; symlinks are refused. Use dry_run first for a selector.',
    inputSchema: { type: 'object', properties: selection, additionalProperties: false },
    annotations: { destructiveHint: true, idempotentHint: true },
  },
]

const HANDLERS = {
  list: (a) => list(ROOT, a),
  archive: (a) => archive(ROOT, a),
  unarchive: (a) => unarchive(ROOT, a),
  delete: (a) => remove(ROOT, a),
}

function call(name, args = {}) {
  const h = HANDLERS[name]
  if (!h) throw new ExportsError(`Unknown tool: ${name}`)
  const allowed = Object.keys(TOOLS.find((t) => t.name === name).inputSchema.properties)
  const extra = Object.keys(args).filter((k) => !allowed.includes(k))
  if (extra.length) throw new ExportsError(`Unknown argument ${extra.join(', ')}; ${name} takes ${allowed.join(', ')}`)
  return JSON.stringify(h(args), null, 1)
}

// ---- CLI (zdr-harness exports …)

function cli(argv) {
  const [cmd, ...rest] = argv
  const ids = []
  const o = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--dry-run') o.dry_run = true
    else if (a.startsWith('--')) o[a.slice(2)] = rest[++i]
    else ids.push(a)
  }
  if (cmd === 'list') return list(ROOT, { kind: o.kind, status: o.status, limit: o.limit ? Number(o.limit) : 5000 })
  if (cmd === 'prune') return prune(ROOT, { days: o.days ? Number(o.days) : ARCHIVE_DAYS, dry_run: !!o.dry_run })
  const fn = { archive, unarchive, delete: remove }[cmd]
  if (!fn) throw new ExportsError('usage: exports list|archive|unarchive|delete|prune …')
  const sel = ids.length ? { ids } : { select: Object.fromEntries(Object.entries({ kind: o.kind, status: o.status, modified_before: o.before }).filter(([, v]) => v !== undefined)) }
  return fn(ROOT, { ...sel, dry_run: o.dry_run })
}

if (process.argv.length > 2) {
  try {
    const r = cli(process.argv.slice(2))
    if (process.argv[2] === 'list') {
      for (const i of r.items) process.stdout.write(`${i.id}\t${i.kind}\t${i.status}\t${i.files} files\t${(i.bytes / 1e6).toFixed(1)} MB\t${i.modified.slice(0, 16)}${i.deletes_after ? `\tdeletes ${i.deletes_after.slice(0, 10)}` : ''}\n`)
      process.stdout.write(`${r.total} exports in ${r.root}${r.unmanaged.length ? `; unmanaged: ${r.unmanaged.join(', ')}` : ''}\n`)
    } else {
      process.stdout.write(`${JSON.stringify(r.counts)}${r.dry_run ? ' (dry run)' : ''}\n`)
    }
    process.exit(0)
  } catch (e) {
    process.stderr.write(`exports: ${e.message}\n`)
    process.exit(1)
  }
} else {
  const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`)
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return
    let req
    try {
      req = JSON.parse(line)
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    const { id, method, params } = req
    if (method === 'initialize') {
      const v = params?.protocolVersion
      send({ jsonrpc: '2.0', id, result: { protocolVersion: SUPPORTED_PROTOCOLS.includes(v) ? v : SUPPORTED_PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'exports', version: '1.0.0' } } })
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    } else if (method === 'tools/call') {
      try {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: call(params?.name, params?.arguments ?? {}) }], isError: false } })
      } catch (e) {
        const msg = e instanceof ExportsError ? e.message : `exports internal error (${e.code || e.name})`
        if (!(e instanceof ExportsError)) console.error('[exports]', e)
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: msg }], isError: true } })
      }
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} })
    } else if (id !== undefined && id !== null) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unsupported method: ${method}` } })
    }
  })
}
