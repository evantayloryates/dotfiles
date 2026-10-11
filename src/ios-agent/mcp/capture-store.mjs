import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const sanitize=createRequire(import.meta.url)('../web/rich-capture.js').sanitize;
const maxTotal=128*1024*1024,maxCapture=32*1024*1024;
function privateDir(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink()||fs.statSync(dir).mode&0o077)throw Error('private_capture_directory_required');}
function write(file,value){const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,value);}finally{fs.closeSync(fd);}}
export class CaptureStore {
  constructor(state){this.root=path.join(state,'rich-captures');privateDir(this.root);this.prune();}
  directories(){return fs.readdirSync(this.root,{withFileTypes:true}).filter(x=>x.isDirectory()&&/^[a-f0-9]{32}$/.test(x.name)).map(x=>path.join(this.root,x.name));}
  prune(now=Date.now()) {for(const dir of this.directories()){try{const meta=JSON.parse(fs.readFileSync(path.join(dir,'retention.json')));if(Number.isFinite(meta.expiresAt)&&now>=meta.expiresAt)fs.rmSync(dir,{recursive:true});}catch{}}}
  usage(dir=this.root){let bytes=0;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isFile())bytes+=fs.statSync(p).size;else if(item.isDirectory())bytes+=this.usage(p);}return bytes;}
  create(id,ttlSeconds=3600){this.prune();privateDir(path.join(this.root,id));write(path.join(this.root,id,'retention.json'),JSON.stringify({createdAt:Date.now(),expiresAt:Date.now()+ttlSeconds*1000}));}
  saveDiagnostic(value){
    this.prune();const encoded=JSON.stringify(value),bytes=Buffer.byteLength(encoded);
    if(bytes>2*1024*1024||this.usage()+bytes+256>maxTotal)throw Error('capture_storage_quota_reached');
    const id=randomBytes(16).toString('hex');this.create(id);
    const file=path.join(this.root,id,'inspector.json');
    try{write(file,encoded);}catch(error){fs.rmSync(path.dirname(file),{recursive:true,force:true});throw error;}
    return {file,bytes,retentionSecondsRemaining:3600};
  }
  save(id,result){this.prune();const dir=path.join(this.root,id);if(!fs.existsSync(dir))throw Error('capture_expired');privateDir(dir);
    let data={capture:sanitize(result.capture),remainingEvents:result.remainingEvents,events:(result.events||[]).map(event=>sanitize(event))},binaryBytes=0;const audio=[];
    for(let i=0;i<(result.events||[]).length;i++){
      const event=result.events[i];if(event.kind!=='audio'||typeof event.base64!=='string')continue;
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(event.base64)||event.base64.length>196608)throw Error('bounded_audio_chunk_required');
      const bytes=Buffer.from(event.base64,'base64'),name=randomBytes(16).toString('hex')+'.audio';binaryBytes+=bytes.length;
      audio.push({name,bytes});data.events[i]={sequence:event.sequence,at:event.at,kind:'audio',mime:event.mime,trackRef:event.trackRef,file:name,bytes:bytes.length};
    }
    const encoded=JSON.stringify(data),needed=Buffer.byteLength(encoded)+binaryBytes;
    if(this.usage(dir)+needed>maxCapture||this.usage()+needed>maxTotal)throw Error('capture_storage_quota_reached');
    for(const a of audio)write(path.join(dir,a.name),a.bytes);
    const file=path.join(dir,randomBytes(16).toString('hex')+'.json');write(file,encoded);
    return {file,eventCount:result.events?.length||0,audioChunks:audio.length,bytes:needed,retentionSecondsRemaining:Math.max(0,Math.floor((JSON.parse(fs.readFileSync(path.join(dir,'retention.json'))).expiresAt-Date.now())/1000))};
  }
}
