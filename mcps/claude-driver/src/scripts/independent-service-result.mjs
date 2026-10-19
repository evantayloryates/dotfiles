#!/usr/bin/env node
import {settleIndependentServiceResult} from '../lib/independent-service-settlement.mjs'
try{console.log(JSON.stringify(await settleIndependentServiceResult(...process.argv.slice(2))))}
catch{console.error('independent native result evidence refused; no replay');process.exitCode=1}
