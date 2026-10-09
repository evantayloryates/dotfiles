#!/usr/bin/env python3
"""Private empty-file notification callback and model-free seven-second watcher.

Notification delivery/sending is separate. A file write alone does not prove a
human click. Consumers must preserve their own authorization and scope.
"""
import argparse
import ctypes
import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import time


def native_ns(clock=8):
    # CLOCK_UPTIME_RAW=8 / CLOCK_MONOTONIC_RAW=4: installed macOS SDK _time.h.
    function = ctypes.CDLL(None).clock_gettime_nsec_np
    function.argtypes = [ctypes.c_int]
    function.restype = ctypes.c_uint64
    return function(clock)


def boot_id():
    return subprocess.check_output(['/usr/sbin/sysctl','-n','kern.bootsessionuuid'],text=True,timeout=2).strip()


def opened(path, write=False):
    fd = os.open(path, (os.O_RDWR if write else os.O_RDONLY)|os.O_NOFOLLOW|os.O_NONBLOCK)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 4096:
        os.close(fd)
        raise ValueError('Owned private bounded regular file required')
    return os.fdopen(fd, 'r+' if write else 'r')


def click(path):
    with opened(path, True) as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        if file.read():
            return {'state':'already_signaled','extended':False}
        value = {'schema':'production-click/v2','clock_domain':'CLOCK_UPTIME_RAW','boot_id':boot_id(),
            'clicked_host_ns':str(native_ns()),'reservation_clock_domain':'CLOCK_MONOTONIC_RAW',
            'clicked_continuous_ns':str(native_ns(4)),'callback_wall_ns':str(time.time_ns()),'duration_s':120,
            'qualification':'Callback receipt time; not authenticated human identity or physical click latency'}
        file.seek(0);file.write(json.dumps(value));file.flush();os.fsync(file.fileno())
        return {'state':'signaled','extended':False}


def watch(path, timeout_s):
    begin = native_ns(4); boot = boot_id()
    while native_ns(4)-begin < timeout_s*1_000_000_000:
        with opened(path) as file:
            fcntl.flock(file, fcntl.LOCK_SH); text=file.read(4097)
        if text:
            value=json.loads(text); stamp=value.get('clicked_continuous_ns'); now=native_ns(4)
            host=value.get('clicked_host_ns')
            valid=lambda v:isinstance(v,str) and v.isascii() and v.isdecimal() and len(v)<=24
            if value.get('schema')!='production-click/v2' or value.get('clock_domain')!='CLOCK_UPTIME_RAW' or value.get('reservation_clock_domain')!='CLOCK_MONOTONIC_RAW' or value.get('boot_id')!=boot or value.get('duration_s')!=120 or not valid(host) or int(host)>native_ns() or not valid(stamp) or int(stamp)>now:
                raise ValueError('Unqualified callback clock/schema/boot; no production signal')
            elapsed=now-int(stamp)
            return {**value,'state':'ready' if elapsed<120_000_000_000 else 'expired',
                'observed_host_ns':str(native_ns()),'observed_continuous_ns':str(now),
                'elapsed_clock_domain':'CLOCK_MONOTONIC_RAW','elapsed_ns':str(elapsed),'remaining_ns':str(max(0,120_000_000_000-elapsed)),
                'poll_interval_s':7,'chat_delivery':'Not performed; active orchestrator must deliver once'}
        time.sleep(7)
    return {'state':'expired_without_signal','poll_interval_s':7}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['prepare','click','watch']);parser.add_argument('signal',type=Path)
    parser.add_argument('--timeout-s',type=int,default=3600);args=parser.parse_args()
    if not args.signal.is_absolute() or not 1<=args.timeout_s<=3600:parser.error('Absolute file and timeout1–3600 required')
    if args.mode=='prepare':
        fd=os.open(args.signal,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.close(fd)
        result={'state':'prepared_empty','signal':str(args.signal)}
    elif args.mode=='click':result=click(args.signal)
    else:result=watch(args.signal,args.timeout_s)
    print(json.dumps(result))
