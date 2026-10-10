import unittest
import tempfile
from pathlib import Path
from service import Broker, Rejected

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
