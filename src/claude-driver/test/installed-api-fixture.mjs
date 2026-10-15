// Explicit observed symbol profiles; unknown binaries must fail qualification.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {resolveClaudeBinary,cliVersionFromPath} from '../lib/paths.mjs'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
export function installedApiFixture(){
 const binary=resolveClaudeBinary(),version=cliVersionFromPath(binary)
 const profiles={
  '2.1.289':{marker:'var gk=(e,t,o)=>Ny({call:',mcp:'gk',mcpEnd:'var Bp=',tool:'nw',toolEnd:'var sw=',wrap:'Ny',object:'N'},
  '2.1.299':{marker:'var kT=(e,t,o)=>ES({call:',mcp:'kT',mcpEnd:'var Mf=',tool:'cE',toolEnd:'var lE=',wrap:'ES',object:'L'}
 }
 const p=profiles[version];assert.ok(p,`unqualified installed CLI version: ${version}`)
 const evidence=installedWindowContaining(binary,p.marker,{after:14000})
 const deps={[p.wrap]:x=>x,[p.object]:x=>!!x&&typeof x==='object',Ie:Error}
 const make=(name,end)=>runInNewContext(`(()=>{${cutInstalledFunction(evidence.text,'var '+name+'=',end)};return ${name}})()`,deps,{timeout:1000})
 return {mcp:make(p.mcp,p.mcpEnd),tool:make(p.tool,p.toolEnd),version,sha256:evidence.sha256}
}
