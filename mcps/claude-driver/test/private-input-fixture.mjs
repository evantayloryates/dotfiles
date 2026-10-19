// Protocol-only binding for synthetic backends that never start an MCP or UI.
// This is not a native helper/runtime approval or a production inspector result.
import {join} from 'node:path'
export function syntheticInputBinding(root){return {version:1,node:process.execPath,launcher:join(root,'unused-cua.mjs'),resourceRoot:root,cli:join(root,'backend'),codexHome:root,socketPath:join(root,'private.sock'),startupDisabledApp:join(root,'startup-disabled.app')}}
export function syntheticInputRoster(){return {data:[{name:'cua_repl',pluginId:null,runtimeStatus:'connected',tools:{js:{},js_reset:{},turn_ended:{}},authStatus:'unsupported',resources:[],resourceTemplates:[]}],nextCursor:null}}
