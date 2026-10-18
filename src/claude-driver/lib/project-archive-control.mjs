import {DriverError} from './paths.mjs'
export function projectArchiveSelection(records,protectedIds){
 const protectedSet=new Set(protectedIds.filter(Boolean))
 return {targets:records.filter(r=>!protectedSet.has(r.sessionId)),excluded:records.filter(r=>protectedSet.has(r.sessionId)).map(r=>({sessionId:r.sessionId,reason:'caller or configured service actor'}))}
}
export function requireCompleteProjectArchive(targets,archived){
 const done=new Set(archived),pending=targets.filter(id=>!done.has(id))
 if(pending.length||done.size!==targets.length||new Set(targets).size!==targets.length)throw new DriverError('project archive is incomplete; folder cleanup refused',{category:'outcome_unknown',detail:{archived,notArchived:pending,folderDeleted:false,retrySafe:false}})
}
