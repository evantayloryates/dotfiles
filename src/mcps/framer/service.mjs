#!/opt/homebrew/bin/node
// Per-user Framer CLI broker. Only local MCP bridges can reach its 0600 socket.
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, chmod, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = join(homedir(), 'Library', 'Application Support', 'taylor-framer')
const socket = join(dir, 'framer.sock')
const sessionsFile = join(dir, 'sessions.json')
const learningFile = join(dir, 'learning.json')
const cli = join(import.meta.dirname, 'runtime', 'node_modules', '@framer', 'agent', 'dist', 'cli.js')
const packageSpec = '@framer/agent@0.0.47'
const idPattern = /^[A-Za-z0-9_-]{3,80}$/
let queue = Promise.resolve()

await mkdir(dir, { recursive: true, mode: 0o700 })
await chmod(dir, 0o700)
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}
async function saveJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, path)
}
function run(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('/opt/homebrew/bin/node', [cli, ...args], {
      env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), 120_000)
    for (const [stream, append] of [[child.stdout, text => { stdout += text }], [child.stderr, text => { stderr += text }]]) {
      stream.on('data', chunk => {
        append(chunk.toString())
        if (stdout.length + stderr.length > 1_000_000) child.kill('SIGTERM')
      })
    }
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`Framer CLI exited ${code}: ${stderr.trim().slice(0, 1600) || stdout.trim().slice(0, 1600)}`))
    })
    child.stdin.end(input)
  })
}
function validateId(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(`${label} must be an explicit ID`)
  return value
}
function parseLastJson(output) {
  const lines = output.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) } catch { /* progress line */ }
  }
  throw new Error(`Framer returned no JSON result: ${output.slice(0, 400)}`)
}
async function session(projectId) {
  validateId(projectId, 'project_id')
  const known = await readJson(sessionsFile, {})
  if (known[projectId]) return known[projectId]
  const output = await run(['session', 'new', projectId])
  const id = output.split(/\r?\n/).map(s => s.trim()).filter(Boolean).at(-1)
  if (!/^\d+$/.test(id)) throw new Error(`Cannot parse Framer session ID: ${output.slice(0, 400)}`)
  known[projectId] = id
  await saveJson(sessionsFile, known)
  return id
}
async function execute(projectId, code) {
  const id = await session(projectId)
  return run(['exec', '-s', id], code)
}
async function dispatch(method, params = {}) {
  switch (method) {
    case 'status': return { service: 'running', socket, cli: packageSpec }
    case 'projects': return { output: await run(['project', 'list']) }
    case 'branches': {
      const projectId = validateId(params.project_id, 'project_id')
      const result = await execute(projectId, "const branches = await framer.getBranches(); const active = await framer.getActiveBranch(); console.log(JSON.stringify({branches: branches.map(b => ({id:b.id,title:b.title,url:b.url,hasJoined:b.hasJoined})),active:active.id}));")
      return { project_id: projectId, ...parseLastJson(result) }
    }
    case 'select_branch': {
      const projectId = validateId(params.project_id, 'project_id')
      const branchId = validateId(params.branch_id, 'branch_id')
      const code = `const branch = (await framer.getBranches()).find(b => b.id === ${JSON.stringify(branchId)}); if (!branch) throw Error('Branch ID not found'); if ((await framer.getActiveBranch()).id !== branch.id) await branch.switch(); const active = await framer.getActiveBranch(); if (active.id !== branch.id) throw Error('Branch switch did not persist'); console.log(JSON.stringify({id:active.id,title:active.title,url:active.url}));`
      return { project_id: projectId, branch: parseLastJson(await execute(projectId, code)) }
    }
    case 'exec': {
      const projectId = validateId(params.project_id, 'project_id')
      const branchId = validateId(params.branch_id, 'branch_id')
      if (typeof params.code !== 'string' || !params.code.trim() || params.code.length > 100_000) throw new Error('code must be a nonempty JavaScript string up to 100 KB')
      const guard = `const active = await framer.getActiveBranch(); if (active.id !== ${JSON.stringify(branchId)}) throw Error('Active Framer branch mismatch: expected ${branchId}, got ' + active.id + '. Select the branch explicitly before executing.');\n`
      return { project_id: projectId, branch_id: branchId, output: await execute(projectId, guard + params.code) }
    }
    case 'learning': {
      const notes = await readJson(learningFile, [])
      if (params.record === undefined) return { notes }
      const record = params.record
      if (!record || typeof record.topic !== 'string' || typeof record.lesson !== 'string' || record.topic.length > 100 || record.lesson.length > 1200) throw new Error('record needs topic and lesson within size limits')
      if (/api[_ -]?key|password|secret|token\s*[:=]/i.test(record.lesson)) throw new Error('Do not store credentials in Framer learnings')
      notes.push({ topic: record.topic, lesson: record.lesson, project_id: record.project_id || null, verified_at: new Date().toISOString() })
      await saveJson(learningFile, notes)
      return { recorded: true, count: notes.length }
    }
    case 'guidance': {
      const topic = params.topic
      if (topic === 'project') {
        const projectId = validateId(params.project_id, 'project_id')
        const paths = [
          join(homedir(), '.agents', 'skills', 'framer', 'projects', projectId, 'index.md'),
          join(homedir(), '.agents', 'skills', '.archive', 'framer', 'projects', projectId, 'index.md'),
        ]
        for (const path of paths) {
          try { return { path, text: await readFile(path, 'utf8') } }
          catch (error) { if (error.code !== 'ENOENT') throw error }
        }
        throw new Error('No generated context for that project; connect to it first')
      }
      if (!['workflow', 'components'].includes(topic)) throw new Error('topic must be project, workflow or components')
      const path = topic === 'workflow'
        ? join(import.meta.dirname, 'LEARNINGS.md')
        : join(homedir(), '.agents', 'skills', '.archive', 'framer-code-components', 'SKILL.md')
      const body = await readFile(path, 'utf8')
      const heading = params.heading
      if (!heading) return { path, headings: [...body.matchAll(/^#{1,3} (.+)$/gm)].map(m => m[1]) }
      const lines = body.split('\n')
      const start = lines.findIndex(line => /^#{1,3} /.test(line) && line.replace(/^#{1,3} /, '').trim().toLowerCase() === heading.toLowerCase())
      if (start < 0) throw new Error('Heading not found; list headings first')
      const level = lines[start].match(/^#+/)[0].length
      let end = start + 1
      while (end < lines.length && (!/^#{1,3} /.test(lines[end]) || lines[end].match(/^#+/)[0].length > level)) end++
      return { path, heading, text: lines.slice(start, end).join('\n').slice(0, 50_000) }
    }
    default: throw new Error('Unknown Framer broker method')
  }
}

try { await unlink(socket) } catch (error) { if (error.code !== 'ENOENT') throw error }
const server = createServer(peer => {
  let buffer = ''
  peer.on('data', chunk => {
    buffer += chunk.toString()
    if (buffer.length > 1_000_000) { peer.destroy(); return }
    let line
    while ((line = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, line); buffer = buffer.slice(line + 1)
      queue = queue.catch(() => {}).then(async () => {
        let id
        try {
          const request = JSON.parse(raw); id = request.id
          const result = await dispatch(request.method, request.params)
          peer.write(JSON.stringify({ id, result }) + '\n')
        } catch (error) { peer.write(JSON.stringify({ id, error: error.message }) + '\n') }
      })
    }
  })
})
server.listen(socket, async () => { await chmod(socket, 0o600); console.error('[framer] broker ready') })
