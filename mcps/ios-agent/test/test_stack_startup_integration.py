"""Real isolated HTTP worker startup; not a product GraphQL/Next cold restart."""
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch
from install_runtime import probe
from local_stack import ensure_backend

SERVER = r'''
import json,sys
from http.server import BaseHTTPRequestHandler,HTTPServer
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):self.send_response(200);self.end_headers();self.wfile.write(b'fixture')
 def do_POST(self):
  self.rfile.read(int(self.headers.get('Content-Length',0)));self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'data':{'__typename':'Query'}}).encode())
HTTPServer(('127.0.0.1',int(sys.argv[1])),Handler).serve_forever()
'''

class IsolatedColdWorkerTests(unittest.TestCase):
    def test_cold_admission_launches_two_real_workers_once_and_observes_http_readiness(self):
        ports={}
        for name in ['node','next']:
            with socket.socket() as s:s.bind(('127.0.0.1',0));ports[name]=s.getsockname()[1]
        workers=[];admitted=[]
        def start(container,project):
            self.assertEqual(container,'owned-http-fixture');admitted.append(project)
            workers.append(subprocess.Popen([sys.executable,'-c',SERVER,str(ports[project])],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL))
        def observe(url,graphql=False):
            port=ports['node' if graphql else 'next']
            return probe('http://127.0.0.1:'+str(port)+('/development/graphql' if graphql else '/sign-in'),graphql=graphql)
        try:
            with patch('local_stack.local_identity'),patch('local_stack.inspect_processes',return_value={'server':0,'starter':0,'web':0}),patch('local_stack.occupied',return_value=False),patch('local_stack.verify_local_backend'),patch('local_stack.start',side_effect=start),patch('local_stack.probe',side_effect=observe):
                result=ensure_backend('owned-http-fixture',timeout=5)
            self.assertEqual(admitted,['node','next']);self.assertEqual(result['started'],['graphql','web'])
            self.assertTrue(result['backendReady']);self.assertFalse(result['dataReset']);self.assertFalse(result['workersStopped'])
            self.assertTrue(all(p.poll() is None for p in workers))
        finally:
            for p in workers:p.terminate()
            for p in workers:p.wait(timeout=5)

if __name__=='__main__':unittest.main()
