#!/usr/bin/env node
import {inspectRestoredPair} from '../lib/restored-pair-plan.mjs'
const [jobId,digest,kind='record',...extra]=process.argv.slice(2)
if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^[a-f0-9]{64}$/.test(digest||'')||!['record','seeded'].includes(kind)||extra.length)throw Error('usage: restored-pair-plan-v2.mjs <exact restoration job ID> <exact root SHA256> [record|seeded]')
console.log(JSON.stringify(await inspectRestoredPair(jobId,digest,{restorationKind:kind})))
