import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {retainedRunner} from './system-reservation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=()=>randomBytes(16).toString('hex');
const bundles={'kickoff-dev':'com.dev.kudos.fit',safari:'com.apple.mobilesafari',chrome:'com.google.chrome.ios',settings:'com.apple.Preferences',shortcuts:'com.apple.shortcuts'};
const allowed=new Set([...Object.values(bundles),'com.apple.springboard']);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function endpointState(host,port=8100){return new Promise(resolve=>{
  const socket=net.createConnection({host,port});let done=false;
  const finish=state=>{if(done)return;done=true;socket.destroy();resolve(state);};
  socket.setTimeout(1500,()=>finish('unconfirmed'));
  socket.once('connect',()=>finish('open'));
  socket.once('error',error=>finish(error.code==='ECONNREFUSED'?'refused':'unconfirmed'));
});}

export function tailnetHost(value){
  if(typeof value!=='string')return false;
  const a=value.split('.').map(Number);
  return a.length===4&&a.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=255&&String(n)===value.split('.')[i])&&a[0]===100&&a[1]>=64&&a[1]<=127;
}

// Project before persistence; secure-entry values never enter artifacts/context.
export function parseTree(xml){
  return new Promise((resolve,reject)=>{
    const script=`import json,sys,xml.etree.ElementTree as E\nr=E.fromstring(sys.stdin.read());out=[]\nfor i,n in enumerate(r.iter()):\n if i>=8000:break\n a=dict(n.attrib);secure='SecureTextField' in n.tag\n out.append({'type':n.tag,'name':'<secure>' if secure else a.get('name','')[:500],'label':'<secure>' if secure else a.get('label','')[:1000],'value':'<secure>' if secure else a.get('value','')[:1000],'visible':a.get('visible')=='true','enabled':a.get('enabled')=='true','rect':{k:float(a.get(k,0)) for k in ('x','y','width','height')}})\nprint(json.dumps({'nodes':out,'truncated':i>=8000}))`;
    const c=execFile('/usr/bin/python3',['-c',script],{timeout:5000,maxBuffer:4*1024*1024},(error,out)=>{if(error)reject(Error('system_tree_unavailable'));else try{resolve(JSON.parse(out));}catch{reject(Error('system_tree_unavailable'));}});
    c.stdin.on('error',()=>{});c.stdin.end(xml);
  });
}

