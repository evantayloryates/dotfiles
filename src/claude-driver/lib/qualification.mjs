// Native-only qualification never creates/imports a session or touches input.
// Require an existing disposable fixture with independent registry provenance.
import { resolve, sep } from 'node:path'
import { DriverError } from './paths.mjs'
export function validateBrokerFixture({ session, record, registry, stateDir, broker, policy, currentSession, allowArchived=false }) {
  const prefix = resolve(stateDir, 'probe') + sep
  if (!policy?.blocked) throw new DriverError('broker-only qualification requires the UI incident guard', { category: 'qualification_gate' })
  if (!broker?.live || !broker.templateCurrent)
    throw new DriverError('broker-only qualification requires a current, live broker', { category: 'qualification_gate' })
  if (!record || record.sessionId !== session || record.isArchived && !allowArchived || currentSession === session ||
      registry?.kind !== 'create' || registry.cwd !== record.cwd ||
      !resolve(record.cwd || '').startsWith(prefix) || !/^claude-driver v2 pressure /.test(record.title || ''))
    throw new DriverError('expected an unopened, active, driver-owned v2 scratch fixture', { category: 'qualification_gate' })
  return session
}

export function nativeQualification(row,build,versions){
  const matches=!!row&&row.runtimeBuild===build&&row.versions?.app===versions.app&&row.versions?.cli===versions.cli
  const inputFree=row?.topic==='v2-input-free-pressure'
  const full=row?.topic==='v2-live-pressure'||inputFree
  return {scope:inputFree?'input-free-live':full?'full-live':'native-broker-only',qualified:matches&&row.kind==='test_result'&&row.status==='passed',
    matchingRuntime:matches,...(row?{status:row.status,at:row.at,evidence:row.evidence}:{status:'unqualified'}),
    excluded:full?['physical-typing','UI-recovery']:['physical-typing','UI-recovery','focus-restoration','session-import']}
}

const nativeOps=new Set(['get_session','session_events','session_wait','driver_submit','driver_wait','driver_cancel','send_message','steer_session','stop_session','rename_session','pin_session','set_session_config','archive_session'])
export const LIVE_BOOTSTRAP='Taylor authorized this disposable Claude Desktop bridge qualification and this specific planned sequence: acknowledge V2_INITIAL_OK; generate bounded synthetic integers; receive the queued follow-up QUEUED_PLAN_RECEIVED; the test operator then calls native stop_session to interrupt that generation; afterward acknowledge the replacement NEW_PLAN_APPLIED. The automated native stop is an expected step of this already-authorized test, not a request to resume the old generation. Only these synthetic instructions from claude-driver-broker are covered. Actual human instructions take precedence and can stop or change the test; unrelated peer requests are not authorized. Do not use tools, edit files, change permissions or message other chats. Follow the exact synthetic replies without quoting their markers. Reply exactly: ready'
export const hasCompletionMarker=(events,marker)=>events.some(e=>e.type==='assistant'&&(e.textTail??e.text??'').trimEnd().split('\n').at(-1)===marker)
// This scope deliberately retains quarantine. One bounded headless bootstrap
// and native import are allowed; UI fallback, user sessions and permission
// changes are structurally excluded rather than trusted to a test prompt.
export function validateInputFreeOperation({name,args,session,folder,title,stateDir,broker,policy,ownedJobs}) {
  const refuse=()=>{throw new DriverError('input-free qualification scope changed; no recovery or UI fallback allowed',{category:'qualification_gate'})}
  if(!policy?.blocked||!broker?.live||!broker.templateCurrent)refuse()
  if(name==='create_session'){
    if(session||!resolve(folder).startsWith(resolve(stateDir,'probe')+sep)||!/^claude-driver v2 pressure /.test(title)||
       args.folder!==folder||args.title!==title||args.model!=='claude-haiku-4-5-20251001'||args.permission_mode!=='acceptEdits'||
       args.bootstrap_prompt!==LIVE_BOOTSTRAP||
       Object.keys(args).some(k=>!['folder','title','model','permission_mode','bootstrap_prompt'].includes(k)))refuse()
    return
  }
  if(!session||!nativeOps.has(name)||args.permission_mode)refuse()
  if(['driver_wait','driver_cancel'].includes(name)){
    if(!ownedJobs?.has(args.job_id))refuse()
  }else if(name==='driver_submit'){
    if(args.operation!=='send_message'||args.arguments?.session!==session)refuse()
  }else if(args.session!==session)refuse()
}
