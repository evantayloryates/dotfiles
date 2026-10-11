import asyncio
import json
from types import SimpleNamespace as Obj
import unittest
from urllib.parse import urlsplit

import browser_inspector as debug

class Session:
    def __init__(self):
        self.response_methods={};self.calls=[];self.fail=None;self.changed=False;self.owned=True
    def emit(self,method,**params):
        if method in self.response_methods:self.response_methods[method]({'params':params})
    async def send_command(self,method,**args):
        self.calls.append((method,args))
        if method==self.fail:raise debug.ProtocolError(method)
        if method=='Runtime.evaluate':
            if 'originMatches' in args['expression']:
                v={'originMatches':True,'visible':True,'timeOrigin':2 if self.changed else 1,'ready':'complete','page':'p','owned':self.owned,'indicator':self.owned}
                return {'result':{'value':v}}
            self.emit('Console.messageAdded',message={'text':'fixture console detail','accessToken':'abcd123456789xyz'})
            return {'result':{'value':42}}
        if method=='Debugger.enable':
            self.emit('Debugger.scriptParsed',scriptId='1',url='https://u:password@dev.example.ts.net/a.js?token=secret#x',startLine=0,endLine=4)
        if method=='Debugger.getScriptSource':return {'scriptSource':'one\ntwo\nthree\nfour'}
        if method=='DOM.getDocument':return {'root':{'nodeId':1}}
        if method=='DOM.querySelector':return {'nodeId':2}
        if method.startswith('CSS.get'):return {'styles':['real matched detail']}
        if method=='Timeline.start':self.emit('Timeline.eventRecorded',record={'type':'Layout'})
        if method=='Timeline.stop':self.emit('Timeline.recordingStopped',endTime=4)
        return {}

class InspectorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.s=Session();self.target=Obj(application=Obj(bundle='com.apple.mobilesafari',id_='app'),page=Obj(id_=1));self.origin=urlsplit('https://dev.example.ts.net')
    async def run_debug(self,request,check=lambda:None):return await debug.inspect(self.s,request,self.target,self.origin,check)
    async def ref(self):return (await self.run_debug({'op':'overview'}))['documentRef']
    async def test_sources_are_catalogued_and_windows_fenced_to_document(self):
        r=await self.run_debug({'op':'sources'});self.assertTrue(r['domainsDisabled']);self.assertEqual(r['scripts'][0]['url'],'https://dev.example.ts.net/a.js')
        r=await self.run_debug({'op':'source','documentRef':r['documentRef'],'scriptId':'1','startLine':1,'lineCount':2})
        self.assertEqual(r['source']['text'],'two\nthree');self.assertEqual(r['source']['totalLines'],4)
        self.assertNotIn('Debugger.scriptParsed',[x['method'] for x in r['events']]);self.assertEqual(self.s.response_methods,{})
        self.s.changed=True
        with self.assertRaisesRegex(ValueError,'debug_document_changed'):await self.run_debug({'op':'source','documentRef':r['documentRef'],'scriptId':'1'})
        self.assertEqual(len([x for x in self.s.calls if x[0]=='Debugger.getScriptSource']),1)
    async def test_styles_return_matched_inline_computed_and_disable(self):
        r=await self.run_debug({'op':'styles','selector':'#fixture'})
        self.assertIn('matched',r);self.assertIn('computed',r);self.assertIn('inline',r)
        self.assertNotIn('CSS.enable',[method for method,_ in self.s.calls]);self.assertFalse(r['styleEventsSubscribed']);self.assertTrue(r['domainsDisabled'])
    async def test_trace_stops_and_counts_final_events_and_never_requests_user_gesture(self):
        r=await self.run_debug({'op':'trace','sampleMs':100})
        self.assertTrue(r['timelineStopped']);self.assertTrue(r['domainsDisabled']);self.assertEqual(r['eventCount'],2)
        self.assertEqual(r['events'][-1]['method'],'Timeline.recordingStopped')
        self.assertTrue(all(not args['userGesture'] for method,args in self.s.calls if method=='Runtime.evaluate'))
    async def test_uncertain_start_and_expired_owner_still_stop_trace(self):
        self.s.fail='Timeline.start'
        with self.assertRaises(debug.ProtocolError):await self.run_debug({'op':'trace','sampleMs':100})
        self.assertEqual([x[0] for x in self.s.calls][-2:],['Timeline.stop','Timeline.disable'])
        self.s=Session()
        def check():
            if any(x[0]=='Timeline.start' for x in self.s.calls):raise ValueError('observer_owner_expired')
        with self.assertRaisesRegex(ValueError,'observer_owner_expired'):await self.run_debug({'op':'trace','sampleMs':100},check)
        self.assertEqual([x[0] for x in self.s.calls][-2:],['Timeline.stop','Timeline.disable'])
    async def test_cleanup_failure_is_not_promoted_to_success(self):
        self.s.fail='Timeline.stop'
        with self.assertRaisesRegex(ValueError,'debug_cleanup_unconfirmed'):await self.run_debug({'op':'trace','sampleMs':100})
        self.assertEqual(self.s.calls[-1][0],'Timeline.disable');self.assertEqual(self.s.response_methods,{})
    async def test_document_change_reports_before_or_after_input_without_replay(self):
        ref=await self.ref();original=self.s.send_command
        async def change_before(method,**args):
            result=await original(method,**args)
            if method=='Timeline.start':self.s.changed=True
            return result
        self.s.send_command=change_before
        request={'op':'trace','documentRef':ref,'ownedPage':'p','expression':'42','sampleMs':100}
        with self.assertRaisesRegex(ValueError,'debug_document_changed'):await self.run_debug(request)
        self.assertFalse(request['_inputDispatched']);self.assertEqual(request['_documentChange']['stage'],'before_expression')
        self.assertEqual([x[0] for x in self.s.calls][-2:],['Timeline.stop','Timeline.disable'])
        self.s=Session();ref=await self.ref();original=self.s.send_command
        async def change_after(method,**args):
            result=await original(method,**args)
            if method=='Runtime.evaluate' and args['expression']=='42':self.s.changed=True
            return result
        self.s.send_command=change_after
        request={'op':'console','documentRef':ref,'ownedPage':'p','expression':'42','sampleMs':100}
        with self.assertRaisesRegex(ValueError,'debug_document_changed'):await self.run_debug(request)
        self.assertTrue(request['_inputDispatched']);self.assertEqual(request['_documentChange']['stage'],'after_operation')
        self.assertEqual(len([args for method,args in self.s.calls if method=='Runtime.evaluate' and args['expression']=='42']),1)
    async def test_evaluation_requires_matching_live_glow_and_console_scrubs_known_fields(self):
        ref=await self.ref()
        with self.assertRaisesRegex(ValueError,'owned_browser_session'):await self.run_debug({'op':'evaluate','documentRef':ref,'expression':'42'})
        self.s.owned=False
        with self.assertRaisesRegex(ValueError,'owned_browser_session'):await self.run_debug({'op':'evaluate','documentRef':ref,'ownedPage':'p','expression':'42'})
        self.s.owned=True
        r=await self.run_debug({'op':'console','documentRef':ref,'ownedPage':'p','expression':'42','sampleMs':100})
        self.assertEqual(r['evaluation']['result']['value'],42)
        m=r['events'][0]['params']['message'];self.assertEqual(m['text'],'fixture console detail');self.assertEqual(m['accessToken'],'abcd…9xyz')
    async def test_old_event_handlers_are_restored_on_protocol_error(self):
        sentinel=lambda e:None;self.s.response_methods['Console.messageAdded']=sentinel;self.s.fail='Console.enable'
        with self.assertRaises(debug.ProtocolError):await self.run_debug({'op':'console'})
        self.assertIs(self.s.response_methods['Console.messageAdded'],sentinel);self.assertEqual(self.s.calls[-1][0],'Console.disable')
    async def test_protocol_error_envelopes_are_rejected(self):
        async def send(method,**args):return {'params':{'message':json.dumps({'error':{'message':'secret'}})}}
        with self.assertRaisesRegex(debug.ProtocolError,'fixed'):await debug.command(Obj(send_command=send),'fixed')
    def test_event_budget_drops_instead_of_growing_and_scrubs_values(self):
        e=debug.Events()
        for _ in range(1002):e.add('Console.messageAdded',{'text':'safe','password':'1234567890123456'})
        self.assertEqual(len(e.rows),1000);self.assertEqual(e.dropped,2)
        self.assertEqual(e.rows[0]['params']['password'],'1234…3456')
        e.add('huge',{'text':'x'*(debug.MAX_BYTES+1)});self.assertEqual(e.dropped,3)
    def test_script_catalog_omits_bulk_provider_fields_before_event_budget(self):
        e=debug.Events()
        e.add('Debugger.scriptParsed',{'scriptId':'7','url':'https://dev.test/a.js?token=private','sourceMapURL':'data:application/json,'+'x'*debug.MAX_BYTES,'providerBulk':'x'*debug.MAX_BYTES})
        self.assertEqual(e.dropped,0);self.assertLess(e.bytes,3000)
        p=e.rows[0]['params'];self.assertEqual(p['url'],'https://dev.test/a.js');self.assertNotIn('providerBulk',p)

if __name__=='__main__':unittest.main()