export class SystemDriver {
  constructor({state,session,check,authorize=async()=>{}}){this.state=state;this.session=session;this.check=()=>{check();if(this.retained){const current=retainedRunner(this.state);if(!current||current.id!==this.retained.id||current.sessionId!==this.sid)throw Error('retained_runner_unavailable');}};this.authorize=authorize;this.snapshot=null;this.child=null;this.startPromise=null;}
  async http(method,route,body,timeout=12000){
    let response;
    try{response=await fetch(this.base+route,{method,signal:AbortSignal.timeout(timeout),headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
    catch(error){throw Error(['TimeoutError','AbortError'].includes(error.name)?'system_endpoint_deadline':'system_endpoint_unreachable');}
    const reader=response.body.getReader();let text='',bytes=0;const decoder=new TextDecoder();
    try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2*1024*1024)throw Error('system_response_bounded');text+=decoder.decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
    const r=JSON.parse(text);if(!response.ok||r.value?.error)throw Error('system_provider_rejected');return r;
  }
  async start(){this.startPromise=this.startOnce();return this.startPromise;}
  async startOnce(){
    const file=path.join(this.state,'system-driver.json');
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077)return {ok:false,reason:'private_system_driver_configuration_required'};
    const config=JSON.parse(fs.readFileSync(file));if(!tailnetHost(config.address))return {ok:false,reason:'configured_tailnet_address_required'};
    this.deviceIdentity=JSON.parse(fs.readFileSync(path.join(this.state,'web-device.json'))).hardwareUDID;
    this.base=`http://${config.address}:8100`;this.check();
    const retained=process.env.IOS_AGENT_EXPERIMENTAL_RETENTION==='1'?retainedRunner(this.state):null;
    if(retained){
      await this.authorize();this.check();
      const status=await this.http('GET','/status',undefined,2000);
      if(status.value?.ready!==true||status.sessionId!==retained.sessionId)return {ok:false,reason:'retained_runner_identity_unconfirmed',replay:false};
      this.retained=retained;this.sid=retained.sessionId;this.runtime=status.value;this.check();
      return {ok:true,retained:true,reservationId:retained.id,expiresAt:retained.expiresAt,transport:'retained-signed-XCTest/Tailscale-WDA',indicator:'Apple Automation Running',inputAuthority:'exclusive current broker lease',offLANStartQualified:false};
    }
    const endpoint=await endpointState(config.address);
    if(endpoint==='open')return {ok:false,reason:'existing_system_runner_preserved'};
    if(endpoint!=='refused')return {ok:false,reason:'system_endpoint_reachability_unconfirmed',replay:false};
    await this.authorize();this.check();
    const log=path.join(this.session.dir,'system-runner.log');
    const argv=JSON.stringify({state:this.state,ownerFile:this.session.owner,leaseFile:this.session.lease,log});
    this.child=spawn(path.join(this.state,'providers/pymobiledevice3-11.15.5/bin/python'),['-B',path.join(root,'system_runner.py'),argv],{stdio:['pipe','pipe','pipe']});
    this.exit=new Promise(resolve=>{this.child.once('error',()=>{this.failed=true;resolve();});this.child.once('close',resolve);});
    this.child.stderr.on('data',()=>{});this.child.stdin.on('error',()=>{});
    let pending='';this.child.stdout.on('data',bytes=>{pending+=bytes;if(pending.length>16000)pending='';let at;while((at=pending.indexOf('\n'))>=0){try{const r=JSON.parse(pending.slice(0,at));if(r.stopped)this.cleanup=r;if(r.started===false)this.failed=true;if(r.startupGate==='physical_unlock_required')this.startupGate=r.startupGate;}catch{}pending=pending.slice(at+1);}});
    const until=Date.now()+45000;let ready=false;
    while(Date.now()<until){this.check();if(this.failed||this.child.exitCode!==null)break;try{this.runtime=(await this.http('GET','/status',undefined,1000)).value;ready=this.runtime?.ready===true;if(ready)break;}catch{}await sleep(500);}
    if(!ready)return {ok:false,reason:this.startupGate||'system_start_unconfirmed_inspect_phone',replay:false};
    await this.authorize();this.check();const r=await this.http('POST','/session',{capabilities:{alwaysMatch:{shouldWaitForQuiescence:false,waitForIdleTimeout:1,shouldUseCompactResponses:true}}});
    this.sid=r.sessionId||r.value?.sessionId;if(!/^[A-Fa-f0-9-]{36}$/.test(this.sid||''))return {ok:false,reason:'system_session_unconfirmed',replay:false};
    return {ok:true,transport:'signed-XCTest-runner/paired-developer-start/Tailscale-WDA',indicator:'Apple Automation Running',offLANStartQualified:false,authentication:'Apple may require physical authorization; no passcode is stored or entered'};
  }
  async foregroundMatches(expected){
    // A successful dispatch can precede SpringBoard's foreground handoff.
    // Re-read only; never send the action twice. Keep every read owner-fenced.
    const deadline=Date.now()+2000;
    do {this.check();const active=(await this.http('GET',this.route('/wda/activeAppInfo'),undefined,2000)).value;this.check();
      if(active?.bundleId===expected)return true;
      if(Date.now()>=deadline)return false;await sleep(200);
    } while(true);
  }
  route(r){if(!this.sid)throw Error('system_session_required');return `/session/${this.sid}${r}`;}
  async context(requireScopedApp=true){this.check();const locked=(await this.http('GET',this.route('/wda/locked'))).value;if(locked!==false)throw Error('physical_unlock_required');const a=(await this.http('GET',this.route('/wda/activeAppInfo'))).value;if(!a?.bundleId||requireScopedApp&&!allowed.has(a.bundleId))throw Error('system_app_scope_required');return a.bundleId;}
  async inspect(){
    const bundle=await this.context(),at=Date.now(),r=await this.http('GET',this.route('/source')),tree=await parseTree(r.value);
    if(await this.context()!==bundle)throw Error('system_app_changed');
    const snapshot=id();this.snapshot={id:snapshot,at:Date.now(),bundle,nodes:tree.nodes};
    this.uncertain=false;
    return {ok:true,snapshot,bundle,readDurationMs:Date.now()-at,freshness:'five seconds after completed read; tap re-resolves a unique live native element and checks hittability',nodes:tree.nodes.map((n,i)=>({...n,target:String(i)})),truncated:tree.truncated,delivery:'native XCTest; full tree includes browser/system UI; not DOM'};
  }
  async tapElement(matches,type){
    if(!Array.isArray(matches)||matches.length!==1)return {reason:'unique_system_target_required'};
    let eid=matches[0].ELEMENT||matches[0]['element-6066-11e4-a52e-4f735466cecf'];
    if(!/^[A-Fa-f0-9-]{36}$/.test(eid||''))return {reason:'system_element_unavailable'};
    // SwiftUI can expose a named full-width row and an unnamed nested toggle.
    if(type==='XCUIElementTypeSwitch'){
      const children=(await this.http('POST',this.route(`/element/${eid}/elements`),{using:'class chain',value:'**/XCUIElementTypeSwitch'})).value;
      if(!Array.isArray(children)||children.length>1)return {reason:'unique_system_switch_required'};
      if(children.length===1){eid=children[0].ELEMENT||children[0]['element-6066-11e4-a52e-4f735466cecf'];if(!/^[A-Fa-f0-9-]{36}$/.test(eid||''))return {reason:'system_element_unavailable'};}
    }
    return {eid};
  }
  async action({action,snapshot,target,direction,app,label,elementType,text}){
    this.check();
    if(this.uncertain)return {ok:false,reason:'system_observation_required',actionSent:false,replay:false};
    let inputSent=false;
    try{
      // Fixed launch/Home never inspect the previous app's contents. Still refuse a locked phone.
      const bundle=await this.context(!['activate','home'].includes(action));
      if(action==='home'){this.snapshot=null;await this.authorize();this.check();inputSent=true;await this.http('POST','/wda/homescreen',{});return {ok:true,homeConfirmed:await this.foregroundMatches('com.apple.springboard'),replay:false};}
      if(action==='activate'){if(!bundles[app])return {ok:false,reason:'fixed_system_app_required',actionSent:false};this.snapshot=null;await this.authorize();this.check();inputSent=true;await this.http('POST',this.route('/wda/apps/activate'),{bundleId:bundles[app]});return {ok:true,foregroundConfirmed:await this.foregroundMatches(bundles[app]),replay:false};}
      if((action==='tap'&&label!==undefined)||['type','clear','focus'].includes(action)){
        const textAction=['type','clear','focus'].includes(action);
        const types=textAction?['XCUIElementTypeTextField','XCUIElementTypeSearchField','XCUIElementTypeTextView']:['XCUIElementTypeButton','XCUIElementTypeCell','XCUIElementTypeSwitch','XCUIElementTypeLink'];
        if(typeof label!=='string'||!label.length||label.length>500||!types.includes(elementType))return {ok:false,reason:'typed_system_label_required',actionSent:false};
        if(action==='type'&&(typeof text!=='string'||!text.length||text.length>256)||action!=='type'&&text!==undefined)return {ok:false,reason:'system_text_argument_mismatch',actionSent:false};
        this.snapshot=null;
        const predicate=`type == ${JSON.stringify(elementType)} AND label == ${JSON.stringify(label)} AND visible == 1 AND enabled == 1`;
        const matches=(await this.http('POST',this.route('/elements'),{using:'predicate string',value:predicate})).value;
        const resolved=await this.tapElement(matches,elementType);if(resolved.reason)return {ok:false,reason:resolved.reason,actionSent:false,replay:false};
        const {eid}=resolved,rect=(await this.http('GET',this.route(`/element/${eid}/rect`))).value,screen=(await this.http('GET',this.route('/window/rect'))).value;
        if(!rect||!screen||![rect.x,rect.y,rect.width,rect.height,screen.x,screen.y,screen.width,screen.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||rect.x+rect.width/2<screen.x||rect.y+rect.height/2<screen.y||rect.x+rect.width/2>screen.x+screen.width||rect.y+rect.height/2>screen.y+screen.height)return {ok:false,reason:'on_screen_target_required',actionSent:false};
        const hittable=(await this.http('GET',this.route(`/element/${eid}/attribute/hittable`))).value;
        if(![true,1,'true','1'].includes(hittable))return {ok:false,reason:'system_target_occluded',actionSent:false};
        if(await this.context()!==bundle)return {ok:false,reason:'system_app_changed',actionSent:false};
        await this.authorize();this.check();inputSent=true;
        await this.http('POST',this.route(`/element/${eid}/${action==='type'?'value':action==='clear'?'clear':'click'}`),action==='type'?{text,frequency:40}:{});
        return {ok:true,delivery:'native-XCTest',effect:'unverified; inspect again',replay:false};
      }
      const s=this.snapshot;if(!s||snapshot!==s.id||Date.now()-s.at>5000)return {ok:false,reason:'fresh_system_snapshot_required',actionSent:false};
      if(await this.context()!==s.bundle)return {ok:false,reason:'system_app_changed',actionSent:false};
      this.snapshot=null; // Consume before dispatch, including unknown outcomes.
      if(action==='scroll'){if(!['up','down','left','right'].includes(direction))return {ok:false,reason:'scroll_direction_required',actionSent:false};await this.authorize();this.check();inputSent=true;await this.http('POST',this.route('/wda/scroll'),{direction,distance:0.5});}
      else if(action==='tap'){
        const n=s.nodes[Number(target)];if(!/^\d+$/.test(target||'')||!n?.visible||!n.enabled||n.type.includes('SecureTextField'))return {ok:false,reason:'visible_enabled_system_target_required',actionSent:false};
        const {x,y,width,height}=n.rect;const point={x:x+width/2,y:y+height/2};const screen=s.nodes.find(n=>n.type==='XCUIElementTypeApplication')?.rect;
        if(!screen||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||point.x<screen.x||point.y<screen.y||point.x>screen.x+screen.width||point.y>screen.y+screen.height)return {ok:false,reason:'on_screen_target_required',actionSent:false};
        if(!n.name&&!n.label)return {ok:false,reason:'named_system_target_required',actionSent:false};
        const predicate=`type == ${JSON.stringify(n.type)} AND name == ${JSON.stringify(n.name)} AND label == ${JSON.stringify(n.label)} AND visible == 1`;
        const matches=(await this.http('POST',this.route('/elements'),{using:'predicate string',value:predicate})).value;
        const resolved=await this.tapElement(matches,n.type);if(resolved.reason)return {ok:false,reason:resolved.reason,actionSent:false};const {eid}=resolved;
        const hittable=(await this.http('GET',this.route(`/element/${eid}/attribute/hittable`))).value;
        if(![true,1,'true','1'].includes(hittable))return {ok:false,reason:'system_target_occluded',actionSent:false};
        await this.authorize();this.check();inputSent=true;await this.http('POST',this.route(`/element/${eid}/click`),{});
      }else return {ok:false,reason:'fixed_system_action_required',actionSent:false};
      return {ok:true,delivery:'native-XCTest',effect:'unverified; inspect again',replay:false};
    }catch(error){if(inputSent)this.uncertain=true;const known=new Set(['physical_unlock_required','system_app_scope_required','system_endpoint_deadline','system_endpoint_unreachable','system_provider_rejected','owner_not_active','system_ownership_unconfirmed','retained_runner_unavailable']);return {ok:false,outcome:inputSent?'unknown_or_rejected':'not_sent',actionSent:inputSent,reason:known.has(error.message)?error.message:'inspect_current_phone_state',replay:false};}
  }
  async stop(){
    if(this.stopping)return this.stopping;
    this.stopping=(async()=>{await this.startPromise?.catch(()=>{});if(this.retained){const current=retainedRunner(this.state);return {ok:current?.id===this.retained.id,runnerStopped:false,retained:current?.id===this.retained.id,reservationId:this.retained.id,expiresAt:this.retained.expiresAt,inputReleasedSeparately:true,...(!current?{reason:'retained_runner_state_unconfirmed'}:{})};}if(this.sid)try{await this.http('DELETE',this.route(''),undefined,4000);}catch{}if(this.child){this.child.stdin.end('stop\n');await Promise.race([this.exit,sleep(38000)]);return {ok:this.cleanup?.runnerStopped===true,runnerStopped:this.cleanup?.runnerStopped===true,verificationAttempts:this.cleanup?.verificationAttempts,cleanupReason:this.cleanup?.reason||'unconfirmed'};}return {ok:true,runnerStopped:true,notStarted:true};})();return this.stopping;
  }
}
