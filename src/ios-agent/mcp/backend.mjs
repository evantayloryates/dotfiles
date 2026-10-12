import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nutritionRecipe} from './workflows.mjs';
import {audioProbePlan, probeExpression, validProbeSelection} from './audio-probe.mjs';
import {mediaObservation,mediaFailureReason} from './media-verification.mjs';
import {callObservation} from './call-verification.mjs';
import {webProfileOrigin} from './web-profiles.mjs';
import {CaptureStore} from './capture-store.mjs';
import {SystemDriver,endpointState,tailnetHost} from './system-driver.mjs';
import {focusLaunch,focusLaunchEnabled} from './focus-launch.mjs';
import {nativeDelivery} from './native-delivery.mjs';
import {planNativeTap} from './native-selector.mjs';
import {codexOwnerContext} from './owner-context.mjs';
import {claudeTurnOwner,sameClaudeTurn} from './claude-lifecycle.mjs';
import {waitNativeElement} from './native-condition.mjs';
import {openManagedWeb,pageIdleConfirmed} from './web-open.mjs';
import {qualifiedChromeDelivery,qualifiedChromeInstalled} from './chrome-handoff.mjs';
import {emitSignal,signalContextEnvironment} from './signal-log.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterHash = createHash('sha256').update(['mcp/signal-log.mjs', 'signals.py', 'mcp/backend.mjs', 'mcp/server.mjs', 'mcp/input-schemas.mjs', 'mcp/native-selector.mjs', 'mcp/owner-context.mjs', 'mcp/claude-lifecycle.mjs', 'claude-begin-hook.mjs', 'mcp/native-condition.mjs', 'mcp/system-driver.mjs', 'mcp/focus-launch.mjs', 'mcp/system-reservation.mjs', 'system_runner.py', 'system_reservation.py', 'mcp/capture-store.mjs', 'web/rich-capture.js', 'ready_wait.py', 'mcp/media-verification.mjs', 'mcp/call-verification.mjs', 'mcp/web-profiles.mjs', 'mcp/workflows.mjs', 'fixture_jobs.py', 'build_jobs.py', 'build_app.py', 'native_delivery.py', 'mcp/native-delivery.mjs', 'tests/run_fixture.py', 'paired_workflow.py', 'health.py', 'connectivity.py', 'local_stack.py', 'worker-launcher.mjs', 'device_observer.py', 'device_foreground.py','device_ax_native.py', 'paired_transport.py','relay_session.py','relay_worker.py','mcp/relay-channel.mjs','mcp/reflection-process.mjs','mcp/web-open.mjs','mcp/chrome-handoff.mjs','probes/packet_reflector.py','device_accessibility.py', 'browser_inspector.py', 'browser_dom.js', 'browser_heap.py','browser_breakpoint.py','browser_worker.py', 'process_inventory.mjs', 'cli.py', 'learning.py', 'mcp/package-lock.json', 'web/sdk.js', 'web/bridge.py', 'web_cli.py']
  .map(file => fs.readFileSync(path.join(root, file))).map(bytes => createHash('sha256').update(bytes).digest('hex')).join(':')).digest('hex');
