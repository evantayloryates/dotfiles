#!/usr/bin/env node
// Exact current settings.read adapter with synthetic sources. No native module,
// actual settings values, writes, refresh, process control or model invocation.
import assert from 'node:assert/strict'
import {Script,runInNewContext} from 'node:vm'
import {join} from 'node:path'
import {installedWindowContaining} from '../lib/installed-source.mjs'
import {versions,resolveClaudeBinary} from '../lib/paths.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','mod-settings-contract-299-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[];let source,failure
try{
 assert.equal(versions().cli,'2.1.299','unreviewed CLI')
 const window=installedWindowContaining(resolveClaudeBinary(),'function frr(e){let n=e.source,r=n===void 0',{before:0,after:1800}),end=window.text.indexOf('function grr(');assert.ok(end>0,'adapter boundary changed');let body=window.text.slice(0,end);try{new Script(body)}catch{body=JSON.parse('"'+body+'"');new Script(body)}source={offset:window.offset,sha256:window.sha256,bytes:window.bytes}
 const calls=[],sources={userSettings:{fixture:'user'},projectSettings:{hooks:{PreToolUse:[{matcher:'owned synthetic hook'}]},env:{SYNTHETIC_PRIVATE:'not actual data'}},localSettings:{fixture:'local'},policySettings:{fixture:'policy'}},merged={fixture:'merged',nested:{value:1}},p7={user:'userSettings',project:'projectSettings',local:'localSettings',policy:'policySettings'}
 const api=runInNewContext('(()=>{'+body+';return {read:frr,check:prr}})()',{Object,Promise,p7,ct:()=>{calls.push('merged');return merged},fe:key=>{calls.push(key);return sources[key]},tun:x=>{calls.push('policy-transform');return x},DW:x=>structuredClone(x)},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 const check=async(name,fn)=>{calls.length=0;await fn();rows.push({name,ok:true})}
 await check('merged read uses snapshot provider and returns independent plain data',async()=>{const x=await api.read({});assert.deepEqual(x,merged);x.nested.value=99;assert.equal(merged.nested.value,1);assert.deepEqual(calls,['merged'])})
 await check('selected source read uses loaded source provider, with no explicit refresh call',async()=>{const x=await api.read({source:'project'});assert.deepEqual(x,sources.projectSettings);assert.deepEqual(calls,['projectSettings'])})
 await check('policy source follows its policy transform; no other source is read',async()=>{assert.deepEqual(await api.read({source:'policy'}),sources.policySettings);assert.deepEqual(calls,['policySettings','policy-transform'])})
 await check('source validation rejects unknown and inherited keys before read',async()=>{for(const x of ['unknown','toString','__proto__',null,42])assert.equal(typeof api.check(x),'string');for(const x of [undefined,'user','project','local','policy'])assert.equal(api.check(x),undefined)})
 await check('snapshot read does not redact env or helper fields; do not log real values',async()=>{const x=await api.read({source:'project'});assert.equal(x.env.SYNTHETIC_PRIVATE,'not actual data');assert.deepEqual(calls,['projectSettings'])})
}catch(e){failure=String(e.message).slice(0,500)}
const evidence={scope:'installed-2.1.299-settings-read-adapter-isolated',runtimeBuild:RUNTIME_BUILD,versions:versions(),source,rows,ok:!failure,...failure&&{failure},nativeCalls:0,actualSettingsRead:false,settingsWrites:0,limitations:['ct/fe/settings merge, policy transform and cloning are synthetic dependencies','Does not establish native cache refresh, hook reload or current settings adoption','The adapter exposes read only; no supported refresh API is established','Never emit real settings.read values: env and helper fields are not redacted']};writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'native-settings-read-contract',source:'installed-adapter-isolated',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Current settings.read adapter returns cloned merged/source data, with no explicit refresh operation. Synthetic provider execution does not qualify native settings cache reload. Real settings snapshots are unredacted; inspect only narrow owned fields.'});console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
