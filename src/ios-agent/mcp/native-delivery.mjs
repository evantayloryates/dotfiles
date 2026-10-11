import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const valid=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function nativeDelivery(b,{action='plan',jobId,installId}={}) {
  if(action==='plan')return {ok:true,steps:['ios_build completed with signed deliveryId','ios_install start with jobId','recover installId using status after any interruption','require matching fresh running deliveryId, then ios_begin for React readiness','use native home and ios_end for cleanup'],limits:['Configured paired iPhone and signed Kickoff DEV only. No sudo, XCTest or Mirroring.','Nearby developer transport required for installation. Routine app control remains Tailscale.','No automatic replay. Installation acceptance, running build identity and React readiness are separate.']};
  const base=path.join(b.state,'native-installs');fs.mkdirSync(base,{recursive:true,mode:0o700});
  if(fs.lstatSync(base).isSymbolicLink()||fs.statSync(base).mode&0o077)return {ok:false,reason:'private_install_directory_required',inputSent:false};
  const read=id=>{
    if(!valid(id))return {ok:false,reason:'fixed_install_id_required'};
    let r;try{r=JSON.parse(fs.readFileSync(path.join(base,`${id}.json`),'utf8'));}catch{return {ok:false,reason:'install_receipt_not_found'};}
    if(r.state==='installing'||r.state==='launching'||r.state==='observing'){
      let alive=false;try{process.kill(r.handlerPid,0);alive=true;}catch{}
      return {...r,state:alive?r.state:'unconfirmed',replay:false,next:'Observe current device identity before any new installation. Never replay an interrupted dispatch.'};
    }
    return r;
  };
  if(action==='status')return installId?read(installId):{ok:true,receipts:fs.readdirSync(base).filter(x=>/^[a-f0-9]{32}\.json$/.test(x)).map(x=>read(x.slice(0,-5))).sort((a,c)=>c.startedAt-a.startedAt).slice(0,10)};
  if(action!=='start'||!valid(jobId))return {ok:false,reason:'fixed_build_job_required',inputSent:false};
  const validation=await b.run('delivery',[],{jobId},30000);
  const v=validation.value;if(!v?.ok)return {ok:false,reason:v?.reason||'signed_product_validation_failed',inputSent:false};
  const owner=await b.begin({surface:'launch'});
  const id=randomBytes(16).toString('hex');const file=path.join(base,`${id}.json`);
  const r={ok:false,installId:id,jobId,deliveryId:v.deliveryId,startedAt:Date.now(),handlerPid:process.pid,state:'preflight',installSent:false,launchSent:false,installedIdentityVerified:false,replay:false};
  const save=()=>{const temp=`${file}.next`;fs.writeFileSync(temp,JSON.stringify(r),{mode:0o600});fs.renameSync(temp,file);};
  try{
    const check=()=>b.session(owner.sessionId);
    check();
    const lock=await b.deviceRun(['device','info','lockState','--device',v.device,'--timeout','8'],{timeout:11000});
    const state=lock.data?.result?.lockState||lock.data?.result?.deviceProperties?.lockState||lock.data?.result;
    if(!lock.ok){r.reason='developer_channel_unconfirmed';r.state='not-dispatched';save();return r;}
    if(state?.passcodeRequired===true||state?.unlocked===false||(state?.passcodeRequired!==false&&state?.unlocked!==true)){r.reason='developer_unlock_required';r.state='not-dispatched';save();return r;}
    // Revalidate under the shared phone owner. No mutable caller-supplied product path.
    const fresh=(await b.run('delivery',[],{jobId},30000)).value;
    if(!fresh?.ok||fresh.seal!==v.seal||fresh.deliveryId!==v.deliveryId){r.reason='build_product_changed';r.state='not-dispatched';save();return r;}
    check();r.installSent=true;r.state='installing';save();
    const installed=await b.deviceRun(['device','install','app','--device',v.device,'--timeout','60',v.product],{timeout:65000});
    r.installOutcome=installed.outcome;
    if(!installed.ok){r.state=installed.outcome==='unknown'?'unknown':'unconfirmed';r.reason='install_not_confirmed';save();return r;}
    check();r.launchSent=true;r.state='launching';save();
    const launched=await b.deviceRun(['device','process','launch','--device',v.device,'--timeout','12','com.dev.kudos.fit'],{timeout:15000});
    r.launchOutcome=launched.outcome;
    if(!launched.ok){r.state='unconfirmed';r.reason='launch_not_confirmed';save();return r;}
    r.state='observing';save();
    const deadline=Date.now()+20000;
    do{
      check();const observed=await b.status();
      if(observed.device?.deliveryId===v.deliveryId&&observed.deviceAgeMs!==null&&observed.deviceAgeMs<=5000&&observed.deviceFeedback?.foreground===true){r.ok=true;r.installedIdentityVerified=true;r.state='verified';r.observedBoot=observed.device.boot;break;}
      await sleep(500);
    }while(Date.now()<deadline);
    if(!r.ok){r.state='unconfirmed';r.reason='running_delivery_identity_not_confirmed';}
    r.next='Use ios_begin for React readiness, then native home and ios_end. Installation does not establish JS readiness or Home cleanup.';
    save();return r;
  }catch{r.state=r.installSent?'unconfirmed':'not-dispatched';r.reason='delivery_interrupted_do_not_replay';save();return r;}
  finally{r.finishedAt=Date.now();try{r.ownerReleased=(await b.end(owner.sessionId))?.released===true;}catch{r.ownerReleased=false;}save();}
}
