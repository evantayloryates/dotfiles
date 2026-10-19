import tempfile
import unittest
from pathlib import Path
from source_hash import WORKER_FILES, worker_source_hash

class WorkerIdentityTests(unittest.TestCase):
    def test_imported_bridge_change_invalidates_loaded_worker_identity(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for name in WORKER_FILES:
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('original')
            before=worker_source_hash(root)
            (root/'web/bridge.py').write_text('replacement bridge')
            self.assertNotEqual(before,worker_source_hash(root))
            self.assertEqual((root/'service.py').read_text(),'original')
