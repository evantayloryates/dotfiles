import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { EXPORTS_ROOT, HARNESS_DIR } from '../src/paths.mjs'

// The harness's own exports library: lists names, kinds, sizes and dates and
// flips archive markers. It never reads an export's contents.
const lib = () => import(pathToFileURL(join(HARNESS_DIR, 'mcps/exports/lib.mjs')).href)

export default {
  name: 'zdr_exports',
  title: 'List or archive harness exports',
  description:
    'Manage files the harness exported (transcript exports, Terra scopes exports, fixture packages, source pages, review files). ' +
    'list returns id, kind, status, absolute path, size and dates, never contents. archive marks exports for deletion after the ' +
    'retention window; unarchive keeps them. To hand an export to Taylor, give him its path and `open -R "<path>"`. ' +
    'Deleting exports and releasing fixtures are not available here: Taylor does those with the zdr-harness CLI.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'archive', 'unarchive'] },
      kind: { type: 'string', description: 'list filter, e.g. transcripts, terra-scopes, fixture-package.' },
      status: { type: 'string', enum: ['all', 'active', 'archived'], description: 'list filter.' },
      limit: { type: 'number', description: 'list: maximum rows (default 50).' },
      ids: { type: 'array', items: { type: 'string' }, description: 'archive/unarchive: export ids.' },
      dry_run: { type: 'boolean', description: 'archive/unarchive: report without changing anything.' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ action, kind, status, limit = 50, ids, dry_run }) => {
    const { list, archive, unarchive } = await lib()
    if (action === 'list') {
      const r = list(EXPORTS_ROOT, { kind, status, limit })
      const rows = r.items.map((i) =>
        [i.id, i.kind, i.status, i.path, `${i.files} files`, `${(i.bytes / 1e6).toFixed(1)} MB`, i.modified?.slice(0, 16), i.deletes_after ? `deletes ${i.deletes_after.slice(0, 10)}` : ''].filter(Boolean).join('  ')
      )
      return [...rows, `${r.total} exports`].join('\n')
    }
    if (!ids?.length) throw Object.assign(new Error(`${action} needs "ids"`), { expected: true })
    const fn = action === 'archive' ? archive : unarchive
    const r = fn(EXPORTS_ROOT, { ids, dry_run })
    return `${action}: ${JSON.stringify(r.counts)}${r.dry_run ? ' (dry run)' : ''}`
  },
}
