// Preparation only: no native load, process launch, or unload qualification.
// The child has an independent hard deadline even if native disposal fails.
export function buildNativeResourceProgram({serviceId,deadline,evidenceRoot}){
 if(!/^[a-f0-9]{32}$/.test(serviceId)||!Number.isSafeInteger(deadline))throw Error('invalid resource identity')
 if(evidenceRoot!=='/Users/taylor/.local/state/claude-driver/broker')throw Error('invalid resource evidence root')
 const config=JSON.stringify({serviceId,deadline,evidenceRoot})
 return `import fs from 'node:fs';
const config=${config},started=Date.now();
if(config.deadline<=started||config.deadline-started>150000)process.exit(64);
const stem=config.evidenceRoot+'/.native-service-resource-'+config.serviceId;
const identity={schemaVersion:1,scope:'owned-native-resource',serviceId:config.serviceId,pid:process.pid,ppid:process.ppid,startedAt:new Date(started).toISOString(),selfDeadline:config.deadline};
let finished=false;
function finish(reason,code){
 if(finished)return;finished=true;
 try{fs.writeFileSync(stem+'.exit.json',JSON.stringify({...identity,reason,code,exitedAt:new Date().toISOString()})+'\\n',{flag:'wx',mode:0o600})}catch{process.exit(74)}
 process.exit(code);
}
process.on('SIGTERM',()=>finish('SIGTERM',143));
process.on('SIGINT',()=>finish('SIGINT',130));
try{fs.writeFileSync(stem+'.ready.json',JSON.stringify(identity)+'\\n',{flag:'wx',mode:0o600})}catch{process.exit(73)}
setTimeout(()=>finish('deadline',0),Math.max(1,config.deadline-Date.now()));
setInterval(()=>process.stdout.write('owned-resource-alive\\n'),250);
`
}
