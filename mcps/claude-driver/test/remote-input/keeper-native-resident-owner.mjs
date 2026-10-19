// Exact owned remote resident composition. Inventory resource only; all lease
// adapter methods refuse. No model, app acquisition, input or consent relay.
import {readFileSync,openSync,closeSync,fstatSync} from 'node:fs'
import {join} from 'node:path'
import {hostname,homedir} from 'node:os'
import {createHash} from 'node:crypto'
import {serveKeeperResident} from '../../src/candidates/input-keeper/resident.mjs'
import {openNativeKeeperResource} from '../../src/candidates/input-keeper/native-resource.mjs'
import {inspectPrivateInputRuntime} from '../../src/lib/private-input-service.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018',dir=process.argv[2],controlDir=process.argv[3]
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d'||!dir?.startsWith(root+'/evidence/keeper-native-resident-')||!/^\/private\/tmp\/keeper-native-control-501-[A-Za-z0-9]+$/.test(controlDir))throw Error('remote resident composition owner refused')
const inspect=()=>inspectPrivateInputRuntime({resourceRoot:join(root,'tools/cua_node'),helperApp:join(root,'codex-home/computer-use/Codex Computer Use.app'),cli:join(root,'tools/CodexCLI.app/Contents/MacOS/codex')})
const epochOf=runtime=>createHash('sha256').update(JSON.stringify(runtime.hashes)).digest('hex')
const fd=openSync(join(dir,'ui.mutex'),'wx',0o600),s=fstatSync(fd),uiLock={dev:s.dev,ino:s.ino};closeSync(fd)
let resource,closed=false
try{
 const runtime=await inspect(),epoch=epochOf(runtime)
 const adapters={runtimeEpoch:async()=>epochOf(await inspect()),openResource:async()=>{
  resource=await openNativeKeeperResource({dir,uiLock});if(resource.startError)throw Error(resource.startError);return resource
 },observeResource:async()=>resource.probe(),observeOwner:async()=>{throw Error('inventory resident has no lease adapter')},openClient:async()=>{throw Error('inventory resident refuses task client')},retireClient:async()=>{throw Error('inventory resident has no task client')},settleInput:async()=>{throw Error('inventory resident refuses input')},closeResource:async()=>{const result=await resource.close();closed=true;return result}}
 const resident=await serveKeeperResident({dir,controlDir,epoch},adapters)
 process.on('disconnect',()=>{})
 process.send?.({type:'ready',pid:process.pid,generation:resident.generation,epoch,resourceHostPid:resource.pid})
 await resident.closed
 if(process.connected)process.disconnect()
}catch(error){
 console.error(JSON.stringify({category:error.category??'native_resident_failure',reason:error.reason??error.message}));process.exitCode=1
 if(resource&&!closed)try{await resource.close();closed=true}catch{}
 if(process.connected)process.disconnect()
}
