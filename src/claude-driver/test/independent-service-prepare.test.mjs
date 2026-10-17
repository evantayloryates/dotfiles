import test from 'node:test'
import assert from 'node:assert/strict'
import {independentPreparationAllowed} from '../lib/independent-service-prepare.mjs'
const session='local_11111111-1111-4111-8111-111111111111'
function fixture(){return {record:{sessionId:session,cwd:'/private/state/probe/service',permissionMode:'bypassPermissions',isArchived:false},registered:true,peer:{hostSessionId:session,sessionId:session.slice(6),cwd:'/private/state/probe/service',entrypoint:'claude-desktop',status:'idle',version:'2.1.299',pid:42,procStart:'epoch'},version:{app:'2.42304.0',cli:'2.1.299'},probeRoot:'/private/state/probe',lifetimeSec:300,maxRequests:8}}
test('preparation is limited to the owned idle bypass scratch receiver and bounded lifetime',()=>{
 assert.equal(independentPreparationAllowed(fixture()),true)
 for(const change of [x=>x.registered=false,x=>x.record.permissionMode='acceptEdits',x=>x.record.isArchived=true,x=>x.record.cwd='/work/repo',x=>x.peer.cwd='/other',x=>x.peer.status='busy',x=>x.peer.procStart='',x=>x.peer.spare=true,x=>x.peer.parkedJobId='work',x=>x.peer.version='future',x=>x.peer.hostSessionId='foreign',x=>x.version.app='future',x=>x.lifetimeSec=3601,x=>x.lifetimeSec=59,x=>x.maxRequests=0,x=>x.maxRequests=129]){const x=fixture();change(x);assert.equal(independentPreparationAllowed(x),false)}
})
