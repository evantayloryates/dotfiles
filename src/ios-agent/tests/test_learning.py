import concurrent.futures
from pathlib import Path
import tempfile
import unittest
from learning import LearningStore


class LearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'learning'
        self.store = LearningStore(self.root)
        self.addCleanup(self.store.close)

    def evidence(self, source='a' * 64, status='passed'):
        return self.store.dispatch('observe', {'source': source, 'receipt': {'gate': 'ready', 'status': status,
            'observation': {'runtimeReady': True, 'token': 'secret sentinel', 'tree': {'raw': 'never'}}}})['evidenceId']

    def test_new_diagnostic_gates_store_only_structural_receipts(self):
        for gate in ['device-profile','system-ready','system-idle','capture-audio','capture-data','web-element']:
            result=self.store.dispatch('observe',{'source':'a'*64,'receipt':{'gate':gate,'status':'passed','observation':{'sampleCount':3,'runnerStopped':True,'rawConsole':'private sentinel','audioBytes':'base64 sentinel','processes':[{'pid':77}]}}})
            row=self.store.dispatch('evidence',{'source':'a'*64,'gate':gate})['evidence'][0]
            self.assertEqual(row['id'],result['evidenceId'])
            self.assertEqual(row['receipt']['observation'],{'runnerStopped':True,'sampleCount':3})

    def test_proposals_review_version_filter_dedup_and_retirement(self):
        eid = self.evidence()
        args = dict(key='ready-before-input', lesson='Require actual readiness before sending input.', evidenceId=eid)
        proposal = self.store.dispatch('propose', args)
        duplicate = self.store.dispatch('propose', args)
        self.assertEqual(proposal['lessonId'], duplicate['lessonId'])
        self.assertFalse(proposal['deduplicated']); self.assertTrue(duplicate['deduplicated'])
        self.assertEqual(self.store.dispatch('search', {'source': 'a' * 64})['lessons'], [])
        self.store.dispatch('review', dict(lessonId=proposal['lessonId'], state='supported', reason='The readiness receipt passed.', evidenceId=eid))
        self.assertEqual(len(self.store.dispatch('search', {'source': 'a' * 64})['lessons']), 1)
        self.assertEqual(self.store.dispatch('search', {'source': 'b' * 64})['lessons'], [])
        self.store.dispatch('review', dict(lessonId=proposal['lessonId'], state='retired', reason='Counterevidence invalidates this claim.', evidenceId=self.evidence(status='failed')))
        self.assertEqual(self.store.dispatch('search', {'source': 'a' * 64})['lessons'], [])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM reviews').fetchone()[0], 2)

    def test_failed_receipt_cannot_support_or_cross_version_review(self):
        eid = self.evidence(status='failed')
        p = self.store.dispatch('propose', dict(key='failure-edge', lesson='Readiness failed in this experiment.', evidenceId=eid))
        for evidence in (eid, self.evidence(source='b' * 64)):
            with self.assertRaises(ValueError):
                self.store.dispatch('review', dict(lessonId=p['lessonId'], state='supported', reason='A claim.', evidenceId=evidence))

    def test_structural_only_evidence_and_accidental_secret_rejection(self):
        self.evidence()
        raw = self.store.db.execute('SELECT receipt FROM evidence').fetchone()[0]
        self.assertNotIn('sentinel', raw); self.assertNotIn('tree', raw)
        for text in ('Bearer abcdef', 'https://private.example', 'me@example.com', 'a' * 64):
            with self.assertRaises(ValueError): self.store.text(text, 1200)

    def test_multiple_process_style_connections_share_atomic_database(self):
        def write(_):
            store = LearningStore(self.root)
            try:
                return store.dispatch('observe', {'source': 'a' * 64, 'receipt': {'gate': 'ready', 'status': 'passed'}})['evidenceId']
            finally: store.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(write, range(12)))
        self.assertEqual(len(set(ids)), 12)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM evidence').fetchone()[0], 12)

    def test_general_lesson_needs_distinct_successful_runtimes_and_remains_available(self):
        first, second = self.evidence(), self.evidence(source='b' * 64)
        p = self.store.dispatch('propose', dict(key='observe-before-control', lesson='Verify readiness before control.', scope='general', evidenceId=first))
        review = dict(lessonId=p['lessonId'], state='supported', reason='The same readiness gate passed on distinct runtimes.', evidenceId=first)
        with self.assertRaises(ValueError): self.store.dispatch('review', review)
        with self.assertRaises(ValueError): self.store.dispatch('review', {**review, 'corroboratingEvidenceId': first})
        self.store.dispatch('review', {**review, 'corroboratingEvidenceId': second})
        self.assertEqual(len(self.store.dispatch('search', {'source': 'c' * 64})['lessons']), 1)


if __name__ == '__main__': unittest.main()
