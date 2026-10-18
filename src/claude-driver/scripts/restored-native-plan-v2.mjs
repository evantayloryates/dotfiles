#!/usr/bin/env node
import {inspectRestoredNative} from '../lib/restored-native-plan.mjs'
const [jobId,digest,...extra]=process.argv.slice(2)
if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^[a-f0-9]{64}$/.test(digest||'')||extra.length)throw Error('usage: restored-native-plan-v2.mjs <exact restoration job ID> <exact root SHA256>')
console.log(JSON.stringify(await inspectRestoredNative(jobId,digest)))
