import {mkdirSync,lstatSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
export function claimNativeHarnessAttempt(dir,{harness,session,serviceId,target,contractFile,mode='direct'}){
 if(!['direct','current','metadata-config','metadata-enrolled'].includes(mode))throw Error('native harness claim mode')
 if(!['claude','codex'].includes(harness)||!/^local_[a-f0-9-]{36}$/.test(session||'')||!/^local_[a-f0-9-]{36}$/.test(target||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||typeof contractFile!=='string'||!contractFile.startsWith('/'))throw Error('native harness claim identity')
 mkdirSync(dir,{recursive:true,mode:0o700});const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())throw Error('native harness claim directory')
 const file=join(dir,[harness,session,serviceId,target,...mode!=='direct'?[mode]:[]].join('-')+'.json')
 try{writeFileSync(file,JSON.stringify({schemaVersion:1,harness,session,serviceId,target,contractFile,...mode!=='direct'?{mode}:{},at:Date.now()})+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code==='EEXIST')throw Error('native harness identity already claimed; inspect original contract and job, never replay with a new identity');throw e}
 return file
}
