import json
from pathlib import Path
import tempfile
import unittest
from dev_runtime import validate_config, load_config
from install_runtime import serve_compatible

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        (self.root / 'ios/kudos.xcworkspace').mkdir(parents=True)
        (self.root / 'node').touch()
        self.config = dict(version=1, mobile=str(self.root), node=str(self.root/'node'), routeNames=['Welcome'])
        self.config.update(metroURL='https://host.tail.ts.net:10444/', graphqlURL='https://host.tail.ts.net:10445/development/graphql', webURL='https://host.tail.ts.net:10446/')

    def tearDown(self):
        self.temp.cleanup()

    def test_invalid_scope_rejected(self):
        validate_config(self.config)
        for patch in [{'version':True}, {'routeNames':['é']}, {'webURL':'https://other.ts.net:10446/'}, {'metroURL':'https://token@host.tail.ts.net:10444/'}, {'metroURL':'https://host.tail.ts.net:10444/\n'}, {'graphqlURL':'https://example.com:10445/development/graphql'}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validate_config({**self.config, **patch})

    def test_permissions_and_funnel_fail_closed(self):
        path = self.root/'config.json'; path.write_text(json.dumps(self.config)); path.chmod(0o644)
        with self.assertRaises(ValueError): load_config(path)
        path.chmod(0o600); self.assertEqual(load_config(path), self.config)
        self.assertEqual(serve_compatible(self.config, {}), {10444:19404,10445:4000,10446:3000})
        for current in [{'AllowFunnel': {'x':True}}, {'TCP': {'10444': {'HTTPS':False}}}, {'Web': {'host.tail.ts.net:10445': {'Handlers': {'/': {'Proxy':'http://127.0.0.1:9999'}}}}}]:
            with self.assertRaises(ValueError): serve_compatible(self.config, current)

if __name__ == '__main__': unittest.main()
