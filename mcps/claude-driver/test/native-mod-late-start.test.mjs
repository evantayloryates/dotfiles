import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {installedWindowContaining,cutInstalledFunction} from '../src/lib/installed-source.mjs'
import {resolveClaudeBinary,cliVersionFromPath} from '../src/lib/paths.mjs'
test('installed late-load dispatcher raises session.start once per module identity',async()=>{
 const binary=resolveClaudeBinary(),version=cliVersionFromPath(binary)
 const profiles={
  '2.1.289':{marker:'function hn(e,n,o){for(let r of e)',start:'function hn(',end:'async function yn(',name:'hn',deps:{t:()=>{},oe:()=>'/synthetic',UJ:options=>({session:{start:async args=>events.push({options,args})}}),l:String}},
  '2.1.299':{marker:'function Io(e,n,r){for(let s of e)',start:'function Io(',end:'async function Po(',name:'Io',deps:{t:()=>{},le:()=>'/synthetic',gre:options=>({session:{start:async args=>events.push({options,args})}}),zcr:()=>false,l:String}}
 },events=[],profile=profiles[version]
 assert.ok(profile,`unqualified installed CLI version: ${version}`)
 const source=installedWindowContaining(binary,profile.marker,{after:1000}).text
 const code=cutInstalledFunction(source,profile.start,profile.end)
 const dispatch=runInNewContext(`(()=>{${code};return ${profile.name}})()`,profile.deps,{timeout:1000})
 const owned={name:'synthetic-peer-probe',hooks:event=>event==='session.start'},passive={name:'no-start-hook',hooks:()=>false},seen=new WeakSet()
 dispatch([owned,passive],seen,{surface:'synthetic',isInteractive:true});await Promise.resolve();await Promise.resolve()
 dispatch([owned],seen,{});await Promise.resolve()
 assert.equal(events.length,1);assert.equal(events[0].options.only,owned.name);assert.equal(events[0].args.cwd,'/synthetic')
})
