#!/usr/bin/env node
// Witness only this diagnostic Stop event. An adjacent MCP call still needs its
// independent native export artifact. No hook output, sends or permission grant.
import {constants,openSync,closeSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join,dirname,resolve} from 'node:path'
import {homedir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {ownedBytes,bytesHash} from '../lib/temporary-hooks.mjs'
import {reverseJsonl} from '../lib/state.mjs'

export function eligibleProbeStop(input,d,peer,latest,{ancestor=false,now=Date.now()}={}){
 return !!(ancestor&&d?.schemaVersion===1&&/^[a-f0-9]{32}$/.test(d.token||'')&&d.expiresAt>now&&d.expiresAt<=now+90000&&input?.hook_event_name==='Stop'&&input.stop_hook_active===false&&input.session_id===d.epoch.sessionId?.slice(6)&&input.cwd===d.brokerDir&&peer?.pid===d.epoch.pid&&peer.procStart===d.epoch.procStart&&peer.hostSessionId===d.epoch.sessionId&&peer.sessionId===input.session_id&&peer.entrypoint==='claude-desktop'&&peer.version==='2.1.289'&&!peer.spare&&!peer.parkedJobId&&peer.cwd===d.brokerDir&&d.peer?.msgId===latest?.origin?.msg_id&&latest?.origin?.kind==='peer')
}
function ancestor(epoch){let pid=process.ppid;for(let i=0;i<24&&pid>1;i++){
 let line;try{line=execFileSync('/bin/ps',['-p',String(pid),'-o','ppid=','-o','lstart='],{encoding:'utf8',timeout:500,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()}catch{return false}
 const m=line.match(/^(\d+)\s+(.+)$/);if(!m)return false;if(pid===epoch.pid)return m[2]===epoch.procStart;const parent=Number(m[1]);if(parent===pid)return false;pid=parent
}return false}
async function main(){
 let b=Buffer.alloc(0);for await(const c of process.stdin){b=Buffer.concat([b,c]);if(b.length>65536)return}
 try{
  const input=JSON.parse(b),path=process.argv[2],d=JSON.parse(ownedBytes(path)),dir=dirname(path);d.brokerDir=dir
  if(path!==join(dir,'mechanical-probe.json')||d.observerScript!==fileURLToPath(import.meta.url)||bytesHash(ownedBytes(d.observerScript))!==d.observerHash||bytesHash(ownedBytes(join(dir,'.claude','settings.json')))!==d.settingsHash||bytesHash(ownedBytes(join(dir,'stop-rescue-policy.json')))!==d.policyHash)return
  const peer=JSON.parse(ownedBytes(join(homedir(),'.claude','sessions',String(d.epoch.pid)+'.json'))),journal=join(homedir(),'.claude','projects',resolve(dir).replace(/[^A-Za-z0-9]/g,'-'),d.epoch.sessionId.slice(6)+'.jsonl')
  let latest,count=0;for(const row of reverseJsonl(journal)){if(++count>128)return;if(row.type==='user'&&!row.isSidechain&&!(Array.isArray(row.message?.content)&&row.message.content.every(b=>b?.type==='tool_result'))){latest=row;break}}
  if(!eligibleProbeStop(input,d,peer,latest,{ancestor:ancestor(d.epoch)}))return
  let fd;try{fd=openSync(d.receiptPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify({scope:'native-stop-hook-witness',token:d.token,at:Date.now(),epoch:d.epoch,msgId:d.peer.msgId,userUuid:latest.uuid,observerHash:d.observerHash,settingsHash:d.settingsHash,nativeResultVerified:false}))}finally{if(fd!==undefined)closeSync(fd)}
 }catch{}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
