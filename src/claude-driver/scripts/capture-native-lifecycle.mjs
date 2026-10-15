#!/usr/bin/env node
// One passive read; no app navigation, inference, wake or recovery.
import {join} from 'node:path'
import {BROKER_DIR,readJson} from '../lib/state.mjs'
import {captureNativeLifecycle} from '../lib/native-lifecycle-capture.mjs'
if(process.argv.length!==2)throw Error('No arguments accepted')
console.log(JSON.stringify(await captureNativeLifecycle(readJson(join(BROKER_DIR,'broker.json'),null)?.sessionId)))
