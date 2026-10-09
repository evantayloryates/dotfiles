import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nutritionRecipe} from './workflows.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterHash = createHash('sha256').update(['mcp/backend.mjs', 'mcp/server.mjs', 'mcp/workflows.mjs', 'paired_workflow.py', 'health.py', 'local_stack.py', 'cli.py', 'learning.py', 'mcp/package-lock.json', 'web/sdk.js', 'web/bridge.py', 'web_cli.py']
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
    const files = {web: 'web_cli.py', cli: 'cli.py', verify: 'verify.py', doctor: 'health.py', stack: 'local_stack.py', paired: 'paired_workflow.py', learning: 'learning.py'};
    if (!files[kind]) throw new Error('fixed_operation_required');
    const argv = kind === 'learning' ? [path.join(this.state, 'learning')] :
      kind === 'web' ? ['--state', this.state] : kind === 'paired' ? [] : kind === 'cli' ? ['--state', this.state, ...args] : [...args, '--state', this.state];
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
    return {browserWorkflow: ['ios_web_enroll (private launchFile)', 'open the intended dev browser page', 'ios_web_pages', 'ios_web_begin', 'ios_web_inspect and ios_web_action', 'ios_web_end in finally'],
      browserLimits: 'Page-owned DOM input is synthetic; it does not operate OS dialogs, trusted touch, IME or microphone permission. SDK return channel works over private HTTPS; require separate off-LAN qualification. Dev-only enrollment and per-tab authentication.',
      workflow: ['ios_doctor', 'ios_begin', 'ios_native or ios_react', 'ios_verify', 'ios_end'],
      hostWorkflow: ['ios_doctor (read only)', 'ios_stack_ensure only when needed and idle; never replay an uncertain start'],
      pairedWorkflow: 'ios_workflow action=plan exposes the versioned coach-client recipe; capture/assert/restore-check independently read only the verified synthetic local row. UI rendering is a separate gate.',
      lease: 'One session per work turn. Always ios_end in finally before ending a turn. Codex should supply its actual active rollout to ios_begin. Other clients use a private connection heartbeat; MCP cannot detect a model turn ending on a persistent connection.',
      requirements: 'Kickoff DEV foreground and unlocked, Tailscale connected, laptop services awake. USB not required.',
      cleanup: 'Explicit end, cancellation, disconnect and 20-minute tool silence retire control. A heartbeat does not extend the silence limit. Native watchdog protects host loss.',
      input: 'Get a fresh tree; use its snapshot, target and observed coordinates within five seconds. Verify committed route/value after input. Never automatically replay an accepted or unknown action.',
      updates: 'JS edits use remote Metro; verify ready and route after refresh. Forms/navigation can reset. Native edits require build/install.',
      visibility: 'Main-window data excludes system overlays. UIKeyInput is semantic editing. No arbitrary system UI, IME or multi-touch guarantee.',
      sharedLearning: learning};
  }
  async doctor() {
    const r = await this.run('doctor', [], undefined, 45000);
    if (!r.value || typeof r.value.hostPrerequisitesReady !== 'boolean') return {ok: false, reason: 'host_diagnosis_unavailable'};
    const value = safe(r.value);
    return {...value, ok: r.ok && value.hostPrerequisitesReady, failedChecks: Object.entries(value.checks || {}).filter(([,v]) => v !== true).map(([k]) => k),
      next: 'Host checks do not establish phone readiness. Inspect failed checks before changing services or asking for phone setup.'};
  }
  async stackEnsure({timeout = 60} = {}) {
    if (this.closing || [...this.sessions.values()].some(s => s.active)) return {ok: false, reason: 'idle_host_required_for_stack_recovery', actionSent: false};
    const r = await this.run('stack', ['--timeout', String(timeout)], undefined, 145000);
    if (!r.value) return {ok: false, reason: r.error, outcome: 'inspect_current_state_before_retry', replay: false};
    return {...safe(r.value), ok: r.ok && r.value.backendReady === true, replay: false,
      next: 'Run ios_doctor after any uncertain result. This tool never stops existing workers, resets data, or promises phone readiness.'};
  }
  async workflow({action = 'plan', clientId, baselineId, stage, expected} = {}) {
    if (action === 'plan') return {ok: true, recipe: nutritionRecipe};
    let baseline;
    if (action !== 'capture') {
      const record = this.artifacts.get(baselineId);
      if (!record || record.type !== 'paired-baseline') throw new Error('owned_baseline_required');
      baseline = JSON.parse(fs.readFileSync(record.file, 'utf8'));
      if (clientId !== undefined && String(clientId) !== String(baseline.clientId)) return {ok: false, reason: 'paired_baseline_client_mismatch', dataChanged: false, credentialsCreated: false};
      clientId = String(baseline.clientId);
    }
    const r = await this.run('paired', [], {state: this.state, clientId}, 45000);
    if (!r.ok || r.value?.ok !== true || !r.value.snapshot) return {ok: false, reason: 'paired_local_read_refused', dataChanged: false, credentialsCreated: false};
    const current = r.value.snapshot;
    if (action === 'capture') {
      const a = this.artifact({id: null, dir: this.observationDirectory()}, 'paired-baseline');
      fs.writeFileSync(a.file, JSON.stringify(current), {flag: 'wx', mode: 0o600});
      return {ok: true, baselineId: a.id, artifactId: a.id, pair: {clientId: String(current.clientId), coachId: String(current.coachId)},
        receipt: {gate: 'paired-baseline', status: 'passed', scope: 'guarded-local-persistence-only', observation: {localIdentity: true, syntheticPair: true, nonAdminCoach: true}},
        next: 'Use ios_read on this baselineId for the original synthetic value. Independently match both authenticated UIs; no login or UI assertion was performed.'};
    }
    const same = ['clientId','clientUserId','coachId','coachUserId','databaseFingerprint'].every(k => String(current[k]) === String(baseline[k]));
    const target = action === 'restore-check' ? baseline.targetDailyCalories : expected;
    const matched = same && current.targetDailyCalories === target;
    return {ok: matched, receipt: {gate: action === 'restore-check' ? 'paired-restoration' : 'paired-persistence', stage,
      status: matched ? 'passed' : 'failed', scope: 'guarded-local-persistence-only', observation: {sameDatabaseAndPair: same, expectedValueMatched: matched}},
      dataChanged: false, credentialsCreated: false, replay: false,
      next: 'This is database readback only. Verify phone and coach rendering separately; stop on a changed pair/value rather than replaying a mutation.'};
  }
  async begin({rollout, surface = 'native', page} = {}) {
    if (this.closing || [...this.sessions.values()].some(s => s.active)) throw new Error('end_existing_session_first');
    const base = path.join(this.state, 'mcp-sessions');
    fs.mkdirSync(base, {recursive: true, mode: 0o700});
    if (fs.lstatSync(base).isSymbolicLink() || fs.statSync(base).mode & 0o077) throw new Error('private_session_directory_required');
    const id = hex(); const dir = path.join(base, id); fs.mkdirSync(dir, {mode: 0o700});
    const s = {id, dir, turn: hex(), owner: path.join(dir, 'owner.json'),
      lease: path.join(dir, 'lease.json'), activity: Date.now(), active: true, busy: false, surface, page};
    this.sessions.set(id, s); this.writeOwner(s);
    s.acquisition = this.run('cli', ['acquire', ...(surface !== 'native' ? ['--surface', surface, ...(surface === 'web' ? ['--page', page] : [])] : []), ...(rollout ? ['--rollout', rollout, '--connection-owner', s.owner] : ['--owner-file', s.owner]), '--lease-file', s.lease]);
    const r = await s.acquisition;
    if (!r.ok || this.closing) { await this.end(id); throw new Error(r.error || 'session_closed'); }
    try {
      if (surface === 'launch') return {sessionId:id,maintenanceOwner:true};
      if (surface === 'web') {
        const check = await this.webAction({sessionId: id, action: 'state'});
        if (check.ok !== true) throw new Error('web_page_not_ready');
        s.webFingerprint = createHash('sha256').update(JSON.stringify([adapterHash, check.value?.version, check.value?.browser, check.value?.boot])).digest('hex');
        return {sessionId: id, page, ready: true, verification: check, learning: await this.learning('search',{source:s.webFingerprint}).catch(()=>({available:false})), next: 'ios_web_inspect, fresh snapshot/target, ios_web_action. Always ios_web_end in finally.'};
      }
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
  async webPages() {
    const r = await this.run('web', [], {op: 'web_pages'}, 8000);
    return r.ok ? {...r.value, ok: true} : {ok: false, reason: r.error};
  }
  async webEnroll({path: route = '/dev/ios-agent', browser} = {}) {
    if (browser && (await this.status()).lease) return {ok:false,reason:'idle_device_required_for_browser_launch',actionSent:false};
    const runtime = JSON.parse(fs.readFileSync(path.join(this.state, 'dev-runtime.json'), 'utf8'));
    const origin = new URL(runtime.webURL).origin;
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('#') || route.includes('\\')) throw new Error('local_route_required');
    const r = await this.run('web', [], {op: 'web_enroll', origin}, 8000);
    if (!r.ok || !r.value.token) return {ok: false, reason: 'web_enrollment_unavailable'};
    const a = this.artifact({id: null, dir: this.observationDirectory()}, 'web-enrollment');
    fs.writeFileSync(a.file, JSON.stringify({url: origin + route + '#ios-agent=' + encodeURIComponent(r.value.token)}), {flag: 'wx', mode: 0o600});
    let launch;
    if (browser) {
      const configFile = path.join(this.state, 'web-device.json');
      if (!fs.existsSync(configFile) || fs.statSync(configFile).mode & 0o077) return {ok:false,reason:'private_web_device_configuration_required',launchFile:a.file,actionSent:false};
      const device = JSON.parse(fs.readFileSync(configFile,'utf8')).coreDeviceId;
      if (!/^[A-Fa-f0-9-]{36}$/.test(device)) return {ok:false,reason:'configured_device_id_required',actionSent:false};
      const bundle = {'ios-safari':'com.apple.mobilesafari','ios-chrome':'com.google.chrome.ios'}[browser];
      if (!bundle) return {ok:false,reason:'supported_ios_browser_required',actionSent:false};
      const sourceURL=JSON.parse(fs.readFileSync(a.file,'utf8')).url;
      const url=sourceURL.replace(/^https:/,browser==='ios-safari'?'x-safari-https:':'googlechromes:');
      const reservation = await this.begin({surface:'launch'});
      try { launch = await new Promise(resolve=>{
        const child=spawn('/usr/bin/xcrun',['devicectl','device','process','launch','--device',device,'--timeout','12','--payload-url',url,bundle],{stdio:'ignore'});
        let settled=false;const timer=setTimeout(()=>{child.kill('SIGTERM');if(!settled){settled=true;resolve({outcome:'unknown',replay:false});}},15000);
        child.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;resolve({outcome:'not-started',replay:false});}});
        child.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;resolve({outcome:code===0?'developer-request-accepted':'unconfirmed',replay:false});}});
      }); } finally { await this.end(reservation.sessionId); }
    }
    return {ok: true, launchFile: a.file, expiresIn: 300, ...(launch?{launch}:{}), next: 'Use this private JSON URL to open the intended dev page in Safari or Chrome. Do not log enrollment fragments.'};
  }
  async webAction({sessionId, action, args = {}}) {
    const s = this.session(sessionId);
    if (s.surface !== 'web') throw new Error('web_session_required');
    const lease = JSON.parse(fs.readFileSync(s.lease, 'utf8')).lease;
    const r = await this.run('web', [], {op: 'web_action', lease, action, args}, 22000);
    const a = this.artifact(s, 'web-observation');
    fs.writeFileSync(a.file, JSON.stringify(r.value), {flag: 'wx', mode: 0o600});
    const ok = r.ok && r.value?.status === 'completed' && r.value?.result?.ok === true;
    const value = r.value?.result?.value;
    const large = JSON.stringify(value || {}).length > 12000;
    const preview = large && action === 'snapshot' ? {...value, content:value.content?.slice(0,2000),elements:value.elements?.slice(0,25),nodeCount:value.elements?.length} :
      large && action === 'state' ? {...value,domains:undefined,domainNames:Object.keys(value.domains || {})} : undefined;
    return {ok, artifactId: a.id, outcome: r.value?.status || 'unknown', error: r.value?.result?.error, replay: false,
      ...(typeof r.value?.reason === 'string' ? {reason:r.value.reason} : {}),
      ...(!large ? {value} : {value:preview,truncated:true,next:'Use ios_read with /result/value for the complete private observation.'})};
  }
  async webVerify({sessionId, gate, expectedPath, expectedText}) {
    const s = this.session(sessionId);
    if (s.surface !== 'web') throw new Error('web_session_required');
    if (gate === 'web-route' && !expectedPath && !expectedText) return {ok:false,reason:'explicit_web_postcondition_required'};
    const read = await this.webAction({sessionId, action: gate === 'web-ready' ? 'state' : 'snapshot'});
    const file=this.artifacts.get(read.artifactId)?.file;
    const value=file ? JSON.parse(fs.readFileSync(file,'utf8'))?.result?.value : read.value;
    const observation = gate === 'web-ready' ? {visible:value?.visible === true,secureContext:value?.secureContext === true,indicatorOn:value?.indicator === true} :
      {snapshotAvailable:typeof value?.snapshot === 'string',nodeCount:value?.elements?.length || 0,
       ...(expectedPath ? {expectedPathMatched:value?.path === expectedPath} : {}),
       ...(expectedText ? {expectedTextMatched:value?.content?.includes(expectedText) === true} : {})};
    const ok=read.ok && Object.values(observation).every(v=>typeof v==='number'?v>0:v===true);
    const receipt={gate,status:ok?'passed':'failed',observation};
    const learningEvidence=await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false}));
    return {ok,receipt,artifactId:read.artifactId,learningEvidence};
  }
  async webEnd(id) {
    const s = this.sessions.get(id), page = s?.page;
    const release = await this.end(id);
    if (!page) return {...release, indicatorOff: 'unconfirmed'};
    const until = Date.now() + 7000;
    while (Date.now() < until) {
      const pages = await this.webPages();
      const p = pages.pages?.find(p => p.id === page);
      if (p?.indicator === false) {
        const receipt={gate:'web-idle',status:'passed',observation:{ownerReleased:release.released === true,indicatorOff:true}};
        const learningEvidence=s?.webFingerprint ? await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false})) : {available:false};
        return {...release, indicatorOff:true,receipt,learningEvidence};
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return {...release, indicatorOff: 'unconfirmed', ok: false, next: 'Host release alone cannot confirm the disconnected page indicator.'};
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
