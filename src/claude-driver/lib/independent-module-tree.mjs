import {constants,openSync,closeSync,fstatSync,lstatSync,readdirSync,readSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
// These are non-executable loader/editor support paths. Their current bytes
// are preserved and compared, not admitted using historical declaration hashes.
const auxiliary=['tsconfig.json','.claude-plugin/types/.gitignore','.claude-plugin/types/tsconfig.json','.claude-plugin/types/claude-code/index.d.ts','.claude-plugin/types/claude-code-mcp/index.d.ts','.claude-plugin/types/claude-code-tools/index.d.ts']
export function snapshotIndependentModule(root,expected){
 if(Object.keys(expected).sort().join(',')!=='.claude-plugin/plugin.json,hooks/hooks.json,hooks/register.js')throw Error('module shape')
 const allowed=new Set([...Object.keys(expected),...auxiliary]),dirs=new Set([...allowed].flatMap(p=>p.split('/').slice(0,-1).map((_,i)=>p.split('/').slice(0,i+1).join('/')))),inventory={};let total=0
 function walk(dir,prefix=''){
  const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())throw Error('module directory')
  const names=readdirSync(dir).sort();if(names.length>12)throw Error('module bound')
  for(const name of names){const rel=prefix+name,file=join(dir,name),s=lstatSync(file);if(s.isSymbolicLink()||s.uid!==process.getuid())throw Error('module ownership')
   if(s.isDirectory()){if(!dirs.has(rel))throw Error('unknown module directory');walk(file,rel+'/');continue}
   if(!allowed.has(rel))throw Error('unknown module file')
   const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
   try{const before=fstatSync(fd);if(!before.isFile()||before.uid!==process.getuid()||before.size>1048576||(total+=before.size)>4194304)throw Error('module file bound');const body=Buffer.alloc(before.size);let offset=0;while(offset<body.length){const n=readSync(fd,body,offset,body.length-offset,offset);if(!n)throw Error('module changed');offset+=n}const after=fstatSync(fd);if(body.length!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('module changed');const sha256=createHash('sha256').update(body).digest('hex');if(expected[rel]&&sha256!==expected[rel])throw Error('module code changed');inventory[rel]={bytes:body.length,sha256}}finally{closeSync(fd)}
  }
 }
 walk(root);if(Object.keys(expected).some(p=>!inventory[p]))throw Error('module incomplete');return inventory
}
export function independentRetirementLedgerMatches(ledger,{serviceId,pointer}){
 return !!(ledger&&ledger.schemaVersion===1&&ledger.kind==='independent-service-retirement'&&ledger.serviceId===serviceId&&['sessionId','build','generation','pid','procStart'].every(k=>ledger[k]===pointer[k])&&['before-move','files-retired'].includes(ledger.phase)&&ledger.inventory&&typeof ledger.inventory==='object'&&!Array.isArray(ledger.inventory))
}
