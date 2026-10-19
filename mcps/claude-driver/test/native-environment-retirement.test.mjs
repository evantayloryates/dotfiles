import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary,cliVersionFromPath} from '../src/lib/paths.mjs'
import {installedWindowContaining} from '../src/lib/installed-source.mjs'
test('installed environment retirement removes commands before outstanding dispatches release environment',()=>{
 const binary=resolveClaudeBinary();assert.equal(cliVersionFromPath(binary),'2.1.299','unqualified retirement symbol profile')
 const w=installedWindowContaining(binary,'terminate(){u2(n.pluginName),Iye(n.pluginName)',{before:2500,after:1600}),s=w.text
 const from=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j)}
 const unload=from('function Q(){','function _e(){'),leave=from('leave(){',',dispatch:'),retire=from('retire(){',',resolveTables:')
 for(const active of [0,1]){
  const events=[],api=runInNewContext(`let M={kind:'live'},z=${active};${unload};({${leave},${retire},state:()=>M.kind})`,{n:{pluginName:'owned'},y:'environment',h:{unload:id=>events.push('unload:'+id)},e:{state:{environmentArgs:new Map([['environment',{}]]),sentCalls:new Map}},Pye:()=>{},Z8:()=>events.push('commands-removed'),EA:()=>events.push('tools-removed'),T3:{forgetPresses:()=>events.push('presses-removed')}})
  api.retire();assert.deepEqual(events.slice(0,3),['commands-removed','tools-removed','presses-removed'])
  if(active){assert.equal(api.state(),'retiring');assert.equal(events.length,3);api.leave()}
  assert.equal(api.state(),'unloaded');assert.equal(events.at(-1),'unload:environment')
 }
})
