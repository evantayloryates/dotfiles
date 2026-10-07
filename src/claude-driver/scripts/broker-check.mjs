#!/usr/bin/env node
// Dispatch checkpoint; cached commands first enter the sealed runtime.
import {dirname,join,resolve} from 'node:path'
import {lstatSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {homedir} from 'node:os'
const [id,index]=process.argv.slice(2)
const dirAt=process.argv.indexOf('--dir')
const dir=dirAt>=0?process.argv[dirAt+1]:join(process.env.CLAUDE_DRIVER_STATE_DIR||join(homedir(),'.local','state','claude-driver'),'broker')
// The small cached-command shim admits a sealed bootstrap before importing
// any service dependency. Future source edits cannot change the selected loop.
const runtimePointer=join(dir, 'runtime.json')
let pinned=false
try { lstatSync(runtimePointer); pinned=true } catch(e) { if(e.code!=='ENOENT')throw e }
if(pinned && !/\/releases\/[a-f0-9]{64}\/scripts\//.test(fileURLToPath(import.meta.url))) {
 const stat=lstatSync(runtimePointer)
 if(stat.isSymbolicLink()||!stat.isFile()||stat.uid!==process.getuid()||stat.size>1024*1024)throw Error('invalid runtime pointer')
 const pointer=JSON.parse(readFileSync(runtimePointer,'utf8')),hash=pointer.bootstrapHash
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('sealed runtime bootstrap missing; preserve handoff')
 const entry=join(dirname(resolve(dir)),'entry',hash+'.mjs'),entryStat=lstatSync(entry)
 if(entryStat.isSymbolicLink()||!entryStat.isFile()||entryStat.uid!==process.getuid()||entryStat.mode&0o222||entryStat.size>65536||createHash('sha256').update(readFileSync(entry)).digest('hex')!==hash)throw Error('sealed runtime bootstrap invalid')
 const {runPinnedEntry}=await import(pathToFileURL(entry).href)
 await runPinnedEntry({dir,kind:'broker-check'})
 process.exit(0)
}
process.env.CLAUDE_DRIVER_STATE_DIR=dirname(dir)
const {authorizeDispatch}=await import('../lib/requests.mjs')
console.log(JSON.stringify(await authorizeDispatch(id,Number(index))))
