// Read one bounded public source member. Never load app/session data or execute
// a whole bundle. Contract runners execute only reviewed extracted functions.
import {constants,openSync,readSync,closeSync,fstatSync} from 'node:fs'
import {createHash} from 'node:crypto'
export const SNAPSHOT_SOURCE_SHA='b7c512ce6a9993a94b6b30e78f17cc088f0d148ec45475c6b3ae864162293327'
export const SNAPSHOT_SOURCE_MEMBER='.vite/build/index.chunk-AgchhrPF.js'
export function installedDesktopChunk(asar,member=SNAPSHOT_SOURCE_MEMBER){
 if(typeof member!=='string'||member.length>200||member.split('/').some(x=>!x||x==='..'||x==='.')||member.startsWith('/'))throw Error('desktop source member refused')
 const fd=openSync(asar,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{
  const stat=fstatSync(fd),header=Buffer.alloc(16)
  if(!stat.isFile()||readSync(fd,header,0,16,0)!==16)throw Error('desktop source archive refused')
  const headerBytes=header.readUInt32LE(12),dataStart=8+header.readUInt32LE(4)
  if(headerBytes<2||headerBytes>16*1024*1024||dataStart<16+headerBytes||dataStart>stat.size)throw Error('desktop source header bound refused')
  const bytes=Buffer.alloc(headerBytes);if(readSync(fd,bytes,0,bytes.length,16)!==bytes.length)throw Error('desktop source header truncated')
  let entry=JSON.parse(bytes);for(const part of member.split('/'))entry=entry?.files?.[part]
  if(!entry||entry.unpacked||entry.link||!Number.isSafeInteger(entry.size)||entry.size<1||entry.size>2*1024*1024||typeof entry.offset!=='string'||!/^\d+$/.test(entry.offset))throw Error('desktop source entry refused')
  const offset=dataStart+Number(entry.offset)
  if(!Number.isSafeInteger(offset)||offset<dataStart||offset+entry.size>stat.size)throw Error('desktop source entry bounds refused')
  const source=Buffer.alloc(entry.size);if(readSync(fd,source,0,source.length,offset)!==source.length)throw Error('desktop source truncated')
  const after=fstatSync(fd)
  if(stat.dev!==after.dev||stat.ino!==after.ino||stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs)throw Error('desktop source changed while reading')
  return {member,offset,bytes:source.length,sha256:createHash('sha256').update(source).digest('hex'),text:source.toString('utf8')}
 }finally{closeSync(fd)}
}
