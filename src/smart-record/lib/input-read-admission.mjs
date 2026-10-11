// One retained-journal reader per adapter; bounded FIFO for concurrent readbacks.
import {EngineError} from './client.mjs';

export function inputReadAdmission({maxPending=8,waitMs=10000}={}) {
 let active=false;
 const pending=[];
 const health=()=>({active,queued:pending.length,max_pending:maxPending,queue_wait_ms:waitMs});
 const releaseHandle=()=>{
  let released=false;
  return()=>{
   if(released)return;
   released=true;
   const next=pending.shift();
   if(next){clearTimeout(next.timer);next.resolve(releaseHandle());}
   else active=false;
  };
 };
 const acquire=()=>{
  if(!active){active=true;return Promise.resolve(releaseHandle());}
  if(pending.length>=maxPending)return Promise.reject(new EngineError('input_query_busy',`Retained-input queue is full (${maxPending} waiting reads); retry later with less fanout.`));
  return new Promise((resolve,reject)=>{
   const entry={resolve,timer:null};
   entry.timer=setTimeout(()=>{
    pending.splice(pending.indexOf(entry),1);
    reject(new EngineError('input_query_queue_timeout',`Retained-input read waited ${waitMs} ms; retry this read later. No capture or action was changed.`));
   },waitMs);
   pending.push(entry);
  });
 };
 return{acquire,health};
}
