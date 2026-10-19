// Explicit read-only production-interface smoke; stack call reuses verified workers.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
if (!process.argv.includes('--run')) throw new Error('explicit_--run_required');
const receipt={version:1,at:new Date().toISOString(),scope:'real stdio MCP, existing guarded local stack, read-only synthetic pair',gates:{}};
const client=new Client({name:'host-workflow-live-smoke',version:'1'});
const transport=new StdioClientTransport({command:path.join(os.homedir(),'dotfiles/bin/ios-agent-mcp'),stderr:'pipe'});
transport.stderr?.on('data',()=>{});
async function call(name,args={}) {
 const r=await client.callTool({name,arguments:args},undefined,{timeout:150000});
 if(r.isError)throw new Error('gate_failed_'+name);
 return r.structuredContent;
}
try {
 await client.connect(transport);
 const names=(await client.listTools()).tools.map(t=>t.name);
 assert.equal(names.length,15);assert.ok(['ios_doctor','ios_stack_ensure','ios_workflow'].every(n=>names.includes(n)));
 receipt.gates.discovery=true;
 const doctor=await call('ios_doctor');assert.equal(doctor.hostPrerequisitesReady,true);assert.equal(doctor.repairsPerformed,false);
 receipt.gates.hostDiagnosis=true;
 const stack=await call('ios_stack_ensure',{timeout:30});assert.equal(stack.backendReady,true);assert.deepEqual(stack.started,[]);assert.equal(stack.dataReset,false);assert.equal(stack.workersStopped,false);
 receipt.gates.warmStackReuse=true;
 assert.equal((await call('ios_doctor')).hostPrerequisitesReady,true);receipt.gates.afterRecoveryDiagnosis=true;
 const plan=await call('ios_workflow',{action:'plan'});assert.equal(plan.recipe.steps.length,8);receipt.gates.recipe=true;
 const resource=await client.readResource({uri:'ios-agent://paired-workflow'});assert.ok(resource.contents[0].text.includes('read-only'));receipt.gates.workflowResource=true;
 const capture=await call('ios_workflow',{action:'capture'});
 assert.equal(capture.receipt.status,'passed');receipt.gates.exactSyntheticNonAdminPair=true;
 const baseline=(await call('ios_read',{artifactId:capture.baselineId})).data;
 const selected=await call('ios_workflow',{action:'capture',clientId:String(baseline.clientId)});
 assert.equal(selected.pair.clientId,String(baseline.clientId));receipt.gates.explicitClientSelection=true;
 const foreign=await client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId,clientId:String(baseline.clientId)==='1'?'2':'1'}});
 assert.equal(foreign.isError,true);assert.equal(foreign.structuredContent.reason,'paired_baseline_client_mismatch');receipt.gates.foreignClientRefused=true;
 const persisted=await call('ios_workflow',{action:'assert',stage:'pre-restore',baselineId:capture.baselineId,expected:baseline.targetDailyCalories});
 assert.equal(persisted.receipt.status,'passed');receipt.gates.samePairPersistence=true;
 const mismatch=await client.callTool({name:'ios_workflow',arguments:{action:'assert',stage:'coach-write',baselineId:capture.baselineId,expected:baseline.targetDailyCalories===2456?2457:2456}});
 assert.equal(mismatch.isError,true);assert.equal(mismatch.structuredContent.receipt.status,'failed');receipt.gates.wrongValueFails=true;
 const restored=await call('ios_workflow',{action:'restore-check',baselineId:capture.baselineId});assert.equal(restored.receipt.status,'passed');receipt.gates.baselineUnchanged=true;
 const status=await call('ios_status');assert.equal(status.leased,false);assert.equal(status.reactFrontendRunning,false);receipt.gates.noPhoneLeaseOrFrontend=true;
 receipt.gates.allPassed=true;
 receipt.limits=['No fresh physical UI edits or assertions in this smoke. Dated original round-trip remains separate.','Cold launcher qualification is isolated/unit evidence, not a shared-stack destructive restart.'];
} catch(e) {receipt.gates.allPassed=false;receipt.failure=/^gate_failed_[a-z_]+$/.test(e.message)?e.message:'live_smoke_failed';process.exitCode=1;}
finally {await client.close();console.log(JSON.stringify(receipt));}
