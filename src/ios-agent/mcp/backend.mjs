import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterHash = createHash('sha256').update(['mcp/backend.mjs', 'mcp/server.mjs', 'cli.py', 'learning.py', 'mcp/package-lock.json']
  .map(file => fs.readFileSync(path.join(root, file))).map(bytes => createHash('sha256').update(bytes).digest('hex')).join(':')).digest('hex');
export const defaultState = path.join(os.homedir(), 'Library/Application Support/ios-agent');
const idleLimit = 20 * 60 * 1000;
const hex = () => randomBytes(16).toString('hex');
export function safe(value) {
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(token|authorization|password|secret|lease|enrollment|pngBase64)$/i.test(key))
    .map(([key, val]) => [key, safe(val)]));
  return value;
}
export function runtimeKey(status) {
  if (!/^[a-f0-9]{64}$/.test(status?.sourceHash) || !status?.device?.boot) return null;
  // Conservative: a new native boot invalidates applicability, even if build 775 repeats.
  return createHash('sha256').update(JSON.stringify([adapterHash, status.sourceHash, status.device.bundle, status.device.boot])).digest('hex');
}

export class Backend {
  constructor({state = defaultState, run} = {}) {
    this.state = path.resolve(state);
    this.runOverride = run;
    this.sessions = new Map();
    this.artifacts = new Map();
    this.running = new Set();
    this.closing = false;
    this.timer = setInterval(() => {
      for (const s of this.sessions.values()) {
        if (Date.now() - s.activity > idleLimit) { s.active = false; void this.end(s.id); }
        else if (s.active) this.writeOwner(s);
      }
    }, 5000);
    this.timer.unref();
  }
  async run(kind, args, input, timeout = 120000) {
    if (this.runOverride) return this.runOverride(kind, args, input);
    const files = {cli: 'cli.py', verify: 'verify.py', doctor: 'health.py', learning: 'learning.py'};
    const argv = kind === 'learning' ? [path.join(this.state, 'learning')] :
      kind === 'cli' ? ['--state', this.state, ...args] : [...args, '--state', this.state];
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/python3', ['-B', path.join(root, files[kind]), ...argv],
        {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
      this.running.add(child);
      let stdout = '', stderr = '', exceeded = false;
      const timer = setTimeout(() => { exceeded = true; child.kill('SIGTERM'); }, timeout);
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 10 * 1024 * 1024) { exceeded = true; child.kill('SIGTERM'); } });
      child.stderr.on('data', chunk => { if (stderr.length < 1024) stderr += chunk; });
      child.stdin.on('error', () => {});
      child.stdin.end(input ? JSON.stringify(input) : undefined);
      child.on('error', () => { clearTimeout(timer); this.running.delete(child); reject(new Error('cli_start_failed')); });
      child.on('close', code => {
        clearTimeout(timer); this.running.delete(child);
        let value; try { value = JSON.parse(stdout); } catch { value = null; }
        const known = /^(device_not_connected|device_already_leased|frontend_cleanup_in_progress|owner_not_active|owner_not_current_active_turn|lease_required|command_in_flight|active_React_frontend_lease_required|device_action_rejected|action_not_confirmed)/.exec(stderr)?.[1];
        resolve({ok: code === 0 && !exceeded, value, error: exceeded ? 'cli_deadline_outcome_unknown_do_not_replay' : known || 'cli_failed_inspect_private_receipt'});
      });
    });
  }
  async status() {
    const r = await this.run('cli', ['status']);
    if (!r.ok || !r.value) throw new Error('host_status_unavailable');
    return r.value;
  }
  writeOwner(s) {
    const value = {version: 1, id: s.id, turn: s.turn, pid: process.pid,
      active: s.active, heartbeatAt: Date.now() / 1000, activityAt: s.activity / 1000};
    const tmp = path.join(s.dir, 'owner.next.json');
    fs.writeFileSync(tmp, JSON.stringify(value), {mode: 0o600, flag: 'w'});
    fs.renameSync(tmp, s.owner);
  }
  session(id) {
    const s = this.sessions.get(id);
    if (!s || !s.active || this.closing || Date.now() - s.activity > idleLimit) throw new Error('active_session_required_begin_again');
    s.activity = Date.now(); this.writeOwner(s);
    return s;
  }
  artifact(s, type) {
    const id = hex();
    const file = path.join(s.dir, `${id}.json`);
    this.artifacts.set(id, {file, sessionId: s.id, type});
    return {id, file};
  }
  async learning(op, args) {
    const r = await this.run('learning', [], {op, args}, 8000);
    if (!r.ok || r.value?.error) throw new Error('shared_learning_unavailable');
    return r.value;
  }
  async guide() {
    let current, learning;
    try { current = await this.status(); learning = await this.learning('search', {source: runtimeKey(current) || ''}); }
    catch { learning = {available: false}; }
    return {workflow: ['ios_begin', 'ios_native or ios_react', 'ios_verify', 'ios_end'],
      lease: 'One session per work turn. Always ios_end in finally before ending a turn. Codex should supply its actual active rollout to ios_begin. Other clients use a private connection heartbeat; MCP cannot detect a model turn ending on a persistent connection.',
      requirements: 'Kickoff DEV foreground and unlocked, Tailscale connected, laptop services awake. USB not required.',
      cleanup: 'Explicit end, cancellation, disconnect and 20-minute tool silence retire control. A heartbeat does not extend the silence limit. Native watchdog protects host loss.',
      input: 'Get a fresh tree; use its snapshot, target and observed coordinates within five seconds. Verify committed route/value after input. Never automatically replay an accepted or unknown action.',
      updates: 'JS edits use remote Metro; verify ready and route after refresh. Forms/navigation can reset. Native edits require build/install.',
      visibility: 'Main-window data excludes system overlays. UIKeyInput is semantic editing. No arbitrary system UI, IME or multi-touch guarantee.',
      sharedLearning: learning};
  }
  async begin({rollout} = {}) {
    if (this.closing || [...this.sessions.values()].some(s => s.active)) throw new Error('end_existing_session_first');
    const base = path.join(this.state, 'mcp-sessions');
    fs.mkdirSync(base, {recursive: true, mode: 0o700});
    if (fs.lstatSync(base).isSymbolicLink() || fs.statSync(base).mode & 0o077) throw new Error('private_session_directory_required');
    const id = hex(); const dir = path.join(base, id); fs.mkdirSync(dir, {mode: 0o700});
    const s = {id, dir, turn: hex(), owner: path.join(dir, 'owner.json'),
      lease: path.join(dir, 'lease.json'), activity: Date.now(), active: true, busy: false};
    this.sessions.set(id, s); this.writeOwner(s);
    s.acquisition = this.run('cli', ['acquire', ...(rollout ? ['--rollout', rollout, '--connection-owner', s.owner] : ['--owner-file', s.owner]), '--lease-file', s.lease]);
    const r = await s.acquisition;
    if (!r.ok || this.closing) { await this.end(id); throw new Error(r.error || 'session_closed'); }
    try {
      const verification = await this.verify({sessionId: id, gate: 'ready', timeout: 12});
      if (verification.receipt.status !== 'passed') throw new Error('app_not_ready');
      return {sessionId: id, ready: true, ownership: rollout ? 'codex-turn' : 'mcp-connection', verification,
        next: 'Inspect a native or React tree. Call ios_end before ending this work turn.',
        learning: await this.learning('search', {source: runtimeKey(await this.status()) || ''}).catch(() => ({available: false}))};
    } catch (error) { await this.end(id); throw error; }
  }
  async verify({sessionId, gate, expected, timeout = 12}) {
    const s = sessionId ? this.session(sessionId) : {dir: this.observationDirectory(), id: null};
    if (!sessionId && !['idle', 'host-idle'].includes(gate)) throw new Error('session_required');
    const a = this.artifact(s, 'verification');
    const before = runtimeKey(await this.status().catch(() => null));
    const result = await this.run('verify', [gate, '--timeout', String(timeout), '--output', a.file,
      ...(sessionId && !['idle', 'host-idle'].includes(gate) ? ['--lease-file', s.lease] : []), ...(expected ? ['--expect', expected] : [])]);
    if (!fs.existsSync(a.file)) throw new Error(result.error);
    const receipt = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    const source = runtimeKey(await this.status().catch(() => null));
    let learningEvidence = {available: false};
    if (source && source === before) learningEvidence = await this.learning('observe', {receipt, source}).catch(() => ({available: false}));
    return {artifactId: a.id, receipt, learningEvidence};
  }
  observationDirectory() {
    const dir = path.join(this.state, 'mcp-observations');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    if (fs.lstatSync(dir).isSymbolicLink() || fs.statSync(dir).mode & 0o077) throw new Error('private_observation_directory_required');
    return dir;
  }
  async action({sessionId, action, args = {}}, inspect = false) {
    const s = this.session(sessionId);
    const a = this.artifact(s, inspect ? 'react' : action);
    const result = await this.run('cli', [inspect ? 'inspect' : 'action', ...(!inspect ? [action] : []),
      '--args', JSON.stringify(args), '--lease-file', s.lease, '--output', a.file]);
    if (!fs.existsSync(a.file)) return {ok: false, reason: result.error, actionSent: 'unknown', replay: false};
    const receipt = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    let data = safe(receipt.result || receipt.data || receipt);
    if (!inspect && action === 'tree' && Array.isArray(data.nodes)) {
      const all = data.nodes;
      const useful = all.filter(n => n.visible && (n.label || n.identifier || n.firstResponder));
      data = {...data, nodes: useful.slice(0, 120), totalNodes: all.length,
        compactView: true, omittedFromCompactView: all.length - Math.min(120, useful.length)};
    }
    // Unknown outcomes retain the accepted command ID in the private artifact.
    return {ok: result.ok, artifactId: a.id, status: receipt.status || 'completed',
      reason: result.ok ? undefined : result.error, replay: false,
      data: action === 'image' ? undefined : data,
      next: result.ok ? 'Verify committed route/value; delivery is not commit.' : 'Inspect this artifact; do not replay automatically.'};
  }
  read({artifactId, pointer = '', limit = 12000}) {
    const a = this.artifacts.get(artifactId);
    if (!a) throw new Error('artifact_not_owned_by_this_connection');
    let value = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    if (a.type === 'image') {
      const image = value.result;
      if (typeof image?.pngBase64 !== 'string') throw new Error('image_unavailable');
      return {image: image.pngBase64, metadata: safe(image)};
    }
    value = safe(value); // Redact before selection; a pointer cannot expose a secret scalar.
    if (pointer) for (const part of pointer.split('/').slice(1)) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || !Object.hasOwn(value, key)) throw new Error('pointer_not_found');
      value = value[key];
    }
    const data = safe(value), text = JSON.stringify(data);
    if (text.length > limit) return {artifactId, truncated: true, characters: text.length,
      next: 'Use a JSON pointer to select a smaller subtree. No partial JSON is returned.'};
    return {artifactId, data};
  }
  async end(id) {
    const s = this.sessions.get(id);
    if (!s) return {released: false, alreadyEnded: true};
    if (s.endPromise) return s.endPromise;
    s.active = false; this.writeOwner(s);
    s.endPromise = (async () => {
      // Acquisition reserves an empty file before broker admission. Wait for
      // that single result before release, or a disconnect could orphan a lease.
      if (s.acquisition) await s.acquisition.catch(() => {});
      let release = {ok: true, value: {alreadyInactive: true}};
      if (fs.existsSync(s.lease)) release = await this.run('cli', ['release', '--lease-file', s.lease], undefined, 20000);
      this.sessions.delete(id);
      return {released: release.ok, detail: release.ok ? safe(release.value) : release.error,
        next: 'Call ios_verify gate=idle without a session to confirm native and host cleanup.'};
    })();
    return s.endPromise;
  }
  async cancel() {
    // Mark every owner inactive before waiting for any IPC; accepted input is
    // observed once by its original CLI, never restarted by cancellation.
    for (const s of this.sessions.values()) { s.active = false; this.writeOwner(s); }
    await Promise.all([...this.sessions.values()].map(s => this.end(s.id)));
  }
  async close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true; clearInterval(this.timer);
    this.closePromise = this.cancel();
    return this.closePromise;
  }
}
