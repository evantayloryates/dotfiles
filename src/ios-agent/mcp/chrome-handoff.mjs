// Physical app-owned Chrome launch, DOM Save and glow cleanup passed untethered
// with Wi-Fi IPv4 absent on 11 October. Qualification follows adapter source,
// not a reused display build number. Signed builds with changed adapters refuse.
import fs from 'node:fs';
import path from 'node:path';
export const qualifiedChromeAdapter = 'b5118743351566bf9e9d0d01d2fd670533cccea2b67cb48f2a67042e4df0009c';
function privatePath(file,directory=false){
  const s=fs.lstatSync(file);
  return !s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile())&&!(s.mode&0o077)&&s.uid===process.getuid()&&(directory||s.size<128*1024);
}
export function qualifiedChromeDelivery(state,deliveryId){
  if(!/^[a-f0-9]{32}$/.test(deliveryId||''))return false;
  const base=path.join(state,'build-jobs');
  try{
    if(!privatePath(base,true))return false;
    const jobs=fs.readdirSync(base).filter(x=>/^[a-f0-9]{32}$/.test(x));
    if(jobs.length>500)return false;
    for(const id of jobs){
      const dir=path.join(base,id),file=path.join(dir,'result.json');
      try{
        if(!privatePath(dir,true)||!privatePath(file))continue;
        const r=JSON.parse(fs.readFileSync(file,'utf8'));
        if(r.deliveryId!==deliveryId||r.jobId!==id||r.ok!==true||r.state!=='completed'||r.signatureVerified!==true||r.agentBinaryVerified!==true||r.sourceChangedDuringBuild!==false)continue;
        const hashes=Object.entries(r.sourceHashes||{}).filter(([name])=>name.endsWith('/native/BrowserHandoff.inc'));
        return hashes.length===1&&hashes[0][1]===qualifiedChromeAdapter;
      }catch{}
    }
  }catch{}
  return false;
}
export function qualifiedChromeInstalled(state,currentDelivery){
  if(currentDelivery)return qualifiedChromeDelivery(state,currentDelivery);
  const base=path.join(state,'native-installs');
  try{
    if(!privatePath(base,true))return false;
    const files=fs.readdirSync(base).filter(x=>/^[a-f0-9]{32}\.json$/.test(x));
    if(files.length>500)return false;
    const receipts=[];
    for(const name of files){const file=path.join(base,name);if(!privatePath(file))return false;const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.installSent===true)receipts.push(r);}
    receipts.sort((a,b)=>b.startedAt-a.startedAt);
    const r=receipts[0];
    return !!r&&r.state==='verified'&&r.installedIdentityVerified===true&&qualifiedChromeDelivery(state,r.deliveryId);
  }catch{return false;}
}
