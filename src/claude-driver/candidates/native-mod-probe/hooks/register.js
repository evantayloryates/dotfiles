// Staged only. Calling the ordinary get_session without a dispatch checkpoint
// should be refused by the existing broker PreToolUse gate. A successful read
// is safe but would leave that gate path unqualified. Never return raw metadata.
const BROKER='local_35b3ba48-f02e-48de-bfbb-925192d90de1'
const CWD='/Users/taylor/.local/state/claude-driver/broker'
const FIXTURE='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14'
async function owned($){
 const id=await $.session.id(),cwd=await $.session.cwd()
 return (id===BROKER||id===BROKER.slice(6))&&cwd===CWD
}
export function register(on){
 on('session.start',async($,e,next)=>{
  if(await owned($))await $.command.register({name:'claude-driver-native-read-probe',description:'Read-only native gate probe; no model turn'})
  return next(e)
 })
 on('command.run',{command:'claude-driver-native-read-probe'},async($)=>{
  if(!await owned($))return {text:'claude-driver native probe refused: wrong session or directory'}
  try{
   const result=await $.mcp.call({server:'ccd_session_mgmt',tool:'get_session',args:{session_id:FIXTURE}})
   return {text:JSON.stringify({scope:'owned-native-mod-read-probe',nativeCallReturned:true,resultWasError:result.isError===true,gateQualified:false,releaseAuthorized:false})}
  }catch{
   // An exception alone cannot identify the gate: require independent native
   // hook denial evidence, exact PID/start and the original command ancestry.
   return {text:JSON.stringify({scope:'owned-native-mod-read-probe',nativeCallReturned:false,gateQualified:false,releaseAuthorized:false})}
  }
 })
}
