#!/usr/bin/env node
import {join} from 'node:path'
import {STATE_DIR} from '../lib/state.mjs'
import {reportInbox} from '../lib/report-inbox.mjs'
const args=process.argv.slice(2)
const flag=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]}
const name=flag('--ack',null),sha256=flag('--sha256',null)
if(name&&!/^[a-f0-9]{64}$/.test(sha256||''))throw new Error('--ack requires the scanned --sha256')
const directory=flag('--dir','/Users/taylor/src/github/dotfiles/src/claude-driver/.runtime/reports')
const state=join(STATE_DIR,'report-inbox.json')
console.log(JSON.stringify(reportInbox(directory,state,{ack:name?{name,sha256}:undefined})))
