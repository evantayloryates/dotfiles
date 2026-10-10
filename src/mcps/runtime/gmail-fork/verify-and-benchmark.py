#!/usr/bin/env python3
"""Synthetic MCP parity and fresh-process RSS check. No mailbox/network calls."""
import hashlib
import json
import os
from pathlib import Path
import select
import statistics
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent
UPSTREAM = ROOT.parent / 'node_modules/gmail-mcp-multiauth/dist'

def run(entry, account):
    with tempfile.TemporaryDirectory(prefix='gmail-mcp-check-') as directory:
        d = Path(directory)
        (d/'oauth.json').write_text(json.dumps({'installed': {'client_id': 'synthetic', 'client_secret': 'synthetic'}}))
        (d/'credentials.json').write_text(json.dumps({'refresh_token': 'synthetic', 'access_token': 'synthetic'}))
        env = dict(os.environ, GMAIL_OAUTH_PATH=str(d/'oauth.json'), GMAIL_CREDENTIALS_PATH=str(d/'credentials.json'), GMAIL_ACCOUNT_NAME=account)
        started = time.monotonic()
        process = subprocess.Popen(['node', str(entry)], cwd=d, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
        try:
            def request(value):
                process.stdin.write(json.dumps(value)+'\n');process.stdin.flush()
                if not select.select([process.stdout], [], [], 10)[0]:
                    raise RuntimeError('MCP response timeout')
                return json.loads(process.stdout.readline())
            init = request({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'synthetic-check','version':'1'}}})
            process.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');process.stdin.flush()
            tools = request({'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}})
            elapsed = (time.monotonic()-started)*1000
            assert len(tools['result']['tools']) == 21
            assert init['result']['serverInfo']['name'] == 'gmail-'+account
            time.sleep(.25)
            rss = int(subprocess.check_output(['ps','-o','rss=','-p',str(process.pid)], text=True).strip())/1024
            digest = hashlib.sha256(json.dumps(tools['result']['tools'],sort_keys=True).encode()).hexdigest()
            return {'account':account, 'rss_mib':rss, 'initialize_and_list_ms':elapsed, 'tools':21, 'schema_sha256':digest}
        finally:
            process.terminate()
            try:process.wait(timeout=3)
            except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__ == '__main__':
    expected = (UPSTREAM/'index.js').read_text().replace("import { google } from 'googleapis';", "import { gmail as gmailApi } from 'googleapis/build/src/apis/gmail/index.js';").replace("google.gmail({ version: 'v1', auth: oauth2Client })", "gmailApi({ version: 'v1', auth: oauth2Client })")
    assert (ROOT/'index.js').read_text() == expected, 'Unexpected handler change'
    for name in ['utl.js','label-manager.js','filter-manager.js']:
        assert (ROOT/name).read_bytes() == (UPSTREAM/name).read_bytes()
    results = {name: [run(entry, ['personal-primary', 'personal-secondary', 'personal-legacy'][i]) for i in range(3)] for name,entry in [('upstream',UPSTREAM/'index.js'),('fork',ROOT/'index.js')]}
    assert len({r['schema_sha256'] for rows in results.values() for r in rows}) == 1
    print(json.dumps({'method':'Synthetic OAuth; no API operations; ps RSS 250ms after tool listing; three fresh processes per variant; identical 21 tool schemas and unchanged handlers. Not an active fleet savings estimate.','results':results,'median_rss_mib':{k:statistics.median(r['rss_mib'] for r in v) for k,v in results.items()}},indent=2))
