#!/usr/bin/env node
import {claudeBeginHook} from './mcp/claude-lifecycle.mjs';
let text='';
try{
  for await(const part of process.stdin){text+=part;if(Buffer.byteLength(text)>65536)throw Error('bounded_input');}
  const input=JSON.parse(text);
  // Ship only the physically qualified main-agent path. Child agents retain
  // explicit end/EOF cleanup until their harness dispatch is qualified.
  const result=process.argv.includes('--main-agent-only') && input.agent_id
    ? {} : claudeBeginHook(input);
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stdout.write('{}\n');}
