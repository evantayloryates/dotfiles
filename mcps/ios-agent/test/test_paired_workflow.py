import json
from pathlib import Path
import unittest
from unittest.mock import patch
from paired_workflow import snapshot, validate_snapshot, SCRIPT


class PairedWorkflowTests(unittest.TestCase):
    def value(self):
        return {'coachId':1,'coachUserId':2,'clientId':3,'clientUserId':4,
                'databaseFingerprint':'a'*64,'targetDailyCalories':None}

    def test_refuses_invalid_ids_before_any_provider(self):
        for value in ['0','-1','x','1;sql',True,'1'*21]:
            with patch('paired_workflow.run') as run:
                with self.assertRaises(ValueError):snapshot(client_id=value)
                run.assert_not_called()

    def test_snapshot_boundary_preserves_nullable_value_and_rejects_extra_fields(self):
        self.assertIsNone(validate_snapshot(self.value())['targetDailyCalories'])
        for change in [{'token':'secret'}, {'clientId':0}, {'targetDailyCalories':True},
                       {'targetDailyCalories':'2000'}, {'databaseFingerprint':'remote'}]:
            with self.assertRaises(ValueError):validate_snapshot({**self.value(),**change})

    def test_exact_local_guard_and_read_only_consumer(self):
        checkout=Path('/Users/taylor/src/github/kickoff')
        outputs=[b'desktop-linux',('unix://'+str(Path.home()/'.docker/run/docker.sock')).encode(),
                 b'ety/local-dev-foundation',json.dumps([{'Type':'bind','Source':str(checkout),'Destination':'/workspaces/kickoff'}]).encode(),
                 json.dumps(self.value()).encode()]
        with patch.dict('os.environ',{'DOCKER_HOST':'','DOCKER_CONTEXT':''}), patch('paired_workflow.load_config',return_value={'mobile':str(checkout/'mobile')}), patch('paired_workflow.verify_local_backend'),patch('paired_workflow.run',side_effect=outputs) as run:
            self.assertEqual(snapshot(client_id='3'),self.value())
        call=run.call_args
        self.assertEqual(json.loads(call.kwargs['input']),{'clientId':'3'})
        self.assertIn(SCRIPT,call.args[0])
        self.assertNotIn('createAuthToken',SCRIPT)
        self.assertNotIn('.update(',SCRIPT)

    def test_remote_endpoint_or_wrong_checkout_refuses_before_database(self):
        with patch.dict('os.environ',{'DOCKER_HOST':'ssh://remote'}),patch('paired_workflow.run') as run:
            with self.assertRaises(ValueError):snapshot()
            run.assert_not_called()
        with patch.dict('os.environ',{'DOCKER_HOST':'','DOCKER_CONTEXT':''}),patch('paired_workflow.run',side_effect=[b'desktop-linux',b'tcp://remote:2375']) as run:
            with self.assertRaises(ValueError):snapshot()
            self.assertEqual(run.call_count,2)

    def test_provider_cannot_substitute_another_client_for_selected_identity(self):
        checkout=Path('/Users/taylor/src/github/kickoff')
        outputs=[b'desktop-linux',('unix://'+str(Path.home()/'.docker/run/docker.sock')).encode(),
                 b'ety/local-dev-foundation',json.dumps([{'Type':'bind','Source':str(checkout),'Destination':'/workspaces/kickoff'}]).encode(),
                 json.dumps({**self.value(),'clientId':5}).encode()]
        with patch.dict('os.environ',{'DOCKER_HOST':'','DOCKER_CONTEXT':''}), patch('paired_workflow.load_config',return_value={'mobile':str(checkout/'mobile')}), patch('paired_workflow.verify_local_backend'),patch('paired_workflow.run',side_effect=outputs):
            with self.assertRaisesRegex(ValueError,'paired_selected_client_mismatch'):
                snapshot(client_id='3')

if __name__=='__main__':unittest.main()
