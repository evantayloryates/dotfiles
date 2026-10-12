import unittest
from unittest.mock import patch
import service


class RetiredReleaseTests(unittest.TestCase):
    def broker(self):
        b = service.Broker({'device': 'phone', 'bundle': 'com.dev.kudos.fit'}, lambda: 100)
        b.lease = {'id': 'old', 'thread': 'thread', 'turn': 'turn', 'expires': 200}
        return b

    def test_exact_retired_release_is_idempotent_without_warning_or_new_owner_revocation(self):
        for replacement in (None, {'id': 'new', 'thread': 'other', 'turn': 'other', 'expires': 200}):
            b = self.broker()
            b.revoke('device_browser_handoff')
            b.lease = replacement
            with patch.object(service, '_signal') as log:
                result = b.control({'op': 'release', 'lease': 'old'})
            self.assertEqual(result, {'released': False, 'alreadyInactive': True, 'otherOwnerActive': replacement is not None})
            self.assertIs(b.lease, replacement)
            self.assertEqual(log.call_args.args[1], 'lease.release_reconciled')
            self.assertNotIn('warn', str(log.call_args_list))

    def test_unknown_or_older_capability_remains_rejected(self):
        b = self.broker()
        b.revoke('device_browser_handoff')
        for capability in (None, 'unknown'):
            with self.assertRaisesRegex(service.Rejected, 'lease_required'):
                b.control({'op': 'release', 'lease': capability})
        b.lease = {'id': 'new', 'thread': 'other', 'turn': 'other', 'expires': 200}
        b.revoke('owner_released')
        with self.assertRaisesRegex(service.Rejected, 'lease_required'):
            b.control({'op': 'release', 'lease': 'old'})

    def test_missing_trace_names_fixed_action_without_arguments(self):
        b = self.broker()
        with patch.object(b, '_control', return_value={}), patch.object(service, '_signal') as log:
            b.control({'op': 'action', 'action': 'browser-handoff', 'args': {'url': 'private'}})
        self.assertEqual(log.call_args.kwargs['action'], 'browser-handoff')
        self.assertNotIn('private', str(log.call_args))
