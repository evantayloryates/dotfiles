// Locate installed CLI code by its shape, not by one build's minified names.
// Each role is found next to stable strings or property names; anything the
// shape no longer matches fails with the role name, which is the signal that a
// new CLI needs review. Every other free identifier gets a pass-through stub.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary,cliVersionFromPath} from '../src/lib/paths.mjs'

const cache=new Map()
export function installedBinary(){
 const binary=resolveClaudeBinary(),version=cliVersionFromPath(binary)
 if(!cache.has(binary)){const bytes=readFileSync(binary);cache.set(binary,{bytes,text:bytes.toString('latin1')})}
 return {binary,version,...cache.get(binary)}
}
const id='[\\w$]+'
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
// One unique match of `pattern` in the installed text; returns the match.
export function uniqueMatch(text,pattern,role,version){
 const all=[...text.matchAll(new RegExp(pattern.source,'g'))]
 assert.equal(all.length,1,`installed CLI ${version}: ${role} shape matched ${all.length} times`)
 return all[0]
}
export function role(source,pattern,name,version){
 const m=source.match(pattern);assert.ok(m,`installed CLI ${version}: ${name} shape not found`);return m[1]
}
// The installed module (NUL-delimited) around a byte offset, as UTF-8.
export function moduleAt({bytes},offset){
 const start=bytes.lastIndexOf(0,offset)+1,end=bytes.indexOf(0,offset)
 assert.ok(end>start&&end-start<1024*1024,'installed module boundary changed')
 return bytes.subarray(start,end).toString('utf8')
}
// Evaluate sloppy-mode `code` with every free non-builtin identifier resolved
// from `overrides`, else a pass-through stub, then return `expression`.
export function evaluateWithStubs(code,expression,overrides={}){
 const builtins=new Set(Object.getOwnPropertyNames(runInNewContext('globalThis')))
 // Names the code declares itself must resolve to its own bindings, not stubs.
 const declared=new Set([...code.matchAll(/(?:\b(?:var|let|const)\s+|,)([\w$]+)=|\bfunction\s+([\w$]+)\(/g)].map(m=>m[1]??m[2]))
 const stub=(...args)=>args[0]
 const scope=new Proxy({},{
  has:(_,key)=>typeof key==='string'&&(Object.hasOwn(overrides,key)||!builtins.has(key)&&!declared.has(key)),
  get:(_,key)=>key===Symbol.unscopables?undefined:Object.hasOwn(overrides,key)?overrides[key]:stub,
 })
 return runInNewContext(`(function(){with(scope){${code};return ${expression}}})()`,{scope},{timeout:1000})
}

// Peer inbox receiver: the function that logs "Ignoring user message with
// missing or non-string content" and routes peer frames to the queue.
export function installedPeerReceiver(){
 const bin=installedBinary(),{text,version}=bin
 const m=uniqueMatch(text,/async function ([\w$]+)\([\w$,]*\)\{let [\w$]+=e\.message\?\.content;if\(typeof [\w$]+!=="string"\|\|[\w$]+\.length===0\)\{[\w$]+\("\[uds-messaging\] Ignoring user message/,'peer receiver',version)
 const tail=text.indexOf('[uds-messaging] Routed user message to queue',m.index)
 assert.ok(tail>m.index&&tail-m.index<8000,`installed CLI ${version}: peer receiver body not found`)
 const end=text.slice(tail).search(/\}(?:async )?function |\}var /)
 assert.ok(end>0,`installed CLI ${version}: peer receiver end not found`)
 const code=bin.bytes.subarray(m.index,tail+end+1).toString('utf8').replace(/\busing ([\w$]+)=/,'const $1=')
 const roles={
  hook:role(code,new RegExp(`await (${id})\\(\\{origin:\\{kind:"peer"`),'mod receive hook',version),
  accept:role(code,new RegExp(`if\\((${id})\\(${id}\\)!=="accept"\\)return;`),'queue admission',version),
  enqueue:role(code,new RegExp(`!=="accept"\\)return;(${id})\\(`),'queue push',version),
  listeners:role(code,new RegExp(`(${id})\\(\\)\\.onEnqueue\\?\\.\\(\\)`),'enqueue listeners',version),
 }
 return {version,name:m[1],code,roles}
}

// Peer envelope adapter: the module that strips from-plugin attributes from a
// <cross-session-message> wrapper; its exported one-argument transform.
export function installedPeerEnvelope(){
 const bin=installedBinary(),{text,version}=bin
 const m=uniqueMatch(text,new RegExp(esc('=/\\sfrom-plugin\\s*(?:=\\s*(?:"[^"<>]*"|\'[^\'<>]*\'|[^\\s>]*))?/gi')),'envelope from-plugin filter',version)
 const module=moduleAt(bin,m.index)
 const transform=role(module,new RegExp(`function (${id})\\(e\\)\\{return ${id}\\(e,!0\\)\\}`),'direct envelope transform',version)
 const roles={
  transform,
  tag:role(module,new RegExp(`new RegExp\\(\`\\^<\\$\\{(${id})\\}\\[`),'envelope tag',version),
  prefix:role(module,new RegExp(`=(${id})\\.test\\(e\\);if\\(!\\(`),'envelope prefix pattern',version),
  encode:role(module,new RegExp(`\\?(${id})\\(e\\):\`<\\$\\{`),'envelope encoder',version),
 }
 const code=module.replace(/import\{[^}]*\}from"[^"]*";?/g,'').replace(/export\{[^}]*\};?/g,'')
 return {version,code,roles}
}

// Public mod API: the MCP namespace (`call`/`connect`) and tool namespace
// (`register`/`list`/`call`) factories, wrapped by the same freeze helper.
export function installedModApi(){
 const bin=installedBinary(),{text,version}=bin
 const mcp=uniqueMatch(text,/var ([\w$]+)=\([\w$]+,[\w$]+,[\w$]+\)=>([\w$]+)\(\{call:\([\w$]+,[\w$]+,[\w$]+=\{\}\)=>[\w$]+\(\{server:/,'mod mcp namespace',version)
 const wrap=mcp[2]
 const tool=uniqueMatch(text,new RegExp(`var (${id})=\\(${id},${id}\\)=>${esc(wrap)}\\(\\{register:`),'mod tool namespace',version)
 const cut=match=>{
  const rest=text.slice(match.index+match[0].length,match.index+20000),end=rest.search(/\}\);var [\w$]+=/)
  assert.ok(end>=0,`installed CLI ${version}: ${match[1]} end not found`)
  return bin.bytes.subarray(match.index,match.index+match[0].length+end+3).toString('utf8')
 }
 const toolCode=cut(tool)
 const roles={
  wrap,
  object:role(toolCode,new RegExp(`register:\\(${id}\\)=>\\{if\\(!(${id})\\(`),'object predicate',version),
  error:role(toolCode,new RegExp(`Promise\\.reject\\(new (${id})\\(`),'mod error class',version),
 }
 return {version,mcp:{name:mcp[1],code:cut(mcp)},tool:{name:tool[1],code:toolCode},roles}
}
