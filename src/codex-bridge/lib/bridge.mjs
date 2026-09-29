// The bridge proper: named sessions mapped to Codex threads, and the
// operations the MCP tools and CLI expose over them.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { AppServer } from './appserver.mjs'
import { trimmedRoster } from './codex-config.mjs'
import { CODEX_HOME, daemonStatus } from './codex-paths.mjs'
import { loadPolicy } from './policy.mjs'
import { STATE_DIR, loadState, updateState } from './state.mjs'
import { finalizeTimeline, formatResult, runTurn, summarize } from './turn-runner.mjs'

const DEVELOPER_INSTRUCTIONS = `You are running a task delegated by a supervising Claude agent through codex-bridge; there is no human at the keyboard.
- Use Computer Use (cua_repl) for anything that needs the macOS UI. Prefer purpose-built tools when they exist.
- Open and target apps by name with cua.getApp(<name or bundle id>); it launches the app if needed. Never go through the Dock, Spotlight, Launchpad or Mission Control: the Dock is auto-hidden, moves between screen edges, and is not readable through accessibility.
- Do not send a message before your first tool call and do not narrate between calls; your words go in the final message. Do every step the task lists, in order, even when a result seems obvious.
- Call the report_progress tool at meaningful milestones on tasks with more than three steps (one short sentence each) so the supervisor can follow along.
- If an app is not approved, say which app in your final message and stop; the supervisor can grant it and re-run.
- Never take irreversible actions (send, submit, purchase, delete) unless the task explicitly asks for that exact action.
- Leave the desktop as you found it. Before your final message, re-read the state of every app you touched and close any dialog, alert, sheet, tab or window you caused; quit any app you launched unless the task says to leave it open. Never leave a modal for the user to puzzle over. If something cannot be cleaned up, say exactly what is left and where.
- After you quit an app, do not call cua.getApp on it again: that relaunches it or raises a "not open anymore" alert. Confirm a quit with cua.getState() (the app is absent from the running list).
- Final message: outcome first, then evidence (what you saw), then anything blocked or assumed. Keep it under 200 words unless asked for more.`

const REPORT_PROGRESS_TOOL = {
  type: 'function',
  name: 'report_progress',
  description: 'Send a one-sentence progress note to the supervising agent. Use at milestones, not for every action.',
  inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false },
}

export { DEVELOPER_INSTRUCTIONS }

export class BridgeError extends Error {
  expected = true // a user-facing refusal, not a bug: logged without a stack
}

export class Bridge {
  #loaded = new Set()
  #rosterByThread = new Map() // threadId -> disabledPluginIds for trimmed threads
  active = new Map() // session -> { threadId, turnId, task, startedAt }

  constructor({ log = () => {} } = {}) {
    this.log = log
    this.policy = loadPolicy()
    this.app = new AppServer({ log, stderrPath: join(STATE_DIR, 'app-server.stderr.log') })
    this.app.on('close', () => this.#loaded.clear())
  }

  async connect() {
    if (!this.app.connected) await this.app.connect()
    return this.app
  }

  // roster: 'full' keeps whatever ~/.codex/config.toml enables; 'trim'
  // disables every MCP server and plugin except Computer Use on this thread
  // (experiment 11: smaller prompt, faster boot).
  #threadParams(cwd, session, roster, instructions) {
    const p = {
      cwd,
      approvalPolicy: this.policy.approvalPolicy,
      sandbox: this.policy.sandbox,
      ephemeral: false,
      developerInstructions: instructions || DEVELOPER_INSTRUCTIONS,
      dynamicTools: [REPORT_PROGRESS_TOOL],
      serviceName: `codex-bridge:${session}`,
    }
    if (roster === 'trim') {
      const t = trimmedRoster()
      p.config = t.config
      p.disabledPluginIds = t.disabledPluginIds
      this.log(`trimmed roster: disabled ${t.disabledServers.length} MCP servers and ${t.disabledPluginIds.length} plugins`)
    }
    return p
  }