export const defaultState = path.join(os.homedir(), 'Library/Application Support/ios-agent');
const idleLimit = 20 * 60 * 1000;
const hex = () => randomBytes(16).toString('hex');
const note=(event,fields)=>{try{emitSignal('mcp',event,fields);}catch{}};
const childSignalEnv=()=>{try{return signalContextEnvironment();}catch{return {};}};
const reasonCode=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(value)?value:undefined;
function dispatchLabel(kind,args,input){
  if(kind==='cli'&&['acquire','release'].includes(args?.[0]))return `lease.${args[0]}`;
  if(kind==='cli'&&args?.[0]==='action'&&['home','browser-handoff','tap','gesture','text','wifi','reload'].includes(args?.[1]))return 'native.input';
  if(kind==='web'&&input?.op==='web_action'&&!['state','snapshot','element'].includes(input.action))return 'browser.input';
  if(kind==='provider'&&['fixed-launch','browser-launch','shortcut-home','shortcut-wifi-on','ax-native-tab'].includes(input?.kind))return 'provider.input';
  if(kind==='reservation'&&['start','stop'].includes(input?.op))return 'reservation.input';
  return null;
}
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
    const child = spawn('/usr/bin/xcrun', ['devicectl', ...args.slice(0,3), '--json-output', jsonFile, ...args.slice(3)], {stdio:['ignore','ignore','pipe'],env:{...process.env,...childSignalEnv()}});
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
  constructor({state = defaultState, run, deviceRun = runCoreDevice, ownerContext,focusRunShortcut} = {}) {
    this.state = path.resolve(state);
    this.runOverride = run;
    this.deviceRun = deviceRun;
    this.focusRunShortcut=focusRunShortcut;
    this.ownerContext = ownerContext || (run ? () => ({mode:'mcp-connection',reason:'isolated-adapter'}) : codexOwnerContext);
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
    const operation=dispatchLabel(kind,args,input),started=performance.now();
    try{
      const result=await this.runUnlogged(kind,args,input,timeout,signal);
      if(operation)note('dispatch.completed',{op:operation,outcome:result.ok?'completed':result.error==='cli_deadline_outcome_unknown_do_not_replay'?'unknown':'failed',reason:result.ok?undefined:reasonCode(result.error),durationMs:Math.round(performance.now()-started),level:result.ok?'info':'warn'});
      return result;
    }catch(error){
      if(operation)note('dispatch.failed',{op:operation,outcome:'unknown',reason:reasonCode(error?.message)||'dispatch_exception',durationMs:Math.round(performance.now()-started),level:'error'});
      throw error;
    }
  }
  async runUnlogged(kind, args, input, timeout = 120000, signal) {
    if (this.runOverride) return this.runOverride(kind, args, input);
    const files = {wait:'ready_wait.py', web: 'web_cli.py', cli: 'cli.py', verify: 'verify.py', doctor: 'health.py', stack: 'local_stack.py', paired: 'paired_workflow.py', learning: 'learning.py', provider:'device_observer.py', fixture:'fixture_jobs.py', build:'build_jobs.py', delivery:'native_delivery.py',reservation:'system_reservation.py'};
    if (!files[kind]) throw new Error('fixed_operation_required');
    const argv = kind === 'learning' ? [path.join(this.state, 'learning')] :
      ['provider','reservation'].includes(kind) ? [] : ['web','wait','fixture'].includes(kind) ? ['--state', this.state] : kind === 'paired' ? [] : kind === 'cli' ? ['--state', this.state, ...args] : [...args, '--state', this.state];
    return new Promise((resolve, reject) => {
      const child = spawn(kind==='provider'?path.join(this.state,'providers/pymobiledevice3-11.15.5/bin/python'):'/usr/bin/python3', ['-B', path.join(root, files[kind]), ...argv],
        {stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, PYTHONDONTWRITEBYTECODE: '1',...childSignalEnv()}});
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
    let bluetoothResourceWatch;
    try {
      const watch = JSON.parse(fs.readFileSync(path.join(root,'../../data/agent_resource_monitor/btle/status.json'),'utf8'));
      const ageSeconds = (Date.now()-Date.parse(watch.timestamp))/1000;
      bluetoothResourceWatch = {timestamp:watch.timestamp,ageSeconds,fresh:ageSeconds>=0&&ageSeconds<15,highCPU:watch.high_cpu,targets:watch.targets,
        advice:'Before device discovery/paired transport work, check btle-watch preflight. If high or stale, inspect the incident; reuse an owned existing connection and batch observations instead of redundant discovery/reconnect loops. Do not restart system Bluetooth or interrupt another owner. Correlation does not establish that ios-agent caused the load.'};
    } catch { bluetoothResourceWatch = {fresh:false,advice:'BTLE watcher unavailable; run /Users/taylor/dotfiles/bin/btle-watch preflight before device discovery.'}; }
    return {workerRelease:current?.serviceRelease||null,bluetoothResourceWatch,browserWorkflow: ['ios_doctor (host prerequisites)', 'ios_web_pages (reuse a visible ready enrolled page)', 'ios_web_enroll only if provisioning is needed (private launchFile)', 'open the intended dev browser page if not enrolled', 'ios_web_pages', 'ios_web_begin', 'ios_web_inspect and ios_web_action', 'ios_web_end in finally'],
      readiness: 'ios_wait_ready waits up to 55 seconds without a lease, waking on fresh foreground app/page events. Use bounded waits while expecting a specific foreground transition; do not repeat unchanged waits to recover a missing native bridge. For browser launch auto selects direct pairing when the native bridge is absent. Do not infer lock from offline. ios_begin still verifies the runtime. MCP availability does not itself schedule a new model turn.',
      browserProfiles: 'ios_web_enroll profile=app uses private10446→3000/4000; profile=call-rig uses private10520→3020/4020 with the dedicated real-provider local fixture. Grants and browser memory are origin-bound. Preserve both Serve routes; call-rig enrollment does not install a route or prove credentials/recording state. Read ios-agent://mobile-web.',
      browserConditions: 'ios_web_verify timeoutSeconds=0..30 waits for a specific owned page condition without repeated model turns. web-element uses a unique semantic selector, optional exact expectedValue, and visible/interactable/editable state; passing returns fresh snapshot/target refs. Stops on failed observation or lost ownership; no input is retried. Read ios-agent://mobile-web for examples. web-call additionally waits for explicit lobby/connected/paired/released call state and reports fixed permission/request diagnostics; it never grants permissions or joins. Media RTP remains a single explicit sample.',
      launch: 'ios_device_launch has fixed DEV/Settings/Safari/Chrome targets. Explicit private developer-tailnet configuration uses paired rootless RSD/DVT over Tailscale, without USB fallback or XCTest. Physical DEV/Safari/Chrome foreground and Inspector/profile reads passed through the overlay. Without that configuration use nearby CoreDevice. A bounded Apple AX app-state stream can independently report foregroundVerified with target/state/observation age. DEV/Settings/Safari/Chrome events matched independent foreground readback. Off-LAN physical qualification remains pending; neither launch acceptance nor foreground state is native/React/page readiness. Remote lock state may be unknown; never infer locked or unplugged.',
      nativeAXCandidate: 'Disabled by default. IOS_AGENT_EXPERIMENTAL_AX=1 exposes only ios_ax_native_tab for qualification. Corrected Workouts, settled Invite and packaged Workouts activations passed while the original XCTest runner was active. An earlier immediately cleaned Home request had no effect; all-tab qualification remains open. Standalone XCTest-free and off-LAN gates remain open. No routine workflow depends on it; do not enable as an approval-free system driver. Read NATIVE-AX-CANDIDATE.md.',
      home: 'End app/page ownership first. ios_device_home normally dispatches the installed Runner Home shortcut through configured paired Tailscale; paired dispatch and independent physical Home readback passed. transport=app instead foregrounds DEV if needed and prepares its native Home handoff, releasing its lease in finally. Auto selects that lane before input when configured developer TCP is unavailable. The app lane passed independent physical Home readback on11October with signed delivery4034fdeaee2849b0b1461bc56d9f532d; cellular Home remains separate. Runtime acceptance is homeVerified=false until display inspection. Never replay accepted or unknown dispatch; never start XCTest solely for Home cleanup.',
      lock: 'ios_device_lock runs only Runner Lock iPhone through the paired developer channel, then independently reads passcodeRequired. The one-action Apple shortcut is installed and physically verified. Already locked is a no-input success. It cannot unlock the phone, does not store a passcode, and is not an arbitrary-network system-control lane.',
      richCapture: 'ios_capture is explicit synthetic-DEV capture only: start selected console/network/audio modes, drain bounded batches, stop, then end in finally. Default 2 MiB ring, max 8 MiB, max 10 minutes; host 32 MiB/capture and 128 MiB total. Artifacts expire after one hour by default (max 24 hours) and private audio chunks stay off the transcript. Clone existing audio tracks only; no microphone request. Updated browser capture reports coverage.audioSources: stable trackRef, allowlisted get-user-media/rtc-sender/rtc-receiver/dom-media origins and recorder-start outcome; empty origins are unknown. At most32source attempts per capture; read audioSourceLimitReached. These labels describe observed API objects, not audible content. Inspect remainingEvents and dropped counts; this is not lossless whole-device traffic capture.',
      browserDebugger: 'Read ios-agent://browser-debug. Physical Safari/Chrome source/CSS/console, bounded timeline and Network reads passed nearby. Use a fresh documentRef; rejected pre-input identity guards report inputSent=false. ios_browser_debug exposes source catalogs/windows, matched CSS, bounded rendered controls with overflow clipping/hit tests, console, Network details and short WebKit timeline/JavaScript samples. dom can reuse the existing system session owner without sending page input; it does not stop XCTest. Content stays in private artifacts; read selected pointers. Evaluation requires an active matching browser page lease/glow and fresh documentRef. Dedicated worker catalogs initialize every reported worker before detach. worker-sources/worker-source/worker-console/worker-profile inspect one current dedicated worker’s source, console or bounded JavaScript samples through its own protocol channel; require fresh documentRef and workerId. No caller worker evaluation or network attribution. Explicit heap requires an active web/system session and fresh frame/loader document reference; it performs synchronous full GC and retains a private graph with shallow-size summaries. Use ios_read offset/count for large arrays. One-shot breakpoint uses an owned web/system session, exact document/script/source hash and zero-based line. Captures stack and bounded top-frame own descriptors, removes and confirms resume; never leaves an interactive pause. Configured tailnet Inspector reads are supported and physically passed over the overlay; a separate off-LAN acceptance is still required.',
      accessibilityAudit: 'ios_accessibility_audit runs bounded Apple contrast/hit-region/text-clipped checks on foreground Kickoff DEV or the configured Safari/Chrome DEV origin. Requires the shared owner, checks foreground before/after and preserves the browser document reference. Private256issue/1MiB report expires after one hour. No Dynamic Text settings changes, simulated activation or compliance claim. A deliberately tiny Safari fixture button produced a matching12×13tap-region finding; browser chrome can also appear. Contrast positive control remains unqualified.',
      deviceObserver: 'ios_device_inspect kind=screen|capabilities|browser-debug|resource-profile reads the paired iPhone without XCTest or Mirroring. With no session it reserves/releases a temporary owner. ios_read renders a private full-display image. Default nearby paired developer transport, or explicit configured tailnet userspace transport. Explicit transport=usb-recovery admits only screen/capabilities with positive fixed USB enumeration; actual MCP screen passed, no silent fallback. Inspector and profiling passed through that overlay; physical off-LAN qualification remains separate. HID input not qualified.',
      managedBrowser: 'ios_web_open selects the qualified app-owned cellular browser lane before dispatch when developer TCP is unavailable; nearby it selects direct pairing when the native bridge is absent, or the reflected secondary channel when that bridge is ready. Explicit transport is chosen before dispatch; Inspector connects separately for direct pairing. Fresh page and ownership are required. ios_web_end confirms glow-off then requests Home through the app lane; nearby it also closes the channel. Lost ownership sends no cleanup input. No silent Wi-Fi changes, USB fallback, XCTest or Mirroring.',
      browserLimits: 'Page-owned DOM input is synthetic and cannot press OS dialogs, trusted touch, IME or microphone permission. Safari and Chrome app-owned cellular launch, owned DOM fill/Save/React readback and glow cleanup passed without USB, Mirroring or XCTest. Chrome requires the provisioned phone-local Shortcut and the qualified signed BrowserHandoff adapter. Deep cellular Inspector remains a separate open transport gate. DEV-only enrollment and per-tab authentication.',
      workflow: ['ios_doctor', 'ios_begin', 'ios_native or ios_react', 'ios_verify', 'ios_end'],
      hostWorkflow: ['ios_doctor (read only)', 'ios_stack_ensure only when needed and idle; never replay an uncertain start'],
      recoveryDecision: 'Use ios_doctor connectivity=true before requesting cable/unlock actions: it separates fixed-device USB inventory, tailnet ping, the fixed developer TCP endpoint and bridge readiness, with unknown lock state. A refused developer endpoint can coexist with a healthy app/page; TCP acceptance is not authenticated developer readiness. Read the recovery decision card in ios-agent://mobile-web. Diagnose host first; if ready but the bridge is offline, wait without a lease and inspect an available paired launch route. Reuse authenticated tabs after reconnect; renew only an actually expired unused grant. Never infer lock/unplugged from offline or replay accepted/unknown input. Preserve unconfirmed cleanup and another active owner. Ask only for the evidenced human action.',
      inputRecipes: 'Read ios-agent://native-input for typed native/React examples, focused text editing, bounded profiling, Wi-Fi handoff and verification. Native target IDs and React component IDs are different. Invalid argument combinations are refused before phone dispatch.',
      nativeBuild: 'Read ios-agent://native-build. ios_build plan/start/retry/status exposes durable signed generic-device DEV builds. Recover jobId after disconnect; build success is not installed readiness. ios_install plan/start/status validates a signed deliveryId, installs on the fixed paired phone and independently checks the running identity. Use a 180-second client request timeout; recover installId rather than replaying after interruption. React readiness and native Home cleanup are separate.',
      inputMatrix: 'ios_input_matrix plan/start/status exposes the compiled UIKit fixture as a durable serialized simulator job. Require completed, passed and cleanupVerified; no physical-iPhone, React Native, browser or off-LAN proof. Jobs survive MCP reconnect for cleanup; never restart an uncertain job.',
      nativeConditions: 'ios_verify gate=native-element waits 1..30 seconds for one exact label/identifier/class match, visible or interactable. Returns fresh native references; no input. Route/ready gates already wait. Stop on read/owner failure or ambiguity; no whole-phone occlusion or committed value claim.',
      pairedWorkflow: 'ios_workflow action=plan exposes the versioned coach-client recipe; capture/assert/restore-check independently read only the verified synthetic local row. UI rendering is a separate gate.',
      lease: 'One session per work turn. Always ios_end in finally before ending a turn. Codex should pass its actual threadId on begin; the service discovers only that exact rollout. Inherited CODEX_THREAD_ID is a fallback when present. Check lifecycle.threadId or supply the actual rollout explicitly. Missing/ambiguous metadata uses explicitly reported mcp-connection ownership. Other clients use a private connection heartbeat and must end in finally; persistent MCP alone has no universal turn-end signal.',
      claudeCleanup: 'ios_harness_end retires only this connection sessions tagged at begin with an exact Claude session/prompt/agent tuple. Main-agent hooks inject the owner for ios_begin, ios_web_begin, ios_web_open and ios_system_begin without permission overrides; older prompt and other-agent events send no cleanup. Actual CLI main-agent dispatch passed with a loopback fake API and production MCP/backend; physical Safari acquisition, exact-owner Stop release and glow-off readback also passed. install_claude_hooks.py merges qualified main-only hooks for new Claude Code sessions, preserving existing settings. Child begin events are skipped; subagent hook delivery remains unqualified and requires explicit end. Stop does not cover user interrupts; disconnect/idle safeguards still apply. Read ios-agent://mcp.',
      requirements: 'Native: Kickoff DEV foreground/unlocked. Browser: enrolled dev document visible on unlocked iPhone. Both require Tailscale and awake laptop services; routine control needs no USB. Developer-channel failure does not prove physical disconnection or lock.',
      audioProbes: 'ios_audio_probe plan/select/run/read/stop wraps the synthetic three-transport lab. Read ios-agent://audio-probe before joining; recording and exact provider fixture must be independently verified. Readback and call cleanup stay separate.',
      browserDomains: {layout:'ios_web_inspect kind=element reports fresh target computed CSS, center hit, bounded ancestors and viewport; use snapshot and target refs.',media:'Content-free request outcomes, track liveness, WebRTC audio and WebSocket counters. Check media.hooks coverage before interpreting zero counts; late microphone APIs are wrapped without replacing later libraries.',performance:'Bounded navigation/paint/resource/main-thread timings, optional Event Timing/LCP observers and readonly AudioSession type/state. Inspect domains.performance; a second state read obtains buffered asynchronous values. Optional observers stop with ownership. Event entry durations are not INP; latest LCP is a candidate. Unsupported readings stay null.',meet:'Fixed local call-lobby projection; no identities, credentials or transcripts.',limitations:'State readback is not a trusted touch, OS permission tap, whole-phone screenshot or off-LAN verification.'},
      browserMediaVerification: 'ios_web_verify gate=web-media direction=sent|received|both sampleMs=500..3000 requires stable advancing audio RTP counters. It returns shared structural learning evidence; a passed counter gate does not prove audible content or a completed call.',
      networkRecovery: 'After an intentional cellular/Wi-Fi-Off test, restore Wi-Fi before diagnosing nearby control as unavailable. Read the current developer transport; failure does not prove an unplugged cable. ios_device_wifi_on runs the fixed Runner Wi-Fi On recovery shortcut outside DEV through pairing; it does not need the native bridge. Dispatch alone is not switch/association proof. Finish with Home. An off-LAN browser page alone cannot yet press system Allow or restore Wi-Fi.',
      microphoneWorkflow: 'Safari: use bounded native page controls to save Microphone=Allow for the exact DEV host, then verify getUserMedia through the normal page driver. Chrome: first inspect Settings > Privacy & Security > Microphone; a disabled Chrome app switch can cause NotAllowedError without a site prompt. Named SwiftUI switches resolve their unique nested native toggle; inspect value afterward. Use exact observed Allow labels only after identifying the expected DEV media prompt. ios_system_inspect also returns native alert text/buttons even if the hierarchy is empty; alert-button rechecks its fresh snapshot and exact label. Authentication prompts remain human-only. A permission projection can remain prompt after live track acquisition; inspect pending requests and actual tracks before requesting another approval. Use web-call lobby/paired/released for call conditions, separately from RTP. Never use Mirroring as runtime permission control, assume tap success equals permission, enter a passcode, or replay an unknown request.',
      focusLaunch: 'Provisioned iCloud Focus + Run Immediately phone automation opened Kickoff DEV while unlocked on cellular without USB, Mirroring or XCTest. ios_device_launch transport=auto selects it before dispatch if fixed developer TCP is unavailable; transport=focus explicitly selects it. Existing personal Focus is preserved. One pulse, bounded cleanup, no retry on unknown outcome. A subsequent recovery pulse completed without a fresh native bridge, so always require foreground/readiness evidence. Safari app-owned private-URL handoff passed cellular DOM work. Chrome app-owned cellular handoff is separately qualified; deep cellular Inspector remains unconfirmed; no accepted input is replayed.',
      systemFallback: 'Explicit ios_system_begin/inspect/action/end uses the existing signed WDA runner for native Safari/Chrome/Settings/Shortcuts/Kickoff and Home. Exact-label type/clear handles ordinary native fields (256 characters maximum); type appends and clear is explicit. Inspect the effect. In browser address bars type the URL, read it back, then tap the observed Go button separately. Secure fields/passcodes are excluded. Fixed activate/Home may leave another app without inspecting it. Xcode automatic privileged diagnostics are disabled; ordinary sessions need no sudo. For an intermediate browser permission handoff use ios_web_end home=false, ios_system_begin/inspect/action, then ios_system_end home=false and ios_web_begin on the SAME ready enrolled page. Do not call ios_web_open merely to resume it; that reload can ask permission again. End the normal app/page lease first; end the fallback in finally, normally return Home, and verify runnerStopped. Startup uses paired nearby developer transport; WDA HTTP uses Tailscale but off-LAN start is unqualified. Apple may request human authorization; no passcode is entered. EOF/dead owner independently stops the runner. Do not use this for routine DOM/app work.',
      systemReadiness: 'A live host owner or xcodebuild is not proof of phone automation. system_runner_exited means this owned test process ended; xctest_authorization_failed means Xcode explicitly reported UI-testing authentication failure, not necessarily a locked screen or a specific passcode. physical_unlock_required requires an exact Xcode/device observation. Transport-only errors do not infer lock. xctest_authorization_timed_out means Xcode explicitly timed out enabling automation. Begin may return ready=false with a starting session, capped at five minutes; Apple may end it sooner. Prefer ios_system_begin timeoutSeconds=25 for cold startup, then ios_system_inspect kind=permission timeoutSeconds=30 on the same session. Alert absence falls back once to the native tree. Use ios_device_inspect with that sessionId if the bounded wait remains pending; ask only for an observed human gate. Native status readiness timing is logged separately from session creation. Pending is not authorized or ready; end/EOF/expiry stop it. Do not replay input or repeatedly restart to chase authorization. Long retention can lose the phone runner independently and is not an authentication exemption.',
      cleanup: 'When finished or pausing phone work: stop capture, release control, confirm glow/inspection cleanup, then return the phone to its Home Screen using an available verified system-control route. Taylor prefers Home over restoring the previous app; do not leave Kickoff DEV foreground without a continuing task. Do not send Home during an intermediate session handoff or while another agent owns the device. For an owned updated native app, send ios_native action=home before ios_end; this retires the lease and asks the DEV app to return Home without XCTest. Use ios_begin nativeOnly=true when JS startup fails. Browser Home still needs an available system route; normal end never starts XCTest just for cleanup. Report homeNavigationPending if no verified route is reachable. Never substitute force-quit, lock, XCTest startup or an unverified shortcut. Explicit end, cancellation, disconnect and 20-minute tool silence retire control; the native watchdog protects host loss.',
      input: 'Exact observed selectors can read and tap within one call: ios_native action=tap args={selector:{identifier:...}} (or exact label/class); requires a unique visible interactive match and preserves native hit tests. Otherwise get a fresh tree; use its snapshot, target and observed coordinates within five seconds. Verify committed route/value after input. Never automatically replay an accepted or unknown action.',
      updates: 'JS edits use remote Metro; verify ready and route after refresh. Forms/navigation can reset. Native edits require build/install.',
      visibility: 'Normal main-window data excludes system overlays. Explicit system fallback includes native browser/system hierarchy. UIKeyInput is semantic editing. No arbitrary system UI, IME or multi-touch guarantee.',
      sharedDiagnosticEvidence: 'ios_learning_evidence includes device-profile, system-ready, system-idle, capture-data and capture-audio receipts. Pass an active browser/system sessionId for runtime matching. Historical review uses matchingRuntime=false and must inspect fingerprints/date; profile jobs use a separate device/OS/provider fingerprint. Counts and booleans are evidence only; no automatic lesson promotion.',
      sharedLearning: learning};
  }
  async doctor({connectivity=false}={}) {
    const r = await this.run('doctor', connectivity?['--connectivity']:[], undefined, 55000);
    if (!r.value || typeof r.value.hostPrerequisitesReady !== 'boolean') return {ok: false, reason: 'host_diagnosis_unavailable'};
    const value = safe(r.value);
    return {...value, ok: r.ok && value.hostPrerequisitesReady, failedChecks: Object.entries(value.checks || {}).filter(([,v]) => v !== true).map(([k]) => k),
      next: 'Host checks do not establish phone readiness. Use connectivity=true for actual fixed-phone USB detection, one tailnet ping, fixed developer TCP endpoint status and lease-free bridge readiness. Inspect evidence before requesting phone setup.'};
  }
  async stackEnsure({timeout = 60} = {}) {
    if (this.closing || [...this.sessions.values()].some(s => s.active)) return {ok: false, reason: 'idle_host_required_for_stack_recovery', actionSent: false};
    const r = await this.run('stack', ['--timeout', String(timeout)], undefined, 145000);
    if (!r.value) return {ok: false, reason: r.error, outcome: 'inspect_current_state_before_retry', replay: false};
    return {...safe(r.value), ok: r.ok && r.value.backendReady === true, replay: false,
      next: 'Run ios_doctor after any uncertain result. This tool never stops existing workers, resets data, or promises phone readiness.'};
  }
  async installJob(args = {}) { return nativeDelivery(this,args); }
  async buildJob(args = {}) {
    const r=await this.run('build',[],args,25000);
    return r.value?safe(r.value):{ok:false,reason:r.error,replay:false,next:'Recover ios_build status before any new start.'};
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
  async begin({rollout, threadId, claudeOwner, surface = 'native', page, nativeOnly = false} = {}) {
    if (this.closing || [...this.sessions.values()].some(s => s.active)) {note('lease.refused',{surface,outcome:'refused',reason:'end_existing_session_first',level:'warn'});throw new Error('end_existing_session_first');}
    if (rollout&&threadId) {note('lease.refused',{surface,outcome:'refused',reason:'one_codex_owner_reference_required',level:'warn'});throw new Error('one_codex_owner_reference_required');}
    if(claudeOwner!==undefined&&(rollout!==undefined||threadId!==undefined)){note('lease.refused',{surface,outcome:'refused',reason:'one_harness_owner_reference_required',level:'warn'});throw Error('one_harness_owner_reference_required');}
    const claude=claudeOwner===undefined?undefined:claudeTurnOwner(claudeOwner);
    const lifecycle=claude?{mode:'claude-prompt',source:'explicit-hook',...claude}:rollout?{mode:'codex-turn',source:'explicit-rollout'}:this.ownerContext({threadId});
    if (threadId&&!lifecycle.rollout) {note('lease.refused',{surface,outcome:'refused',reason:reasonCode(lifecycle.reason)||'codex_rollout_unavailable',level:'warn'});throw new Error(lifecycle.reason||'codex_rollout_unavailable');}
    rollout ||= lifecycle.rollout;
    const signalOwnerId=lifecycle.threadId||claude?.sessionId;
    note('owner.selected',{surface,ownerId:signalOwnerId,kind:lifecycle.mode,ownerMode:lifecycle.mode,reason:reasonCode(lifecycle.reason),level:lifecycle.reason&&lifecycle.reason!=='no_inherited_codex_thread'?'warn':'info'});
    const ownership={mode:lifecycle.mode,...(lifecycle.source?{source:lifecycle.source}:{}),...(lifecycle.threadId?{threadId:lifecycle.threadId}:{}),...(lifecycle.reason?{reason:lifecycle.reason}:{}),...(claude?{claudeOwner:claude}:{})};
    const base = path.join(this.state, 'mcp-sessions');
    fs.mkdirSync(base, {recursive: true, mode: 0o700});
    if (fs.lstatSync(base).isSymbolicLink() || fs.statSync(base).mode & 0o077) throw new Error('private_session_directory_required');
    const id = hex(); const dir = path.join(base, id); fs.mkdirSync(dir, {mode: 0o700});
    const s = {id, dir, turn: hex(), owner: path.join(dir, 'owner.json'),
      lease: path.join(dir, 'lease.json'), activity: Date.now(), active: true, busy: false, surface, page,claudeOwner:claude};
    this.sessions.set(id, s); this.writeOwner(s);
    s.acquisition = this.run('cli', ['acquire', ...(surface !== 'native' ? ['--surface', surface, ...(surface === 'web' ? ['--page', page] : [])] : []), ...(rollout ? ['--rollout', rollout, '--connection-owner', s.owner] : ['--owner-file', s.owner]), '--lease-file', s.lease]);
    const r = await s.acquisition;
    if (!r.ok || this.closing) {note('lease.refused',{surface,session:id,outcome:'refused',reason:reasonCode(r.error)||'session_closed',level:'warn'});await this.end(id); throw new Error(r.error || 'session_closed'); }
    note('lease.acquired',{surface,session:id,ownerId:signalOwnerId,kind:lifecycle.mode,ownerMode:lifecycle.mode,page:surface==='web'?page:undefined,outcome:'acquired'});
    try {
      if (surface === 'launch') return {sessionId:id,maintenanceOwner:true,lifecycle:ownership};
      if (surface === 'web') {
        const check = await this.webAction({sessionId: id, action: 'state'});
        if (check.ok !== true) throw new Error('web_page_not_ready');
        s.webFingerprint = createHash('sha256').update(JSON.stringify([adapterHash, check.value?.version, check.value?.browser, check.value?.boot])).digest('hex');
        s.webRuntime = Object.fromEntries(['version','browser','boot'].map(k => [k,check.value?.[k]]));
        note('session.ready',{surface,session:id,page,version:check.value?.version,outcome:'verified'});
        return {sessionId: id, page, ready: true, lifecycle:ownership, verification: check, learning: await this.learning('search',{source:s.webFingerprint}).catch(()=>({available:false})), next: 'ios_web_inspect, fresh snapshot/target, ios_web_action. Always ios_web_end in finally.'};
      }
      if(nativeOnly){
        const verification=await this.action({sessionId:id,action:'capabilities'});
        if(!verification.ok||verification.data?.applicationState!==0)throw new Error('app_not_ready');
        note('session.bridge_ready',{surface,session:id,outcome:'verified'});
        return {sessionId:id,ready:false,nativeBridgeReady:true,lifecycle:ownership,verification,
          next:'Native diagnostics only: inspect state/tree/capabilities, reload explicitly or return Home. React/app readiness is unproven. End in finally.'};
      }
      const verification = await this.verify({sessionId: id, gate: 'ready', timeout: 12});
      if (verification.receipt.status !== 'passed') throw new Error('app_not_ready');
      note('session.ready',{surface,session:id,outcome:'verified'});
      return {sessionId: id, ready: true, ownership: lifecycle.mode, lifecycle:ownership, verification,
        next: 'Inspect a native or React tree. Call ios_end before ending this work turn.',
        learning: await this.learning('search', {source: runtimeKey(await this.status()) || ''}).catch(() => ({available: false}))};
    } catch (error) {note('session.readiness_failed',{surface,session:id,outcome:'failed',reason:reasonCode(error?.message)||'readiness_unconfirmed',level:'warn'});await this.end(id); throw error; }
  }
  async verify({sessionId, gate, expected, selector, state, timeout = 12},signal) {
    const s = sessionId ? this.session(sessionId) : {dir: this.observationDirectory(), id: null};
    if (!sessionId && !['idle', 'host-idle'].includes(gate)) throw new Error('session_required');
    const a = this.artifact(s, 'verification');
    const before = runtimeKey(await this.status().catch(() => null));
    if(gate==='native-element'){
      const value=await waitNativeElement({selector,state,timeout,signal,owned:()=>this.session(sessionId),read:async timeoutMs=>{
        const read=await this.action({sessionId,action:'tree',timeoutMs});
        if(!read.ok)throw Error('tree_failed');
        return JSON.parse(fs.readFileSync(this.artifacts.get(read.artifactId).file,'utf8')).result;
      }});
      fs.writeFileSync(a.file,JSON.stringify(value),{flag:'wx',mode:0o600});
      const source=runtimeKey(await this.status().catch(()=>null));
      const learningEvidence=source&&source===before?await this.learning('observe',{receipt:value.receipt,source}).catch(()=>({available:false})):{available:false};
      note('verification.completed',{action:gate,session:sessionId,outcome:value.receipt?.status==='passed'?'verified':'failed',reason:reasonCode(value.reason),level:value.receipt?.status==='passed'?'info':'warn'});
      return {...value,artifactId:a.id,learningEvidence};
    }
    const result = await this.run('verify', [gate, '--timeout', String(timeout), '--output', a.file,
      ...(sessionId && !['idle', 'host-idle'].includes(gate) ? ['--lease-file', s.lease] : []), ...(expected ? ['--expect', expected] : [])]);
    if (!fs.existsSync(a.file)) throw new Error(result.error);
    const receipt = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    const source = runtimeKey(await this.status().catch(() => null));
    let learningEvidence = {available: false};
    if (source && source === before) learningEvidence = await this.learning('observe', {receipt, source}).catch(() => ({available: false}));
    note('verification.completed',{action:gate,session:sessionId,outcome:receipt.status==='passed'?'verified':'failed',level:receipt.status==='passed'?'info':'warn'});
    return {artifactId: a.id, receipt, learningEvidence};
  }
  observationDirectory() {
    const dir = path.join(this.state, 'mcp-observations');
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    if (fs.lstatSync(dir).isSymbolicLink() || fs.statSync(dir).mode & 0o077) throw new Error('private_observation_directory_required');
    return dir;
  }
  async action({sessionId, action, args = {}, timeoutMs=120000}, inspect = false, capturePoll=false) {
    const s = this.session(sessionId);
    if(!inspect && action==='tap' && args.selector){
      const tree=await this.action({sessionId,action:'tree'});
      if(!tree.ok)return {ok:false,reason:'native_selector_tree_failed',actionSent:false,treeArtifactId:tree.artifactId};
      // Compact MCP trees omit unlabelled input views and later nodes. Match the
      // complete private receipt, never a ranked/truncated candidate list.
      const raw=JSON.parse(fs.readFileSync(this.artifacts.get(tree.artifactId).file,'utf8'));
      const plan=planNativeTap(raw.result,args.selector);
      if(!plan.ok)return {...plan,treeArtifactId:tree.artifactId};
      // Re-enter the normal action path: validates current ownership again and
      // retains native snapshot/occlusion guards. No retry after any outcome.
      return {...await this.action({sessionId,action:'tap',args:plan.point}),treeArtifactId:tree.artifactId,targeting:'fresh-exact-selector'};
    }
    const a = this.artifact(s, inspect ? 'react' : action);
    const result = await this.run('cli', [inspect ? 'inspect' : 'action', ...(!inspect ? [action] : []),
      '--args', JSON.stringify(args), '--lease-file', s.lease, '--output', a.file],undefined,timeoutMs);
    if (!fs.existsSync(a.file)) return {ok: false, reason: result.error, actionSent: 'unknown', replay: false};
    const receipt = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    if(action==='state'&&!capturePoll&&receipt.result?.richCapture){delete receipt.result.richCapture;fs.writeFileSync(a.file,JSON.stringify(receipt),{mode:0o600});}
    let data = safe(receipt.result || receipt.data || receipt);
    if(action==='home'&&result.ok&&data.delivery==='prepared-home-handoff')s.nativeHomePrepared=true;
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
  read({artifactId, pointer = '', limit = 12000, offset, count}) {
    const paged=offset!==undefined||count!==undefined;
    if(paged&&(!Number.isSafeInteger(offset)||offset<0||offset>10000000||!Number.isInteger(count)||count<1||count>200))throw Error('bounded_array_window_required');
    const a = this.artifacts.get(artifactId);
    if (!a) throw new Error('artifact_not_owned_by_this_connection');
    this.captureStore.prune();
    if(['capture','inspector'].includes(a.type)&&!fs.existsSync(a.file))throw new Error('artifact_expired');
    let value = JSON.parse(fs.readFileSync(a.file, 'utf8'));
    if (a.type === 'image') {
      if(paged)throw Error('array_pointer_required_for_window');
      const image = value.result;
      if (typeof image?.pngBase64 !== 'string') throw new Error('image_unavailable');
      if (image.pngBase64.length > 8 * 1024 * 1024) throw new Error('image_transport_limit_capture_again');
      return {image: image.pngBase64, metadata: safe(image)};
    }
    value = ['capture','inspector'].includes(a.type)?value:safe(value); // Deep content was scrubbed before persistence.
    if (pointer) for (const part of pointer.split('/').slice(1)) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || !Object.hasOwn(value, key)) throw new Error('pointer_not_found');
      value = value[key];
    }
    let pagination;
    if(paged){
      if(!Array.isArray(value))throw Error('array_pointer_required_for_window');
      const total=value.length;value=value.slice(offset,offset+count);
      pagination={offset,count:value.length,total,nextOffset:offset+value.length<total?offset+value.length:null};
    }
    const data = ['capture','inspector'].includes(a.type)?value:safe(value), text = JSON.stringify(data);
    if (text.length > limit) return {artifactId, truncated: true, characters: text.length,
      ...(pagination?{pagination}:{}),next: 'Use a smaller subtree or an explicit array offset/count window. No partial JSON is returned.'};
    return {artifactId, data,...(pagination?{pagination}:{})};
  }
  async deviceInspect({kind='screen',sessionId,debug,audit,transport='configured'}={}) {
    if(!['configured','usb-recovery'].includes(transport))return {ok:false,reason:'fixed_developer_transport_required',inputSent:false};
    if(transport==='usb-recovery'&&(!['screen','capabilities'].includes(kind)||debug||audit))return {ok:false,reason:'usb_recovery_read_only_screen_or_capabilities_required',inputSent:false};
    let s,temporary=false,expressionDispatched=false,heapDispatched=false;
    try {
      if(['heap','breakpoint'].includes(debug?.op)&&!sessionId)return {ok:false,reason:`owned_debug_session_required_for_${debug.op}`,inputSent:false,runtimeMutationSent:false};
      if(!fs.existsSync(path.join(this.state,'providers/pymobiledevice3-11.15.5/bin/python')))return {ok:false,reason:'device_observer_not_installed',inputSent:false};
      if(sessionId)s=this.session(sessionId);
      else {const acquired=await this.begin({surface:'launch'});s=this.session(acquired.sessionId);temporary=true;}
      if(['heap','breakpoint'].includes(debug?.op)){
        if(!sessionId||!['web','system'].includes(s.surface))return {ok:false,reason:`owned_debug_session_required_for_${debug.op}`,inputSent:false};
        debug={...debug,ownedDebugSession:true};
      }
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
      heapDispatched=['heap','breakpoint'].includes(debug?.op);
      let run;
      if(s.relayChannel&&transport==='configured'&&['browser-debug','resource-profile'].includes(kind)&&!audit){
        const response=await s.relayChannel.request('observe',{request:{kind,...(debug?{debug}:{})}});
        if(response.ok){fs.writeFileSync(a.file,JSON.stringify({result:{...response.value,transport:response.transport}}),{flag:'wx',mode:0o600});run={ok:true,value:{ok:true}};}
        else run={ok:false,value:{ok:false,reason:response.reason}};
      }else run=await this.run('provider',[],{kind,serial,transport,state:this.state,leaseFile:s.lease,ownerFile:s.owner,output:a.file,...(debug?{debug}:{}),...(audit?{audit}:{})},debug||audit?35000:26000);
      if(!run.ok||run.value?.ok!==true||!fs.existsSync(a.file)){
        let learningEvidence;
        if(kind==='resource-profile'){
          const source=createHash('sha256').update(JSON.stringify([adapterHash,serial,null,'pymobiledevice3-11.15.5'])).digest('hex');
          const receipt={gate:'device-profile',status:'failed',observation:{observationCompleted:false,inputSent:false,deadlineExceeded:run.value?.reason==='device_observation_deadline',waitingForSamples:run.value?.phase==='resource_profile_sample',osVersionKnown:false}};
          learningEvidence=await this.learning('observe',{receipt,source}).catch(()=>({available:false}));
        }
        return {ok:false,reason:run.value?.reason||'device_observation_unavailable',phase:run.value?.phase,failureType:run.value?.failureType,...((debug||audit)?{diagnostic:run.value?.diagnostic}:{}),...(learningEvidence?{learningEvidence}:{}),inputSent:debug?.expression!==undefined?(run.value?.inputSent===false?false:'unknown'):false,...(['heap','breakpoint'].includes(debug?.op)?{runtimeMutationSent:(run.value?.diagnostic?.heapSnapshotRequested||run.value?.diagnostic?.breakpointRequested)?'unknown':false}:{}),replay:false};
      }
      this.session(s.id);
      const value=JSON.parse(fs.readFileSync(a.file,'utf8')).result;
      if(debug){
        const row=value.pages?.[0]?.debug;
        if(!row)return {ok:false,reason:'active_dev_inspector_target_unavailable',artifactId:a.id,devTargets:value.devTargets,busyTargets:value.busyTargets,inputSent:false,replay:false};
        let saved;
        try{saved=this.captureStore.saveDiagnostic({status:'completed',result:value},debug.op==='heap'&&row.operation==='heap'?{maxBytes:32*1024*1024}:undefined);}
        finally{fs.rmSync(a.file,{force:true});this.artifacts.delete(a.id);}
        this.artifacts.set(a.id,{file:saved.file,sessionId:s.id,type:'inspector'});
        const summary=Object.fromEntries(['operation','documentRef','browser','ready','scriptCount','eventCount','droppedEvents','retainedBytes','timelineStopped','profilerStopped','profileComplete','sampleCount','memoryStopped','cpuProfilerStopped','memorySamples','cpuSamples','webSocketFrames','webSocketPayloadBytes','workerCount','workersInitialized','workerInitializationConfirmed','workerResumeConfirmed','historyMayReplay','heapSnapshotComplete','heapNodeCount','heapEdgeCount','heapShallowBytes','snapshotDurationMs','forcedGarbageCollection','breakpointHit','pauseObserved','latePauseObserved','resumeConfirmed','breakpointRemoved','windowMs','domainsDisabled'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
        return {ok:true,artifactId:a.id,metadata:{...summary,detached:true,transport:value.transport,offLANQualified:false,retentionSeconds:saved.retentionSecondsRemaining,artifactBytes:saved.bytes},inputSent:debug.expression!==undefined,...(['heap','breakpoint'].includes(debug.op)?{runtimeMutationSent:true}:{}),replay:false,next:'Read selected private result/pages/0/debug subtrees with ios_read. Content expires after one hour. Document references expire on navigation/reload; no trusted input or off-LAN Inspector claim.'};
      }
      if(kind==='accessibility-audit'){
        let saved;
        try{saved=this.captureStore.saveDiagnostic({status:'completed',result:value});}
        finally{fs.rmSync(a.file,{force:true});this.artifacts.delete(a.id);}
        this.artifacts.set(a.id,{file:saved.file,sessionId:s.id,type:'inspector'});
        const metadata=Object.fromEntries(['scope','transport','target','profile','checks','reportedIssueCount','issueCount','droppedIssues','auditCompleted','auditChannelClosed','finalCleanupSent','foregroundVerified','documentRef','attribution','noIssuesIsNotAccessibilityCertification','contrastPositiveControlQualified'].map(k=>[k,value[k]]));
        return {ok:true,artifactId:a.id,metadata:{...metadata,retentionSeconds:saved.retentionSecondsRemaining},inputSent:false,replay:false,next:'Read /result/issues selectively with ios_read. Zero reported issues is not an accessibility certification. Dynamic Text/settings changes and simulated activation are excluded.'};
      }
      let learningEvidence;
      if(kind==='resource-profile'){
        const processes=(value.samples||[]).flatMap(x=>x.processes||[]);
        const receipt={gate:'device-profile',status:value.sampleCount===3&&value.profilerStopped===true?'passed':'failed',observation:{sampleCount:value.sampleCount||0,profilerStopped:value.profilerStopped===true,memoryReadings:processes.filter(p=>Number.isFinite(p.physicalFootprintBytes)).length,cpuReadings:processes.filter(p=>Number.isFinite(p.cpuUsageRaw)).length,pageAttributed:false}};
        const source=createHash('sha256').update(JSON.stringify([adapterHash,serial,value.productVersion,value.provider])).digest('hex');
        learningEvidence=await this.learning('observe',{receipt,source}).catch(()=>({available:false}));
      }
      return {ok:true,artifactId:a.id,metadata:safe(value),...(learningEvidence?{learningEvidence}:{}),inputSent:false,next:kind==='screen'?`Use ios_read with this artifactId for the actual full-device PNG. ${transport==='usb-recovery'?'Explicit fixed-phone USB recovery':'Configured paired developer transport'}; separate from arbitrary-network page control.`:kind==='resource-profile'?'Three bounded process samples; CPU is provider raw units and WebContent is not page attribution. The profiler is closed; a temporary owner is released only when this call created it.':'Service availability is not proof of Web Inspector opt-in or native touch.'};
    } catch(error){
      if(!debug)throw error;
      const reason=['capture_storage_quota_reached','active_session_required_begin_again','end_existing_session_first','device_already_leased','frontend_cleanup_in_progress'].includes(error.message)?error.message:'browser_debug_operation_unconfirmed';
      return {ok:false,reason,inputSent:expressionDispatched?'unknown':false,...(['heap','breakpoint'].includes(debug?.op)?{runtimeMutationSent:heapDispatched?'unknown':false}:{}),replay:false};
    } finally {if(temporary&&s)await this.end(s.id);}
  }
  async systemReservation({action='status',durationSeconds=1800,reservationId,threadId}={}) {
    // Candidate remains explicitly gated until physical detach/re-entry passes.
    if(process.env.IOS_AGENT_EXPERIMENTAL_RETENTION!=='1')return {ok:false,reason:'runner_retention_candidate_not_physically_qualified',inputSent:false};
    if(action==='status')return (await this.run('reservation',[],{op:'status',state:this.state},5000)).value;
    if(!['start','end'].includes(action))return {ok:false,reason:'fixed_reservation_operation_required'};
    if(action==='end'&&!/^[a-f0-9]{32}$/.test(reservationId||''))return {ok:false,reason:'matching_reservation_required',inputSent:false};
    if(action==='start'&&(!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>36000||reservationId!==undefined))return {ok:false,reason:'bounded_reservation_required',inputSent:false};
    const acquired=await this.begin({surface:'launch',threadId}),s=this.session(acquired.sessionId);
    try{
      const result=await this.run('reservation',[],{op:action==='start'?'start':'stop',state:this.state,durationSeconds,reservationId,ownerFile:s.owner,leaseFile:s.lease,log:path.join(s.dir,'system-reservation.log')},action==='start'?55000:42000);
      return result.value||{ok:false,reason:'reservation_unconfirmed',replay:false};
    }finally{await this.end(s.id);}
  }
  async systemBegin({rollout,threadId,claudeOwner,timeoutSeconds=10}={}) {
    if(!Number.isInteger(timeoutSeconds)||timeoutSeconds<0||timeoutSeconds>30)return {ok:false,reason:'bounded_system_start_wait_required',inputSent:false};
    const acquired=await this.begin({surface:'launch',rollout,threadId,claudeOwner}),s=this.session(acquired.sessionId);
    s.systemDriver=new SystemDriver({state:this.state,session:s,check:()=>this.session(s.id),authorize:async()=>{
      this.session(s.id);
      const status=await this.run('cli',['owner-check','--lease-file',s.lease],undefined,5000);
      if(!status.ok||typeof status.value?.owned!=='boolean')throw Error('system_ownership_unconfirmed');
      if(!status.value.owned)throw Error('owner_not_active');
      this.session(s.id);
    }});
    try{
      const result=await s.systemDriver.start(timeoutSeconds*1000);
      if(!result.ok){const cleanup=await this.end(s.id);return {...result,cleanup};}
      s.surface='system';
      if(result.ready===false){
        s.systemStarting=true;
        s.systemStartupTimer=setTimeout(()=>this.end(s.id).catch(()=>{}),Math.max(0,result.expiresAt-Date.now()));
        s.systemStartupTimer.unref();
        return {...result,sessionId:s.id,lifecycle:acquired.lifecycle,next:'The same runner is starting; no system input authority yet. Resume with ios_system_inspect kind=permission timeoutSeconds=30 on this sessionId. Pending runner_status is not evidence of a phone lock or authentication prompt. Ask the human only for an observed authentication/unlock gate. Do not begin again. Five-minute expiry, end and EOF stop it.'};
      }
      return {...result,sessionId:s.id,lifecycle:acquired.lifecycle,learningEvidence:await this.systemReady(s),next:result.retained?'Use ios_system_inspect and observed targets; ios_system_end releases input control but preserves the explicit reservation and Apple overlay. Reservation end/expiry stops its runner.':'Use ios_system_inspect kind=permission for a permission/dialog (alert first, one tree fallback), or tree for other native controls. Use fresh targets; ios_system_end in finally stops the runner and Apple overlay. Normal page/app work should use its own driver.'};
    }catch{const cleanup=await this.end(s.id);return {ok:false,reason:'system_start_unconfirmed_inspect_phone',replay:false,cleanup};}
  }
  async systemReady(s){
    clearTimeout(s.systemStartupTimer);s.systemStarting=false;
    s.systemFingerprint=createHash('sha256').update(JSON.stringify([adapterHash,s.systemDriver.deviceIdentity,s.systemDriver.runtime?.os,s.systemDriver.runtime?.build])).digest('hex');
    const receipt={gate:'system-ready',status:'passed',observation:{runnerReady:true,sharedOwner:true,nearbyStartupOnly:true}};
    return this.learning('observe',{receipt,source:s.systemFingerprint}).catch(()=>({available:false}));
  }
  async systemInspect({sessionId,timeoutSeconds=0,kind='tree'}) {
    if(!Number.isInteger(timeoutSeconds)||timeoutSeconds<0||timeoutSeconds>55||!['tree','alert','permission'].includes(kind))return {ok:false,reason:'bounded_system_inspection_required',inputSent:false};
    const s=this.session(sessionId);if(!s.systemDriver)throw Error('session_required');
    if(s.systemStarting){
      const result=await s.systemDriver.continueStart(timeoutSeconds*1000);
      if(!result.ok){const cleanup=await this.end(s.id);return {...result,cleanup};}
      if(result.ready===false)return {...result,sessionId:s.id,next:'Resume the same session with ios_system_inspect kind=permission timeoutSeconds=30. Pending runner_status does not prove a human gate. Inspect phone state only if the bounded wait remains pending or an explicit gate is reported. Do not restart XCTest. End in finally; five-minute expiry still applies.'};
      await this.systemReady(s);
    }
    const value=await s.systemDriver.inspect({kind}),a=this.artifact(s,'system-tree');
    fs.writeFileSync(a.file,JSON.stringify(value),{flag:'wx',mode:0o600});
    const nodes=value.nodes.filter(n=>n.visible&&(n.name||n.label||n.value));
    const alertAbsent=kind==='alert'&&value.alert===null;
    note('system.inspection_completed',{session:sessionId,kind,stage:value.inspectionPath||kind,outcome:'completed',present:value.alert!==null||nodes.length>0,count:nodes.length,durationMs:value.readDurationMs});
    return {...value,artifactId:a.id,nodes:nodes.slice(0,100),totalNodes:value.nodes.length,compact:true,
      coverage:value.inspectionPath==='alert'||kind==='alert'?'native-alert-only':'native-accessibility-tree',
      next:alertAbsent?'No native alert was found. Chrome/WebKit can show an in-app permission sheet instead: inspect kind=tree once, then act on its fresh observed target. This does not prove no permission UI is present.':'Fresh snapshot expires in five seconds. ios_read selects the private full tree. Never replay accepted or unknown input.'};
  }
  async systemAction(args) {
    const s=this.session(args.sessionId);if(!s.systemDriver)throw Error('session_required');
    if(s.systemStarting)return {ok:false,reason:'system_not_ready',actionSent:false,replay:false};
    if(args.action==='scroll'&&args.snapshot===undefined&&args.label===undefined){
      const tree=await s.systemDriver.inspect();
      args={...args,snapshot:tree.snapshot};
    }
    const result=await s.systemDriver.action(args);if(args.action==='home')s.systemHomeConfirmed=result.homeConfirmed===true;return result;
  }
  async systemEnd({sessionId,home=true}) {
    const s=this.sessions.get(sessionId);if(!s?.systemDriver)throw Error('session_required');
    let presentation=home?{homeNavigationPending:true}:{homeRequested:false,homeNavigationPending:false,reason:'intermediate_handoff'};
    if(home){try{presentation=await s.systemDriver.action({action:'home'});s.systemHomeConfirmed=presentation.homeConfirmed===true;}
      catch{presentation={ok:false,homeConfirmed:false,reason:'home_navigation_unconfirmed',replay:false};s.systemHomeConfirmed=false;}}
    if(home)note('home.request_completed',{provider:'system',session:sessionId,outcome:s.systemHomeConfirmed?'verified':presentation.ok===true?'accepted':'unknown',dispatched:presentation.ok===true?true:undefined,verified:s.systemHomeConfirmed,reason:reasonCode(presentation.reason),level:s.systemHomeConfirmed?'info':'warn'});
    const ended=await this.end(sessionId);
    return {...ended,presentation,ok:ended.released===true&&(ended.systemCleanup?.runnerStopped===true||ended.systemCleanup?.retained===true),next:ended.systemCleanup?.retained?'Input control ended; the explicitly reserved runner and Apple indicator remain until reservation end/expiry. Begin native/browser control normally.':ended.systemCleanup?.runnerStopped===true?'XCTest fallback is stopped. Begin a fresh native/browser lease for normal work.':'Runner cleanup is unconfirmed; inspect the phone and paired channel before starting another fallback.'};
  }
  async waitReady({surface='any',browser,page,timeoutSeconds=45}={},signal) {
    const controller=new AbortController();this.waitControllers.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted||this.closing)abort();
    try{const r=await this.run('wait',[],{surface,browser,page,timeoutSeconds},(timeoutSeconds+4)*1000,controller.signal);return r.value||{readyToAcquire:false,reason:controller.signal.aborted?'cancelled':'readiness_channel_unavailable',leaseAcquired:false};}
    finally{this.waitControllers.delete(controller);signal?.removeEventListener('abort',abort);}
  }
  async appTransportPreferred() {
    if(!focusLaunchEnabled(this.state))return false;
    try{
      const file=path.join(this.state,'developer-tailnet.json'),stat=fs.lstatSync(file);
      if(stat.isFile()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&stat.size<4096){const config=JSON.parse(fs.readFileSync(file));if(tailnetHost(config.address))return (await endpointState(config.address,49152))!=='open';}
    }catch{}
    return false;
  }
  async deviceLaunch({target='kickoff-dev',transport='auto'}={}) {
    if(!['auto','paired','focus'].includes(transport)||transport==='focus'&&target!=='kickoff-dev')return {ok:false,reason:'fixed_launch_transport_required',inputSent:false};
    let useFocus=transport==='focus';
    if(transport==='auto'&&target==='kickoff-dev')useFocus=await this.appTransportPreferred();
    note('provider.selected',{op:'device_launch',provider:useFocus?'focus':'paired',kind:target});
    if(useFocus){
      const acquired=await this.begin({surface:'launch'});let result;
      try{result=await focusLaunch({state:this.state,check:()=>this.session(acquired.sessionId),runShortcut:this.focusRunShortcut});}finally{await this.end(acquired.sessionId);}
      if(!result.ok)return result;
      const ready=await this.waitReady({surface:'native',timeoutSeconds:5});
      return {...result,target,foregroundVerified:ready.readyToAcquire===true,foregroundScope:'fresh native foreground bridge; verify app/React readiness separately',offLANQualified:true,
        next:ready.readyToAcquire?'Call ios_begin for fresh runtime readiness. Focus was restored; no input lease is retained.':'Launch completed, but no fresh native bridge is visible. Do not replay the Focus pulse; inspect current state.'};
    }
    const bundles={'kickoff-dev':'com.dev.kudos.fit',settings:'com.apple.Preferences',safari:'com.apple.mobilesafari',chrome:'com.google.chrome.ios'};
    if(!Object.hasOwn(bundles,target))return {ok:false,reason:'fixed_launch_target_required',inputSent:false};
    const reservation=await this.begin({surface:'launch'});
    try {
      const file=path.join(this.state,'web-device.json');
      if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      const device=JSON.parse(fs.readFileSync(file,'utf8')).coreDeviceId;
      if(!/^[A-Fa-f0-9-]{36}$/.test(device||''))return {ok:false,reason:'configured_device_id_required',inputSent:false};
      let tailnetConfigured=false;
      try{fs.lstatSync(path.join(this.state,'developer-tailnet.json'));tailnetConfigured=true;}catch(error){if(error.code!=='ENOENT')throw error;}
      if(tailnetConfigured){
        const serial=JSON.parse(fs.readFileSync(file,'utf8')).hardwareUDID;
        if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(serial||''))return {ok:false,reason:'configured_device_identity_unconfirmed',inputSent:false};
        const owner=this.session(reservation.sessionId),artifact=this.artifact(owner,'device-launch');
        try{
          const result=await this.run('provider',[],{kind:'fixed-launch',target,serial,state:this.state,leaseFile:owner.lease,ownerFile:owner.owner,output:artifact.file},26000);
          this.session(owner.id);
          if(!result.ok||result.value?.ok!==true||!fs.existsSync(artifact.file))return {ok:false,reason:result.value?.reason||'developer_launch_unconfirmed',phase:result.value?.phase,inputSent:result.value?.inputSent??'unknown',replay:false};
          const value=JSON.parse(fs.readFileSync(artifact.file,'utf8')).result;
          return {ok:true,...safe(value),replay:false,next:target==='kickoff-dev'?'Wait for native readiness, then ios_begin. Inspect optional foregroundEvidence separately from native/React readiness.':'Inspect the device independently. Settings input requires a separate system provider.'};
        }finally{fs.rmSync(artifact.file,{force:true});this.artifacts.delete(artifact.id);}
      }
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
  async nativeAXTab({tab}={}) {
    if(process.env.IOS_AGENT_EXPERIMENTAL_AX!=='1')return {ok:false,reason:'experimental_ax_disabled',inputSent:false};
    if(!['home','workouts','nutrition','invite'].includes(tab))return {ok:false,reason:'fixed_ax_native_tab_required',inputSent:false};
    const reservation=await this.begin({surface:'launch'});
    try {
      const file=path.join(this.state,'web-device.json');
      if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      if(!fs.existsSync(path.join(this.state,'developer-tailnet.json')))return {ok:false,reason:'paired_tailnet_configuration_required',inputSent:false};
      const serial=JSON.parse(fs.readFileSync(file,'utf8')).hardwareUDID;
      if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(serial||''))return {ok:false,reason:'configured_device_identity_unconfirmed',inputSent:false};
      const owner=this.session(reservation.sessionId),artifact=this.artifact(owner,'native-ax');
      try {
        const result=await this.run('provider',[],{kind:'ax-native-tab',axTab:tab,experimentalAX:true,serial,state:this.state,leaseFile:owner.lease,ownerFile:owner.owner,output:artifact.file},26000);
        this.session(owner.id);
        if(!result.ok||result.value?.ok!==true||!fs.existsSync(artifact.file))return {ok:false,reason:result.value?.reason||'native_ax_unconfirmed',inputSent:result.value?.inputSent??'unknown',replay:false};
        return {ok:true,...safe(JSON.parse(fs.readFileSync(artifact.file,'utf8')).result),replay:false};
      }finally{fs.rmSync(artifact.file,{force:true});this.artifacts.delete(artifact.id);}
    }finally{await this.end(reservation.sessionId);}
  }
  async deviceHome({transport='auto'}={}) {
    if(!['auto','paired','app'].includes(transport))return {ok:false,reason:'home_transport_required',inputSent:false};
    const app=transport==='app'||transport==='auto'&&await this.appTransportPreferred();
    note('provider.selected',{op:'device_home',provider:app?'app':'paired'});
    if(app){
      const current=await this.waitReady({surface:'native',timeoutSeconds:0});
      if(!current.readyToAcquire){const opened=await this.deviceLaunch({target:'kickoff-dev'});if(opened.foregroundVerified!==true)return {...opened,ok:false,next:'Foreground is unconfirmed; Home was not sent. Do not replay the launch.'};}
      const acquired=await this.begin({surface:'native',nativeOnly:true});
      try{
        const result=await this.action({sessionId:acquired.sessionId,action:'home'});
        note('home.request_completed',{provider:'app',outcome:result.ok===true?'accepted':result.actionSent===false?'refused':'unknown',dispatched:result.ok===true?true:result.actionSent===false?false:undefined,verified:false,reason:reasonCode(result.reason),level:result.ok?'info':'warn'});
        return {ok:result.ok===true,transport:'app-owned-home',inputSent:result.ok?true:(result.actionSent??'unknown'),homeVerified:false,replay:false,next:'DEV prepared one Home handoff and retired its lease. Whole-display confirmation remains separate; do not replay this input.'};
      }finally{await this.end(acquired.sessionId);}
    }
    return this.pairedShortcut('shortcut-home');
  }
  async deviceWiFiOn(){return this.pairedShortcut('shortcut-wifi-on');}
  async pairedShortcut(kind){
    if(!['shortcut-home','shortcut-wifi-on'].includes(kind))return {ok:false,reason:'fixed_device_shortcut_required',inputSent:false};
    const home=kind==='shortcut-home',event=home?'home.request_completed':'wifi.recovery_requested';
    const reservation=await this.begin({surface:'launch'});
    try {
      const file=path.join(this.state,'web-device.json'),transport=path.join(this.state,'developer-tailnet.json');
      if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_web_device_configuration_required',inputSent:false};
      if(!fs.existsSync(transport))return {ok:false,reason:'paired_tailnet_configuration_required',inputSent:false};
      const serial=JSON.parse(fs.readFileSync(file,'utf8')).hardwareUDID;
      if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(serial||''))return {ok:false,reason:'configured_device_identity_unconfirmed',inputSent:false};
      const owner=this.session(reservation.sessionId),artifact=this.artifact(owner,kind);
      try {
        const result=await this.run('provider',[],{kind,serial,state:this.state,leaseFile:owner.lease,ownerFile:owner.owner,output:artifact.file},26000);
        this.session(owner.id);
        if(!result.ok||result.value?.ok!==true||!fs.existsSync(artifact.file)){note(event,{provider:'paired',outcome:result.value?.inputSent===false?'refused':'unknown',dispatched:result.value?.inputSent===true?true:result.value?.inputSent===false?false:undefined,verified:false,reason:reasonCode(result.value?.reason)||(home?'device_home_unconfirmed':'device_wifi_on_unconfirmed'),level:'warn'});return {ok:false,reason:result.value?.reason||(home?'device_home_unconfirmed':'device_wifi_on_unconfirmed'),inputSent:result.value?.inputSent??'unknown',replay:false};}
        const value={ok:true,...safe(JSON.parse(fs.readFileSync(artifact.file,'utf8')).result),replay:false};
        note(event,{provider:'paired',outcome:(home?value.homeVerified:value.wifiVerified)===true?'verified':'accepted',dispatched:true,verified:(home?value.homeVerified:value.wifiVerified)===true});
        return value;
      }finally{fs.rmSync(artifact.file,{force:true});this.artifacts.delete(artifact.id);}
    }finally{await this.end(reservation.sessionId);}
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
  async webOpen(args){return openManagedWeb(this,args);}
  async webEnroll({path: route = '/dev/ios-agent', browser, rememberBrowser=false,profile='app',transport='auto'} = {}) {
    if(!['auto','paired','app'].includes(transport)||transport==='app'&&!browser)return {ok:false,reason:'browser_transport_required',actionSent:false};
    if (browser && (await this.status()).lease) return {ok:false,reason:'idle_device_required_for_browser_launch',actionSent:false};
    const runtime = JSON.parse(fs.readFileSync(path.join(this.state, 'dev-runtime.json'), 'utf8'));
    const origin = webProfileOrigin(runtime.webURL,profile);
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('#') || route.includes('\\')) throw new Error('local_route_required');
    const r = await this.run('web', [], {op: 'web_enroll', origin, rememberBrowser}, 8000);
    if (!r.ok || !r.value.token) return {ok: false, reason: 'web_enrollment_unavailable'};
    const a = this.artifact({id: null, dir: this.observationDirectory()}, 'web-enrollment');
    fs.writeFileSync(a.file, JSON.stringify({url: origin + route + '#ios-agent=' + encodeURIComponent(r.value.token)}), {flag: 'wx', mode: 0o600});
    let launch;
    if (browser) {
      let appHandoff=transport==='app';
      if(transport==='auto')appHandoff=await this.appTransportPreferred();
      note('provider.selected',{op:'browser_enroll_launch',provider:appHandoff?'app':'paired',kind:browser});
      if(appHandoff){
        if(browser==='ios-chrome'&&transport==='auto'&&!qualifiedChromeInstalled(this.state,(await this.status()).device?.deliveryId))return {ok:false,profile,launchFile:a.file,actionSent:false,inputSent:false,reason:'chrome_installed_adapter_unqualified',next:'Use explicit app transport only to qualify an unknown installed adapter; older HTTPS adapters can open Safari. Otherwise reuse an enrolled page or the paired lane. Never replay an accepted handoff.'};
        const current=await this.waitReady({surface:'native',timeoutSeconds:0});
        if(!current.readyToAcquire){
          const opened=await this.deviceLaunch({target:'kickoff-dev'});
          if(opened.foregroundVerified!==true)return {ok:false,profile,reason:'native_foreground_unconfirmed',browserInputSent:false,launchFile:a.file,launch:opened,next:'Wait for native readiness without a lease. No browser input was sent. Do not repeat the accepted or unknown foreground launch; diagnose connectivity before asking for a physical action.'};
        }
        const reservation=await this.begin({surface:'native',nativeOnly:true});
        try{
          if(browser==='ios-chrome'&&transport==='auto'&&!qualifiedChromeDelivery(this.state,reservation.verification?.data?.deliveryId))return {ok:false,profile,actionSent:false,inputSent:false,reason:'chrome_installed_adapter_changed',next:'No browser input sent. Inspect the fresh installed adapter before qualification.'};
          const sourceURL=JSON.parse(fs.readFileSync(a.file,'utf8')).url;
          const result=await this.action({sessionId:reservation.sessionId,action:'browser-handoff',args:{browser,url:sourceURL}});
          launch={ok:result.ok===true,transport:'app-owned-private-URL',browserRoute:result.data?.mode||'installed-adapter-route-unreported',...(result.data?.mode==='system-default-https'?{requiresDefaultBrowser:'ios-chrome'}:{}),inputSent:result.ok===true?true:(result.actionSent??'unknown'),foregroundVerified:false,replay:false,...(result.ok?{}:{reason:result.reason||'native_browser_handoff_unconfirmed'})};
          note('browser.launch_completed',{provider:'app',kind:browser,outcome:launch.ok?'accepted':launch.inputSent===false?'refused':'unknown',reason:reasonCode(launch.reason),level:launch.ok?'info':'warn'});
        }finally{await this.end(reservation.sessionId);}
        return {ok:launch.ok,profile,launchFile:a.file,expiresIn:300,launch,next:'Handoff acceptance is not browser readiness. Wait for the intended visible ios_web_pages entry, then acquire it. Never replay accepted or unknown URL delivery.'};
      }
      const configFile = path.join(this.state, 'web-device.json');
      if (!fs.existsSync(configFile) || fs.lstatSync(configFile).isSymbolicLink() || fs.statSync(configFile).mode & 0o077) return {ok:false,reason:'private_web_device_configuration_required',launchFile:a.file,actionSent:false};
      const device = JSON.parse(fs.readFileSync(configFile,'utf8')).coreDeviceId;
      if (!/^[A-Fa-f0-9-]{36}$/.test(device)) return {ok:false,reason:'configured_device_id_required',actionSent:false};
      const bundle = {'ios-safari':'com.apple.mobilesafari','ios-chrome':'com.google.chrome.ios'}[browser];
      if (!bundle) return {ok:false,reason:'supported_ios_browser_required',actionSent:false};
      let tailnetConfigured=false;
      try{fs.lstatSync(path.join(this.state,'developer-tailnet.json'));tailnetConfigured=true;}catch(error){if(error.code!=='ENOENT')throw error;}
      if(tailnetConfigured){
        const serial=JSON.parse(fs.readFileSync(configFile,'utf8')).hardwareUDID;
        if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/.test(serial||''))return {ok:false,reason:'configured_device_identity_unconfirmed',launchFile:a.file,actionSent:false};
        const reservation=await this.begin({surface:'launch'});
        try{
          const owner=this.session(reservation.sessionId),receipt=this.artifact(owner,'browser-launch');
          try{
            const sourceURL=JSON.parse(fs.readFileSync(a.file,'utf8')).url;
            const result=await this.run('provider',[],{kind:'browser-launch',browser:browser==='ios-safari'?'safari':'chrome',profile,url:sourceURL,serial,state:this.state,leaseFile:owner.lease,ownerFile:owner.owner,output:receipt.file},26000);
            this.session(owner.id);
            if(!result.ok||result.value?.ok!==true||!fs.existsSync(receipt.file))launch={ok:false,outcome:'unknown',reason:result.value?.reason||'developer_launch_unconfirmed',inputSent:result.value?.inputSent??'unknown',replay:false};
            else launch={ok:true,...safe(JSON.parse(fs.readFileSync(receipt.file,'utf8')).result),replay:false};
            note('browser.launch_completed',{provider:'paired',kind:browser,outcome:launch.ok?'accepted':launch.inputSent===false?'refused':'unknown',reason:reasonCode(launch.reason),level:launch.ok?'info':'warn'});
          }finally{fs.rmSync(receipt.file,{force:true});this.artifacts.delete(receipt.id);}
        }finally{await this.end(reservation.sessionId);}
        return {ok:true,profile,launchFile:a.file,expiresIn:300,launch,next:'Enrollment was created; inspect launch outcome, then ios_web_pages for actual page readiness. Accepted or unknown URL delivery must not be replayed. The private launch file contains the expiring enrollment fragment; do not log it.'};
      }
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
        note('browser.launch_completed',{provider:'paired',kind:browser,outcome:result.outcome==='developer-request-accepted'?'accepted':result.outcome==='developer-request-rejected'?'refused':'unknown',level:result.ok?'info':'warn'});
      } finally { await this.end(reservation.sessionId); }
    }
    return {ok: true, profile,launchFile: a.file, expiresIn: 300, ...(launch?{launch}:{}), next: 'Use this private JSON URL to open the intended dev page in Safari or Chrome. Do not log enrollment fragments. Call-rig needs its separately configured private port10520→local3020 route; enrollment does not install or repair it.'};
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
    if(action==='state'&&ok&&value?.domains?.meet?.connected===true)s.webSawConnectedCall=true;
    const large = JSON.stringify(value || {}).length > 12000;
    const preview = large && action === 'snapshot' ? {...value, content:value.content?.slice(0,2000),elements:value.elements?.slice(0,25),nodeCount:value.elements?.length} :
      large && action === 'state' ? {...value,domains:undefined,domainNames:Object.keys(value.domains || {})} : undefined;
    return {ok, artifactId: a.id, outcome: r.value?.status || 'unknown', error: r.value?.result?.error, replay: false,
      ...(typeof r.value?.reason === 'string' ? {reason:r.value.reason} : {}),
      ...(!large ? {value} : {value:preview,truncated:true,next:'Use ios_read with /result/value for the complete private observation.'})};
  }
  async audioProbe({action='plan',sessionId,strategy,fault}) {
    if(action==='plan')return {ok:true,recipe:audioProbePlan};
    const s=this.session(sessionId);
    if(s.surface!=='web')throw new Error('web_session_required');
    if(action==='select'&&!validProbeSelection(strategy,fault))return {ok:false,reason:'invalid_probe_selection',inputSent:false};
    const read=await this.webAction({sessionId,action:'state'});
    const file=this.artifacts.get(read.artifactId)?.file;
    const page=file?JSON.parse(fs.readFileSync(file,'utf8'))?.result?.value:read.value;
    if(!read.ok||!page?.visible||!page?.secureContext||!page?.indicator||page.boot!==s.webRuntime.boot||page.browser!==s.webRuntime.browser||page.version!==s.webRuntime.version)return {ok:false,reason:'probe_page_not_owned_ready',inputSent:false,artifactId:read.artifactId};
    const probe=page.domains?.['transport-lab'],meet=page.domains?.meet;
    if(!probe)return {ok:false,reason:'probe_adapter_missing',inputSent:false,artifactId:read.artifactId};
    if(action==='read')return {ok:true,probe,primaryCall:{connected:meet?.connected===true,microphoneEnabled:meet?.microphoneEnabled===true},artifactId:read.artifactId};
    if(action==='stop'&&!probe.running)return {ok:true,inputSent:false,alreadyStopped:true,probe};
    if(action!=='stop'&&(!meet?.connected||!probe.sourceLive||!probe.sourceEnabled))return {ok:false,reason:'probe_live_call_required',inputSent:false};
    if(action!=='stop'&&probe.running)return {ok:false,reason:'probe_already_running',inputSent:false};
    // One fixed page input, never repeated or inferred successful from readback.
    return this.webAction({sessionId,action:'evaluate',args:{expression:probeExpression(action,strategy,fault)}});
  }
  async webVerify({sessionId, gate, expectedPath, expectedText, selector, expectedValue, callPhase, elementState='visible', timeoutSeconds=0, direction = 'both', sampleMs = 1000}, signal) {
    const s = this.session(sessionId);
    if (s.surface !== 'web') throw new Error('web_session_required');
    if (gate === 'web-route' && !expectedPath && !expectedText) return {ok:false,reason:'explicit_web_postcondition_required'};
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds<0 || timeoutSeconds>30) return {ok:false,reason:'bounded_condition_wait_required'};
    if (gate === 'web-call' && !['lobby','connected','paired','released'].includes(callPhase)) return {ok:false,reason:'explicit_call_phase_required'};
    if (gate === 'web-element' && !selector) return {ok:false,reason:'element_selector_required'};
    if (gate === 'web-media' && timeoutSeconds) return {ok:false,reason:'media_wait_requires_explicit_new_sample'};
    if (gate === 'web-media') {
      if (!['sent','received','both'].includes(direction) || !Number.isInteger(sampleMs) || sampleMs < 500 || sampleMs > 3000) return {ok:false,reason:'bounded_media_sample_required'};
      const full = read => { const file=this.artifacts.get(read.artifactId)?.file; return file ? JSON.parse(fs.readFileSync(file,'utf8'))?.result?.value : read.value; };
      const first = await this.webAction({sessionId,action:'state'}), before = full(first);
      await new Promise(resolve => setTimeout(resolve,sampleMs));
      const second = await this.webAction({sessionId,action:'state'}), after = full(second);
      const observation = {readsCompleted:first.ok === true && second.ok === true,...mediaObservation(before,after,direction,s.webRuntime)};
      const ok = Object.values(observation).every(v => v === true);
      const reason=mediaFailureReason(observation);
      const receipt = {gate,status:ok?'passed':'failed',scope:'instrumented-audio-RTP-counters-only',observation};
      const learningEvidence=await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false}));
      note('verification.completed',{action:gate,session:sessionId,page:s.page,kind:direction,outcome:ok?'verified':'failed',reason,level:ok?'info':'warn'});
      return {ok,receipt,...(!ok?{reason,replay:false}:{}),direction,artifactId:second.artifactId,beforeArtifactId:first.artifactId,sampleMs,learningEvidence,
        limits:'Stable document-local stream counters; at least one stream advances in each requested direction, none reset. This does not prove audible content, call-room identity, remote playout, microphone permission or physical network route.'};
    }
    const started=performance.now();let read,observation,ok=false,checks=0,refs,reason,callCheck;
    const full = r => {const file=this.artifacts.get(r.artifactId)?.file;return file?JSON.parse(fs.readFileSync(file,'utf8'))?.result?.value:r.value;};
    do {
      if(signal?.aborted)throw new Error('request_cancelled_before_dispatch');
      this.session(sessionId); // Refuse a replaced/retired owner before every read.
      read=await this.webAction({sessionId,action:['web-ready','web-call'].includes(gate)?'state':'snapshot',args:selector?{selector}:{}});checks++;
      const value=full(read);
      callCheck=gate==='web-call'?callObservation(value,s.webRuntime,callPhase,{priorConnected:s.webSawConnectedCall===true}):undefined;
      observation=callCheck?callCheck.observation:gate==='web-ready'?{visible:value?.visible===true,secureContext:value?.secureContext===true,indicatorOn:value?.indicator===true,
        sameRuntime:['browser','boot','version'].every(k=>typeof value?.[k]==='string'&&value[k].length>0&&value[k]===s.webRuntime[k])}:
        {snapshotAvailable:typeof value?.snapshot==='string',nodeCount:value?.elements?.length||0,
         ...(expectedPath?{expectedPathMatched:value?.path===expectedPath}:{}),
         ...(expectedText?{expectedTextMatched:value?.content?.includes(expectedText)===true}:{})};
      refs=undefined;
      if(gate==='web-element'&&read.ok){
        const nodes=value?.elements||[],node=nodes[0];observation.uniqueElement=nodes.length===1;
        if(expectedValue!==undefined)observation.expectedValueMatched=nodes.length===1&&node.value===expectedValue;
        if(nodes.length===1){
          refs={snapshot:value.snapshot,target:node.id};
          if(elementState!=='visible'){
            const detail=await this.webAction({sessionId,action:'element',args:refs}),element=full(detail);
            observation.interactable=detail.ok===true&&element?.interactable===true&&element?.disabled===false;
            if(elementState==='editable')observation.editable=observation.interactable&&element?.readOnly===false&&['input','textarea'].includes(node.tag);
            if(!detail.ok){read=detail;reason='condition_observation_failed';}
          }
        }
      }
      ok=read.ok&&Object.values(observation).every(v=>typeof v==='number'?v>0:v===true);
      if(ok||!read.ok||reason)break;
      const remaining=timeoutSeconds*1000-(performance.now()-started);
      if(remaining<=0||checks>=61)break;
      await new Promise((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);reject(new Error('request_cancelled_before_dispatch'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},Math.min(500,remaining));
        signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      });
    }while(performance.now()-started<timeoutSeconds*1000);
    const receipt={gate,status:ok?'passed':'failed',observation};
    const learningEvidence=await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false}));
    note('verification.completed',{action:gate,session:sessionId,page:s.page,outcome:ok?'verified':'failed',reason:ok?undefined:reasonCode(reason||(!read.ok?'condition_observation_failed':callCheck?.reason||'condition_not_met')),count:checks,level:ok?'info':'warn'});
    return {ok,receipt,artifactId:read.artifactId,learningEvidence,checks,elapsedMs:Math.round(performance.now()-started),
      ...(callCheck?{diagnostics:callCheck.diagnostics,...(!ok&&callCheck.diagnostics.releaseState==='disconnected_with_live_tracks'?{next:'The call disconnected but this document still owns live tracks; a lobby preview may explain them. Leave the meet route, then verify released in the same document. Home alone is not media-release proof.'}:{}),scope:'owned-dev-call-projection-only',limits:'Call state is not RTP advancement, audible playout, provider room identity or physical network proof. released covers instrumented page media only.'}:{}),
      ...(ok&&refs?{...refs,next:'Use these references immediately; normal five-second/occlusion input checks still apply.'}:{}),
      ...(!ok?{reason:reason||(!read.ok?'condition_observation_failed':callCheck?.reason||'condition_not_met'),replay:false}:{})};
  }
  async webEnd(id,{home=true}={}) {
    const s=this.sessions.get(id);
    // An unknown ID is a harmless schema preflight: no CLI or phone work. Echo
    // the effective boolean so a client can detect a cached schema dropping it.
    if(!s)return {...await this.end(id),cleanupIntent:{home},inputSent:false};
    if(!s.webEndPromise){s.webEndHome=home;s.webEndPromise=this.finishWebEnd(id,{home}).then(result=>({...result,cleanupIntent:{home:s.webEndHome}}));}
    return s.webEndPromise;
  }
  async finishWebEnd(id,{home=true}={}) {
    const s = this.sessions.get(id), page = s?.page;
    const requestHome=home&&(s?.appManagedHome===true||s?.pairedManagedHome===true)&&s.active&&!this.closing;
    const cleanupStartedAt=Date.now();
    note('browser.cleanup_requested',{session:id,page,action:home&&(s?.appManagedHome||s?.pairedManagedHome||s?.relayChannel)?'glow_then_home':'glow_only',reason:home?undefined:'intermediate_handoff'});
    const release = await this.end(id,{home});
    if (!page){note('browser.cleanup_unconfirmed',{session:id,outcome:'unknown',reason:'page_identity_unavailable',level:'warn'});return {...release, indicatorOff: 'unconfirmed',ok:false,reason:'page_identity_unavailable'};}
    // The nearby relay requests Home before retiring ownership. Its final
    // visibility/glow report can legitimately precede the release response;
    // background Safari/Chrome need not emit another heartbeat afterward.
    const feedbackNotBefore=s.managedHomePrepared?cleanupStartedAt:Date.now();
    const until = Date.now() + 7000;
    let feedback='page_catalog_unavailable';
    while (Date.now() < until) {
      const pages = await this.webPages();
      const p = pages.pages?.find(p => p.id === page);
      feedback=!pages.ok?'page_catalog_unavailable':!p?'page_disconnected':
        ['browser','boot','version'].some(k=>p[k]!==s.webRuntime?.[k])?'page_runtime_changed':
        p.indicator!==false?'indicator_not_off':'indicator_feedback_stale';
      if (pageIdleConfirmed(p,s.webRuntime,Date.now()-feedbackNotBefore)) {
        note('browser.indicator_off_verified',{session:id,page,outcome:'verified',verified:true,released:release.released===true});
        const receipt={gate:'web-idle',status:'passed',observation:{ownerReleased:release.released === true,indicatorOff:true}};
        const learningEvidence=s?.webFingerprint ? await this.learning('observe',{receipt,source:s.webFingerprint}).catch(()=>({available:false})) : {available:false};
        let appCleanup;
        if(requestHome&&release.released===true&&!this.closing){
          try{const home=await this.deviceHome({transport:s.pairedManagedHome?'paired':'app'});appCleanup={homeRequested:home.ok===true,homeVerified:false,...(!home.ok?{reason:home.reason||'home_unconfirmed',replay:false}:{})};}
          catch{appCleanup={homeRequested:false,homeVerified:false,reason:'home_owner_or_transport_unavailable',replay:false};}
          note('browser.home_cleanup_completed',{session:id,outcome:appCleanup.homeRequested?'accepted':'unknown',dispatched:appCleanup.homeRequested===true?true:undefined,verified:false,reason:reasonCode(appCleanup.reason),level:appCleanup.homeRequested?'info':'warn'});
        }
        return {...release, indicatorOff:true,receipt,learningEvidence,...(appCleanup?{appCleanup}:{}),...(appCleanup?.homeRequested===false?{ok:false,next:'Control and glow ended; Home remains unconfirmed. Inspect the current owner/transport without replaying input.'}:{})};
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    note('browser.cleanup_unconfirmed',{session:id,page,outcome:'unknown',reason:'fresh_indicator_off_feedback_missing',state:feedback,level:'warn'});
    return {...release, indicatorOff: 'unconfirmed', ok: false, reason:'fresh_indicator_off_feedback_missing',feedback,
      next: 'Host release alone cannot confirm this page indicator. Inspect current page/ownership state; do not replay a Home or browser handoff already accepted or unknown.'};
  }
  async harnessEnd({event,sessionId,promptId,agentId}={}) {
    const ignored=reason=>({ok:true,suppressOutput:true,cleanup:{matched:0,released:0,reason}});
    if(!['Stop','StopFailure','SubagentStop','SessionEnd'].includes(event))return ignored('unsupported_cleanup_event');
    if(event==='SubagentStop'&&!agentId)return ignored('subagent_identity_required');
    let owner;
    try{owner=claudeTurnOwner({sessionId,promptId,...(agentId===undefined?{}:{agentId})});}
    catch{return ignored('exact_claude_prompt_owner_required');}
    const matched=[...this.sessions.values()].filter(s=>sameClaudeTurn(s.claudeOwner,owner));
    const receipts=[];
    for(const s of matched){
      // No global cancellation/close: a delayed Stop, parent Stop, another
      // connection and any unbound session are all outside this exact fence.
      try{receipts.push(s.systemDriver?await this.systemEnd({sessionId:s.id}):s.surface==='web'?await this.webEnd(s.id):await this.end(s.id));}
      catch{receipts.push({released:false,ok:false,reason:'harness_cleanup_unconfirmed',replay:false});}
    }
    const confirmed=receipts.every(r=>r.released===true&&r.ok!==false&&r.indicatorOff!=='unconfirmed'&&r.captureCleanup?.complete!==false);
    if(matched.length)note('harness.cleanup_completed',{ownerId:owner.sessionId,kind:'claude-prompt',ownerMode:'claude-prompt',epoch:owner.promptId,count:matched.length,failedCount:receipts.filter(r=>r.released!==true).length,released:receipts.every(r=>r.released===true),outcome:confirmed?'verified':'unknown',level:confirmed?'info':'warn'});
    return {ok:confirmed,suppressOutput:true,cleanup:{matched:matched.length,released:receipts.filter(r=>r.released===true).length,confirmed,
      ...(matched.length?{receipts}:{reason:'no_matching_owned_prompt'})}};
  }
  async end(id,{home=true}={}) {
    const s = this.sessions.get(id);
    if (!s) return {released: false, alreadyEnded: true};
    if (s.endPromise) return s.endPromise;
    note('lease.release_requested',{session:id,surface:s.surface});
    s.endPromise = (async () => {
      clearTimeout(s.systemStartupTimer);
      let captureCleanup,systemCleanup;
      if(s.systemDriver)systemCleanup=await s.systemDriver.stop();
      if(this.captures.get(id)?.active&&s.active&&!this.closing){
        try {const started=Date.now();captureCleanup=await this.capture({sessionId:id,op:'stop'});const artifacts=captureCleanup.artifactId?[captureCleanup.artifactId]:[];while(captureCleanup.ok&&captureCleanup.remainingEvents>0&&Date.now()-started<10000){captureCleanup=await this.capture({sessionId:id,op:'drain'});if(captureCleanup.artifactId)artifacts.push(captureCleanup.artifactId);}captureCleanup={...captureCleanup,artifactIds:artifacts,complete:captureCleanup.ok&&captureCleanup.remainingEvents===0};}catch{captureCleanup={complete:false,reason:'capture_cleanup_unconfirmed'};} // Watchdog handles lost ownership.
      }
      let relayCleanup;
      if(s.relayChannel){
        try{if(home&&s.active&&!this.closing){const sent=await s.relayChannel.request('observe',{request:{kind:'shortcut-home'}},10000);s.managedHomePrepared=sent.ok===true;relayCleanup={homeRequested:sent.ok===true,homeVerified:false};}
          else if(!home)relayCleanup={homeRequested:false,homeVerified:false,reason:'intermediate_handoff'};}
        catch{relayCleanup={homeRequested:'unconfirmed',homeVerified:false,replay:false};}
        finally{const closed=await s.relayChannel.close();relayCleanup={...relayCleanup,tunnelClosed:closed?.closed===true};}
        note(home?'home.request_completed':'browser.handoff_released',{provider:'reflected',session:id,outcome:!home?'released':relayCleanup.homeRequested===true?'accepted':'unknown',reason:!home?'intermediate_handoff':undefined,dispatched:relayCleanup.homeRequested===true?true:undefined,verified:false,level:!home||relayCleanup.homeRequested===true?'info':'warn'});
      }
      s.active = false; this.writeOwner(s);
      // Acquisition reserves an empty file before broker admission. Wait for
      // that single result before release, or a disconnect could orphan a lease.
      if (s.acquisition) await s.acquisition.catch(() => {});
      let release = {ok: true, value: {alreadyInactive: true}};
      if (fs.existsSync(s.lease)) release = await this.run('cli', ['release', '--lease-file', s.lease], undefined, 20000);
      if((s.nativeHomePrepared||s.managedHomePrepared)&&!release.ok){
        const current=await this.status().catch(()=>null);
        if(current&&current.lease===null)release={ok:true,value:{alreadyRetired:true,reason:'native_home_handoff',homeVerified:false}};
      }
      if(systemCleanup&&s.systemFingerprint&&!systemCleanup.retained){
        const receipt={gate:'system-idle',status:systemCleanup.runnerStopped===true&&release.ok?'passed':'failed',observation:{runnerStopped:systemCleanup.runnerStopped===true,ownerReleased:release.ok,...(typeof s.systemHomeConfirmed==='boolean'?{homeConfirmed:s.systemHomeConfirmed}:{})}};
        systemCleanup.learningEvidence=await this.learning('observe',{receipt,source:s.systemFingerprint}).catch(()=>({available:false}));
      }
      this.sessions.delete(id);
      this.captures.delete(id);
      note('lease.release_completed',{session:id,surface:s.surface,outcome:release.ok?'released':'unknown',reason:release.ok?systemCleanup?.retained?'runner_retained':systemCleanup&&!systemCleanup.runnerStopped?'runner_cleanup_unconfirmed':undefined:reasonCode(release.error),released:release.ok,verified:systemCleanup&&!systemCleanup.retained?systemCleanup.runnerStopped===true:undefined,level:release.ok?'info':'warn'});
      return {released: release.ok,...(relayCleanup?{relayCleanup}:{}),...(systemCleanup?{systemCleanup,ok:systemCleanup.ok}:{}),...(captureCleanup?{captureCleanup}:{}), detail: release.ok ? safe(release.value) : release.error,
        next: systemCleanup?.retained?'Input lease released; explicitly reserved XCTest remains. End its reservation to remove Apple automation.':'Call ios_verify gate=idle without a session to confirm native and host cleanup.'};
    })();
    return s.endPromise;
  }
  async cancel() {
    if(this.sessions.size||this.waitControllers.size)note('connection.cancel_requested',{count:this.sessions.size,outcome:'cleanup_requested',level:'warn'});
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
