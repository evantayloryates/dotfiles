import {createHash} from 'node:crypto'
import {validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {DriverError} from './paths.mjs'
const marker='CLAUDE_DRIVER_SERVICE_SEED_READY'
export const serviceSeedDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
// A fresh minimal transcript, never an old conversation or an instruction to
// install service authority. Native import/consent/permission remain separate.
export function serviceSeedRecipe(identity,{probeRoot}={}){
 validateServiceRecoveryIdentity(identity,{session:identity?.sessionId,serviceId:identity?.serviceId,...probeRoot?{probeRoot}:{}})
 return {schemaVersion:1,sessionId:identity.sessionId,cliSessionId:identity.cliSessionId,cwd:identity.cwd,identitySha256:serviceSeedDigest(identity),title:'claude-driver recovered service '+identity.cliSessionId.slice(0,8),model:'claude-haiku-5-5',marker,permissionMode:'dontAsk',tools:[],mcpServers:{}}
}
export function serviceSeedArguments(recipe){
 if(recipe?.schemaVersion!==1||recipe.marker!==marker||recipe.model!=='claude-haiku-5-5'||recipe.permissionMode!=='dontAsk'||JSON.stringify(recipe.tools)!=='[]'||JSON.stringify(recipe.mcpServers)!=='{}'||recipe.sessionId!=='local_'+recipe.cliSessionId||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(recipe.cliSessionId||'')||recipe.title!=='claude-driver recovered service '+recipe.cliSessionId.slice(0,8))throw Error('exact minimal service seed required')
 return ['-p','Reply exactly '+marker+'. Do not use tools.','--session-id',recipe.cliSessionId,'-n',recipe.title,'--model',recipe.model,'--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools','','--setting-sources','','--permission-mode','dontAsk','--max-turns','1','--output-format','json']
}
// Internal only; caller supplies independently reviewed absence/retirement proof
// and a durable one-use claim. No public operation calls this primitive yet.
export async function runServiceSeedProvision(recipe,expectedRecipeSha256,d){
 if(serviceSeedDigest(recipe)!==expectedRecipeSha256)throw Error('exact service seed digest required')
 const args=serviceSeedArguments(recipe),check=async()=>{await d.guard();const p=await d.inspect();if(p?.seedPreparationEligible!==true||p.sessionId!==recipe.sessionId||p.identitySha256!==recipe.identitySha256||p.oldGenerationRetired!==true||p.oldPidAbsent!==true||p.recordAbsent!==true||p.allTranscriptsAbsent!==true||p.rolesPreserved!==true)throw Error('service seed prerequisites unqualified')}
 await check();await d.claim();await d.record('claimed',{sessionId:recipe.sessionId,recipeSha256:expectedRecipeSha256});await check()
 await d.record('before-bootstrap',{bootstrapAttempted:true});await check()
 // Never cleanup/retry unknown CLI output: it may already have written a seed.
 const output=await d.bootstrap(args,recipe.cwd);await d.record('after-bootstrap',{code:output?.code===0?0:null})
 let reply;try{if(output?.code!==0||typeof output.stdout!=='string'||output.stdout.length>65536)throw Error();reply=JSON.parse(output.stdout)}catch{throw new DriverError('minimal service bootstrap unverified; preserve original attempt',{category:'service_seed_unresolved'})}
 if(reply.is_error!==false||reply.session_id!==recipe.cliSessionId||reply.result!==marker||reply.num_turns!==1)throw new DriverError('minimal service bootstrap reply unverified; preserve original attempt',{category:'service_seed_unresolved'})
 await d.guard();const transcript=await d.verifyTranscript(recipe)
 if(transcript?.verified!==true||!/^[a-f0-9]{64}$/.test(transcript.fingerprint||''))throw Error('new service seed transcript unverified')
 const result={sessionId:recipe.sessionId,seedCreated:true,bootstrapReplyVerified:true,recipeSha256:expectedRecipeSha256,transcriptFingerprint:transcript.fingerprint,importAttempted:false,recordRestored:false,permissionRaiseAuthorized:false,nativeEpochAssessed:false,serviceRestored:false,servingQualified:false,replayAuthorized:false,retrySafe:false}
 await d.record('seed-created',result);return result
}