  async ensureThread(session, { cwd, newThread = false, roster, instructions } = {}) {
    await this.connect()
    const state = loadState()
    const rec = state.sessions[session]
    roster ||= rec?.roster || this.policy.mcpRoster || 'full'
    const params = this.#threadParams(cwd || rec?.cwd || process.cwd(), session, roster, instructions)
    if (rec?.threadId && !newThread) {
      if (this.#loaded.has(rec.threadId)) return rec.threadId
      try {
        await this.app.threadResume({ threadId: rec.threadId, ...params })
        this.#loaded.add(rec.threadId)
        this.#rosterByThread.set(rec.threadId, roster === 'trim' ? params.disabledPluginIds : null)
        updateState((s) => {
          s.sessions[session] = { ...rec, lastUsedAt: new Date().toISOString() }
        })
        return rec.threadId
      } catch (err) {
        this.log(`resume of ${rec.threadId} failed (${err.message}); starting a fresh thread for ${session}`)
      }
    }
    const resp = await this.app.threadStart(params)
    const threadId = resp.thread.id
    this.#loaded.add(threadId)
    this.#rosterByThread.set(threadId, roster === 'trim' ? params.disabledPluginIds : null)
    updateState((s) => {
      s.sessions[session] = { threadId, cwd: params.cwd, createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(), model: resp.model, roster }
    })
    return threadId
  }

  async run(args, ctx = {}) {
    const receivedAt = Date.now()
    const session = String(args.session || 'default')
    if (this.active.has(session)) {
      const a = this.active.get(session)
      throw new BridgeError(`session "${session}" already has a turn running (started ${a.startedAt}, task: ${a.task.slice(0, 80)}). Use codex_steer to redirect it, codex_interrupt to stop it, or another session name.`)
    }
    const threadId = await this.ensureThread(session, { cwd: args.cwd, newThread: !!args.new_thread, roster: args.mcp_roster, instructions: args.developer_instructions })
    const threadReadyAt = Date.now()
    const state = loadState()
    const grants = { ...(state.grants || {}) }
    for (const app of args.apps || []) grants[app] = 'session'

    const input = [{ type: 'text', text: String(args.task) }]
    for (const p of args.images || []) {
      if (!existsSync(p)) throw new BridgeError(`image not found: ${p}`)
      input.push({ type: 'localImage', path: p })
    }

    const entry = { threadId, turnId: null, task: String(args.task), startedAt: new Date().toISOString() }
    this.active.set(session, entry)
    try {
      const result = await this.#runTurnWithRecovery(session, threadId, {
        input,
        outputSchema: args.output_schema,
        policy: this.policy,
        grants,
        overrides: { allowCommands: !!args.allow_commands, model: args.model, effort: args.effort, sandbox: args.sandbox, disabledPluginIds: this.#rosterByThread.get(threadId) || null },
        onProgress: (m) => {
          ctx.progress?.(m)
          entry.lastProgress = m
        },
        timeoutMs: Math.max(30, Number(args.timeout_sec) || 900) * 1000,
        log: this.log,
        signal: ctx.signal,
        receivedAt,
        threadReadyAt,
        session,
        roster: args.mcp_roster,
        instructions: args.developer_instructions,
      })
      entry.threadId = result.threadId
      entry.turnId = result.turnId
      updateState((s) => {
        const rec = s.sessions[session] || { threadId }
        s.sessions[session] = { ...rec, lastUsedAt: new Date().toISOString(), lastStatus: result.status, lastTurnId: result.turnId }
      })
      const mode = args.screenshots || 'last'
      const imagesReturned = mode === 'all' ? result.screenshots.length : mode === 'last' ? Math.min(1, result.screenshots.length) : 0
      // Format once to size the payload, finalize the timeline (adds the
      // timeline path), then format again so the path is in the text.
      const provisional = formatResult(result, { session })
      const returnedShots = mode === 'all' ? result.screenshots : mode === 'last' ? result.screenshots.slice(-1) : []
      const imageBytes = returnedShots.reduce((n, s) => n + (s.data?.length || 0), 0)
      finalizeTimeline(result, { resultBytes: Buffer.byteLength(provisional) + imageBytes, imagesReturned, session })
      const text = formatResult(result, { session })
      return { result, text, summary: summarize(result, { session }) }
    } finally {
      this.active.delete(session)
    }
  }

