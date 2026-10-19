// Fleet service runtime: turns an mcps/<id>/ folder into a running MCP server.
// It reads mcp.json, loads one tool per file from tools/, adds the standard
// toolset every fleet service shares, and serves it over the stdio kernel.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serveMcp } from './mcp-stdio.mjs'

const SLUG = /^## (\d{4}-\d{2}-\d{2}\.\d{3})\b/

export async function loadManifest(dir) {
  return JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'))
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// CHANGELOG.md is the single source of truth for versions: one "## <slug>"
// heading per release, newest first.
export function parseChangelog(text) {
  const releases = []
  for (const line of (text || '').split('\n')) {
    const match = SLUG.exec(line)
    if (match) releases.push({ version: match[1], lines: [] })
    else releases.at(-1)?.lines.push(line)
  }
  return releases.map((r) => ({ version: r.version, notes: r.lines.join('\n').trim() }))
}

export async function loadTools(dir) {
  let files
  try {
    files = (await readdir(join(dir, 'tools'))).filter((f) => f.endsWith('.mjs')).sort()
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const tools = []
  for (const file of files) {
    const tool = (await import(pathToFileURL(join(dir, 'tools', file)).href)).default
    if (tool?.name !== file.slice(0, -'.mjs'.length)) {
      throw new Error(`tools/${file} must export default a tool named "${file.slice(0, -4)}"`)
    }
    tools.push(tool)
  }
  return tools
}

function standardTools({ prefix, guide, releases, id }) {
  return [
    {
      name: `${prefix}guide`,
      title: `How to use ${id}`,
      description: `Read the usage guide for ${id}: when to use which tool, gotchas and examples. Read it before a first use.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async () => guide || `${id} has no guide yet.`,
    },
    {
      name: `${prefix}whats_new`,
      title: `Release notes for ${id}`,
      description: `List ${id} releases newer than a version you know, or the latest release when "since" is omitted.`,
      inputSchema: {
        type: 'object',
        properties: { since: { type: 'string', description: 'A version slug such as 2026-10-18.001.' } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ since }) => {
        const newer = since ? releases.filter((r) => r.version > since) : releases.slice(0, 1)
        if (!newer.length) return `No releases newer than ${since}. Current: ${releases[0]?.version || 'unreleased'}.`
        return newer.map((r) => `## ${r.version}\n${r.notes}`).join('\n\n')
      },
    },
  ]
}

export async function serveService(dir, { log = (...a) => console.error(...a) } = {}) {
  const manifest = await loadManifest(dir)
  const releases = parseChangelog(await readOptional(join(dir, 'CHANGELOG.md')))
  const guide = await readOptional(join(dir, 'GUIDE.md'))
  const own = await loadTools(dir)
  const prefix = manifest.toolPrefix || ''
  const tools = [...own, ...standardTools({ prefix, guide, releases, id: manifest.id })]
  const names = new Set()
  for (const t of tools) {
    if (names.has(t.name)) throw new Error(`duplicate tool name ${t.name}`)
    names.add(t.name)
  }
  return serveMcp({
    name: manifest.id,
    version: releases[0]?.version || '0000-00-00.000',
    instructions: manifest.instructions,
    tools,
    log: (...a) => log(`[${manifest.id}]`, ...a),
  })
}
