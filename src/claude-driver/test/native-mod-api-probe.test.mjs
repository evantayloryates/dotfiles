import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
test('corrected candidate crosses installed public wrapper with exact positional native input',async()=>{
 const source=installedWindowContaining(resolveClaudeBinary(),'var gk=(e,t,o)=>Ny({call:',{after:220}).text
 const factory=runInNewContext(`(()=>{${cutInstalledFunction(source,'var gk=','var Bp=')};return gk})()`,{Ny:x=>x})
 const hooks=[],calls=[],writes=[],commands=[]
 const code=readFileSync(new URL('../candidates/native-mod-api-probe/hooks/register.js',import.meta.url),'utf8')
 runInNewContext(`(()=>{${code.replace('export function register','function register')};return register})()`,{JSON})((...x)=>hooks.push(x))
 const $={session:{id:async()=> '35b3ba48-f02e-48de-bfbb-925192d90de1',cwd:async()=>'/Users/taylor/.local/state/claude-driver/broker'},command:{register:async x=>commands.push(x)},fs:{exists:async()=>false,write:async(p,t)=>writes.push(JSON.parse(t))},clock:{now:async()=>1791385000000},mcp:factory('synthetic',async x=>{calls.push(x);throw Error('synthetic: $.mcp.call(s,t) refused: Native broker operation lacks one live matching epoch-bound dispatch checkpoint')},()=>{})}
 await hooks[0].at(-1)($,{},async x=>x);assert.equal(calls.length,0);assert.equal(writes.length,0)
 await Promise.all([hooks[1].at(-1)($,{}),hooks[1].at(-1)($,{})])
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{server:'ccd_session_mgmt',tool:'get_session',args:{session_id:'local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14'}}])
 assert.equal(writes.length,2);assert.equal(writes[1].failureCategory,'broker-dispatch-gate-refusal');assert.equal(writes[1].gateQualified,false)
})