  // The daemon unloads idle threads and archives close them; the in-process
  // loaded set then lies and turn/start answers "thread not found". Resume
  // (or start over) once and retry.
  async #runTurnWithRecovery(session, threadId, turnOpts) {
    try {
      return await runTurn(this.app, { ...turnOpts, threadId })
    } catch (err) {
      if (!/thread not found|not loaded|unknown thread/i.test(err.message)) throw err
      this.log(`turn/start on ${threadId} failed (${err.message}); resuming or restarting the thread`)
      this.#loaded.delete(threadId)
      const fresh = await this.ensureThread(session, { roster: turnOpts.roster, instructions: turnOpts.instructions })
      return runTurn(this.app, { ...turnOpts, threadId: fresh })
    }
  }

  // Archive the session's thread on the daemon (which frees its MCP servers,
  // Computer Use REPL and app-server child) and forget the mapping.
  async closeSession(session) {
    session = String(session)
    if (this.active.has(session)) throw new BridgeError(`session "${session}" has a turn running; interrupt it first`)
    const rec = loadState().sessions[session]
    if (!rec?.threadId) throw new BridgeError(`unknown session "${session}"`)
    await this.connect()
    let archived = 'archived'
    try {
      await this.app.request('thread/archive', { threadId: rec.threadId })
    } catch (err) {
      archived = `archive failed (${err.message.slice(0, 120)}); mapping dropped anyway`
    }
    this.#loaded.delete(rec.threadId)
    updateState((s) => {
      delete s.sessions[session]
    })
    return `session "${session}" closed: thread ${rec.threadId} ${archived}. A new call with this session name starts a fresh thread.`
  }

  async steer(session, message) {
    const a = this.active.get(String(session))
    if (!a?.turnId) throw new BridgeError(`session "${session}" has no turn running in this bridge process`)
    await this.connect()
    await this.app.turnSteer({ threadId: a.threadId, expectedTurnId: a.turnId, input: [{ type: 'text', text: String(message) }] })
    return `steered session "${session}" (thread ${a.threadId}, turn ${a.turnId}). The running codex_computer_use call will return when Codex finishes.`
  }

  async interrupt(session) {
    const a = this.active.get(String(session))
    await this.connect()
    if (a?.turnId) {
      await this.app.turnInterrupt({ threadId: a.threadId, turnId: a.turnId })
      return `interrupted session "${session}" (turn ${a.turnId}); the pending call will return status=interrupted.`
    }
    // Not running here: maybe on the shared daemon from another process.
    const rec = loadState().sessions[String(session)]
    if (!rec?.threadId) throw new BridgeError(`unknown session "${session}"`)
    await this.ensureThread(String(session))
    const turns = await this.app.request('thread/turns/list', { threadId: rec.threadId, limit: 5, itemsView: 'summary' }).catch(() => null)
    const running = (turns?.data || []).find((t) => t.status === 'inProgress')
    if (!running) return `session "${session}" (thread ${rec.threadId}) has no active turn.`
    await this.app.turnInterrupt({ threadId: rec.threadId, turnId: running.id })
    return `interrupted thread ${rec.threadId} turn ${running.id} (it was running outside this bridge process).`
  }

  approveApp(app, scope = 'session') {
    if (!['session', 'always'].includes(scope)) throw new BridgeError('scope must be "session" or "always"')
    updateState((s) => {
      s.grants[String(app)] = scope
    })
    return `${app} will be approved with persist=${scope} the next time Codex asks for it. ("always" is written by Codex Computer Use to its own approval store; "session" applies to the Codex thread it is asked in.)`
  }

  revokeApp(app) {
    updateState((s) => {
      delete s.grants[String(app)]
    })
    return `${app} removed from bridge grants. A permanent grant already stored by Computer Use must be removed in the Codex app or by editing ComputerUseAppApprovals.json.`
  }

  async status({ session } = {}) {
    const lines = []
    let daemon = null
    try {
      await this.connect()
      daemon = this.app.transportKind === 'daemon' ? await daemonStatus(this.app.bin) : null
      lines.push(`app-server: connected via ${this.app.transportKind}, codex ${this.app.version}${daemon ? ` (daemon ${daemon.status})` : ''}`)
    } catch (err) {
      lines.push(`app-server: NOT connected (${err.message})`)
    }
    lines.push(`policy: ${this.policy.source || 'built-in defaults'}; sandbox ${this.policy.sandbox}; unknown apps → ${this.policy.apps.unknown}; commands ${this.policy.commands}`)
    const state = loadState()
    const grants = Object.entries(state.grants || {})
    if (grants.length) lines.push(`grants: ${grants.map(([a, s]) => `${a}=${s}`).join(', ')}`)
    const cuaApprovals = join(process.env.HOME || '', 'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/Library/Application Support/Software/ComputerUseAppApprovals.json')
    if (existsSync(cuaApprovals)) {
      try {
        const ids = JSON.parse(await import('node:fs').then((m) => m.readFileSync(cuaApprovals, 'utf8'))).approvedBundleIdentifiers || []
        lines.push(`computer use permanent allowlist: ${ids.join(', ') || '(empty)'}`)
      } catch {}
    }
    const sessions = Object.entries(state.sessions || {}).filter(([name]) => !session || name === session)
    lines.push('', sessions.length ? 'sessions:' : 'sessions: none yet')
    for (const [name, rec] of sessions) {
      const a = this.active.get(name)
      lines.push(`  ${name}: thread ${rec.threadId}${a ? ` RUNNING since ${a.startedAt} (${a.lastProgress || 'starting'})` : ` idle, last ${rec.lastStatus || '-'} at ${rec.lastUsedAt}`}; cwd ${rec.cwd}`)
    }
    lines.push('', `codex home: ${CODEX_HOME}; bridge state: ${STATE_DIR}`)
    return lines.join('\n')
  }

  close() {
    this.app.close()
  }
}
