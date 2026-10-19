import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
// Read only structural metadata for the exact supplied/inherited thread. A
// resumed chat may have several rollouts; the native state DB is authoritative.
export function codexOwnerContext({env=process.env,home=os.homedir(),threadId}={}) {
  const id=threadId??env.CODEX_THREAD_ID;
  if (!id) return {mode:'mcp-connection',reason:'no_inherited_codex_thread'};
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
    return {mode:'mcp-connection',reason:'invalid_inherited_codex_thread'};
  const codex=path.join(home,'.codex'),root=path.join(codex,'sessions');
  const fallback=reason=>({mode:'mcp-connection',reason});
  try {
    let found=[],entries=0;
    const databases=fs.readdirSync(codex).filter(n=>/^state_\d+\.sqlite$/.test(n))
      .sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));
    if(databases.length){
      const dbPath=path.join(codex,databases[0]),stat=fs.lstatSync(dbPath);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid())throw Error('metadata');
      const {DatabaseSync}=require('node:sqlite');
      const db=new DatabaseSync(dbPath,{readOnly:true});
      try{
        const row=db.prepare('SELECT rollout_path FROM threads WHERE id = ?').get(id);
        if(!row)return fallback('codex_rollout_not_found');
        found=[row.rollout_path];
      }finally{db.close();}
    }else{
      // Legacy installations without a state database: accept one exact
      // thread filename only. Multiple resumed rollouts require explicit path.
      const name=new RegExp('-'+id+'(?:_[a-f0-9-]{36})?\\.jsonl$');
      const walk=(dir,depth)=>{
        const stat=fs.lstatSync(dir);
        if(!stat.isDirectory()||stat.isSymbolicLink())return;
        for(const item of fs.readdirSync(dir,{withFileTypes:true})){
          if(++entries>100000)throw Error('bounded_discovery');
          if(depth<3&&item.isDirectory()&&/^\d{2,4}$/.test(item.name))walk(path.join(dir,item.name),depth+1);
          else if(depth===3&&item.isFile()&&item.name.startsWith('rollout-')&&name.test(item.name))found.push(path.join(dir,item.name));
        }
      };
      walk(root,0);
    }
    if(found.length!==1)return fallback(found.length?'ambiguous_codex_rollout':'codex_rollout_not_found');
    const file=found[0];
    if(typeof file!=='string'||!path.isAbsolute(file)||!file.startsWith(root+path.sep)||fs.realpathSync(file)!==file)throw Error('path');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
      const stat=fs.fstatSync(fd);
      if(!stat.isFile()||stat.uid!==process.getuid())throw Error('owner');
      const buffer=Buffer.alloc(65536),n=fs.readSync(fd,buffer,0,buffer.length,0);
      const text=buffer.subarray(0,n).toString('utf8'),end=text.indexOf('\n');
      if(end<0)throw Error('metadata');
      const meta=JSON.parse(text.slice(0,end));
      if(meta.type!=='session_meta'||meta.payload?.id!==id)throw Error('metadata');
    }finally{fs.closeSync(fd);}
    return {mode:'codex-turn',source:threadId?'explicit-thread':'inherited-thread',threadId:id,rollout:file};
  }catch{return fallback('codex_rollout_unavailable');}
}
