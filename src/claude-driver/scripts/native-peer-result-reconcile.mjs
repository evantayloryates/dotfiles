#!/usr/bin/env node
// Publish a previously captured native callback receipt; never invoke or replay.
import {reconcileNativePeerResult} from '../lib/native-peer-result.mjs'
try{
 if(process.argv.length!==3)throw Error('one exact probe UUID required')
 console.log(JSON.stringify(await reconcileNativePeerResult(process.argv[2])))
}catch{
 console.log(JSON.stringify({receiptVerified:false,published:false,category:'native_callback_result_refused',replay:false}))
 process.exitCode=1
}
