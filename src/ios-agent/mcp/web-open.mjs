import fs from 'node:fs';
import path from 'node:path';
import {RelayChannel} from './relay-channel.mjs';
import {reflectionConfig,startReflection} from './reflection-process.mjs';

// One bootstrap/launch/control lifecycle; enrollment-only semantics stay intact.
export async function openReflectedWeb(b,{browser,profile='app',path:route='/dev/ios-agent',threadId,rollout,claudeOwner}={}){
  if(!['ios-safari','ios-chrome'].includes(browser))return {ok:false,reason:'fixed_browser_required',inputSent:false};
  const config=reflectionConfig(b.state);
  let session,channel,reflector,complete=false;
  const lifecycle={threadId,rollout,claudeOwner};
  const owner=()=>{const s=b.session(session);return {ownerFile:s.owner,leaseFile:s.lease};};
  try{
    const existing=await b.webPages();
    const prior=new Set(existing.pages?.map(p=>p.id)||[]);
    const link=await b.webEnroll({path:route,profile});
    if(!link.ok) return link;
    let ready=await b.waitReady({surface:'native',timeoutSeconds:0});
    if(!ready.readyToAcquire){
      const launched=await b.deviceLaunch({target:'kickoff-dev'});
      if(!launched.foregroundVerified)return {ok:false,reason:'bootstrap_foreground_unconfirmed',launch:launched,replay:false};
      ready=await b.waitReady({surface:'native',timeoutSeconds:15});
    }
    if(!ready.readyToAcquire)return {ok:false,reason:'native_bootstrap_unavailable',inputSent:false};
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
