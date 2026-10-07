import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
import {resolveClaudeBinary} from '../lib/paths.mjs'
test('installed late-load dispatcher raises session.start once per module identity',async()=>{
 const source=installedWindowContaining(resolveClaudeBinary(),'function hn(e,n,o){for(let r of e)',{after:800}).text
 const code=cutInstalledFunction(source,'function hn(','async function yn('),events=[]
 const dispatch=runInNewContext(`(()=>{${code};return hn})()`,{t:()=>{},oe:()=>'/synthetic',UJ:options=>({session:{start:async args=>events.push({options,args})}}),l:String},{timeout:1000})
 const owned={name:'synthetic-peer-probe',hooks:event=>event==='session.start'},passive={name:'no-start-hook',hooks:()=>false},seen=new WeakSet()
 dispatch([owned,passive],seen,{surface:'synthetic',isInteractive:true});await Promise.resolve();await Promise.resolve()
 dispatch([owned],seen,{});await Promise.resolve()
 assert.equal(events.length,1);assert.equal(events[0].options.only,owned.name);assert.equal(events[0].args.cwd,'/synthetic')
})
