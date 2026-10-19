// Declaration evidence only. Never executes a lifecycle operation or treats a
// tool description as proof that a process exited.
export function inspectNativeLifecycleSurface(engine,mcp){
 const start=engine.indexOf('      session: {'),end=engine.indexOf('\n      };',start)
 if(start<0||end<=start||end-start>32768)throw Error('session declaration boundary changed')
 const methods=[...engine.slice(start,end).matchAll(/^ {10}(\w+):/gm)].map(x=>x[1])
 if(!methods.includes('id')||!methods.includes('send')||!methods.includes('identity'))throw Error('session declaration incomplete')
 const tools={}
 for(const [name,fields]of Object.entries({stop_session:['session_id'],archive_session:['session_id','reason','_consent'],delete_session:['session_ids','force_worktree_cleanup','reason','_consent'],unarchive_session:['session_id']})){
  const marker='    mcp__ccd_session_mgmt__'+name+': {',at=mcp.indexOf(marker),stop=mcp.indexOf('\n    }',at),doc=mcp.lastIndexOf('    /**',at)
  if(at<0||mcp.indexOf(marker,at+1)!==-1||stop<=at||doc<0||at-doc>8192)throw Error('lifecycle declaration changed: '+name)
  const input=mcp.slice(at,stop),description=mcp.slice(doc,at),actual=[...input.matchAll(/^ {6}(\w+)\??:/gm)].map(x=>x[1])
  if(actual.join(',')!==fields.join(','))throw Error('lifecycle input changed: '+name)
  tools[name]={fields:actual,description}
 }
 if(!tools.stop_session.description.includes('session stays open and idle afterwards')||!tools.archive_session.description.includes("Archiving stops the session's process")||!tools.archive_session.description.includes('side sessions')||!tools.archive_session.description.includes('cleans up its worktree')||!tools.delete_session.description.includes('in every permission mode')||!tools.delete_session.description.includes('approval card')||!tools.unarchive_session.description.includes('conversation is intact'))throw Error('lifecycle semantics declaration changed')
 return {sessionMethods:methods,directProcessExitDeclared:methods.some(n=>['exit','close','dispose','stop','archive'].includes(n)),stopIsTurnOnly:true,archiveDeclaresProcessStop:true,archiveMayAffectRelatedSessionsAndWorktree:true,deleteAlwaysRequiresHumanCard:true,unarchivePreservesConversation:true,toolInputs:Object.fromEntries(Object.entries(tools).map(([name,t])=>[name,t.fields])),nativeCalls:0,physicalExitQualified:false,recoveryQualified:false}
}
