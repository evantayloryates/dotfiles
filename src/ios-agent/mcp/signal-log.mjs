/** Compact, private host signals. This module never writes to stdout. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

const context = new AsyncLocalStorage();
// Process configuration only; never supplied through readSignals tool arguments.
const ROOT = process.env.IOS_AGENT_SIGNAL_STATE_DIR || path.join(os.homedir(), 'Library/Application Support/ios-agent');
const DIR = path.join(ROOT, 'signals');
const FILE_BYTES = 128 * 1024, TOTAL_BYTES = 2 * 1024 * 1024, MAX_FILES = 256;
const MAX_AGE = 7 * 86400 * 1000, ROTATE_AGE = 86400 * 1000;
const ids = new Set(['traceId','requestId','sessionId','ownerId','pageId','buildId','bootId','epoch','backendEpoch','clientEpoch','sourceHash','leaseFingerprint','sourceStream','documentId','observedDocumentId','frameLoaderId']);
const aliases = {operation:'op',document:'documentId',observedDocument:'observedDocumentId',frameLoader:'frameLoaderId',receiverFailure:'errorCode',windowMs:'durationMs',droppedEvents:'dropCount',trace:'traceId',request:'requestId',session:'sessionId',owner:'ownerId',page:'pageId',build:'buildId',boot:'bootId',source:'stage',sourceStreamId:'sourceStream',sourceBootId:'bootId',attempts:'attemptCount',routeName:'route',previousRouteName:'previousRoute',operationName:'op',errorCount:'count'};
const words = new Set(['tool','action','op','kind','surface','transport','provider','strategy','stage','phase','state','fromState','toState','outcome','reason','code','version','errorName','errorCode','route','previousRoute']);
const numeric = new Set(['durationMs','count','participants','sent','received','drops','gaps','attemptCount','retryCount','acceptedCount','failedCount','frameCount','signalCount','dropCount','droppedCount','truncatedCount','sourceAtMs','sourceSeq','bytes','domainCount','eventCount','cleanupFailures','nodeCount','edgeCount','workerCount','workersInitialized']);
const booleans = new Set(['dispatched','inputSent','verified','released','ready','truncated','present','enabled','muted','visible','pauseObserved','resumeConfirmed','breakpointRemoved','terminated']);
const scopes = new Set(['mcp','browser','host','native','kck-native','kck-web','kck-call']);
const levels = new Set(['info','warn','error']);
let current, writes = 0;

function safeDir() {
  if (!path.isAbsolute(ROOT)) return false;
  try {
    if (fs.lstatSync(ROOT).isSymbolicLink()) return false;
    fs.mkdirSync(DIR, {mode: 0o700});
  } catch (error) { if (error.code !== 'EEXIST') return false; }
  try { const s = fs.lstatSync(DIR); return s.isDirectory() && !s.isSymbolicLink() && (s.mode & 0o077) === 0; }
  catch { return false; }
}
function secret(s) {
  return /(?:bearer\s+|basic\s+|api[_-]?key|password|passwd|secret|token|authorization|cookie|session[_-]?key|sk-[A-Za-z0-9])/i.test(s)
    || /(?:[A-Za-z0-9_-]{16,}\.){2}[A-Za-z0-9_-]{16,}/.test(s)
    || /(?:data:[^,\s]+;base64,|[A-Za-z0-9+/]{64,}={0,2})/.test(s);
}
function scrub(s, max = 160) {
  if (typeof s !== 'string') return undefined;
  if (secret(s)) return '[redacted]';
  s = s.replace(/(?:https?:\/\/|wss?:\/\/)[^\s)\]]+/gi, '[url]')
    .replace(/(?:[?&][A-Za-z0-9_-]+=[^\s&#]*)+/g, '[query]')
    .replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').trim();
  return s.length > max ? s.slice(0,max-13)+'…'+s.slice(-12) : s;
}
function safeId(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{1,96}$/.test(v)) return undefined;
  if (/^[a-f0-9]{64}$/.test(v) && v.length === 64) return v;
  if (secret(v)) return undefined;
  // Opaque 48+ character values can be credentials, even in an ID field.
  if (v.length >= 48 && !/^[a-f0-9]{64}$/.test(v)) return '[redacted]';
  return v;
}
function urlTemplate(v) {
  if (typeof v !== 'string' || v.length > 2048) return undefined;
  if (/^(relative|loopback|private|public):\/[A-Za-z0-9_:/-]{0,110}$/.test(v)) return v;
  try {
    const u = new URL(v, 'http://relative.invalid');
    const origin = u.hostname === 'relative.invalid' ? 'relative' : /^(localhost|127\.|\[::1\])/.test(u.hostname) ? 'loopback'
      : /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(u.hostname) ? 'private' : 'public';
    const segments = u.pathname.split('/').slice(0, 7).map(p => /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(p) ? p : p ? ':id' : '');
    return `${origin}:${segments.join('/').slice(0, 100)}`;
  } catch { return '[url]'; }
}
function clean(fields) {
  const out = {};
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return out;
  for (const [rawKey, value] of Object.entries(fields)) {
    const key=aliases[rawKey] || rawKey;
    if (rawKey === 'lease' || rawKey === 'leaseId') {
      if (typeof value === 'string' && value.length > 0 && value.length <= 256) out.leaseFingerprint=createHash('sha256').update(value).digest('hex').slice(0,12);
      continue;
    }
    if (key === 'leaseFingerprint') {
      if (typeof value === 'string' && /^[a-f0-9]{12}$/.test(value)) out[key]=value;
      continue;
    }
    if (key === 'statusCode') {
      if (Number.isInteger(value) && value >= 100 && value <= 599) out[key]=value;
      continue;
    }
    if (ids.has(key)) { const v = safeId(value); if (v !== undefined) out[key] = v; }
    else if (words.has(key)) { const v = ['reason','code','errorCode'].includes(key)&&['xctest_authorization_failed','xctest_authorization_timed_out'].includes(value)?value:scrub(value, 80); if (v) out[key] = v; }
    else if (numeric.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = Math.min(value, 1e15);
    else if (booleans.has(key) && typeof value === 'boolean') out[key] = value;
    else if (key === 'message' || key === 'detail') { const v = scrub(value, 160); if (v) out[key] = v; }
    else if (key === 'stack') { const v = scrub(value, 240); if (v) out[key] = v; }
    else if (key === 'url') { const v = urlTemplate(value); if (v) out.url = v; }
  }
  return out;
}
function files() {
  if (!safeDir()) return [];
  return fs.readdirSync(DIR).filter(n => /^signal-[a-f0-9]{16}-\d+\.jsonl$/.test(n)).map(name => {
    try {
      const file = path.join(DIR, name), s = fs.lstatSync(file);
      return s.isFile() && !s.isSymbolicLink() && (s.mode & 0o077) === 0 ? {name,file,size:s.size,mtime:s.mtimeMs} : null;
    } catch { return null; }
  }).filter(Boolean).sort((a,b) => a.mtime-b.mtime || a.name.localeCompare(b.name));
}
function prune() {
  try {
    const now = Date.now(), all = files(); let bytes = all.reduce((n,f)=>n+f.size,0), count=all.length;
    for (const f of all) {
      if (now-f.mtime <= MAX_AGE && bytes <= TOTAL_BYTES && count <= MAX_FILES) break;
      if (f.file === current?.file && now-f.mtime <= MAX_AGE) continue;
      if (f.file === current?.file) current=null;
      fs.unlinkSync(f.file); bytes -= f.size; count--;
    }
  } catch { /* Logging must not affect control. */ }
}
function target(bytes) {
  const now = Date.now();
  if (current && now-current.started < ROTATE_AGE && current.size+bytes <= FILE_BYTES) {
    try {const s=fs.lstatSync(current.file);if(s.isFile()&&!s.isSymbolicLink()&&!(s.mode&0o077))return current.file;} catch {}
    current=null; // Another process may have pruned this writer's idle file.
  }
  const name = `signal-${randomBytes(8).toString('hex')}-${now}.jsonl`;
  const file = path.join(DIR, name);
  const fd = fs.openSync(file, fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW, 0o600);
  fs.closeSync(fd); current = {file,size:0,started:now}; prune(); return file;
}
export function withSignalContext(value, fn) {
  let prepared;
  try { prepared = {...inherited(), ...context.getStore(), ...clean(value)}; }
  catch { prepared = context.getStore() || {}; }
  // Do not catch around run: a handler exception must propagate without replay.
  return context.run(prepared, fn);
}
export function signalContextEnvironment(base = process.env) {
  return {...base, IOS_AGENT_SIGNAL_CONTEXT: JSON.stringify(clean({...inherited(), ...context.getStore()}))};
}
function inherited() {
  try {
    const raw=process.env.IOS_AGENT_SIGNAL_CONTEXT;
    return raw && raw.length<=1024 ? clean(JSON.parse(raw)) : {};
  } catch { return {}; }
}
export function emitSignal(scope, event, fields = {}) {
  try {
    if (!scopes.has(scope) || typeof event !== 'string' || !/^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/.test(event) || event.length > 64 || !safeDir()) return false;
    const data = {...inherited(), ...clean(context.getStore()), ...clean(fields)};
    const level = levels.has(data.level) ? data.level : levels.has(fields?.level) ? fields.level : 'info';
    delete data.level;
    const row = {v:1,time:new Date().toISOString(),id:randomBytes(8).toString('hex'),scope,event,level,...data};
    let line = JSON.stringify(row)+'\n';
    for (const key of ['stack','detail','message','url','route','previousRoute','sourceHash','backendEpoch','clientEpoch','buildId','ownerId','pageId','bootId','version','provider','transport','surface','stage','phase']) {
      if (Buffer.byteLength(line)<=1200) break;
      delete row[key]; line=JSON.stringify(row)+'\n';
    }
    if (Buffer.byteLength(line)>1200) return false;
    const file = target(Buffer.byteLength(line));
    const fd = fs.openSync(file, fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);
    try { fs.writeSync(fd,line); } finally { fs.closeSync(fd); }
    current.size += Buffer.byteLength(line);
    if (++writes % 32 === 0) prune();
    return true;
  } catch { current=null; return false; }
}
function display(v, key) {
  let s=String(v);
  if (ids.has(key) && s.length > 20 && s !== '[redacted]') s=s.slice(0,8)+'…'+s.slice(-6);
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}
function cursorKey(row) { return `${row.time}|${row.id}`; }
function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 160 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { const s=Buffer.from(value,'base64url').toString('utf8'); return /^\d{4}-\d\d-\d\dT[^|]{10,30}\|[a-f0-9]{16}$/.test(s) ? s : null; } catch { return null; }
}
function eventLabel(row) {
  const prefix=row.scope.startsWith('kck-')?row.scope.replace('-', '.') : row.scope;
  return row.event.startsWith(prefix+'.')?row.event:row.scope+'.'+row.event;
}
function summarize(rows,maxBytes) {
  const counts=key=>Object.fromEntries([...rows.reduce((m,r)=>{const k=r[key]||'none';m.set(k,(m.get(k)||0)+1);return m;},new Map())].sort((a,b)=>b[1]-a[1]).slice(0,12));
  const bad=rows.filter(r=>r.level!=='info'||['failed','rejected','unknown','not_executed','refused'].includes(r.outcome));
  const commands=rows.filter(r=>r.event==='browser.command.terminal');
  const mcp=rows.filter(r=>r.scope==='mcp'&&r.event==='request.admitted');
  const summary={retainedRecords:rows.length,from:rows.at(-1)?.time||null,to:rows[0]?.time||null,
    levels:counts('level'),scopes:counts('scope'),outcomes:counts('outcome'),
    browserCommands:commands.length,uncorrelatedBrowserCommands:commands.filter(r=>!r.traceId).length,
    admittedMcpRequests:mcp.length,notableRecords:bad.length};
  const lines=[`Retained signals=${rows.length} from=${summary.from||'none'} to=${summary.to||'none'}`,
    `levels ${Object.entries(summary.levels).map(([k,v])=>k+'='+v).join(' ')}; browserCommands=${commands.length} withoutTrace=${summary.uncorrelatedBrowserCommands}; admittedMcp=${mcp.length}`,
    'Counts describe retained records, not unique operations; missing traces do not prove non-execution.'];
  const events=[...rows.reduce((m,r)=>{const k=eventLabel(r);m.set(k,(m.get(k)||0)+1);return m;},new Map())].sort((a,b)=>b[1]-a[1]).slice(0,12);
  lines.push('events '+events.map(([k,v])=>k+'='+v).join(' '));
  for(const r of bad.slice(0,8))lines.push(`${r.time} ${eventLabel(r)} outcome=${r.outcome||r.level}${r.reason?' reason='+display(r.reason,'reason'):''}${r.traceId?' trace='+display(r.traceId,'traceId'):''}`);
  let text=lines.join('\n'),truncated=false;
  if(Buffer.byteLength(text)>maxBytes){const chars=Array.from(text);while(chars.length&&Buffer.byteLength(chars.join('')+' …')>maxBytes)chars.pop();text=chars.join('')+' …';truncated=true;}
  return {text,count:rows.length,nextCursor:null,truncated,summary};
}
export function readSignals(options = {}) {
  try {
    const limit=Math.max(1,Math.min(100,Number.isInteger(options.limit)?options.limit:40));
    const maxBytes=Math.max(256,Math.min(24000,Number.isInteger(options.maxBytes)?options.maxBytes:12000));
    const after=options.after ?? options.cursor;
    const cursor=decodeCursor(after);
    if (after && !cursor) return {text:'invalid cursor',count:0,nextCursor:null,truncated:false};
    prune();
    const selected=files().slice(-MAX_FILES); const rows=[]; let readBytes=0;
    for (const f of selected) {
      if (f.size>FILE_BYTES || readBytes+f.size>TOTAL_BYTES) continue;
      readBytes+=f.size;
      let body;
      try {
        const fd=fs.openSync(f.file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
        try { if (fs.fstatSync(fd).size>FILE_BYTES) continue; body=fs.readFileSync(fd,'utf8'); }
        finally { fs.closeSync(fd); }
      } catch { continue; }
      for (const line of body.split('\n')) {
        if (!line || line.length>1200) continue;
        try {
          const r=JSON.parse(line);
          if (r.v!==1 || !scopes.has(r.scope) || !levels.has(r.level) || typeof r.event!=='string' || r.event.length>64 || !/^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/.test(r.event) || typeof r.time!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.time) || !/^[a-f0-9]{16}$/.test(r.id)) continue;
          if (cursor && cursorKey(r)>=cursor) continue;
          if (options.scope && r.scope!==options.scope || options.level && r.level!==options.level || options.event && !r.event.startsWith(options.event) || options.tool && r.tool!==options.tool) continue;
          if (options.sessionId && r.sessionId!==options.sessionId || options.traceId && r.traceId!==options.traceId) continue;
          if (options.since && r.time < options.since) continue;
          rows.push({...r, ...clean(r)});
        } catch { /* Ignore torn or malformed rows. */ }
      }
    }
    rows.sort((a,b)=>cursorKey(b).localeCompare(cursorKey(a)));
    if(options.view==='summary')return summarize(rows,maxBytes);
    const lines=[]; let bytes=0, taken=0;
    for (const r of rows) {
      if (taken>=limit) break;
      const shown=[r.time,eventLabel(r),`level=${r.level}`];
      const cleaned=clean(r), priority=['tool','action','op','outcome','reason','code','statusCode','durationMs','verified','released','ready','traceId','sessionId','pageId','sourceAtMs','sourceSeq'];
      for (const key of new Set([...priority,...Object.keys(cleaned)])) {
        if (!(key in cleaned)||(key==='requestId'&&cleaned.requestId===cleaned.traceId)) continue;
        shown.push(`${key}=${display(cleaned[key],key)}`);
      }
      const full=shown.join(' '), cap=r.level==='error'?1000:600;
      let line=full.length>cap?full.slice(0,cap-2)+' …':full;
      // A small requested page must still make progress over a long error row.
      // Bound UTF-8 bytes, not only JS code units, and mark trimmed read views.
      if (!taken && Buffer.byteLength(line)+1>maxBytes) {
        const chars=Array.from(line);
        while (chars.length&&Buffer.byteLength(chars.join('')+' …')+1>maxBytes) chars.pop();
        line=chars.join('')+' …';
      }
      if (bytes+Buffer.byteLength(line)+1>maxBytes) break;
      lines.push(line); bytes+=Buffer.byteLength(line)+1; taken++;
    }
    const last=rows[taken-1], truncated=taken<rows.length;
    return {text:lines.join('\n'),count:taken,nextCursor:truncated&&last?Buffer.from(cursorKey(last)).toString('base64url'):null,truncated};
  } catch { return {text:'signals unavailable',count:0,nextCursor:null,truncated:false}; }
}
