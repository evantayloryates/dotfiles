#!/usr/bin/env node
import {claudeBeginHook} from './mcp/claude-lifecycle.mjs';
let text='';
try{
  for await(const part of process.stdin){text+=part;if(Buffer.byteLength(text)>65536)throw Error('bounded_input');}
  process.stdout.write(JSON.stringify(claudeBeginHook(JSON.parse(text)))+'\n');
}catch{process.stdout.write('{}\n');}
