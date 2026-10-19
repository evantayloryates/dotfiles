// Private transport for the qualified nearby managed MCP lifecycle.
// The exact approved node is retained for personal DEV; cellular stays unqualified.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {signalContextEnvironment} from './signal-log.mjs';
const signalEnvironment=()=>{try{return signalContextEnvironment();}catch{return {};}};
const requestContext=()=>{try{return JSON.parse(signalContextEnvironment({}).IOS_AGENT_SIGNAL_CONTEXT);}catch{return {};}};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export class RelayChannel {
  constructor(state,initial){
    this.sequence=0;this.pending=null;this.closed=false;this.buffer='';
    this.child=spawn(path.join(state,'providers/pymobiledevice3-11.15.5/bin/python'),
      ['-B',path.join(root,'relay_worker.py')],{stdio:['pipe','pipe','ignore'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',...signalEnvironment()}});
    this.exited=false;this.exitPromise=new Promise(resolve=>this.child.once('close',()=>{this.exited=true;resolve();}));
    this.ready=new Promise((resolve,reject)=>{
      this.startup={resolve,reject,timer:setTimeout(()=>this.fail('relay_start_deadline'),45000)};
    });
    this.child.stdout.on('data',chunk=>{
      this.buffer+=chunk;
      if(this.buffer.length>34*1024*1024){this.fail('relay_output_limit');return;}
      let newline;
      while((newline=this.buffer.indexOf('\n'))>=0){
        const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);
        let value;try{value=JSON.parse(line);}catch{this.fail('relay_response_unconfirmed');return;}
        if(this.startup){
          const startup=this.startup;this.startup=null;clearTimeout(startup.timer);
          if(value.ok===true&&value.event==='ready'&&value.rsdIdentityVerified===true)startup.resolve(value);
          else{startup.reject(Error('relay_start_unconfirmed'));this.fail('relay_start_unconfirmed');}
        }else if(this.pending&&value.id===this.pending.id){
          const pending=this.pending;this.pending=null;clearTimeout(pending.timer);
          pending.resolve(value);
          if(value.ok!==true)this.fail('relay_operation_unconfirmed');
        }else{this.fail('relay_response_identity_mismatch');return;}
      }
    });
    this.child.stdin.on('error',()=>this.fail('relay_connection_closed'));
    this.child.on('error',()=>this.fail('relay_worker_unavailable'));
    this.child.on('close',()=>this.fail('relay_connection_closed'));
    this.child.stdin.write(JSON.stringify({...initial,state})+'\n');
  }
  fail(reason){
    this.closed=true;
    for(const key of ['startup','pending']){
      const p=this[key];this[key]=null;if(p){clearTimeout(p.timer);p.reject(Error(reason));}
    }
    this.child.kill('SIGTERM');
  }
  async request(op,args={},timeoutMs=35000){
    await this.ready;
    if(this.closed)throw Error('relay_connection_closed');
    if(this.pending)throw Error('relay_operation_in_flight');
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      this.pending={id,resolve,reject,timer:setTimeout(()=>this.fail('relay_deadline_outcome_unknown_do_not_replay'),timeoutMs)};
      this.child.stdin.write(JSON.stringify({...args,id,op,signalContext:requestContext()})+'\n');
    });
  }
  async close(){
    let graceful=false;
    if(!this.closed&&!this.pending&&!this.startup)try{graceful=(await this.request('close',{},2000)).closed===true;}catch{}
    this.closed=true;
    if(!graceful)this.fail('relay_closed');
    await Promise.race([this.exitPromise,new Promise(resolve=>setTimeout(resolve,1500))]);
    if(!this.exited){this.child.kill('SIGKILL');await Promise.race([this.exitPromise,new Promise(resolve=>setTimeout(resolve,500))]);}
    return {closed:this.exited,graceful};
  }
}
