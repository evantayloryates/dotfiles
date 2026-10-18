#!/usr/bin/env node
import {inspectMissingServiceImport} from '../lib/missing-service-plan.mjs'
const [primary,role,digest]=process.argv.slice(2)
if(!primary||!role||!digest)throw Error('usage: missing-service-plan-v2.mjs <exact primary ID> <primary|standby> <exact enrollment SHA256>')
console.log(JSON.stringify(await inspectMissingServiceImport(primary,role,digest)))
