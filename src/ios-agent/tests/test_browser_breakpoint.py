import asyncio,hashlib,unittest
from types import SimpleNamespace as Obj
from urllib.parse import urlsplit
import browser_inspector as debug

SOURCE='function tick(){\n const count=7;\n return count;\n}'
class Session:
    def __init__(self):self.calls=[];self.response_methods={};self.fail=None;self.hit=True;self.changed=False;self.hashChanged=False;self.resumeEvent=True
    def emit(self,m,**p):
        if m in self.response_methods:self.response_methods[m]({'params':p})
    async def send_command(self,m,**a):
        self.calls.append((m,a))
        if m==self.fail:raise debug.ProtocolError(m)
        if m=='Page.getResourceTree':return {'frameTree':{'frame':{'id':'f','loaderId':'new' if self.changed else 'old'}}}
        if m=='Runtime.evaluate':return {'result':{'value':{'originMatches':True,'visible':True,'timeOrigin':1,'ready':'complete'}}}
        if m=='Debugger.enable':self.emit('Debugger.scriptParsed',scriptId='1')
        if m=='Debugger.getScriptSource':return {'scriptSource':SOURCE+' changed' if self.hashChanged else SOURCE}
        if m=='Debugger.setBreakpoint':
            if self.hit:self.emit('Debugger.paused',reason='Breakpoint',data={'breakpointId':'bp'},callFrames=[{'functionName':'tick','location':a['location'],'scopeChain':[{'type':'nestedLexical','object':{'objectId':'local'}},{'type':'global','object':{'objectId':'global'}}],'this':{'type':'object','description':'Window','objectId':'must-omit'}}])
            return {'breakpointId':'bp','actualLocation':a['location']}
        if m=='Runtime.getProperties':return {'properties':[{'name':'count','value':{'type':'number','value':7}},{'name':'accessToken','value':{'type':'string','value':'abcdefghijklmnop'}},{'name':'computed','get':{'objectId':'getter'}}]}
        if m=='Debugger.resume' and self.resumeEvent:self.emit('Debugger.resumed')
        return {}
class BreakpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.s=Session();self.target=Obj(application=Obj(bundle='com.apple.mobilesafari',id_='a'),page=Obj(id_=1));self.origin=urlsplit('https://dev.example.ts.net')
        self.ref=(await debug.inspect(self.s,{'op':'overview'},self.target,self.origin,lambda:None))['documentRef']
        self.q={'op':'breakpoint','ownedDebugSession':True,'documentRef':self.ref,'scriptId':'1','sourceHash':hashlib.sha256(SOURCE.encode()).hexdigest(),'lineNumber':2,'sampleMs':100}
    async def run_capture(self,check=lambda:None):return await debug.inspect(self.s,self.q,self.target,self.origin,check)
    async def test_hit_locals_remove_resume_disable_in_order(self):
        r=await self.run_capture();self.assertTrue(r['breakpointHit']);self.assertTrue(r['resumeConfirmed']);self.assertTrue(r['breakpointRemoved']);self.assertTrue(r['domainsDisabled']);self.assertEqual(r['callFrames'][0]['functionName'],'tick');self.assertNotIn('must-omit',str(r));self.assertEqual(r['locals'][0]['properties'][0]['value']['value'],7);self.assertEqual(r['locals'][0]['properties'][1]['value']['value'],'abcd…mnop');self.assertTrue(r['locals'][0]['properties'][2]['hasGetter'])
        calls=[m for m,_ in self.s.calls];self.assertLess(calls.index('Debugger.removeBreakpoint'),calls.index('Debugger.resume'));self.assertLess(calls.index('Debugger.resume'),calls.index('Debugger.disable'));self.assertEqual(self.s.response_methods,{})
        args=next(a for m,a in self.s.calls if m=='Runtime.getProperties');self.assertTrue(args['ownProperties']);self.assertFalse(args['generatePreview'])
    async def test_no_hit_is_not_invented_and_breakpoint_is_removed(self):
        self.s.hit=False;r=await self.run_capture();self.assertFalse(r['breakpointHit']);self.assertFalse(r['pauseObserved']);self.assertIsNone(r['resumeConfirmed']);self.assertTrue(r['breakpointRemoved']);self.assertNotIn('Debugger.resume',[m for m,_ in self.s.calls])
    async def test_stale_document_or_source_refused_before_set(self):
        self.s.changed=True
        with self.assertRaisesRegex(ValueError,'debug_document_changed'):await self.run_capture()
        self.assertNotIn('Debugger.enable',[m for m,_ in self.s.calls]);self.s.changed=False;self.s.hashChanged=True
        with self.assertRaisesRegex(ValueError,'debug_script_source_changed'):await self.run_capture()
        self.assertNotIn('Debugger.setBreakpoint',[m for m,_ in self.s.calls]);self.assertEqual(self.s.calls[-1][0],'Debugger.disable')
    async def test_owner_loss_after_hit_still_removes_resumes_disables(self):
        def check():
            if any(m=='Debugger.setBreakpoint' for m,_ in self.s.calls):raise ValueError('observer_owner_expired')
        with self.assertRaisesRegex(ValueError,'observer_owner_expired'):await self.run_capture(check)
        self.assertEqual([m for m,_ in self.s.calls][-3:],['Debugger.removeBreakpoint','Debugger.resume','Debugger.disable']);self.assertTrue(self.q['_breakpointCleanup']['resumeConfirmed'])
    async def test_local_read_failure_still_resumes_and_restores_handlers(self):
        sentinel=lambda e:None;self.s.response_methods['Debugger.paused']=sentinel;self.s.fail='Runtime.getProperties'
        with self.assertRaises(debug.ProtocolError):await self.run_capture()
        self.assertTrue(self.q['_breakpointCleanup']['resumeConfirmed']);self.assertIs(self.s.response_methods['Debugger.paused'],sentinel)
    async def test_unknown_install_still_disables_and_no_replay(self):
        self.s.fail='Debugger.setBreakpoint'
        with self.assertRaises(debug.ProtocolError):await self.run_capture()
        self.assertTrue(self.q['_breakpointRequested']);self.assertEqual(self.s.calls[-1][0],'Debugger.disable');self.assertEqual(len([m for m,_ in self.s.calls if m=='Debugger.setBreakpoint']),1)
    async def test_resume_failure_never_claims_success(self):
        self.s.fail='Debugger.resume'
        with self.assertRaisesRegex(ValueError,'debug_cleanup_unconfirmed'):await self.run_capture()
        self.assertIn('Debugger.resume',self.q['_cleanupFailures']);self.assertEqual(self.s.calls[-1][0],'Debugger.disable')
    async def test_missing_resume_event_is_unconfirmed_even_with_command_ack(self):
        self.s.resumeEvent=False
        with self.assertRaisesRegex(ValueError,'debug_cleanup_unconfirmed'):await self.run_capture()
        self.assertIsNone(self.q['_breakpointCleanup']['resumeConfirmed']);self.assertEqual(self.s.calls[-1][0],'Debugger.disable')
    async def test_late_pause_during_remove_is_resumed_and_labeled(self):
        self.s.hit=False;original=self.s.send_command
        async def send(m,**a):
            if m=='Debugger.removeBreakpoint':self.s.emit('Debugger.paused',reason='Breakpoint',data={'breakpointId':'bp'},callFrames=[])
            return await original(m,**a)
        self.s.send_command=send;r=await self.run_capture();self.assertTrue(r['latePauseObserved']);self.assertTrue(r['resumeConfirmed']);self.assertTrue(r['breakpointHit']);self.assertNotIn('callFrames',r)
    async def test_owned_session_required_before_enable(self):
        self.q.pop('ownedDebugSession')
        with self.assertRaisesRegex(ValueError,'owned_debug_session_required_for_breakpoint'):await self.run_capture()
        self.assertNotIn('Debugger.enable',[m for m,_ in self.s.calls])
if __name__=='__main__':unittest.main()
