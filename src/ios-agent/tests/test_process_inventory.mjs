import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countProcesses} from '../process_inventory.mjs';
const cwd='/workspaces/kickoff/next';
test('alternate-port parent excludes titled Next child without stopping it',()=>{
 const rows=[{pid:'1',cwd,args:['yarn','start:demo:development','--port','3020']},{pid:'2',parent:'1',cwd,args:['next-server (v14)']}];
 assert.equal(countProcesses(rows).web,0);
 assert.equal(countProcesses([...rows,{pid:'3',cwd,args:['yarn','start:demo:development']}]).web,1);
});
test('explicit, equals and environment ports are distinguished',()=>{
 for(const args of [['next','dev','-p','3020'],['next','dev','--port=3020']])assert.equal(countProcesses([{pid:'1',cwd,args}]).web,0);
 assert.equal(countProcesses([{pid:'1',cwd,args:['next-server'],envPort:'3020'}]).web,0);
 assert.equal(countProcesses([{pid:'1',cwd,args:['next-server'],envPort:'3000'}]).web,1);
});
test('pending default web launcher is retained and parent cycles terminate',()=>{
 assert.equal(countProcesses([{pid:'1',parent:'1',cwd,args:['sh','dev-demo.sh']}]).web,1);
});

test('shell command containing another agent launcher is not a default starter',()=>{assert.equal(countProcesses([{pid:'1',cwd,args:['sh','-lc','yarn start:demo:development --port 3020']}]).web,0)});
