// Provisioned private DEV reflector only. Configuration is not enrollment.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const probes=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../probes'));

export function reflectionConfig(state){
  const file=path.join(state,'developer-reflection.json');
  if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).mode&0o077||fs.statSync(file).size>4096)throw Error('private_reflection_configuration_required');
  const c=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Object.keys(c).sort().join(',')!=='containerId,image,scope,version'||c.version!==1||!['qualification','personal-dev'].includes(c.scope)||!/^[a-f0-9]{64}$/.test(c.containerId)||!/^sha256:[a-f0-9]{64}$/.test(c.image))throw Error('fixed_reflection_configuration_required');
  return c;
}

export async function startReflection(state){
  const config=reflectionConfig(state);
  const phoneFile=path.join(state,'developer-tailnet.json');
  if(fs.lstatSync(phoneFile).isSymbolicLink()||fs.statSync(phoneFile).mode&0o077)throw Error('private_developer_tailnet_configuration_required');
  const phone=JSON.parse(fs.readFileSync(phoneFile,'utf8')).address;
  if(!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3})\.(?:\d{1,3})$/.test(phone))throw Error('fixed_phone_address_required');
  const {stdout}=await exec('docker',['inspect',config.containerId],{timeout:5000,maxBuffer:256*1024});
  const [c]=JSON.parse(stdout);
  if(c?.Id!==config.containerId||c.Image!==config.image||c.State?.Running!==true||!c.Mounts?.some(m=>m.Destination==='/probe'&&m.RW===false&&fs.realpathSync(m.Source)===probes))throw Error('provisioned_reflection_container_unconfirmed');
  const child=spawn('docker',['exec',config.containerId,'python3','-B','/probe/packet_reflector.py','--phone',phone,'--seconds','60'],{stdio:['ignore','pipe','ignore']});
  let buffer='',pid,closed=false;
  const stopped=new Promise(resolve=>child.once('close',()=>{closed=true;resolve();}));
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('reflection_start_unconfirmed')),5000);
      child.once('error',()=>{clearTimeout(timer);reject(Error('reflection_start_unconfirmed'));});
      child.once('close',()=>{clearTimeout(timer);if(!pid)reject(Error('reflection_start_unconfirmed'));});
      child.stdout.on('data',chunk=>{
        buffer+=chunk;if(buffer.length>32768){clearTimeout(timer);reject(Error('reflection_output_limit'));child.kill('SIGTERM');return;}
        if(!pid&&buffer.includes('\n')){
          try{const row=JSON.parse(buffer.split('\n')[0]);if(row.ready!==true||!Number.isInteger(row.pid)||row.pid<2)throw Error();pid=row.pid;clearTimeout(timer);resolve();}
          catch{clearTimeout(timer);reject(Error('reflection_start_unconfirmed'));}
        }
      });
    });
  }catch(e){child.kill('SIGTERM');throw e;}
  return {scope:config.scope,async close(){
    if(!closed)try{await exec('docker',['exec',config.containerId,'kill','-TERM',String(pid)],{timeout:3000,maxBuffer:4096});}catch{}
    await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,1500))]);
    if(!closed)child.kill('SIGTERM');
    return {stopped:closed,boundedExpirySeconds:60};
  }};
}
