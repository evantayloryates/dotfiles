#!/usr/bin/env python3
"""Fixed web operations over the private same-user control socket."""
import argparse
import json
import sys
import time
from cli import request
from service import STATE
from pathlib import Path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--state', type=Path, default=STATE)
    a = p.parse_args()
    r = json.loads(sys.stdin.read(100000))
    if r.get('op') not in ('web_pages','web_enroll','web_action','web_result'):
        raise ValueError('fixed_web_operation_required')
    result = request(r, a.state)
    if r['op'] == 'web_action':
        cid = result['id']
        end = time.monotonic() + 14
        while time.monotonic() < end:
            result = request({'op':'web_result','id':cid,'lease':r['lease']}, a.state)
            if result['status'] not in ('queued','sent'):
                break
            time.sleep(.1)
        if result['status'] in ('queued','sent'):
            result = {'id':cid,'status':'unknown','reason':'deadline_do_not_replay'}
    print(json.dumps(result))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Raw exceptions can include local paths/data. No secret-bearing stderr.
        print(json.dumps({'error':'web_operation_refused_or_unknown','replay':False}))
        sys.exit(1)
