import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining} from '../lib/installed-source.mjs'
test('installed environment retirement removes commands before outstanding dispatches release environment',()=>{
 const w=installedWindowContaining(resolveClaudeBinary(),'terminate(){bpn(n.pluginName),sse(n.pluginName),eV(n.pluginName)',{before:4000,after:1600}),s=w.text
 const from=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j)}
 const unload=from('function V(){','function he(){'),leave=from('leave(){',',dispatch:'),retire=from('retire(){',',resolveTables:')
 for(const active of [0,1]){
  const events=[],api=runInNewContext(`let M={kind:'live'},B=${active};${unload};({${leave},${retire},state:()=>M.kind})`,{n:{pluginName:'owned'},h:'environment',g:{unload:id=>events.push('unload:'+id)},eV:()=>events.push('commands-removed'),YE:()=>events.push('tools-removed'),T3:{forgetPresses:()=>events.push('presses-removed')}})
  api.retire();assert.deepEqual(events.slice(0,3),['commands-removed','tools-removed','presses-removed'])
  if(active){assert.equal(api.state(),'retiring');assert.equal(events.length,3);api.leave()}
  assert.equal(api.state(),'unloaded');assert.equal(events.at(-1),'unload:environment')
 }
})
