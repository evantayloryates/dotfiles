#!/usr/bin/env node
// Execute the installed receiver's framing/auth/session/envelope functions on
// synthetic data. No Claude turns, app IPC, real socket, key or peer record.
import {openSync,readSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {runInNewContext} from 'node:vm'
import {EventEmitter} from 'node:events'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {resolveClaudeBinary,versions} from '../lib/paths.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','peer-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const binary=resolveClaudeBinary(),sources={}
function moduleContaining(needle){
 const fd=openSync(binary,'r');let offset=0,carry=Buffer.alloc(0)
 try{for(;;){const chunk=Buffer.alloc(2*1024*1024),count=readSync(fd,chunk,0,chunk.length,offset);if(!count)break
  const data=Buffer.concat([carry,chunk.subarray(0,count)]),at=data.indexOf(needle)
  if(at>=0){const start=data.lastIndexOf(0,at)+1,end=data.indexOf(0,at);assert.ok(end>start&&end-start<512*1024,'installed module boundary changed');return {offset:offset-carry.length+start,text:data.subarray(start,end).toString('utf8')}}
  offset+=count;carry=data.subarray(Math.max(0,data.length-512*1024))
 }}finally{closeSync(fd)}throw Error('installed source marker missing')
}
const cut=(source,start,end)=>{const i=source.indexOf(start),j=source.indexOf(end,i+start.length);assert.ok(i>=0&&j>i,'installed function schema changed');return source.slice(i,j)}
const rows=[]
try{
 sources.inbox=moduleContaining('function en(e){e.setEncoding("utf8")')
 sources.auth=moduleContaining('function I7o(e,n){if(n===void 0)return;')
 sources.envelope=moduleContaining('function cet(e,n,r,s,t,i,o){')
 sources.constants=moduleContaining('BUt=')
 const inbox=sources.inbox.text,auth=sources.auth.text,envelope=sources.envelope.text
 const receiver=cut(inbox,'function en(e){','function Yds()')
 const guard=cut(inbox,'function Ie(e){','async function ze(')
 const authFunctions=cut(auth,'function P7o(e){','function r4()')
 const format=cut(envelope,'function V(e,n,r,s,t,i){','var Rkn=')
 const formatter=cut(envelope,'function cet(e,n,r,s,t,i,o){','function _(')
 const parser=cut(envelope,'function _(e){','function ')
 const capExpression=sources.constants.text.match(/\bBUt=([0-9e*]+)/)?.[1];assert.ok(capExpression)
 const lineCap=runInNewContext(capExpression,{}, {timeout:1000});assert.equal(lineCap,1048576)
 const sid='00000000-0000-4000-8000-000000000001',token='a'.repeat(32)
 class Socket extends EventEmitter{setEncoding(){}destroy(){this.destroyed=true;this.emit('close')}end(){this.ended=true}}
 const make=required=>{
  const state={firstLineDeadlineMs:1000,authRequired:required,activeTokens:{peerToken:token,childToken:'b'.repeat(32)}},seen=[],timers=[]
  const context={u:()=>state,process:{pid:2},setTimeout:fn=>{const t={fn,active:true,unref(){}};timers.push(t);return t},clearTimeout:t=>t.active=false,
   t:()=>{},p:()=>{},m:()=>{},y:()=>{},P_r:()=>false,Lhn:()=>undefined,fet:()=>undefined,w7r:()=>undefined,
   J:'auth',kL:(a,b)=>typeof a==='string'&&a===b,le:x=>x&&typeof x==='object'&&typeof x.type==='string',Rm:String,p2:String,Zo:JSON.parse,BUt:lineCap,q:()=>sid,
   Qe:(frame,pid,epoch,ancestor,authKind)=>{if(api.Ie(frame))seen.push({frame,authKind})}}
  const api=runInNewContext(`(()=>{${authFunctions}${guard}${receiver};return {en,Ie}})()`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  const socket=new Socket();api.en(socket);return {socket,seen,timers}
 }
 const frame={msgV:1,msg_id:'11111111-1111-4111-8111-111111111111',type:'user',session_id:sid,priority:'next',message:{role:'user',content:'synthetic'}}
 const send=(f,lines)=>f.socket.emit('data',lines.map(x=>JSON.stringify(x)).join('\n')+'\n')
 const check=(name,fn)=>{fn();rows.push({name,ok:true})}
 check('fragmented auth and user frame route exactly once',()=>{const f=make(true),payload=JSON.stringify({type:'auth',token})+'\n'+JSON.stringify(frame)+'\n';for(const part of [payload.slice(0,9),payload.slice(9,37),payload.slice(37)])f.socket.emit('data',part);assert.equal(f.seen.length,1);assert.equal(f.seen[0].authKind,'peer')})
 check('missing, bad, blank and malformed authentication refuse before routing',()=>{for(const payload of [JSON.stringify(frame)+'\n',JSON.stringify({type:'auth',token:'wrong'})+'\n'+JSON.stringify(frame)+'\n','\n'+JSON.stringify(frame)+'\n','not-json\n'+JSON.stringify(frame)+'\n']){const f=make(true);f.socket.emit('data',payload);assert.equal(f.seen.length,0);assert.equal(f.socket.destroyed,true)}})
 check('session guard refuses a wrong recipient without effects',()=>{const f=make(true);send(f,[{type:'auth',token},{...frame,session_id:'other'}]);assert.equal(f.seen.length,0)})
 check('child token is classified distinctly from peer token',()=>{const f=make(true);send(f,[{type:'auth',token:'b'.repeat(32)},frame]);assert.equal(f.seen[0].authKind,'child')})
 check('line cap and first-line deadline close without routing',()=>{const f=make(true);f.socket.emit('data','x'.repeat(lineCap+1));assert.equal(f.socket.destroyed,true);assert.equal(f.seen.length,0);const idle=make(true);idle.timers[0].fn();assert.equal(idle.socket.destroyed,true)})
 check('an authenticated final fragment is accepted on half-close',()=>{const f=make(true);send(f,[{type:'auth',token}]);f.socket.emit('data',JSON.stringify(frame));f.socket.emit('end');assert.equal(f.seen.length,1);assert.equal(f.socket.ended,true)})
 const api=runInNewContext(`(()=>{${format}${formatter}${parser};return {parse:_,format:cet}})()`,{r6:'cross-session-message',h:{source:'^[a-f0-9]{32}$'},C:{source:'^[a-f0-9]{32}(?:,[a-f0-9]{32}){0,7}$'},f:'A-Za-z0-9%:_/.\\\\-',x:['bypass','prompting'],Oh:s=>s,UWe:(tag,body)=>body},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 check('existing direct envelope matches installed parser and preserves routing metadata',()=>{const body='claude-driver wake v6',text='<cross-session-message from-name="claude-driver" from-mode="bypass">\n'+body+'\n</cross-session-message>';const parsed=api.parse(text);assert.equal(parsed.body,body);assert.equal(parsed.fromName,'claude-driver');assert.equal(parsed.fromMode,'bypass');assert.equal(api.parse(text+' appended'),undefined)})
 const evidence=Object.fromEntries(Object.entries(sources).map(([name,x])=>[name,{offset:x.offset,sha256:createHash('sha256').update(x.text).digest('hex')}]))
 writeJsonAtomic(report,{scope:'installed-peer-receiver-isolated',versions:versions(),binary,sources:evidence,lineCap,rows,ok:true,limitations:['Synthetic sockets, timers, process ancestry and constant-time comparison dependency','Envelope character canonicalization stubbed for exact ASCII triggers only','Native queue/model execution and live receipt not qualified by this test']})
 recordMemory({kind:'test_result',topic:'peer-native-contract',source:'installed-source-isolated',status:'passed',evidence:report,lesson:'Installed receiver framing/auth/session/envelope cases passed with synthetic dependencies; no model turns or native writes.'})
 console.log(JSON.stringify({report,ok:true,checks:rows.length,claudeTurns:0,nativeWrites:false}))
}catch(error){writeJsonAtomic(report,{scope:'installed-peer-receiver-isolated',versions:versions(),ok:false,error:{name:error.name,message:error.message.slice(0,400)},rows});console.log(JSON.stringify({report,ok:false,error:error.message.slice(0,400)}));process.exitCode=1}
