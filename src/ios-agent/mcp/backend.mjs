import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nutritionRecipe} from './workflows.mjs';
import {mediaObservation} from './media-verification.mjs';
import {CaptureStore} from './capture-store.mjs';
import {SystemDriver} from './system-driver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterHash = createHash('sha256').update(['mcp/backend.mjs', 'mcp/server.mjs', 'mcp/input-schemas.mjs', 'mcp/system-driver.mjs', 'system_runner.py', 'mcp/capture-store.mjs', 'web/rich-capture.js', 'ready_wait.py', 'mcp/media-verification.mjs', 'mcp/workflows.mjs', 'fixture_jobs.py', 'tests/run_fixture.py', 'paired_workflow.py', 'health.py', 'local_stack.py', 'worker-launcher.mjs', 'device_observer.py', 'browser_inspector.py', 'process_inventory.mjs', 'cli.py', 'learning.py', 'mcp/package-lock.json', 'web/sdk.js', 'web/bridge.py', 'web_cli.py']
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

export function runCoreDevice(args, {jsonFile, timeout = 15000} = {}) {
  return new Promise(resolve => {
    const temporary = jsonFile ? null : fs.mkdtempSync(path.join(os.tmpdir(),'ios-agent-device-'));
    if (temporary) jsonFile=path.join(temporary,'result.json');
    // Launch's variadic app arguments consume flags after the bundle ID.
    // Keep developer output options before that positional argument.
    const child = spawn('/usr/bin/xcrun', ['devicectl', ...args.slice(0,3), '--json-output', jsonFile, ...args.slice(3)], {stdio:['ignore','ignore','pipe']});
    let errorText='';child.stderr.on('data',chunk=>{if(errorText.length<8000)errorText+=chunk;});
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); if(temporary)fs.rmSync(temporary,{recursive:true,force:true}); resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ok:false,outcome:'unknown',replay:false}); }, timeout);
    child.on('error', () => finish({ok:false,outcome:'not-started',replay:false}));
    child.on('close', code => {
      let data; try { if (jsonFile) data = JSON.parse(fs.readFileSync(jsonFile,'utf8')); } catch {}
      const errors=[];const scan=v=>{if(!v||typeof v!=='object'||errors.length>=8)return;if(Number.isInteger(v.code)&&typeof v.domain==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(v.domain))errors.push({code:v.code,domain:v.domain});for(const child of Object.values(v))if(child&&typeof child==='object')scan(child);};scan(data?.error);
      const parserIssue=/Unexpected argument/i.test(errorText)?'unexpected_argument':/Unknown option/i.test(errorText)?'unknown_option':/Invalid value/i.test(errorText)?'invalid_value':/Missing (expected )?(argument|value)/i.test(errorText)?'missing_argument_or_value':undefined;
      const timedOut=/timed? out|timeout.*exceed|exceeded.*timeout/i.test(errorText);
      finish({ok:code===0,outcome:timedOut?'unknown':code===0?'developer-request-accepted':data?.error?'developer-request-rejected':'unconfirmed',data,diagnostic:{exitCode:code,errors,...(timedOut?{timedOut:true}:{}),...(parserIssue?{parserIssue}:{})},replay:false});
    });
  });
}

