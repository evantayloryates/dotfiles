import hashlib
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import native_delivery as delivery

class DeliveryTests(unittest.TestCase):
 def fixture(self, root):
  job='a'*32; stamp='b'*32; base=root/'build-jobs'/job;product=base/'DerivedData/Build/Products/Debug-iphoneos/Kickoff.app';product.mkdir(parents=True);(root/'build-jobs').chmod(0o700)
  (base/'request.json').write_text('{}')
  (product/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.dev.kudos.fit','CFBundleExecutable':'Kickoff','IOSAgentDeliveryId':stamp}))
  (product/'Kickoff').write_bytes(b'fixed-binary')
  (base/'result.json').write_text(json.dumps({'ok':True,'state':'completed','deliveryId':stamp,'executableHash':hashlib.sha256(b'fixed-binary').hexdigest()}))
  (base/'DerivedData/ios-agent-build.json').write_text(json.dumps({'product':str(product),'deliveryId':stamp}))
  (root/'web-device.json').write_text(json.dumps({'coreDeviceId':'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9'}));(root/'web-device.json').chmod(0o600)
  return job,product
 def test_signed_product_and_stamp_revalidated_and_binary_tamper_refused(self):
  with tempfile.TemporaryDirectory() as d:
   state=Path(d);job,product=self.fixture(state)
   with patch.object(delivery.subprocess,'run',return_value=SimpleNamespace(stderr='CDHash=abcdef\n')) as codesign:
    r=delivery.prepare(state,job);self.assertEqual(r['deliveryId'],'b'*32);self.assertEqual(codesign.call_count,2)
    (product/'Kickoff').write_bytes(b'tampered')
    with self.assertRaisesRegex(ValueError,'build_product_changed'):delivery.prepare(state,job)
 def test_legacy_identity_and_non_dev_bundle_refused(self):
  for change,reason in [({'IOSAgentDeliveryId':'old'},'signed_delivery_identity_required'),({'CFBundleIdentifier':'com.kudos.fit'},'fixed_dev_bundle_required')]:
   with tempfile.TemporaryDirectory() as d:
    state=Path(d);job,product=self.fixture(state);info=plistlib.loads((product/'Info.plist').read_bytes());info.update(change);(product/'Info.plist').write_bytes(plistlib.dumps(info))
    with patch.object(delivery.subprocess,'run') as codesign:
     with self.assertRaisesRegex(ValueError,reason):delivery.prepare(state,job)
     codesign.assert_not_called()
 def test_no_arbitrary_job(self):
  with self.assertRaisesRegex(ValueError,'fixed_build_job_required'):delivery.prepare(Path('/unused'),'../escape')
