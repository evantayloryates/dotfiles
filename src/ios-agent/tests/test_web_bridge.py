import unittest
import tempfile
from pathlib import Path
from service import Broker, Rejected
import web.bridge as bridge

class WebTests(unittest.TestCase):
    def setUp(self):
        self.now = 100
        self.b = Broker({'device':'phone','bundle':'com.dev.kudos.fit'}, lambda:self.now)
        self.origin = 'https://penelope.taile8fdd0.ts.net:10446'
        grant = self.b.control({'op':'web_enroll','origin':self.origin})
        self.p = self.b.web.page_request({'op':'join','token':grant['token'],'boot':'doc'}, self.origin)
        self.poll = {**self.p, 'op':'poll','boot':'doc','visible':True,'ready':True,'browser':'ios-safari','indicator':False}
        self.b.web.page_request(self.poll,self.origin)
        self.b.lease = {'id':'owner','surface':'web','page':self.p['page'],'thread':'t','turn':'t','expires':1300}
    def action(self):
        return self.b.control({'op':'web_action','lease':'owner','action':'click','args':{'snapshot':'s','target':'1'}})['id']
    def test_browser_command_retains_trace_without_assigning_it_to_unrelated_page_events(self):
        rows=[];old=bridge.emit_signal
        bridge.emit_signal=lambda scope,event,**fields:rows.append((event,fields))
        try:
            cid=self.b.control({'op':'web_action','lease':'owner','action':'click','args':{'snapshot':'s','target':'1'},
                                'signalContext':{'traceId':'a'*16,'sessionId':'c'*32}})['id']
            self.b.web.page_request(self.poll,self.origin)
            self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch,
                                    'result':{'ok':True},'signals':[{'seq':1,'sourceAtMs':1700000000000,'droppedCount':0,
                                    'event':'kck.call.track','fields':{'kind':'microphone','state':'live','present':True}}]},self.origin)
        finally:
            bridge.emit_signal=old
        terminal=next(fields for event,fields in rows if event=='browser.command.terminal')
        self.assertEqual(terminal['traceId'],'a'*16)
        self.assertEqual(terminal['sessionId'],'c'*32)
        page=next(fields for event,fields in rows if event=='kck.call.track')
        self.assertNotIn('traceId',page)
        self.assertNotIn('request',page)
        self.assertEqual(page['state'],'live')
        self.assertEqual(bridge.safe_version('web-f67ef21f1e575eef'),'web-f67ef21f1e575eef')
    def test_native_lease_never_sent_to_native_for_web_owner(self):
        self.assertIsNone(self.b.lease_wire())
        with self.assertRaisesRegex(Rejected,'native_surface_required'):
            self.b.control({'op':'action','lease':'owner','action':'tap'})
    def test_enrollment_is_single_use_origin_bound_and_expiring(self):
        g=self.b.control({'op':'web_enroll','origin':self.origin})
        with self.assertRaisesRegex(Rejected,'web_enrollment_refused'):
            self.b.web.page_request({'op':'join','token':g['token']},'https://other.ts.net:10446')
        self.b.web.page_request({'op':'join','token':g['token']},self.origin)
        with self.assertRaisesRegex(Rejected,'web_enrollment_refused'):
            self.b.web.page_request({'op':'join','token':g['token']},self.origin)
        g=self.b.control({'op':'web_enroll','origin':self.origin});self.now+=301
        with self.assertRaisesRegex(Rejected,'web_enrollment_refused'):
            self.b.web.page_request({'op':'join','token':g['token']},self.origin)
    def test_foreign_origin_and_token_refused(self):
        for r,o in (({**self.poll,'token':'bad'},self.origin),(self.poll,'https://other.ts.net:10446')):
            with self.assertRaisesRegex(Rejected,'web_page_auth_required'): self.b.web.page_request(r,o)
    def test_singleflight_delivery_once_and_lost_ack_unknown(self):
        cid=self.action()
        with self.assertRaisesRegex(Rejected,'web_command_in_flight'): self.action()
        self.assertEqual(self.b.web.page_request(self.poll,self.origin)['command']['id'],cid)
        self.assertNotIn('command',self.b.web.page_request(self.poll,self.origin))
        self.now+=13
        result=self.b.control({'op':'web_result','lease':'owner','id':cid})
        self.assertEqual(result['status'],'unknown')
        self.assertNotIn('command',self.b.web.page_request(self.poll,self.origin))
    def test_hide_and_reload_revoke_no_replay(self):
        for r in ({'visible':False},{'boot':'replacement'}):
            self.b.web.page_request(self.poll,self.origin)
            self.b.lease={'id':'owner','surface':'web','page':self.p['page'],'thread':'t','turn':'t','expires':1300}
            cid=self.action();self.b.web.page_request(self.poll,self.origin)
            self.b.web.page_request({**self.poll,**r},self.origin)
            self.assertIsNone(self.b.lease)
            self.assertEqual(self.b.web.commands[cid]['status'],'unknown')
    def test_native_disconnect_does_not_drop_web_lease(self):
        self.b.device={'seen':0,'boot':'native'};self.b.tick()
        self.assertIsNotNone(self.b.lease)
    def test_page_timeout_retires_ownership(self):
        self.now+=31;self.b.tick();self.assertIsNone(self.b.lease)
    def test_result_requires_epoch_current_lease_and_sent_command(self):
        cid=self.action()
        with self.assertRaisesRegex(Rejected,'stale_web_result'):
            self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch},self.origin)
        self.b.web.page_request(self.poll,self.origin)
        r=self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch,'result':{'ok':True}},self.origin)
        self.assertNotIn('command',r)
        self.assertEqual(self.b.web.commands[cid]['status'],'completed')

    def test_page_signals_are_bounded_scrubbed_deduplicated_and_correlated(self):
        rows=[];old=bridge.emit_signal
        bridge.emit_signal=lambda scope,event,**fields:rows.append((scope,event,fields))
        try:
            cid=self.action();self.b.web.page_request(self.poll,self.origin)
            signals=[
                {'seq':1,'event':'kck.call.media.ready','fields':{'audioTracks':2,'muted':False,'token':'private','code':'ready'}},
                {'seq':2,'event':'browser.command.executed','fields':{'action':'click','outcome':'completed','payload':'private'}},
                {'seq':3,'event':'kck.call.media.ready','fields':{'reason':'https://secret/path','code':'tokenabcd1234','frames':1000001}},
                {'seq':4,'event':'kck.call.media.ready','fields':{'bytes':32}},
                {'seq':5,'event':'kck.call.transport.summary','fields':{'strategy':'pcm-ws','sent':8,'received':7,
                    'drops':1,'gaps':0,'bytes':1000000000000,'durationMs':1000000000000,'reason':'closed'}},
                {'seq':6,'event':'kck.call.permission.state','fields':{'kind':'microphone','state':'granted'}},
                {'seq':7,'event':'kck.call.track.state','fields':{'kind':'audio','present':True,'enabled':True,'muted':False}},
            ]
            for row in signals:
                row.update(sourceAtMs=1700000000000,droppedCount=2)
            self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch,
                                     'result':{'ok':True},'signals':signals},self.origin)
            self.b.web.page_request({**self.poll,'signals':signals},self.origin)
        finally:
            bridge.emit_signal=old
        self.assertEqual(len([x for x in rows if x[1]=='kck.call.media.ready']),3)
        call=next(x for x in rows if x[1]=='kck.call.media.ready')
        self.assertEqual(call[0],'kck-call')
        self.assertNotIn('request',call[2])  # A batch transport does not establish event causality.
        self.assertEqual(call[2]['page'],self.p['page'])
        self.assertIsNone(call[2]['boot'])  # Test fixture is not a real SDK UUID.
        self.assertEqual(bridge.safe_boot('12345678-1234-1234-1234-123456789abc'),
                         '12345678-1234-1234-1234-123456789abc')
        self.assertEqual(call[2]['audioTracks'],2)
        self.assertEqual(call[2]['sourceAtMs'],1700000000000)
        self.assertEqual(call[2]['sourceSeq'],1)
        self.assertEqual(call[2]['sourceStream'],'web-page')
        self.assertEqual(call[2]['droppedCount'],2)
        self.assertNotIn('token',call[2])
        self.assertFalse(any('private' in str(x) or 'https://' in str(x) for x in rows))
        self.assertFalse(any('tokenabcd1234' in str(x) for x in rows))
        transport=next(x for x in rows if x[1]=='kck.call.transport.summary')
        self.assertEqual(transport[2]['strategy'],'pcm-ws')
        self.assertEqual(transport[2]['bytes'],1000000000000)
        self.assertTrue(next(x for x in rows if x[1]=='kck.call.track.state')[2]['present'])

    def test_signal_storage_failure_does_not_fail_command(self):
        old=bridge.emit_signal
        bridge.emit_signal=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('disk unavailable'))
        try:
            cid=self.action()
            self.b.web.page_request({**self.poll,'signals':[{'seq':1,'sourceAtMs':1700000000000,'droppedCount':0,
                'event':'kck.web.ready','fields':{'ready':True}}]},self.origin)
            self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch,'result':{'ok':True}},self.origin)
        finally:
            bridge.emit_signal=old
        self.assertEqual(self.b.web.commands[cid]['status'],'completed')

    def test_execution_timeout_signal_does_not_claim_failure(self):
        rows=[];old=bridge.emit_signal
        bridge.emit_signal=lambda scope,event,**fields:rows.append((event,fields))
        try:
            cid=self.action();self.b.web.page_request(self.poll,self.origin)
            self.b.web.page_request({**self.poll,'op':'result','id':cid,'epoch':self.b.epoch,
                'result':{'ok':False,'error':'execution_deadline_unknown'}},self.origin)
        finally:
            bridge.emit_signal=old
        terminal=next(fields for event,fields in rows if event=='browser.command.terminal')
        self.assertEqual(terminal['outcome'],'unknown')
        self.assertEqual(terminal['reason'],'execution_deadline_unknown')

    def test_authenticated_tab_survives_host_restart_without_reenrollment(self):
        with tempfile.TemporaryDirectory() as d:
            b=Broker({'device':'p','bundle':'com.dev.kudos.fit'},lambda:self.now,state=Path(d))
            g=b.control({'op':'web_enroll','origin':self.origin})
            p=b.web.page_request({'op':'join','token':g['token'],'boot':'doc'},self.origin)
            self.assertNotIn(p['token'],(Path(d)/'web-clients.json').read_text())
            replacement=Broker({'device':'p','bundle':'com.dev.kudos.fit'},lambda:self.now,state=Path(d))
            result=replacement.web.page_request({**p,'op':'poll','visible':True,'ready':True,'boot':'doc'},self.origin)
            self.assertIsNone(result['lease'])
            self.assertNotEqual(replacement.epoch,b.epoch)
            self.assertEqual(len(replacement.web.pages),1)

    def test_delayed_retired_document_cannot_hide_or_replace_new_owner(self):
        newer = {**self.poll, 'boot':'new-document'}
        self.b.web.page_request(newer,self.origin)
        self.b.lease = {'id':'replacement-owner','surface':'web','page':self.p['page'],'thread':'t','turn':'t','expires':1300}
        with self.assertRaisesRegex(Rejected,'retired_web_document'):
            self.b.web.page_request({**self.poll,'visible':False},self.origin)
        self.assertEqual(self.b.lease['id'],'replacement-owner')
        self.assertEqual(self.b.web.pages[self.p['page']]['boot'],'new-document')
        self.assertTrue(self.b.web.pages[self.p['page']]['visible'])

    def test_android_browser_identity_is_not_desktop_or_ios(self):
        self.b.web.page_request({**self.poll,'browser':'android-chrome'},self.origin)
        self.assertEqual(self.b.web.pages[self.p['page']]['browser'],'android-chrome')
        self.b.web.page_request({**self.poll,'browser':'spoofed-unknown'},self.origin)
        self.assertEqual(self.b.web.pages[self.p['page']]['browser'],'android-chrome')

    def test_remember_opt_in_mints_distinct_tabs_without_revoking_owner(self):
        normal=self.b.control({'op':'web_enroll','origin':self.origin})
        identity=self.b.web.page_request({'op':'join','token':normal['token'],'boot':'plain'},self.origin)
        self.assertNotIn('browserResume',identity)
        grant=self.b.control({'op':'web_enroll','origin':self.origin,'rememberBrowser':True})
        parent=self.b.web.page_request({'op':'join','token':grant['token'],'boot':'parent'},self.origin)
        resume=parent['browserResume']
        a=self.b.web.page_request({'op':'resume',**resume,'boot':'child-a'},self.origin)
        c=self.b.web.page_request({'op':'resume',**resume,'boot':'child-b'},self.origin)
        self.assertEqual(len({parent['page'],a['page'],c['page']}),3)
        self.assertEqual(self.b.lease['id'],'owner')
        self.assertEqual(self.b.web.clients[a['page']]['expires'],self.b.web.clients[resume['page']]['expires'])
        self.assertNotIn('browserResume',a)

    def test_resume_origin_type_expiry_and_capacity_fences(self):
        grant=self.b.control({'op':'web_enroll','origin':self.origin,'rememberBrowser':True})
        parent=self.b.web.page_request({'op':'join','token':grant['token'],'boot':'parent'},self.origin)
        resume=parent['browserResume']
        for r,origin in (({**resume,'token':'bad'},self.origin),(resume,'https://other.ts.net:10446'),(parent,self.origin)):
            with self.assertRaisesRegex(Rejected,'web_page_auth_required'):
                self.b.web.page_request({'op':'resume',**r},origin)
        with self.assertRaisesRegex(Rejected,'web_page_auth_required'):
            self.b.web.page_request({'op':'poll',**resume},self.origin)
        original=self.b.web.clients[resume['page']]['expires']
        self.b.web.clients[resume['page']]['expires']=0
        with self.assertRaisesRegex(Rejected,'web_page_auth_required'):
            self.b.web.page_request({'op':'resume',**resume},self.origin)
        self.b.web.clients[resume['page']]['expires']=original
        while len(self.b.web.pages)<16:
            self.b.web.page_request({'op':'resume',**resume,'boot':'another'},self.origin)
        with self.assertRaisesRegex(Rejected,'web_page_limit'):
            self.b.web.page_request({'op':'resume',**resume},self.origin)

    def test_resume_hash_only_persistence_and_restart(self):
        with tempfile.TemporaryDirectory() as d:
            b=Broker({'device':'p','bundle':'com.dev.kudos.fit'},lambda:self.now,state=Path(d))
            grant=b.control({'op':'web_enroll','origin':self.origin,'rememberBrowser':True})
            parent=b.web.page_request({'op':'join','token':grant['token'],'boot':'parent'},self.origin)
            resume=parent['browserResume']
            self.assertNotIn(resume['token'],(Path(d)/'web-clients.json').read_text())
            replacement=Broker({'device':'p','bundle':'com.dev.kudos.fit'},lambda:self.now,state=Path(d))
            child=replacement.web.page_request({'op':'resume',**resume,'boot':'new-tab'},self.origin)
            self.assertNotEqual(child['page'],parent['page'])
            self.assertIsNone(replacement.lease)

    def test_call_rig_grant_is_port_bound_and_cannot_resume_on_normal_app(self):
        origin=self.origin.replace(':10446',':10520')
        g=self.b.control({'op':'web_enroll','origin':origin,'rememberBrowser':True})
        with self.assertRaisesRegex(Rejected,'web_enrollment_refused'):
            self.b.web.page_request({'op':'join','token':g['token'],'boot':'rig'},self.origin)
        joined=self.b.web.page_request({'op':'join','token':g['token'],'boot':'rig'},origin)
        with self.assertRaisesRegex(Rejected,'web_page_auth_required'):
            self.b.web.page_request({**joined,'op':'poll','boot':'rig'},self.origin)
        with self.assertRaisesRegex(Rejected,'private_web_origin_required'):
            self.b.control({'op':'web_enroll','origin':self.origin.replace(':10446',':10521')})
