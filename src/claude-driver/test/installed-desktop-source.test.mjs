import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
function fixture(entry={offset:'0',size:9},body=Buffer.from('synthetic')){
 const dir=mkdtempSync(join(tmpdir(),'desktop-source-')),path=join(dir,'app.asar'),tree=Buffer.from(JSON.stringify({files:{'member.js':entry}})),head=Buffer.alloc(16)
 head.writeUInt32LE(8+tree.length,4);head.writeUInt32LE(tree.length,12);writeFileSync(path,Buffer.concat([head,tree,body]));return {dir,path}
}
test('source extractor reads exact bounded member with a fingerprint',()=>{
 const f=fixture();try{const r=installedDesktopChunk(f.path,'member.js');assert.equal(r.text,'synthetic');assert.equal(r.bytes,9);assert.match(r.sha256,/^[a-f0-9]{64}$/)}finally{rmSync(f.dir,{recursive:true,force:true})}
})
test('source extractor refuses linked, unpacked, oversized, truncated and malformed entries',()=>{
 for(const entry of [{offset:'0',size:9,link:'other'},{offset:'0',size:9,unpacked:true},{offset:'0',size:2097153},{offset:'100',size:9},{offset:'-1',size:9},{offset:0,size:9},{offset:'0',size:0}]){
  const f=fixture(entry);try{assert.throws(()=>installedDesktopChunk(f.path,'member.js'),/refused/)}finally{rmSync(f.dir,{recursive:true,force:true})}
 }
 const f=fixture();try{for(const member of ['../member.js','/member.js','a//b','missing.js'])assert.throws(()=>installedDesktopChunk(f.path,member),/refused/);const link=join(f.dir,'linked.asar');symlinkSync(f.path,link);assert.throws(()=>installedDesktopChunk(link,'member.js'))}finally{rmSync(f.dir,{recursive:true,force:true})}
})