export class Backend {
  constructor({state = defaultState, run, deviceRun = runCoreDevice} = {}) {
    this.state = path.resolve(state);
    this.runOverride = run;
    this.deviceRun = deviceRun;
    this.sessions = new Map();
    this.artifacts = new Map();
    this.running = new Set();
    this.closing = false;
    this.captures=new Map();
    this.captureStore=new CaptureStore(this.state);
    this.waitControllers=new Set();
    this.timer = setInterval(() => {
      try{this.captureStore.prune();}catch{} // Retention cannot interrupt control cleanup.
      for (const s of this.sessions.values()) {
        if (Date.now() - s.activity > idleLimit) { s.active = false; void this.end(s.id); }
        else if (s.active) this.writeOwner(s);
      }
    }, 5000);
    this.timer.unref();
  }
  async run(kind, args, input, timeout = 120000, signal) {
    if (this.runOverride) return this.runOverride(kind, args, input);
    const files = {wait:'ready_wait.py', web: 'web_cli.py', cli: 'cli.py', verify: 'verify.py', doctor: 'health.py', stack: 'local_stack.py', paired: 'paired_workflow.py', learning: 'learning.py', provider:'device_observer.py', fixture:'fixture_jobs.py'};
    if (!files[kind]) throw new Error('fixed_operation_required');
    const argv = kind === 'learning' ? [path.join(this.state, 'learning')] :
      kind === 'provider' ? [] : ['web','wait','fixture'].includes(kind) ? ['--state', this.state] : kind === 'paired' ? [] : kind === 'cli' ? ['--state', this.state, ...args] : [...args, '--state', this.state];
    return new Promise((resolve, reject) => {
      const child = spawn(kind==='provider'?path.join(this.state,'providers/pymobiledevice3-11.15.5/bin/python'):'/usr/bin/python3', ['-B', path.join(root, files[kind]), ...argv],
        {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
      this.running.add(child);
      const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      let stdout = '', stderr = '', exceeded = false;
      const timer = setTimeout(() => { exceeded = true; child.kill('SIGTERM'); }, timeout);
      // A bounded 12 MiB device PNG expands to 16 MiB in base64.
      const stdoutLimit=(kind==='provider'?18:10)*1024*1024;
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > stdoutLimit) { exceeded = true; child.kill('SIGTERM'); } });
      child.stderr.on('data', chunk => { if (stderr.length < 1024) stderr += chunk; });
      child.stdin.on('error', () => {});
      child.stdin.end(input ? JSON.stringify(input) : undefined);
      child.on('error', () => { clearTimeout(timer); this.running.delete(child); reject(new Error('cli_start_failed')); });
      child.on('close', code => {
        signal?.removeEventListener('abort',abort);
        clearTimeout(timer); this.running.delete(child);
        let value; try { value = JSON.parse(stdout); } catch { value = null; }
        const known = /^(device_not_connected|device_already_leased|frontend_cleanup_in_progress|owner_not_active|owner_not_current_active_turn|lease_required|command_in_flight|active_React_frontend_lease_required|device_action_rejected|action_not_confirmed|web_page_not_ready)/.exec(stderr)?.[1];
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
  async learningSource(sessionId) {
    if (sessionId) { const s=this.session(sessionId); if(s.surface==='web') return s.webFingerprint || ''; if(s.surface==='system')return s.systemFingerprint||''; }
    return runtimeKey(await this.status().catch(()=>null)) || '';
  }
  async guide() {
    let current, learning;
    try { current = await this.status(); learning = await this.learning('search', {source: runtimeKey(current) || ''}); }
    catch { learning = {available: false}; }
    return {browserWorkflow: ['ios_doctor (host prerequisites)', 'ios_web_pages (reuse a visible ready enrolled page)', 'ios_web_enroll only if provisioning is needed (private launchFile)', 'open the intended dev browser page if not enrolled', 'ios_web_pages', 'ios_web_begin', 'ios_web_inspect and ios_web_action', 'ios_web_end in finally'],
      readiness: 'ios_wait_ready waits up to 55 seconds without a lease, waking on fresh foreground app/page events. Repeat bounded waits while this task is waiting; do not infer lock from offline. ios_begin still verifies the runtime. MCP availability does not itself schedule a new model turn.',
      launch: 'ios_device_launch has fixed DEV/Settings/Safari/Chrome targets through a paired nearby developer channel. DEV launch was qualified from Settings without XCTest. Arbitrary-network foreground launch remains unqualified; Tailscale page/app control alone cannot launch a suspended app.',
      lock: 'ios_device_lock runs only Runner Lock iPhone through the paired developer channel, then independently reads passcodeRequired. The one-action Apple shortcut is installed and physically verified. Already locked is a no-input success. It cannot unlock the phone, does not store a passcode, and is not an arbitrary-network system-control lane.',
      richCapture: 'ios_capture is explicit synthetic-DEV capture only: start selected console/network/audio modes, drain bounded batches, stop, then end in finally. Default 2 MiB ring, max 8 MiB, max 10 minutes; host 32 MiB/capture and 128 MiB total. Artifacts expire after one hour by default (max 24 hours) and private audio chunks stay off the transcript. Clone existing audio tracks only; no microphone request. Inspect remainingEvents and dropped counts; this is not lossless whole-device traffic capture.',
      browserDebugger: 'v1.8 candidate: physical new-domain qualification is pending. ios_browser_debug exposes on-demand source catalogs/windows, matched CSS, console and short WebKit timeline records through the paired Inspector. Content stays in private artifacts; read selected pointers. Evaluation requires an active matching browser page lease/glow and fresh documentRef. No breakpoint/heap or arbitrary-network Inspector claim.',
      deviceObserver: 'ios_device_inspect kind=screen|capabilities|browser-debug|resource-profile reads the paired iPhone without XCTest or Mirroring. With no session it reserves/releases a temporary owner. ios_read renders a private full-display image. Nearby paired wireless developer transport only; HID input not qualified.',
      browserLimits: 'Page-owned DOM input is synthetic; it does not operate OS dialogs, trusted touch, IME or microphone permission. SDK return channel works over private HTTPS; require separate off-LAN qualification. Dev-only enrollment and per-tab authentication.',
      workflow: ['ios_doctor', 'ios_begin', 'ios_native or ios_react', 'ios_verify', 'ios_end'],
      hostWorkflow: ['ios_doctor (read only)', 'ios_stack_ensure only when needed and idle; never replay an uncertain start'],
      inputRecipes: 'Read ios-agent://native-input for typed native/React examples, focused text editing, bounded profiling, Wi-Fi handoff and verification. Native target IDs and React component IDs are different. Invalid argument combinations are refused before phone dispatch.',
      inputMatrix: 'ios_input_matrix plan/start/status exposes the compiled UIKit fixture as a durable serialized simulator job. Require completed, passed and cleanupVerified; no physical-iPhone, React Native, browser or off-LAN proof. Jobs survive MCP reconnect for cleanup; never restart an uncertain job.',
      pairedWorkflow: 'ios_workflow action=plan exposes the versioned coach-client recipe; capture/assert/restore-check independently read only the verified synthetic local row. UI rendering is a separate gate.',
      lease: 'One session per work turn. Always ios_end in finally before ending a turn. Codex should supply its actual active rollout to ios_begin. Other clients use a private connection heartbeat; MCP cannot detect a model turn ending on a persistent connection.',
      requirements: 'Native: Kickoff DEV foreground/unlocked. Browser: enrolled dev document visible on unlocked iPhone. Both require Tailscale and awake laptop services; routine control needs no USB. Developer-channel failure does not prove physical disconnection or lock.',
      browserDomains: {layout:'ios_web_inspect kind=element reports fresh target computed CSS, center hit, bounded ancestors and viewport; use snapshot and target refs.',media:'Content-free request outcomes, track liveness, WebRTC audio and WebSocket counters. Check media.hooks coverage before interpreting zero counts; late microphone APIs are wrapped without replacing later libraries.',performance:'Bounded navigation/paint/resource/main-thread timings, optional Event Timing/LCP observers and readonly AudioSession type/state. Inspect domains.performance; a second state read obtains buffered asynchronous values. Optional observers stop with ownership. Event entry durations are not INP; latest LCP is a candidate. Unsupported readings stay null.',meet:'Fixed local call-lobby projection; no identities, credentials or transcripts.',limitations:'State readback is not a trusted touch, OS permission tap, whole-phone screenshot or off-LAN verification.'},
      browserMediaVerification: 'ios_web_verify gate=web-media direction=sent|received|both sampleMs=500..3000 requires stable advancing audio RTP counters. It returns shared structural learning evidence; a passed counter gate does not prove audible content or a completed call.',
      microphoneWorkflow: 'Safari: use bounded native page controls to save Microphone=Allow for the exact DEV host, then verify getUserMedia through the normal page driver. Chrome: first inspect Settings > Privacy & Security > Microphone; a disabled Chrome app switch can cause NotAllowedError without a site prompt. Named SwiftUI switches resolve their unique nested native toggle; inspect value afterward. Use exact observed Allow labels only after identifying the expected DEV microphone prompt. Never use Mirroring as runtime permission control, assume tap success equals permission, enter a passcode, or replay an unknown request.',
      systemFallback: 'Explicit ios_system_begin/inspect/action/end uses the existing signed WDA runner for native Safari/Chrome/Settings/Kickoff and Home. Fixed activate/Home may leave another app without inspecting it. Xcode automatic privileged diagnostics are disabled; ordinary sessions need no sudo. End the normal app/page lease first; end the fallback in finally, normally return Home, and verify runnerStopped. Startup uses paired nearby developer transport; WDA HTTP uses Tailscale but off-LAN start is unqualified. Apple may request human authorization; no passcode is entered. EOF/dead owner independently stops the runner. Do not use this for routine DOM/app work.',
      cleanup: 'When finished or pausing phone work: stop capture, release control, confirm glow/inspection cleanup, then return the phone to its Home Screen using an available verified system-control route. Taylor prefers Home over restoring the previous app; do not leave Kickoff DEV foreground without a continuing task. Do not send Home during an intermediate session handoff or while another agent owns the device. Home is available within an explicitly started system fallback; normal native/browser end does not start XCTest just for cleanup. Report homeNavigationPending if no verified route is reachable. Never substitute force-quit, lock, XCTest startup or an unverified shortcut. Explicit end, cancellation, disconnect and 20-minute tool silence retire control; the native watchdog protects host loss.',
      input: 'Get a fresh tree; use its snapshot, target and observed coordinates within five seconds. Verify committed route/value after input. Never automatically replay an accepted or unknown action.',
      updates: 'JS edits use remote Metro; verify ready and route after refresh. Forms/navigation can reset. Native edits require build/install.',
      visibility: 'Normal main-window data excludes system overlays. Explicit system fallback includes native browser/system hierarchy. UIKeyInput is semantic editing. No arbitrary system UI, IME or multi-touch guarantee.',
      sharedDiagnosticEvidence: 'ios_learning_evidence includes device-profile, system-ready, system-idle, capture-data and capture-audio receipts. Pass an active browser/system sessionId for runtime matching. Historical review uses matchingRuntime=false and must inspect fingerprints/date; profile jobs use a separate device/OS/provider fingerprint. Counts and booleans are evidence only; no automatic lesson promotion.',
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
  async inputMatrix(args = {}) {
    const r = await this.run('fixture', [], args, 25000);
    return r.value ? safe(r.value) : {ok:false,reason:r.error,replay:false,next:'Inspect ios_input_matrix action=status before starting again.'};
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
        s.webRuntime = Object.fromEntries(['version','browser','boot'].map(k => [k,check.value?.[k]]));
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
  async action({sessionId, action, args = {}}, inspect = false, capturePoll=false) {
    const s = this.session(sessionId);
    const a = this.artifact(s, inspect ? 'react' : action);
    const result = await this.run('cli', [inspect ? 'inspect' : 'action', ...(!inspect ? [action] : []),
      '--args', JSON.stringify(args), '--lease-file', s.lease, '--output', a.file]);
    if (!fs.existsSync(a.file)) return {ok: false, reason: result.error, actionSent: 'unknown', replay: false};
    const receipt = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    if(action==='state'&&!capturePoll&&receipt.result?.richCapture){delete receipt.result.richCapture;fs.writeFileSync(a.file,JSON.stringify(receipt),{mode:0o600});}
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
    this.captureStore.prune();
    if(['capture','inspector'].includes(a.type)&&!fs.existsSync(a.file))throw new Error('artifact_expired');
    let value = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    if (a.type === 'image') {
      const image = value.result;
      if (typeof image?.pngBase64 !== 'string') throw new Error('image_unavailable');
      return {image: image.pngBase64, metadata: safe(image)};
    }
    value = ['capture','inspector'].includes(a.type)?value:safe(value); // Deep content was scrubbed before persistence.
    if (pointer) for (const part of pointer.split('/').slice(1)) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || !Object.hasOwn(value, key)) throw new Error('pointer_not_found');
      value = value[key];
    }
    const data = ['capture','inspector'].includes(a.type)?value:safe(value), text = JSON.stringify(data);
    if (text.length > limit) return {artifactId, truncated: true, characters: text.length,
      next: 'Use a JSON pointer to select a smaller subtree. No partial JSON is returned.'};
    return {artifactId, data};
  }
  async deviceInspect({kind='screen',sessionId,debug}={}) {
    let s,temporary=false,expressionDispatched=false;
    try {
      if(!fs.existsSync(path.join(this.state,'providers/pymobiledevice3-11.15.5/bin/python')))return {ok:false,reason:'device_observer_not_installed',inputSent:false};
      if(sessionId)s=this.session(sessionId);
      else {const acquired=await this.begin({surface:'launch'});s=this.session(acquired.sessionId);temporary=true;}
      if(debug?.expression!==undefined){
        if(!sessionId||s.surface!=='web')return {ok:false,reason:'owned_browser_session_required_for_evaluation',inputSent:false};
        debug={...debug,ownedPage:s.page};
      }
      const configFile=path.join(this.state,'web-device.json');
      if(!fs.existsSync(configFile)||fs.statSync(configFile).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      const configured=JSON.parse(fs.readFileSync(configFile,'utf8')),device=configured.coreDeviceId;
      if(!/^[A-Fa-f0-9-]{36}$/.test(device))return {ok:false,reason:'configured_device_id_required',inputSent:false};
      let serial=configured.hardwareUDID;
      if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(serial||'')){
        const detail=await this.deviceRun(['device','info','details','--device',device,'--timeout','8'],{timeout:11000});
        if(!detail.ok)return {ok:false,reason:'developer_channel_unconfirmed',inputSent:false};
        serial=detail.data?.result?.connectionProperties?.localHostnames?.map(x=>x.replace(/\.coredevice\.local$/,'')).find(x=>/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(x));
      }
      if(!serial)return {ok:false,reason:'configured_device_identity_unconfirmed',inputSent:false};
      this.session(s.id);
      const a=this.artifact(s,kind==='screen'?'image':'device-capabilities');
      expressionDispatched=debug?.expression!==undefined;
      const run=await this.run('provider',[],{kind,serial,state:this.state,leaseFile:s.lease,ownerFile:s.owner,output:a.file,...(debug?{debug}:{})},debug?35000:26000);
      if(!run.ok||run.value?.ok!==true||!fs.existsSync(a.file)){
        let learningEvidence;
        if(kind==='resource-profile'){
          const source=createHash('sha256').update(JSON.stringify([adapterHash,serial,null,'pymobiledevice3-11.15.5'])).digest('hex');
          const receipt={gate:'device-profile',status:'failed',observation:{observationCompleted:false,inputSent:false,deadlineExceeded:run.value?.reason==='device_observation_deadline',waitingForSamples:run.value?.phase==='resource_profile_sample',osVersionKnown:false}};
          learningEvidence=await this.learning('observe',{receipt,source}).catch(()=>({available:false}));
        }
        return {ok:false,reason:run.value?.reason||'device_observation_unavailable',phase:run.value?.phase,failureType:run.value?.failureType,...(learningEvidence?{learningEvidence}:{}),inputSent:debug?.expression!==undefined?'unknown':false,replay:false};
      }
      this.session(s.id);
      const value=JSON.parse(fs.readFileSync(a.file,'utf8')).result;
      if(debug){
        const row=value.pages?.[0]?.debug;
        if(!row)return {ok:false,reason:'active_dev_inspector_target_unavailable',artifactId:a.id,devTargets:value.devTargets,busyTargets:value.busyTargets,inputSent:false,replay:false};
        let saved;
        try{saved=this.captureStore.saveDiagnostic({status:'completed',result:value});}
        finally{fs.rmSync(a.file,{force:true});this.artifacts.delete(a.id);}
        this.artifacts.set(a.id,{file:saved.file,sessionId:s.id,type:'inspector'});
        const summary=Object.fromEntries(['operation','documentRef','browser','ready','scriptCount','eventCount','droppedEvents','retainedBytes','timelineStopped','domainsDisabled'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
        return {ok:true,artifactId:a.id,metadata:{...summary,detached:true,transport:value.transport,offLANQualified:false,retentionSeconds:saved.retentionSecondsRemaining},inputSent:debug.expression!==undefined,replay:false,next:'Read selected private result/pages/0/debug subtrees with ios_read. Content expires after one hour. Document references expire on navigation/reload; no trusted input or off-LAN Inspector claim.'};
      }
      let learningEvidence;
      if(kind==='resource-profile'){
        const processes=(value.samples||[]).flatMap(x=>x.processes||[]);
        const receipt={gate:'device-profile',status:value.sampleCount===3&&value.profilerStopped===true?'passed':'failed',observation:{sampleCount:value.sampleCount||0,profilerStopped:value.profilerStopped===true,memoryReadings:processes.filter(p=>Number.isFinite(p.physicalFootprintBytes)).length,cpuReadings:processes.filter(p=>Number.isFinite(p.cpuUsageRaw)).length,pageAttributed:false}};
        const source=createHash('sha256').update(JSON.stringify([adapterHash,serial,value.productVersion,value.provider])).digest('hex');
        learningEvidence=await this.learning('observe',{receipt,source}).catch(()=>({available:false}));
      }
      return {ok:true,artifactId:a.id,metadata:safe(value),...(learningEvidence?{learningEvidence}:{}),inputSent:false,next:kind==='screen'?'Use ios_read with this artifactId for the actual full-device PNG. Paired nearby developer transport; separate from arbitrary-network page control.':kind==='resource-profile'?'Three bounded process samples; CPU is provider raw units and WebContent is not page attribution. The profiler is closed; a temporary owner is released only when this call created it.':'Service availability is not proof of Web Inspector opt-in or native touch.'};
    } catch(error){
      if(!debug)throw error;
      const reason=['capture_storage_quota_reached','active_session_required_begin_again','device_already_leased','frontend_cleanup_in_progress'].includes(error.message)?error.message:'browser_debug_operation_unconfirmed';
      return {ok:false,reason,inputSent:expressionDispatched?'unknown':false,replay:false};
    } finally {if(temporary&&s)await this.end(s.id);}
  }
  async systemBegin({rollout}={}) {
    const acquired=await this.begin({surface:'launch',rollout}),s=this.session(acquired.sessionId);
    s.systemDriver=new SystemDriver({state:this.state,session:s,check:()=>this.session(s.id),authorize:async()=>{
      this.session(s.id);
      const status=await this.run('cli',['owner-check','--lease-file',s.lease],undefined,5000);
      if(!status.ok||typeof status.value?.owned!=='boolean')throw Error('system_ownership_unconfirmed');
      if(!status.value.owned)throw Error('owner_not_active');
      this.session(s.id);
    }});
    try{
      const result=await s.systemDriver.start();
      if(!result.ok){const cleanup=await this.end(s.id);return {...result,cleanup};}
      s.surface='system';s.systemFingerprint=createHash('sha256').update(JSON.stringify([adapterHash,s.systemDriver.deviceIdentity,s.systemDriver.runtime?.os,s.systemDriver.runtime?.build])).digest('hex');
      const receipt={gate:'system-ready',status:'passed',observation:{runnerReady:true,sharedOwner:true,nearbyStartupOnly:true}};
      const learningEvidence=await this.learning('observe',{receipt,source:s.systemFingerprint}).catch(()=>({available:false}));
      return {...result,sessionId:s.id,learningEvidence,next:'Use ios_system_inspect and fresh targets; ios_system_end in finally stops the runner and Apple overlay. Normal page/app work should use its own driver.'};
    }catch{const cleanup=await this.end(s.id);return {ok:false,reason:'system_start_unconfirmed_inspect_phone',replay:false,cleanup};}
  }
  async systemInspect({sessionId}) {
    const s=this.session(sessionId);if(!s.systemDriver)throw Error('session_required');
    const value=await s.systemDriver.inspect(),a=this.artifact(s,'system-tree');
    fs.writeFileSync(a.file,JSON.stringify(value),{flag:'wx',mode:0o600});
    const nodes=value.nodes.filter(n=>n.visible&&(n.name||n.label||n.value));
    return {...value,artifactId:a.id,nodes:nodes.slice(0,100),totalNodes:value.nodes.length,compact:true,next:'Fresh snapshot expires in five seconds. ios_read selects the private full tree. Never replay accepted or unknown input.'};
  }
  async systemAction(args) {
    const s=this.session(args.sessionId);if(!s.systemDriver)throw Error('session_required');
    if(args.action==='scroll'&&args.snapshot===undefined){
      const tree=await s.systemDriver.inspect();
      args={...args,snapshot:tree.snapshot};
    }
    const result=await s.systemDriver.action(args);if(args.action==='home')s.systemHomeConfirmed=result.homeConfirmed===true;return result;
  }
  async systemEnd({sessionId,home=true}) {
    const s=this.sessions.get(sessionId);if(!s?.systemDriver)throw Error('session_required');
    let presentation={homeNavigationPending:true};
    if(home){try{presentation=await s.systemDriver.action({action:'home'});s.systemHomeConfirmed=presentation.homeConfirmed===true;}
      catch{presentation={ok:false,homeConfirmed:false,reason:'home_navigation_unconfirmed',replay:false};s.systemHomeConfirmed=false;}}
    const ended=await this.end(sessionId);
    return {...ended,presentation,ok:ended.released===true&&ended.systemCleanup?.runnerStopped===true,next:ended.systemCleanup?.runnerStopped===true?'XCTest fallback is stopped. Begin a fresh native/browser lease for normal work.':'Runner cleanup is unconfirmed; inspect the phone and paired channel before starting another fallback.'};
  }
  async waitReady({surface='any',browser,page,timeoutSeconds=45}={},signal) {
    const controller=new AbortController();this.waitControllers.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted||this.closing)abort();
    try{const r=await this.run('wait',[],{surface,browser,page,timeoutSeconds},(timeoutSeconds+4)*1000,controller.signal);return r.value||{readyToAcquire:false,reason:controller.signal.aborted?'cancelled':'readiness_channel_unavailable',leaseAcquired:false};}
    finally{this.waitControllers.delete(controller);signal?.removeEventListener('abort',abort);}
  }
  async deviceLaunch({target='kickoff-dev'}={}) {
    const bundles={'kickoff-dev':'com.dev.kudos.fit',settings:'com.apple.Preferences',safari:'com.apple.mobilesafari',chrome:'com.google.chrome.ios'};
    if(!Object.hasOwn(bundles,target))return {ok:false,reason:'fixed_launch_target_required',inputSent:false};
    const reservation=await this.begin({surface:'launch'});
    try {
      const file=path.join(this.state,'web-device.json');
      if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      const device=JSON.parse(fs.readFileSync(file,'utf8')).coreDeviceId;
      if(!/^[A-Fa-f0-9-]{36}$/.test(device||''))return {ok:false,reason:'configured_device_id_required',inputSent:false};
      const preflight=await this.deviceRun(['device','info','lockState','--device',device,'--timeout','8'],{timeout:11000});
      if(!preflight.ok)return {ok:false,reason:'developer_channel_unconfirmed',inputSent:false,lockState:'unknown',replay:false};
      const state=preflight.data?.result?.lockState||preflight.data?.result?.deviceProperties?.lockState||preflight.data?.result;
      if(state?.passcodeRequired===true||state?.unlocked===false)return {ok:false,reason:'developer_unlock_required',inputSent:false,replay:false};
      this.session(reservation.sessionId);
      const launched=await this.deviceRun(['device','process','launch','--device',device,'--timeout','12',bundles[target]],{timeout:15000});
      return {ok:launched.ok,target,outcome:launched.outcome,diagnostic:launched.diagnostic,replay:false,
        foregroundVerified:false,transport:'paired-developer-channel',offLANQualified:false,
        next:target==='kickoff-dev'?'Wait for native readiness, then ios_begin. Request acceptance is not foreground readiness.':'Inspect the full phone screen independently. Settings navigation still requires a system input provider.'};
    } finally {await this.end(reservation.sessionId);}
  }
  async deviceLock() {
    const reservation=await this.begin({surface:'launch'});
    try {
      const file=path.join(this.state,'web-device.json');
      if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      const device=JSON.parse(fs.readFileSync(file,'utf8')).coreDeviceId;
      if(!/^[A-Fa-f0-9-]{36}$/.test(device||''))return {ok:false,reason:'configured_device_id_required',inputSent:false};
      const observe=async()=>{const r=await this.deviceRun(['device','info','lockState','--device',device,'--timeout','8'],{timeout:11000});const state=r.data?.result?.lockState||r.data?.result?.deviceProperties?.lockState||r.data?.result;return {ok:r.ok,required:state?.passcodeRequired};};
      const before=await observe();
      if(!before.ok||typeof before.required!=='boolean')return {ok:false,reason:'device_lock_state_unconfirmed',inputSent:false,lockState:'unknown'};
      if(before.required)return {ok:true,alreadyLocked:true,lockedVerified:true,inputSent:false};
      this.session(reservation.sessionId);
      const sent=await this.deviceRun(['device','process','launch','--device',device,'--timeout','12','--payload-url','shortcuts://run-shortcut?name=Runner%20Lock%20iPhone','com.apple.shortcuts'],{timeout:15000});
      // Observe after one dispatch; an unknown launch is never replayed.
      let after;
      for(let attempt=0;attempt<3;attempt++){
        after=await observe();if(after.ok&&after.required===true)break;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500));
      }
      const lockedVerified=after?.ok===true&&after.required===true;
      return {ok:lockedVerified,lockedVerified,inputSent:true,outcome:sent.outcome,replay:false,transport:'paired-developer-channel',offLANQualified:false,
        next:lockedVerified?'The phone is locked. Connect Mirroring if needed; a later physical unlock still requires the human.':'Inspect the phone independently. Shortcut dispatch is not proof of locking; do not replay an unknown outcome.'};
    } finally {await this.end(reservation.sessionId);}
  }
  async capture({sessionId,op='status',modes=['console','network'],seconds=120,maxBytes=2097152,ttlSeconds=3600}={}) {
    const s=this.session(sessionId);
    if(!['native','web'].includes(s.surface))return {ok:false,reason:'app_or_page_session_required'};
    let capture=this.captures.get(sessionId);
    if(op==='start') {
      if(capture?.active)return {ok:false,reason:'capture_already_active'};
      capture={id:hex(),active:true,modes:[...modes]};this.captureStore.create(capture.id,ttlSeconds);this.captures.set(sessionId,capture);
    } else if(!capture)return {ok:false,reason:'start_capture_first'};
    const request={op,id:capture.id,...(op==='start'?{modes,seconds,maxBytes}:{})};
    let response;
    if(s.surface==='web')response=await this.webAction({sessionId,action:'capture',args:request});
    else {
      request.requestId=hex();
      const sent=await this.action({sessionId,action:'capture',args:request});
      if(!sent.ok){if(sent.data?.error==='unsupported_action')capture.active=false;return {...sent,next:'Native capture requires the updated signed adapter. Do not replay an unknown input.'};}
      const until=Date.now()+6000;
      while(Date.now()<until){const read=await this.action({sessionId,action:'state'},false,true);const file=this.artifacts.get(read.artifactId)?.file;
        const receipt=file?JSON.parse(fs.readFileSync(file)).result?.richCapture:undefined;
        if(file){fs.rmSync(file,{force:true});this.artifacts.delete(read.artifactId);}
        if(receipt?.requestId===request.requestId){response=receipt;break;}
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      if(!response)return {ok:false,reason:'capture_acknowledgment_unknown',replay:false};
    }
    if(response.artifactId){const intermediate=this.artifacts.get(response.artifactId);if(intermediate){response.value=JSON.parse(fs.readFileSync(intermediate.file,'utf8')).result?.value;fs.rmSync(intermediate.file,{force:true});}this.artifacts.delete(response.artifactId);}
    if(!response.ok)return {ok:false,reason:response.error||response.reason||'capture_not_confirmed',outcome:response.outcome,replay:false};
    const value=response.value;
    if(op==='stop')capture.active=false;
    if(value?.events){
      const saved=this.captureStore.save(capture.id,value),artifactId=hex();this.artifacts.set(artifactId,{file:saved.file,type:'capture',sessionId});
      const audio=capture.modes?.includes('audio'),receipt={gate:audio?'capture-audio':'capture-data',status:(audio?saved.audioChunks>0:saved.eventCount>0)?'passed':'failed',observation:{eventCount:saved.eventCount,audioChunks:saved.audioChunks,remainingEvents:value.remainingEvents,captureStopped:op==='stop',metadataOnly:true}};
      const source=await this.learningSource(sessionId).catch(()=>'');
      const learningEvidence=source?await this.learning('observe',{receipt,source}).catch(()=>({available:false})):{available:false};
      return {ok:true,captureId:capture.id,artifactId,eventCount:saved.eventCount,audioChunks:saved.audioChunks,storedBytes:saved.bytes,remainingEvents:value.remainingEvents,
        retentionSecondsRemaining:saved.retentionSecondsRemaining,learningEvidence,replay:false,next:'Use ios_read with a JSON pointer for selected scrubbed events. Audio bytes stay in private chunk files.'};
    }
    return {ok:true,captureId:capture.id,status:value,replay:false};
  }
  async webPages() {
    const r = await this.run('web', [], {op: 'web_pages'}, 8000);
    return r.ok ? {...r.value, ok: true} : {ok: false, reason: r.error};
  }
  async webEnroll({path: route = '/dev/ios-agent', browser, rememberBrowser=false} = {}) {
    if (browser && (await this.status()).lease) return {ok:false,reason:'idle_device_required_for_browser_launch',actionSent:false};
    const runtime = JSON.parse(fs.readFileSync(path.join(this.state, 'dev-runtime.json'), 'utf8'));
    const origin = new URL(runtime.webURL).origin;
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('#') || route.includes('\\')) throw new Error('local_route_required');
    const r = await this.run('web', [], {op: 'web_enroll', origin, rememberBrowser}, 8000);
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
      const preflightFile = path.join(this.observationDirectory(), hex()+'.json');
      let preflight;
      try { preflight = await this.deviceRun(['device','info','lockState','--device',device,'--timeout','12'], {jsonFile:preflightFile,timeout:15000}); }
      finally { fs.rmSync(preflightFile,{force:true}); }
      if (!preflight.ok) return {ok:false,reason:preflight.data?.error?.code===1011?'developer_device_unavailable':'developer_channel_unconfirmed',launchFile:a.file,actionSent:false,
        next:'Use an already enrolled visible page over the network. Restore the developer channel only if browser provisioning is needed; do not infer a locked phone.'};
      const lockState=preflight.data?.result?.lockState || preflight.data?.result?.deviceProperties?.lockState || preflight.data?.result;
      if (lockState?.passcodeRequired===true) return {ok:false,reason:'device_developer_unlock_required',launchFile:a.file,actionSent:false};
      const sourceURL=JSON.parse(fs.readFileSync(a.file,'utf8')).url;
      const url=browser==='ios-safari'?sourceURL.replace(/^https:/,'x-safari-https:'):sourceURL;
      const reservation = await this.begin({surface:'launch'});
      try { const result = await this.deviceRun(['device','process','launch','--device',device,'--timeout','12','--payload-url',url,bundle]);
        launch={outcome:result.outcome,...(result.diagnostic?{diagnostic:result.diagnostic}:{}),replay:false};
      } finally { await this.end(reservation.sessionId); }
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
  async webVerify({sessionId, gate, expectedPath, expectedText, direction = 'both', sampleMs = 1000}) {
    const s = this.session(sessionId);
    if (s.surface !== 'web') throw new Error('web_session_required');
    if (gate === 'web-route' && !expectedPath && !expectedText) return {ok:false,reason:'explicit_web_postcondition_required'};
    if (gate === 'web-media') {
      if (!['sent','received','both'].includes(direction) || !Number.isInteger(sampleMs) || sampleMs < 500 || sampleMs > 3000) return {ok:false,reason:'bounded_media_sample_required'};
      const full = read => { const file=this.artifacts.get(read.artifactId)?.file; return file ? JSON.parse(fs.readFileSync(file,'utf8'))?.result?.value : read.value; };
      const first = await this.webAction({sessionId,action:'state'}), before = full(first);
      await new Promise(resolve => setTimeout(resolve,sampleMs));
      const second = await this.webAction({sessionId,action:'state'}), after = full(second);
      const observation = {readsCompleted:first.ok === true && second.ok === true,...mediaObservation(before,after,direction,s.webRuntime)};
      const ok = Object.values(observation).every(v => v === true);
      const receipt = {gate,status:ok?'passed':'failed',scope:'instrumented-audio-RTP-counters-only',observation};
      const learningEvidence=await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false}));
      return {ok,receipt,artifactId:second.artifactId,beforeArtifactId:first.artifactId,sampleMs,learningEvidence,
        limits:'Stable document-local stream counters; at least one stream advances in each requested direction, none reset. This does not prove audible content, call-room identity, remote playout, microphone permission or physical network route.'};
    }
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
    s.endPromise = (async () => {
      let captureCleanup,systemCleanup;
      if(s.systemDriver)systemCleanup=await s.systemDriver.stop();
      if(this.captures.get(id)?.active&&s.active&&!this.closing){
        try {const started=Date.now();captureCleanup=await this.capture({sessionId:id,op:'stop'});const artifacts=captureCleanup.artifactId?[captureCleanup.artifactId]:[];while(captureCleanup.ok&&captureCleanup.remainingEvents>0&&Date.now()-started<10000){captureCleanup=await this.capture({sessionId:id,op:'drain'});if(captureCleanup.artifactId)artifacts.push(captureCleanup.artifactId);}captureCleanup={...captureCleanup,artifactIds:artifacts,complete:captureCleanup.ok&&captureCleanup.remainingEvents===0};}catch{captureCleanup={complete:false,reason:'capture_cleanup_unconfirmed'};} // Watchdog handles lost ownership.
      }
      s.active = false; this.writeOwner(s);
      // Acquisition reserves an empty file before broker admission. Wait for
      // that single result before release, or a disconnect could orphan a lease.
      if (s.acquisition) await s.acquisition.catch(() => {});
      let release = {ok: true, value: {alreadyInactive: true}};
      if (fs.existsSync(s.lease)) release = await this.run('cli', ['release', '--lease-file', s.lease], undefined, 20000);
      if(systemCleanup&&s.systemFingerprint){
        const receipt={gate:'system-idle',status:systemCleanup.runnerStopped===true&&release.ok?'passed':'failed',observation:{runnerStopped:systemCleanup.runnerStopped===true,ownerReleased:release.ok,...(typeof s.systemHomeConfirmed==='boolean'?{homeConfirmed:s.systemHomeConfirmed}:{})}};
        systemCleanup.learningEvidence=await this.learning('observe',{receipt,source:s.systemFingerprint}).catch(()=>({available:false}));
      }
      this.sessions.delete(id);
      this.captures.delete(id);
      return {released: release.ok,...(systemCleanup?{systemCleanup,ok:systemCleanup.ok}:{}),...(captureCleanup?{captureCleanup}:{}), detail: release.ok ? safe(release.value) : release.error,
        next: 'Call ios_verify gate=idle without a session to confirm native and host cleanup.'};
    })();
    return s.endPromise;
  }
  async cancel() {
    for(const controller of this.waitControllers)controller.abort();
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
