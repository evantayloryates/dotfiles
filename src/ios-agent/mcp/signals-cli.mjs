#!/usr/bin/env node
import {readSignals} from './signal-log.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const usage = `ios-agent-signals [--scope mcp|browser|host|native|kck-native|kck-web|kck-call]
  [--event prefix] [--level info|warn|error] [--tool ios_name]
  [--trace exact-id] [--session exact-id] [--since UTC-ISO-time]
  [--after cursor] [--limit 1..100] [--bytes 256..24000] [--summary] [--json]
Newest first. --after reads the next older page. No phone control or lease.`;
export function parseSignalOptions(argv) {
  const options = {}; let json = false, help = false;
  const names = {'--scope':'scope','--event':'event','--level':'level','--tool':'tool',
    '--trace':'traceId','--session':'sessionId','--since':'since','--after':'after','--limit':'limit','--bytes':'maxBytes'};
  for (let i=0; i<argv.length; i++) {
    const flag=argv[i];
    if (flag==='--json') {json=true;continue;}
    if (flag==='--summary') {options.view='summary';continue;}
    if (flag==='--help'||flag==='-h') {help=true;continue;}
    const key=names[flag],value=argv[++i];
    if (!key||value===undefined||value.startsWith('--')) throw Error('invalid_signal_option');
    if (['limit','maxBytes'].includes(key)) {
      const n=Number(value),minimum=key==='limit'?1:256,maximum=key==='limit'?100:24000;
      if (!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n<minimum||n>maximum) throw Error('invalid_signal_bound');
      options[key]=n;
    } else {
      if (value.length>160) throw Error('invalid_signal_filter');
      options[key]=value;
    }
  }
  if (options.scope&&!['mcp','browser','host','native','kck-native','kck-web','kck-call'].includes(options.scope)) throw Error('invalid_signal_scope');
  if (options.level&&!['info','warn','error'].includes(options.level)) throw Error('invalid_signal_level');
  if (options.event&&!/^[a-z][a-z0-9_.-]{0,63}$/.test(options.event)) throw Error('invalid_signal_event');
  if (options.tool&&!/^ios_[a-z_]{1,64}$/.test(options.tool)) throw Error('invalid_signal_tool');
  for (const k of ['traceId','sessionId']) if (options[k]&&!/^[A-Za-z0-9_.:-]{1,96}$/.test(options[k])) throw Error('invalid_signal_id');
  if (options.after&&!/^[A-Za-z0-9_-]{1,160}$/.test(options.after)) throw Error('invalid_signal_cursor');
  if (options.since&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(options.since)||!Number.isFinite(Date.parse(options.since)))) throw Error('invalid_signal_time');
  return {options,json,help};
}
if (process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {options,json,help}=parseSignalOptions(process.argv.slice(2));
    if (help) process.stdout.write(usage+'\n');
    else {
      const page=readSignals(options);
      if (json) process.stdout.write(JSON.stringify(page)+'\n');
      else {
        if (page.text) process.stdout.write(page.text+'\n');
        process.stderr.write(`signals count=${page.count} truncated=${page.truncated}${page.nextCursor?' next='+page.nextCursor:''}\n`);
      }
    }
  } catch {
    process.stderr.write('Invalid signal filter or bound. Use ios-agent-signals --help.\n');
    process.exitCode=2;
  }
}
