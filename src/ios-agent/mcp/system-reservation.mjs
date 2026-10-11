import fs from 'node:fs';
import path from 'node:path';

// Lifetime metadata only. Every actual input still requires the broker lease.
export function retainedRunner(state, now=Date.now()/1000) {
  const root=path.join(state,'system-reservations'),current=path.join(root,'current.json');
  if(!fs.existsSync(current))return null;
  const read=file=>{
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>8192)throw Error('private_reservation_required');return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
  };
  const directory=fs.lstatSync(root);if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077))throw Error('private_reservation_required');
  const marker=read(current);if(!/^[a-f0-9]{32}$/.test(marker.id||''))throw Error('invalid_reservation');
  const r=read(path.join(root,marker.id+'.json'));
  if(r.version!==1||r.id!==marker.id||!Number.isFinite(r.createdAt)||!Number.isFinite(r.expiresAt)||r.expiresAt-r.createdAt<1||r.expiresAt-r.createdAt>36000)throw Error('invalid_reservation');
  if(!r.active||r.ready!==true||r.phase!=='ready'||now<r.createdAt||now>=r.expiresAt||fs.existsSync(path.join(root,r.id+'.stop')))return null;
  if(!Number.isInteger(r.pid)||r.pid<=0||!/^[A-Fa-f0-9-]{36}$/.test(r.sessionId||''))throw Error('invalid_reservation');
  try{process.kill(r.pid,0);}catch{return null;}
  return r;
}
