// The installed public mod API, located by shape (see installed-shape.mjs) so
// a new CLI build is exercised as-is; a changed shape fails with its role name.
import {runInNewContext} from 'node:vm'
import {installedModApi} from './installed-shape.mjs'
export function installedApiFixture(){
 const api=installedModApi(),{wrap,object,error}=api.roles
 const deps={[wrap]:x=>x,[object]:x=>!!x&&typeof x==='object',[error]:Error}
 const make=({name,code})=>runInNewContext(`(()=>{${code};return ${name}})()`,deps,{timeout:1000})
 return {mcp:make(api.mcp),tool:make(api.tool),version:api.version}
}
