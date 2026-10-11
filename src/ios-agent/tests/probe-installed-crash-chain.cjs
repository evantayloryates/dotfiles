const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
// Opt-in composition probe: pass the installed Bugsnag error-handler.js path.
const source=process.argv[2];if(!source||!source.endsWith('/@bugsnag/plugin-react-native-global-error-handler/error-handler.js'))throw Error('installed_bugsnag_handler_path_required');
const plugin=require(source),{installTelemetry}=require('../native/telemetry');
const cases=[];
for(const order of ['reporter-first','observer-first'])for(const failObserver of [false,true]){
 const error=new Error('synthetic-crash-chain-only'),callbacks=[],delivered=[],forwarded=[];let handler=function(e,fatal){forwarded.push({sameError:e===error,fatal});return 'original-result'};
 const original=handler,utils={getGlobalHandler:()=>handler,setGlobalHandler:h=>{handler=h}},runtime={ErrorUtils:utils};
 const client={_config:{autoDetectErrors:true,enabledErrorTypes:{unhandledExceptions:true}},Event:{create:(e,unhandled,details)=>{assert.equal(e,error);assert.equal(unhandled,true);return {details}}},_notify:(event,unused,done)=>{delivered.push(event);callbacks.push(done)}};
 let t;const install=()=>t=installTelemetry(runtime,{onChange(){if(failObserver)throw Error('synthetic observer failure')}});
 if(order==='reporter-first'){plugin(utils).load(client);install()}else{install();plugin(utils).load(client)}
 t.start();handler(error,false);assert.equal(delivered.length,1);assert.equal(forwarded.length,0);callbacks.shift()();assert.deepEqual(forwarded,[{sameError:true,fatal:false}]);assert.equal(t.snapshot().errors.length,1);assert.equal(delivered[0].attemptImmediateDelivery,false);
 t.dispose();assert.equal(t.snapshot().errors.length,0);handler(error,true);callbacks.shift()();assert.equal(delivered.length,2);assert.deepEqual(forwarded[1],{sameError:true,fatal:true});assert.equal(t.snapshot().errors.length,0);
 cases.push({order,failObserver,reporterOnce:true,originalForwardedOnce:true,sameError:true,fatalPreserved:true,disposedObserverSilent:true});
}
console.log(JSON.stringify({ok:true,scope:'installed Bugsnag plugin with isolated ErrorUtils and dummy client; no app crash or external delivery',pluginSourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),cases}));
