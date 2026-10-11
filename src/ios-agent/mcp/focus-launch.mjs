import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';

export function focusLaunchEnabled(state) {
  const file=path.join(state,'focus-launch.json');
  try {
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.mode&0o077||stat.size>1024)return false;
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    return Object.keys(value).sort().join(',')==='enabled,version'&&value.version===1&&value.enabled===true;
  }catch{return false;}
}

function shortcut(name,timeout){return new Promise((resolve,reject)=>{
  execFile('/usr/bin/shortcuts',['run',name],{timeout,maxBuffer:8192},(error,stdout)=>{
    if(error)reject(Error('fixed_shortcut_outcome_unconfirmed'));else resolve(stdout.trim());
  });
});}

export async function focusLaunch({state,check,runShortcut=shortcut}) {
  const result={ok:false,scope:'fixed-native-dev-focus-launch',transport:'iCloud-Focus/phone-local-Shortcut',inputSent:false,replay:false,XCTestStarted:false};
  if(!focusLaunchEnabled(state))return {...result,reason:'focus_launch_not_provisioned'};
  let attempted=false;
  try {
    check();
    if(await runShortcut('Runner Current Focus',6000))return {...result,reason:'existing_focus_preserved'};
    check();attempted=true;result.inputSent='unknown';
    await runShortcut('Runner DEV Focus Pulse',58000);
    check();result.inputSent=true;result.ok=true;
  }catch{result.reason='focus_launch_outcome_unconfirmed';}
  finally {
    if(attempted)try {
      check();const current=await runShortcut('Runner Current Focus',6000);check();
      if(current==='Runner Dev Launch') {
        await runShortcut('Runner DEV Focus Off',6000);check();
        result.focusRestored=(await runShortcut('Runner Current Focus',6000))==='';check();
      }else {result.focusRestored=true;if(current)result.otherFocusPreserved=true;}
    }catch{result.focusRestored=false;}
  }
  if(attempted&&result.focusRestored!==true){result.ok=false;result.reason='focus_cleanup_unconfirmed';}
  return result;
}
