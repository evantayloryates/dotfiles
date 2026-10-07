#!/usr/bin/env node
import {captureServiceDiagnostics} from '../lib/service-diagnostics.mjs'
const args=process.argv.slice(2)
if(args.some(x=>x!=='--quota-exhausted')||args.length>1)throw Error('usage: service-diagnostics.mjs [--quota-exhausted]')
console.log(JSON.stringify(captureServiceDiagnostics({inference:args.length?'quota-exhausted':'unknown'})))
