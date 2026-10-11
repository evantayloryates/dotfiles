#!/usr/bin/env python3
"""One-shot actual Claude CLI hook qualification against a loopback fake API.
No credential reads, phone IPC, global settings changes or provider requests.
Run one named scenario; intentionally excluded from periodic test suites.
"""
import os,json,threading,subprocess,uuid,sys,shutil,tempfile,signal,time
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
mode=sys.argv[1] if len(sys.argv)>1 else 'ordinary'
assert mode in ['ordinary','continuation','failure']
source=Path(__file__).resolve().parent.parent
root=Path(tempfile.mkdtemp(prefix='ios-claude-'+mode+'-'));root.chmod(0o700)
shutil.copy2(source/'mcp/claude-hooks.candidate.json',root/'settings.json')
mcp={'mcpServers':{'ios-agent':{'command':'/opt/homebrew/bin/node','args':[str(source/'tests/claude_hook_fixture.mjs'),str(root/'events.jsonl')]}}};(root/'mcp.json').write_text(json.dumps(mcp))
if mode=='continuation':
 (root/'continue.mjs').write_text("import fs from 'node:fs';let s='';for await(const x of process.stdin)s+=x;const i=JSON.parse(s),f=process.argv[2];if(!fs.existsSync(f)){fs.writeFileSync(f,'1');console.log(JSON.stringify({decision:'block',reason:'Local fixture: begin once more and finish.'}));}else console.log('{}');")
 settings=json.loads((root/'settings.json').read_text());settings['hooks']['Stop'].append({'hooks':[{'type':'command','command':'/opt/homebrew/bin/node','args':[str(root/'continue.mjs'),str(root/'continued')],'timeout':5}]});(root/'settings.json').write_text(json.dumps(settings))
calls=[];main=0
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  global main
  data=json.loads(self.rfile.read(int(self.headers.get('content-length',0))))
  tools=data.get('tools',[]); name=next((t['name'] for t in tools if t['name']=='mcp__ios-agent__ios_begin'),None)
  calls.append({'path':self.path,'toolAvailable':bool(name),'messageCount':len(data.get('messages',[]))})
  if 'count_tokens' in self.path:
   body=json.dumps({'input_tokens':100}).encode();self.send_response(200);self.end_headers();self.wfile.write(body);return
  if mode=='failure' and name and main==1:
   self.send_response(400);self.send_header('content-type','application/json');self.end_headers();self.wfile.write(json.dumps({'type':'error','error':{'type':'invalid_request_error','message':'Local fixture API failure'}}).encode());return
  use=bool(name) and (main==0 or mode=='continuation' and main==2)
  if name:main+=1
  msg={'id':'msg_local_'+uuid.uuid4().hex,'type':'message','role':'assistant','model':data.get('model','local-fixture'),'content':[{'type':'tool_use','id':'toolu_local_'+str(main),'name':name,'input':{}}] if use else [{'type':'text','text':'Local fixture complete.'}],'stop_reason':'tool_use' if use else 'end_turn','stop_sequence':None,'usage':{'input_tokens':100,'output_tokens':10}}
  self.send_response(200);self.send_header('content-type','text/event-stream' if data.get('stream') else 'application/json');self.end_headers()
  if not data.get('stream'):self.wfile.write(json.dumps(msg).encode());return
  def event(typ,value):self.wfile.write(('event: '+typ+'\ndata: '+json.dumps(value)+'\n\n').encode())
  event('message_start',{'type':'message_start','message':{**msg,'content':[],'stop_reason':None}})
  block=msg['content'][0];event('content_block_start',{'type':'content_block_start','index':0,'content_block':{**block,**({'input':{}} if use else {'text':''})}})
  event('content_block_delta',{'type':'content_block_delta','index':0,'delta':{'type':'input_json_delta','partial_json':'{}'} if use else {'type':'text_delta','text':block['text']}})
  event('content_block_stop',{'type':'content_block_stop','index':0});event('message_delta',{'type':'message_delta','delta':{'stop_reason':msg['stop_reason'],'stop_sequence':None},'usage':{'output_tokens':10}});event('message_stop',{'type':'message_stop'});self.wfile.flush()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
