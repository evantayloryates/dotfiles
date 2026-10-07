import test from 'node:test'
import assert from 'node:assert/strict'
import {diagnosticFailure} from '../candidates/native-mod-probe/diagnostic-failure.js'

test('adapter errors expose fixed categories while suppressing sensitive text',()=>{
 const cases=[
 ['probe: $.mcp.call: no connected MCP tool private-token on a server named private-server','mcp-tool-unavailable'],
 ['probe: $.tool.call: no tool named private-tool in this session','tool-hidden-or-unavailable'],
 ['probe: $.tool.call(private-tool) produced no result (aborted)','tool-pipeline-no-result'],
 ['probe: $.mcp.call(s,t) refused: Native broker operation lacks one live matching epoch-bound dispatch checkpoint, private-data','broker-dispatch-gate-refusal'],
 ['probe: $.mcp.call(s,t) refused: private-user-reason','tool-permission-refusal'],
 ['private-token','unidentified-exception']]
 for(const [message,expected] of cases)assert.equal(diagnosticFailure(Error(message)),expected)
 assert.equal(diagnosticFailure(null),'unidentified-exception')
 assert.equal(diagnosticFailure({get message(){throw Error('private')}}),'unidentified-exception')
})

import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
const code=readFileSync(new URL('../candidates/native-mod-diagnostic/hooks/register.js',import.meta.url),'utf8')
function harness({id='35b3ba48-f02e-48de-bfbb-925192d90de1',prior=false,writeFails=false,message='probe: $.mcp.call(s,t) refused: Native broker operation lacks one live matching epoch-bound dispatch checkpoint, secret'}={}){
 const hooks=[],writes=[],calls=[],commands=[]
 runInNewContext(`(()=>{${code.replace('export function register','function register')};return register})()`,{JSON})((...args)=>hooks.push(args))
 const $={session:{id:async()=>id,cwd:async()=>'/Users/taylor/.local/state/claude-driver/broker'},command:{register:async x=>commands.push(x)},fs:{exists:async()=>prior,write:async(p,t)=>{if(writeFails)throw Error('secret');writes.push({p,data:JSON.parse(t)})}},clock:{now:async()=>1791384000000},mcp:{call:async x=>{calls.push(x);throw Error(message)}}}
 return {$,writes,calls,commands,start:hooks[0].at(-1),run:hooks[1].at(-1)}
}
test('registration does no work; concurrent diagnostics preserve intent and emit private category',async()=>{
 const h=harness();await h.start(h.$,{},async x=>x)
 assert.equal(h.commands[0].name,'claude-driver-native-read-diagnostic');assert.equal(h.calls.length,0);assert.equal(h.writes.length,0)
 const results=await Promise.all([h.run(h.$,{}),h.run(h.$,{})]);assert.equal(h.calls.length,1);assert.equal(h.writes.length,2)
 assert.equal(h.writes[1].data.failureCategory,'broker-dispatch-gate-refusal');assert.equal(h.writes[1].data.releaseAuthorized,false)
 assert.equal(h.writes[1].data.gateQualified,false);assert.ok(!JSON.stringify(results).includes('secret'))
 assert.ok(h.writes[0].p.includes('94701894-fc71-4dfa-943e-f5a1cc3fc8b8'))
})
test('foreign session, durable prior attempt and failed preflight never call MCP',async()=>{
 for(const options of [{id:'foreign'},{prior:true},{writeFails:true}]){const h=harness(options);await h.run(h.$,{});assert.equal(h.calls.length,0)}
})
