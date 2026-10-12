import fs from 'node:fs';
import path from 'node:path';
import {RelayChannel} from './relay-channel.mjs';
import {reflectionConfig,startReflection} from './reflection-process.mjs';
import {emitSignal} from './signal-log.mjs';
const note=(event,fields)=>{try{emitSignal('mcp',event,fields);}catch{}};

export function pageIdleConfirmed(page,runtime,elapsedSinceRelease){
  return page?.indicator===false&&Number.isFinite(page.ageMs)&&page.ageMs>=0&&page.ageMs<3000&&page.ageMs<=elapsedSinceRelease&&
    ['boot','browser','version'].every(k=>typeof runtime?.[k]==='string'&&runtime[k].length>0&&page[k]===runtime[k]);
}

// Choose before dispatch. Never retry a possibly accepted launch in another lane.
export async function openManagedWeb(b,args={}){
  if(!['ios-safari','ios-chrome'].includes(args.browser))return {ok:false,reason:'fixed_browser_required',inputSent:false};
  let provider=args.transport||'auto';
  if(!['auto','app','paired','reflected'].includes(provider))return {ok:false,reason:'fixed_browser_transport_required',inputSent:false};
  // Select before any launch. A healthy paired endpoint does not imply a live
  // app bridge. Direct paired URL delivery does not need native bootstrap.
  let reason='explicit_transport';
  if(provider==='auto'){
    if(await b.appTransportPreferred()){provider='app';reason='developer_endpoint_unavailable';}
    else{const native=await b.waitReady({surface:'native',timeoutSeconds:0});provider=native.readyToAcquire?'reflected':'paired';reason=native.readyToAcquire?'native_bridge_ready':'native_bridge_unavailable';}
  }
  note('provider.selected',{op:'managed_browser_open',provider,kind:args.browser,reason});
  const result=await (provider==='reflected'?openReflectedWeb(b,args):openAppWeb(b,{...args,enrollmentTransport:provider==='paired'?'paired':args.transport==='app'?'app':'auto'}));
  note('browser.open_completed',{provider,kind:args.browser,session:result.sessionId,page:result.page,
    outcome:result.ok===true?'verified':result.inputSent===false?'refused':'unknown',reason:typeof result.reason==='string'&&/^[a-z][a-z0-9_-]{0,79}$/.test(result.reason)?result.reason:undefined,level:result.ok?'info':'warn'});
  return result;
}

export async function openAppWeb(b,{browser,profile='app',path:route='/dev/ios-agent',threadId,rollout,claudeOwner,enrollmentTransport='auto'}={}){
  let session,complete=false;
  try{
    const existing=await b.webPages();
    if(!existing.ok)return {ok:false,reason:'prior_page_inventory_unavailable',inputSent:false};
    const prior=new Set(existing.pages?.map(p=>p.id)||[]);
    const paired=enrollmentTransport==='paired';
    const launch=await b.webEnroll({browser,profile,path:route,transport:enrollmentTransport});
    if(!launch.ok)return {...launch,replay:false};
    if(launch.launch?.ok===false&&launch.launch.inputSent===false)return {...launch,ok:false,inputSent:false,reason:launch.launch.reason||'browser_launch_refused',replay:false};
    const until=Date.now()+15000;let page;
    while(Date.now()<until){
      const inventory=await b.webPages();
      if(!inventory.ok)return {ok:false,reason:'launched_page_inventory_unavailable',launch:launch.launch,replay:false};
      const matches=inventory.pages?.filter(p=>!prior.has(p.id)&&p.browser===browser&&p.visible&&p.ready&&p.ageMs<3000)||[];
      if(matches.length===1){page=matches[0];break;}
      if(matches.length>1)return {ok:false,reason:'browser_page_ambiguous',replay:false};
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!page)return {ok:false,reason:'fresh_launched_page_unconfirmed',launch:launch.launch,replay:false};
    const begun=await b.begin({surface:'web',page:page.id,threadId,rollout,claudeOwner});session=begun.sessionId;
    if(paired)b.session(session).pairedManagedHome=true;
    else b.session(session).appManagedHome=true;
    complete=true;
    return {...begun,ok:true,launch:launch.launch,transport:paired?'paired-direct-browser-handoff':'app-owned-browser-handoff',qualificationScope:'personal-dev',offLANQualified:!paired,
      limits:'Owned page DOM/state over Tailscale; synthetic input. Deep cellular Inspector and OS permission control remain separate gates.',
      next:paired?'Use ordinary web tools with this sessionId. No native bridge or reflected tunnel was required. Deep Inspector connects separately. End verifies glow-off then requests the fixed Runner Home shortcut through pairing; Home needs independent readback. Cellular qualification is separate. Never replay an unknown launch.':'Use ordinary web tools with this sessionId; ios_web_end confirms glow-off before requesting Home through the app-owned lane. Never replay an unknown launch.'};
  }catch(e){return {ok:false,reason:'managed_app_browser_open_unconfirmed',failureType:e.name,replay:false};}
  finally{if(session&&!complete)await b.end(session);}
}