env={k:v for k,v in os.environ.items() if not (k.startswith('ANTHROPIC_') or k.startswith('CLAUDE_'))}
env.update(CLAUDE_CONFIG_DIR=str(root/'config'),ANTHROPIC_BASE_URL=f'http://127.0.0.1:{server.server_port}',ANTHROPIC_API_KEY='local-fixture-only',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1')
args=['/Users/taylor/.local/bin/claude','-p','Call the synthetic ios_begin once, then finish. No phone exists in this fixture.','--setting-sources','','--settings',str(root/'settings.json'),'--strict-mcp-config','--mcp-config',str(root/'mcp.json'),'--allowedTools','mcp__ios-agent__ios_begin','--tools','','--output-format','stream-json','--verbose','--include-hook-events','--max-turns','5','--no-session-persistence','--system-prompt','Local hook fixture. Only the supplied synthetic MCP server exists.']
try:
 with open(root/'stdout.jsonl','w') as out,open(root/'stderr.txt','w') as err:
  r=subprocess.Popen(args,cwd=root,env=env,stdout=out,stderr=err,start_new_session=True)
  try:r.wait(timeout=75)
  except subprocess.TimeoutExpired:
   deadline=time.monotonic()+3
   try:os.killpg(r.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:r.wait(timeout=3)
   except subprocess.TimeoutExpired:pass
   # The CLI parent can exit while its MCP child remains in this process group.
   while time.monotonic()<deadline:
    try:os.killpg(r.pid,0)
    except ProcessLookupError:break
    time.sleep(0.05)
   try:os.killpg(r.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   r.wait()
   raise
 events=[json.loads(x) for x in (root/'events.jsonl').read_text().splitlines()]
 begins=[x for x in events if x['kind']=='begin'];ends=[x for x in events if x['kind']=='end'];closed=[x for x in events if x['kind']=='closed']
 assert len(begins)==(2 if mode=='continuation' else 1),events
 assert all(x.get('owner',{}).get('promptId') and x['owner']['agentId']=='' for x in begins),events
 assert len({x['connection'] for x in events})==1,events
 assert closed and closed[-1]['remaining']==0,events
 assert len([x for x in events if x['kind']=='release'])==len(begins),events
 if mode!='failure':
  assert r.returncode==0 and len(ends)==len(begins),events
  assert all(x['args']['event']=='Stop' and x['cleanup']['released']==1 for x in ends),events
  assert all(x['args']['sessionId']==b['owner']['sessionId'] and x['args']['promptId']==b['owner']['promptId'] for b,x in zip(begins,ends)),events
 else: assert r.returncode==1
 receipt={'mode':mode,'cliVersion':subprocess.check_output(['/Users/taylor/.local/bin/claude','--version'],text=True).strip(),'exit':r.returncode,'apiCalls':len(calls),'beginCount':len(begins),'stopCount':len(ends),'stopFailureObserved':any(x['args']['event']=='StopFailure' for x in ends),'eofCleanupConfirmed':closed[-1]['remaining']==0,'sameConnection':True,'mainAgentIdEmpty':True,'continuedPromptReused':mode=='continuation' and begins[0]['owner']==begins[1]['owner'],'scope':'actual CLI and production MCP/backend; local fake API, fake phone IPC; no physical qualification','passed':True}
 print(json.dumps(receipt))
 (root/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print('Evidence: '+str(root/'receipt.json'))
except subprocess.TimeoutExpired:
 print(json.dumps({'timedOut':True,'calls':calls,'dir':str(root),'mode':mode}))
 raise SystemExit(1)
finally:server.shutdown();server.server_close()
