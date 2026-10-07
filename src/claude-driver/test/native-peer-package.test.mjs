import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerPackage} from '../lib/native-peer-package.mjs'
const id='33333333-3333-4333-8333-333333333333',cwd='/Users/taylor/.local/state/claude-driver/broker',root='/Users/taylor/Desktop/temp_reports/'
const config={id,token:'claude-driver native-check '+'d'.repeat(32),brokerSession:'local_35b3ba48-f02e-48de-bfbb-925192d90de1',brokerCwd:cwd,targetSession:'local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',ready:root+'native-peer-ready-'+id+'.json',intent:cwd+'/.native-peer-read-'+id+'.started.json',report:root+'native-peer-read-'+id+'.report.json',notBefore:1,deadline:100}
test('generated self-contained native package registers passively and invokes exact read once',async()=>{
 const {files,hashes}=buildNativePeerPackage(config),handlers={},writes=[],calls=[]
 assert.equal(Object.keys(hashes).length,3);assert.ok(!files['hooks/register.js'].includes('import '))
 runInNewContext(files['hooks/register.js'].replace('export function register','function register')+';register',( {JSON,Object} ))((name,fn)=>handlers[name]=fn)
 assert.equal(writes.length,0);assert.equal(calls.length,0)
 const $={session:{id:async()=>config.brokerSession,cwd:async()=>cwd},fs:{exists:async()=>false,write:async(p,t)=>writes.push({p,data:JSON.parse(t)})},clock:{now:async()=>10},mcp:{call:async(...args)=>{calls.push(args);return {isError:false}}}}
 await handlers['session.start']($,{},async()=>{})
 assert.equal(writes.length,1);assert.equal(calls.length,0)
 await handlers['session.receive']($,{origin:{kind:'peer'},text:config.token},()=>assert.fail('queued'))
 await handlers['session.receive']($,{origin:{kind:'peer'},text:config.token},()=>assert.fail('queued'))
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),['ccd_session_mgmt','get_session',{session_id:config.targetSession}]);assert.equal(writes.length,3)
})
test('package refuses path drift, extra configuration and unbounded deadlines',()=>{
 for(const change of [{report:'/other'},{deadline:300002},{extra:true},{targetSession:config.brokerSession}])assert.throws(()=>buildNativePeerPackage({...config,...change}))
})