// One bootstrap/launch/control lifecycle; enrollment-only semantics stay intact.
export async function openReflectedWeb(b,{browser,profile='app',path:route='/dev/ios-agent',threadId,rollout,claudeOwner}={}){
  if(!['ios-safari','ios-chrome'].includes(browser))return {ok:false,reason:'fixed_browser_required',inputSent:false};
  const config=reflectionConfig(b.state);
  let session,channel,reflector,bootstrapLaunch,complete=false;
  const lifecycle={threadId,rollout,claudeOwner};
  const owner=()=>{const s=b.session(session);return {ownerFile:s.owner,leaseFile:s.lease};};
  try{
    const existing=await b.webPages();
    const prior=new Set(existing.pages?.map(p=>p.id)||[]);
    const link=await b.webEnroll({path:route,profile});
    if(!link.ok) return link;
    let ready=await b.waitReady({surface:'native',timeoutSeconds:0});
    if(!ready.readyToAcquire){
      const launched=bootstrapLaunch=await b.deviceLaunch({target:'kickoff-dev'});
      if(!launched.foregroundVerified)return {ok:false,reason:'bootstrap_foreground_unconfirmed',launch:launched,replay:false};
      ready=await b.waitReady({surface:'native',timeoutSeconds:15});
    }
    if(!ready.readyToAcquire)return {ok:false,reason:'native_bootstrap_unavailable',browserInputSent:false,
      inputSent:bootstrapLaunch?(bootstrapLaunch.inputSent??'unknown'):false,bootstrapLaunch,replay:false};
    session=(await b.begin({nativeOnly:true,...lifecycle})).sessionId;
    const serial=JSON.parse(fs.readFileSync(path.join(b.state,'web-device.json'),'utf8')).hardwareUDID;
    reflector=await startReflection(b.state);
    channel=new RelayChannel(b.state,{serial,...owner()});
    await channel.ready;
    await reflector.close();reflector=null; // Secondary RSD no longer needs reflection.
    await channel.request('handoff');await b.end(session);session=undefined;
    session=(await b.begin({surface:'launch',...lifecycle})).sessionId;
    await channel.request('bind',{owner:owner()});
    const launch=await channel.request('observe',{request:{kind:'browser-launch',browser:browser==='ios-chrome'?'chrome':'safari',profile,url:JSON.parse(fs.readFileSync(link.launchFile,'utf8')).url}});
    if(!launch.ok||launch.value?.foregroundVerified!==true)return {ok:false,reason:'browser_launch_unconfirmed',launch:launch.value,replay:false};
    const until=Date.now()+15000;let page;
    while(Date.now()<until){
      const pages=await b.webPages();
      const matches=pages.pages?.filter(p=>!prior.has(p.id)&&p.browser===browser&&p.visible&&p.ready&&p.ageMs<3000)||[];
      if(matches.length===1){page=matches[0];break;}
      if(matches.length>1)throw Error('browser_page_ambiguous');
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!page)return {ok:false,reason:'fresh_launched_page_unconfirmed',replay:false};
    await channel.request('handoff');await b.end(session);session=undefined;
    const begun=await b.begin({surface:'web',page:page.id,...lifecycle});session=begun.sessionId;
    await channel.request('bind',{owner:owner()});
    b.session(session).relayChannel=channel;
    complete=true;
    return {...begun,ok:true,launch:launch.value,transport:'reflected-pairing/direct-secondary-userspace',qualificationScope:config.scope,
      offLANQualified:false,next:'Use ordinary ios_web_inspect/action and ios_browser_debug with this sessionId. ios_web_end closes the managed tunnel and requests Home. Wi-Fi-off reflected transport is not qualified.'};
  }catch(e){return {ok:false,reason:'managed_browser_open_unconfirmed',failureType:e.name,replay:false,next:'Inspect readiness; do not replay an unknown launch. The working Safari app-owned lane and existing visible browser pages remain separate options.'};}
  finally{
    if(reflector)await reflector.close();
    if(!complete){
      if(channel&&!channel.closed&&session)try{await channel.request('observe',{request:{kind:'shortcut-home'}},10000);}catch{}
      if(channel)await channel.close();
      if(session)await b.end(session);
    }
  }
}
