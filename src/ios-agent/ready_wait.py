"""Lease-free event wait over the local authenticated-user Unix socket."""
import argparse
import json
import sys
from pathlib import Path
from cli import request
from service import STATE

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--state',type=Path,default=STATE)
    args=parser.parse_args();r=json.loads(sys.stdin.read(4096));r['op']='ready_wait'
    print(json.dumps(request(r,args.state,timeout=r.get('timeoutSeconds',45)+3)))
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'readyToAcquire':False,'reason':'readiness_channel_unavailable','lockState':'unknown','leaseAcquired':False}));sys.exit(1)
