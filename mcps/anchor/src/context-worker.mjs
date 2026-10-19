// Runs services' sessionContext generators (services/<id>/context.mjs) away
// from the core's event loop. The core gives it a deadline and terminates it
// if a generator hangs, so a bad generator can never stall a chat's start.

import { parentPort } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'
import { statSync } from 'node:fs'

const loaded = new Map() // path -> {mtime, mod}

async function load(path) {
  const mtime = statSync(path).mtimeMs
  const hit = loaded.get(path)
  if (hit && hit.mtime === mtime) return hit.mod
  const mod = await import(pathToFileURL(path).href + `?v=${mtime}`) // hot reload on change
  loaded.set(path, { mtime, mod })
  return mod
}

// kind "relevance": a service's relevance(ctx, need) for discovery, which may
// answer {relevant?: boolean, ops?: [names], note?: string}.
// Each relevance hook has its own deadline, so one that hangs cannot hold up
// the answers of the others.
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
parentPort.on('message', async ({ id, jobs, ctx, kind, need, perJobMs = 150 }) => {
  const out = {}
  await Promise.all(jobs.map(async ({ service, path }) => {
    try {
      const mod = await load(path)
      if (kind === 'relevance') {
        const r = mod.relevance ? await within(Promise.resolve(mod.relevance({ ...ctx, service }, need)), perJobMs) : null
        out[service] = r && typeof r === 'object' ? { relevance: { relevant: r.relevant, ops: Array.isArray(r.ops) ? r.ops.map(String) : undefined, note: typeof r.note === 'string' ? r.note.slice(0, 300) : undefined } } : { relevance: null }
        return
      }
      const text = await mod.sessionContext?.({ ...ctx, service })
      out[service] = typeof text === 'string' ? { text: text.slice(0, 600) } : { text: null }
    } catch (err) {
      out[service] = { error: String(err?.message || err).slice(0, 200) }
    }
  }))
  parentPort.postMessage({ id, out })
})
