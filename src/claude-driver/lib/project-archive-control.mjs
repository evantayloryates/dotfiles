import {createHash} from 'node:crypto'
import {join,resolve,sep} from 'node:path'
import {existsSync,realpathSync,writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {brokerInfo} from './broker.mjs'
import {sessionManagementController,readSessionManagementEnrollment} from './session-management-controller.mjs'
import {readStandbyEnrollment} from './standby-enrollment.mjs'
import {ordinarySessionBinding,ordinarySessionsSameStore} from './ordinary-session-control.mjs'
const canonical=p=>existsSync(p)?realpathSync(p):resolve(p)
const within=(path,parent)=>typeof path==='string'&&(resolve(path)===resolve(parent)||resolve(path).startsWith(resolve(parent)+sep))
import {DriverError} from './paths.mjs'
export function projectArchiveSelection(records,protectedIds){
 const protectedSet=new Set(protectedIds.filter(Boolean))
 return {targets:records.filter(r=>!protectedSet.has(r.sessionId)),excluded:records.filter(r=>protectedSet.has(r.sessionId)).map(r=>({sessionId:r.sessionId,reason:'caller or configured service actor'}))}
}
export function requireCompleteProjectArchive(targets,archived){
 const done=new Set(archived),pending=targets.filter(id=>!done.has(id))
 if(pending.length||done.size!==targets.length||new Set(targets).size!==targets.length)throw new DriverError('project archive is incomplete; folder cleanup refused',{category:'outcome_unknown',detail:{archived,notArchived:pending,folderDeleted:false,retrySafe:false}})
}

export function projectArchiveContexts(ids,jobId){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!Array.isArray(ids)||ids.length<1||ids.length>128||new Set(ids).size!==ids.length||ids.some(id=>!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)))throw new DriverError('project archive requires a bounded unique durable target set',{category:'bad_args'})
 return ids.map(sessionId=>({sessionId,contextId:'j'+createHash('sha256').update('project-archive:'+jobId+':'+sessionId).digest('hex').slice(0,32)}))
}
export async function runProjectArchiveBatch(entries,d){
 await d.preflight(entries)
 const results=[]
 for(const entry of entries){await d.guard(entry);await d.record('before-archive',entry,results);const result=await d.archive(entry);results.push({sessionId:entry.sessionId,contextId:entry.contextId,result});await d.record('after-archive',entry,results);if(result?.alreadyArchived!==true&&(result?.verified!==true||result.receiptVerified!==true||result.archived!==true))throw Error('project archive receipt unverified');await d.verify(entry)}
 await d.final(entries);return results
}
export async function routeProjectArchiveBatch(targets,folder,ctx){
 const controller=sessionManagementController(targets[0]?.sessionId),entries=projectArchiveContexts(targets.map(r=>r.sessionId),ctx.jobId).map(e=>({...e,binding:ordinarySessionBinding(getRecord(e.sessionId),controller)})),file=join(ensureDir(join(STATE_DIR,'project-archive-routes')),ctx.jobId+'.json'),ledger={schemaVersion:1,jobId:ctx.jobId,controller,folder,entries,phase:'prepared',at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 const guard=async entry=>{const r=getRecord(entry.sessionId),enrollment=readSessionManagementEnrollment(),pair=enrollment&&readStandbyEnrollment(enrollment.controllerSession);if(ctx.signal?.aborted||enrollment?.controllerSession!==controller||[callerHostSession(),brokerInfo().sessionId,controller,pair?.standby?.sessionId].includes(entry.sessionId)||!ordinarySessionsSameStore(r,getRecord(controller),controller)||JSON.stringify(ordinarySessionBinding(r,controller))!==JSON.stringify(entry.binding)||!within(r.cwd,folder)&&!within(r.originCwd,folder))throw Error('project target identity, folder or service ownership changed')}
 const verify=async entry=>{await guard(entry);if(getRecord(entry.sessionId).isArchived!==true)throw Error('project saved archive mismatch');ledger.verifiedArchived=[...new Set([...(ledger.verifiedArchived??[]),entry.sessionId])];writeJsonAtomic(file,ledger)}
 const record=(phase,entry,results)=>{ledger.phase=phase;ledger.currentSession=entry.sessionId;ledger.results=results;writeJsonAtomic(file,ledger)}
 try{const results=await runProjectArchiveBatch(entries,{preflight:async list=>{for(const entry of list)await guard(entry)},guard,record,verify,archive:async entry=>{const {runOp}=await import('./driver.mjs');return runOp('archive_session',{session:entry.sessionId,reason:'claude-driver project archive'},{...ctx,jobId:entry.contextId})},final:async list=>{for(const entry of list)await verify(entry)}});ledger.phase='completed';ledger.results=results;writeJsonAtomic(file,ledger);return {results,routeFile:file}}
 catch(error){ledger.phase='unresolved';ledger.failure={category:error.category??'project_archive_unresolved',at:Date.now()};writeJsonAtomic(file,ledger);throw new DriverError('project archive stopped; reconcile original per-session requests before continuing',{category:'project_archive_unresolved',detail:{folder,routeFile:file,targets:entries.map(e=>({sessionId:e.sessionId,contextId:e.contextId})),previouslyVerifiedArchived:ledger.verifiedArchived??[],folderDeleted:false,retrySafe:false}})}
}
export function requireProjectCleanupScope(folder,protectedDirectories){
 const parent=canonical(folder)
 if(protectedDirectories.filter(Boolean).some(dir=>within(canonical(dir),parent)))throw new DriverError('folder cleanup contains a retained service directory; archive selection does not authorize service removal',{category:'gate_project',detail:{folder,folderDeleted:false}})
}
export function requireProjectCleanupInventory(folder,records){
 const parent=canonical(folder),inside=path=>typeof path==='string'&&within(canonical(path),parent),pending=records.filter(r=>r.isArchived!==true&&(inside(r.cwd)||inside(r.originCwd))).map(r=>r.sessionId)
 if(pending.length)throw new DriverError('folder cleanup refused: current session inventory is not fully archived',{category:'outcome_unknown',detail:{folder,notArchived:pending,folderDeleted:false,retrySafe:false}})
}
export function validateProjectArchiveJobArgs(args){
 if(args?.dry_run!==false||args.delete_folder===true||args.via_broker!==undefined)throw new DriverError('durable project jobs are archive-only: explicit dry_run:false, no folder deletion or alternate route',{category:'bad_args',detail:{dispatched:false}})
}
export function freezeProjectArchivePlan(plan,dependencies={}){
 const enrollment=dependencies.enrollment??readSessionManagementEnrollment(),record=dependencies.record??getRecord
 if(plan?.wouldProceed!==true||!enrollment?.controllerSession||!Array.isArray(plan.sessions)||plan.sessions.length>128||new Set(plan.sessions.map(r=>r.sessionId)).size!==plan.sessions.length)throw new DriverError('project job requires an allowed bounded dry-run plan and independent controller',{category:'gate_project',detail:{dispatched:false}})
 const controller=enrollment.controllerSession,c=record(controller),bindings=plan.sessions.map(row=>{const r=record(row.sessionId);if(!ordinarySessionsSameStore(r,c,controller))throw new DriverError('project submission account scope unqualified',{category:'gate_project',detail:{dispatched:false}});return ordinarySessionBinding(r,controller)}).sort((a,b)=>a.sessionId.localeCompare(b.sessionId))
 return {version:1,folder:plan.folder,controllerSession:controller,bindings,excluded:(plan.excluded??[]).map(r=>r.sessionId).sort()}
}
export function verifyProjectArchiveSnapshot(snapshot,plan,dependencies){
 let current;try{current=freezeProjectArchivePlan({...plan,wouldProceed:true},dependencies)}catch{throw new DriverError('project job scope changed before effects',{category:'project_scope_changed',detail:{dispatched:false,retrySafe:false}})}
 if(JSON.stringify(snapshot)!==JSON.stringify(current))throw new DriverError('project job no longer matches its submitted folder/account/targets/service exclusions',{category:'project_scope_changed',detail:{dispatched:false,retrySafe:false}})
}
