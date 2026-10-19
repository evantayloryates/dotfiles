// Fixed adapter-protocol diagnostics. Never return exception text or tool data.
// This helper is staged only and is not imported by the installed probe.
function diagnosticFailure(error) {
 let text=''
 try { if(typeof error?.message==='string')text=error.message } catch {}
 if(text.includes('$.mcp.call: no connected MCP tool'))return 'mcp-tool-unavailable'
 if(text.includes('$.tool.call: no tool named'))return 'tool-hidden-or-unavailable'
 if(text.includes('produced no result'))return 'tool-pipeline-no-result'
 if(text.includes('$.mcp.call(')&&text.includes(') refused:')) {
  if(text.includes('Native broker operation lacks one live matching epoch-bound dispatch checkpoint'))return 'broker-dispatch-gate-refusal'
  return 'tool-permission-refusal'
 }
 return 'unidentified-exception'
}

// Staged only. Calling the ordinary get_session without a dispatch checkpoint
// should be refused by the existing broker PreToolUse gate. A successful read
// is safe but would leave that gate path unqualified. Never return raw metadata.
const BROKER='local_35b3ba48-f02e-48de-bfbb-925192d90de1'
const CWD='/Users/taylor/.local/state/claude-driver/broker'
const FIXTURE='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14'
const PROBE_ID='94701894-fc71-4dfa-943e-f5a1cc3fc8b8'
const VERSION='0.3.0'
const INTENT=CWD+'/.native-mod-diagnostic-'+PROBE_ID+'.started.json'
const REPORT='/Users/taylor/Desktop/temp_reports/native-mod-diagnostic-'+PROBE_ID+'.report.json'
// One attempt in this loaded module. The durable intent also refuses a later
// reload after an incomplete attempt. fs.write is not an exclusive/atomic API;
// this is NOT a general cross-process admission or idempotency mechanism.
let attempted=false
async function owned($){
 const id=await $.session.id(),cwd=await $.session.cwd()
 return (id===BROKER||id===BROKER.slice(6))&&cwd===CWD
}
export function register(on){
 on('session.start',async($,e,next)=>{
  if(await owned($))await $.command.register({name:'claude-driver-native-read-diagnostic',description:'Read-only native gate probe; no model turn'})
  return next(e)
 })
 on('command.run',{command:'claude-driver-native-read-diagnostic'},async($,e)=>{
  if(!await owned($))return {text:'claude-driver native probe refused: wrong session or directory'}
  if(e?.args)return {text:'claude-driver native probe refused: command takes no arguments'}
  if(attempted)return {text:'claude-driver native probe refused: this module already attempted the probe'}
  attempted=true
  let startedAt
  try{
   if(await $.fs.exists(INTENT)||await $.fs.exists(REPORT))return {text:'claude-driver native probe refused: prior attempt requires independent review'}
   const now=await $.clock.now()
   if(!Number.isFinite(now))throw Error('invalid clock')
   startedAt=new Date(now).toISOString()
   await $.fs.write(INTENT,JSON.stringify({schemaVersion:1,scope:'owned-native-mod-read-diagnostic-intent',probeId:PROBE_ID,pluginVersion:VERSION,brokerSession:BROKER,targetSession:FIXTURE,startedAt,complete:false,gateQualified:false,releaseAuthorized:false})+'\n')
  }catch{
   return {text:'claude-driver native probe refused: evidence preflight unavailable; no native call requested'}
  }
  const evidence={schemaVersion:1,scope:'owned-native-mod-read-diagnostic',probeId:PROBE_ID,pluginVersion:VERSION,brokerSession:BROKER,brokerCwd:CWD,targetSession:FIXTURE,startedAt,complete:true,nativeCallReturned:false,resultWasError:null,gateQualified:false,releaseAuthorized:false,modelCallsRequested:0,nativeModelTurnsQualified:false,failureCategory:null}
  try{
   const result=await $.mcp.call({server:'ccd_session_mgmt',tool:'get_session',args:{session_id:FIXTURE}})
   evidence.nativeCallReturned=true
   evidence.resultWasError=typeof result?.isError==='boolean'?result.isError:null
  }catch(error){
   evidence.failureCategory=diagnosticFailure(error)
   // An exception alone cannot identify the gate: require independent native
   // hook denial evidence, exact PID/start and the original command ancestry.
  }
  try{
   const now=await $.clock.now()
   if(Number.isFinite(now))evidence.completedAt=new Date(now).toISOString()
  }catch{}
  let reportWritten=false
  try{await $.fs.write(REPORT,JSON.stringify(evidence)+'\n');reportWritten=true}catch{}
  // Never include result content, exception strings, transcript or environment.
  // A failed write does not retry the native read; the intent remains pending.
  return {text:JSON.stringify({...evidence,reportWritten,reportFile:REPORT})}
 })
}
