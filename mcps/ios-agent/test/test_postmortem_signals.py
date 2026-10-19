import unittest
from unittest.mock import patch
import service

class PostmortemSignals(unittest.TestCase):
    def test_missing_trace_notice_coalesces_without_changing_dispatch(self):
        b=service.Broker({'device':'phone','bundle':'com.dev.kudos.fit'},lambda:100)
        rows=[]
        with patch.object(service,'_signal',side_effect=lambda *a,**k:rows.append((a,k))), patch.object(b,'_control',return_value={'ok':True}) as dispatch:
            for _ in range(3):self.assertEqual(b.control({'op':'web_action','action':'click'}),{'ok':True})
            self.assertEqual(dispatch.call_count,3)
            b.control({'op':'web_action','action':'click','signalContext':{'traceId':'a'*16}})
            b.control({'op':'web_action','action':'state'})
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0][1]['reason'],'client_trace_missing')
        self.assertEqual(rows[0][1]['level'],'warn')

    def test_rejection_keeps_original_exception_and_safe_reason(self):
        b=service.Broker({'device':'phone','bundle':'com.dev.kudos.fit'})
        rows=[]
        with patch.object(service,'_signal',side_effect=lambda *a,**k:rows.append((a,k))), patch.object(b,'_control',side_effect=service.Rejected('lease_required')):
            with self.assertRaisesRegex(service.Rejected,'lease_required'):b.control({'op':'status'})
        self.assertEqual(rows[0][1]['reason'],'lease_required')
        self.assertEqual(rows[0][1]['outcome'],'rejected')

    def test_status_reports_loaded_release_without_acquiring_phone(self):
        b=service.Broker({'device':'phone','bundle':'com.dev.kudos.fit'})
        r=b.control({'op':'status'})
        self.assertEqual(r['serviceRelease'],service.SERVICE_RELEASE)
        self.assertIsNone(r['lease'])

    def test_only_fixed_auth_gate_codes_bypass_word_redaction(self):
        from signals import _clean
        r=_clean({'reason':'xctest_authorization_timed_out','message':'Authorization: Bearer fake-secret'})
        self.assertEqual(r['reason'],'xctest_authorization_timed_out')
        self.assertEqual(r['message'],'[redacted]')
        self.assertEqual(_clean({'reason':'authorization_private_value'})['reason'],'[redacted]')
