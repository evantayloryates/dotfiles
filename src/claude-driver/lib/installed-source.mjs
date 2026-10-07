// Read bounded null-delimited source modules from the installed native binary.
// This is version-specific evidence extraction, not a supported app API.
import {openSync,readSync,closeSync,fstatSync} from 'node:fs'
import {createHash} from 'node:crypto'

export function installedModuleContaining(binary,needle){
 if(typeof needle!=='string'||!needle||needle.length>4096)throw Error('invalid installed source marker')
 const fd=openSync(binary,'r');let offset=0,carry=Buffer.alloc(0)
 try{
  const before=fstatSync(fd)
  if(!before.isFile())throw Error('installed binary is not a regular file')
  for(;;){
   const chunk=Buffer.alloc(2*1024*1024),count=readSync(fd,chunk,0,chunk.length,offset)
   if(!count)break
   const data=Buffer.concat([carry,chunk.subarray(0,count)]),at=data.indexOf(needle)
   if(at>=0){
    const boundary=data.lastIndexOf(0,at),end=data.indexOf(0,at),start=boundary+1
    if(boundary<0&&offset>0||end<=start||end-start>=512*1024)throw Error('installed module boundary changed')
    const after=fstatSync(fd)
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('installed binary changed while reading')
    const bytes=data.subarray(start,end)
    return {offset:offset-carry.length+start,bytes:bytes.length,text:bytes.toString('utf8'),sha256:createHash('sha256').update(bytes).digest('hex')}
   }
   offset+=count;carry=data.subarray(Math.max(0,data.length-512*1024))
  }
 }finally{closeSync(fd)}
 throw Error('installed source marker missing')
}

export function cutInstalledFunction(source,start,end){
 const i=source.indexOf(start),j=source.indexOf(end,i+start.length)
 if(i<0||j<=i||source.indexOf(start,i+start.length)!==-1)throw Error('installed function schema changed')
 return source.slice(i,j)
}

// Some bundled modules exceed the small-module bound. Read only a declared
// window around a unique marker; never silently widen it to the whole module.
export function installedWindowContaining(binary,needle,{before=0,after=8192}={}){
 if(typeof needle!=='string'||!needle||Buffer.byteLength(needle)>4096||!Number.isInteger(before)||!Number.isInteger(after)||before<0||after<Buffer.byteLength(needle)||before+after>65536)throw Error('invalid installed source window')
 const fd=openSync(binary,'r');let offset=0,carry=Buffer.alloc(0),found=null
 try{
  const initial=fstatSync(fd)
  if(!initial.isFile())throw Error('installed binary is not a regular file')
  for(;;){
   const chunk=Buffer.alloc(2*1024*1024),count=readSync(fd,chunk,0,chunk.length,offset)
   if(!count)break
   const data=Buffer.concat([carry,chunk.subarray(0,count)]);let start=0
   for(;;){const at=data.indexOf(needle,start);if(at<0)break
    const absolute=offset-carry.length+at
    if(found!==null&&found!==absolute)throw Error('installed source marker is ambiguous')
    found=absolute;start=at+Buffer.byteLength(needle)
   }
   offset+=count;carry=data.subarray(Math.max(0,data.length-Buffer.byteLength(needle)+1))
  }
  if(found===null)throw Error('installed source marker missing')
  const start=Math.max(0,found-before),bytes=Buffer.alloc(before+after)
  const count=readSync(fd,bytes,0,bytes.length,start),current=fstatSync(fd)
  if(initial.size!==current.size||initial.mtimeMs!==current.mtimeMs||initial.ctimeMs!==current.ctimeMs)throw Error('installed binary changed while reading')
  const slice=bytes.subarray(0,count)
  return {offset:start,markerOffset:found-start,bytes:slice.length,text:slice.toString('utf8'),sha256:createHash('sha256').update(slice).digest('hex')}
 }finally{closeSync(fd)}
}
