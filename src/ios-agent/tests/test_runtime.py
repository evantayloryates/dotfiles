import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from email.message import Message
from dev_runtime import validate_config, load_config
from install_runtime import serve_compatible, route_names, warm_bundle

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

    def test_route_allowlist_uses_code_literals_only(self):
        directory = self.root/'src/navigators/tabs'; directory.mkdir(parents=True)
        (directory/'index.js').write_text('const HOME = "ClientDashboard";\n<Stack.Screen name={HOME} />\n<Stack.Screen name="Welcome" />\n<Stack.Screen name={userValue} />')
        self.assertEqual(route_names(self.root), ['ClientDashboard','Welcome'])

    def test_bundle_warm_requires_the_expected_runtime_even_across_chunks(self):
        class Response:
            status = 200
            headers = Message()
            headers['Content-Type'] = 'application/javascript'
            def __init__(self, chunks): self.chunks = iter(chunks)
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return next(self.chunks, b'')
        body = b'x' * 1200 + b' '.join(self.config[k].encode() for k in ['metroURL','graphqlURL','webURL'])
        with patch('install_runtime.urllib.request.urlopen', return_value=Response([body[:1220],body[1220:]])):
            self.assertEqual(warm_bundle(self.config),len(body))
        with patch('install_runtime.urllib.request.urlopen', return_value=Response([b'x'*2000])):
            with self.assertRaises(ValueError): warm_bundle(self.config)

if __name__ == '__main__': unittest.main()
