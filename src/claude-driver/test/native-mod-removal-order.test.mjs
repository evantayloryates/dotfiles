import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining} from '../lib/installed-source.mjs'
test('installed collection refresh emits removal only after reload and updated loaded inventory',async()=>{
 const binary=resolveClaudeBinary(),window=installedWindowContaining(binary,'function RUt({watchRoot:e,listChildren:n,reloadPlugins:r,tell:s,',{after:6000}),body=window.text.slice(0,window.text.indexOf('import{join as xRo'))
 const diff=(before,after)=>({appeared:after.filter(x=>!before.has(x)),gone:[...before.keys()].filter(x=>!after.includes(x))})
 const events=[],create=runInNewContext(body+';RUt',{Map,Promise,Number,tY:diff,bUt:()=>0,TUt:()=>{},EUt:()=>({sawChange(){},isDeferring:()=>false,admits:()=>true}),qHr:x=>{events.push('inventory-reviewed');assert.equal(x.before.get('owned'),'plugin');assert.equal(x.after.size,0);return [{plugin:'plugin',text:'removed'}]},jLe:x=>x,cVn:()=> 'error',_Ut:()=> 'storm'})
 let changed,timer,finish;const gate=new Promise(resolve=>finish=resolve),root='/synthetic/mods'
 const manager=create({watchRoot:(_,fn)=>{changed=fn;return {close:async()=>{}}},listChildren:async()=>[],reloadPlugins:async()=>{events.push('reload-start');await gate;manager.watchCollections([{root,loaded:new Map}]);events.push('reload-end');return 'reloaded'},tell:(plugin,text)=>events.push('tell:'+text),debounceMs:0,burst:{},storm:{quietMs:100},clock:{now:()=>1000,setTimeout:fn=>{timer=fn;return ()=>{}}},turn:{onBegin:()=>()=>{},onEnd:()=>()=>{},isRunning:()=>false}})
 manager.watchCollections([{root,loaded:new Map([['owned','plugin']])}]);changed();timer();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(events,['reload-start']);finish();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(events,['reload-start','reload-end','inventory-reviewed','tell:removed']);await manager.dispose()
})
