import importlib.util
from pathlib import Path
import plistlib
import sys
import unittest

spec = importlib.util.spec_from_file_location('gpu', Path(__file__).with_name('sample-gpu.py'))
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)


class GPUProbeTests(unittest.TestCase):
    def test_missing_accelerator_or_fields_never_become_idle_zero(self):
        self.assertEqual(gpu.extract(plistlib.dumps([]))['state'], 'unavailable')
        node = gpu.extract(plistlib.dumps([{}]))['accelerators'][0]
        self.assertTrue(all(v is None for v in node['reported_utilization_percent'].values()))
        self.assertTrue(all(v is None for v in node['reported_counters'].values()))

    def test_invalid_percentages_and_bool_counters_remain_unknown(self):
        row = {'PerformanceStatistics': {'Device Utilization %': 101, 'Renderer Utilization %': True,
              'Tiler Utilization %': float('nan'), 'recoveryCount': False, 'Alloc system memory': -1}}
        node = gpu.extract(plistlib.dumps([row]))['accelerators'][0]
        self.assertEqual(len(node['invalid_fields']), 5)
        self.assertTrue(all(v is None for v in node['reported_utilization_percent'].values()))

    def test_whitelist_exact_large_counters_and_node_truncation(self):
        row = {'PerformanceStatistics': {'Device Utilization %': 0, 'recoveryCount': 2**60, 'unrelated': 'private'},
               'SurfaceList': 'not copied', 'IORegistryEntryID': 2**60}
        result = gpu.extract(plistlib.dumps([row]*5))
        self.assertTrue(result['truncated']); self.assertEqual(len(result['accelerators']), 4)
        node = result['accelerators'][0]
        self.assertEqual(node['reported_counters']['recoveryCount'], str(2**60))
        self.assertEqual(node['registry_entry_id'], str(2**60))
        self.assertEqual(node['reported_utilization_percent']['Device Utilization %'], 0)
        self.assertNotIn('private', str(result)); self.assertNotIn('SurfaceList', str(result))

    def test_malformed_payload_refuses_instead_of_reporting_idle(self):
        for data in [b'invalid', plistlib.dumps({}), b'x'*(gpu.MAX_BYTES+1)]:
            with self.assertRaises(RuntimeError): gpu.extract(data)

    def test_process_deadline_output_budget_and_failure_reap_owned_child(self):
        self.assertEqual(gpu.bounded_output([sys.executable, '-c', 'print("ok")']), b'ok\n')
        for code, reason, options in [('import time;time.sleep(10)', 'deadline', {'deadline_s': .1}),
                ('print("x"*10000)', 'output_budget', {'max_bytes': 100}),
                ('raise SystemExit(2)', 'command_failed', {})]:
            with self.assertRaisesRegex(RuntimeError, reason): gpu.bounded_output([sys.executable, '-c', code], **options)


if __name__ == '__main__': unittest.main()
