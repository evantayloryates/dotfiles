// Fleet launcher: `run <mcp-id> [profile]`. Loads the service's declared
// environment from its sources, then runs the service in this same process:
// its own entry when mcp.json names one, otherwise the standard tools-folder
// service. Nothing outside the service folder is consulted except the env
// sources mcp.json names.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadManifest, serveService } from './service.mjs'

const MCPS = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = resolve(MCPS, '..')
const [id, profileName = 'default'] = process.argv.slice(2)

function fatal(message) {
  console.error(`[run] ${message}`)
  process.exit(78)
}

if (!id || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) fatal('usage: run <mcp-id> [profile]')
const dir = join(MCPS, id)
if (!existsSync(join(dir, 'mcp.json'))) fatal(`no mcps/${id}/mcp.json`)
const manifest = await loadManifest(dir)
const profile = manifest.profiles?.[profileName] ?? (profileName === 'default' ? {} : null)
if (!profile) fatal(`${id} has no profile "${profileName}"`)

const expand = (p) =>
  p.replace(/^~(?=\/)/, process.env.HOME).replaceAll('${repo}', REPO).replaceAll('${service}', dir)

// Same reading rules as src/lib/read-env.sh: KEY=value lines, optional
// "export ", one layer of quotes. Only the named keys are taken.
function readDotenv(path, key) {
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    let line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice(7).trimStart()
    const eq = line.indexOf('=')
    if (eq < 0 || line.slice(0, eq).trim() !== key) continue
    let value = line.slice(eq + 1).trim()
    if (value.length > 1 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1)
    return value
  }
  return undefined
}

function resolveSource(source, key) {
  if (source === 'dotfiles-env') source = 'file:${repo}/.env'
  if (source.startsWith('file:')) {
    const path = expand(source.slice(5))
    return existsSync(path) ? readDotenv(path, key) : undefined
  }
  if (source === 'process') return process.env[key]
  fatal(`unknown env source "${source}" for ${key}`)
}

const env = { ...manifest.env, ...profile.env }
for (const [key, spec] of Object.entries(env)) {
  const { from = ['dotfiles-env'], required = true, value } = typeof spec === 'string' ? { from: [spec] } : spec
  let found = value
  for (const source of from) {
    if (found !== undefined) break
    found = resolveSource(source, key)
  }
  if (found === undefined && required) fatal(`${id}: ${key} not found in ${from.join(', ')}`)
  if (found !== undefined) process.env[key] = found
}
process.env.MCP_ID = id
process.env.MCP_PROFILE = profileName
process.env.MCP_DIR = dir

if (manifest.entry) {
  const entry = join(dir, manifest.entry)
  process.argv = [process.argv[0], entry, ...(profile.args || [])]
  await import(pathToFileURL(entry).href)
} else {
  await serveService(dir)
  process.exit(0)
}
