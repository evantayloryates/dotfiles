#!/usr/bin/env python3
"""Controlled worker death with a bounded owned decoder; no UI or recording."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


def probe(worker):
    with tempfile.TemporaryDirectory(prefix='registered-orphan-') as folder:
        root = Path(folder)
        ready = root/'decoder-ready.json'
        lease = root/'registration-reader.lock'
        fake = root/'owned-decoder'
        fake.write_text('#!'+sys.executable+'\nimport json,os,time\n'
                        'from pathlib import Path\n'
                        f'Path({str(ready)!r}).write_text(json.dumps({{"pid":os.getpid(),"group":os.getpgrp()}}))\n'
                        'time.sleep(30)\n')
        fake.chmod(0o700)
        dummy = root/'unused-video'
        dummy.write_bytes(b'owned synthetic decoder input')
        fds = [os.open(dummy, os.O_RDONLY), os.open(dummy, os.O_RDONLY)]
        process = None
        group_stop_sent = False
        try:
            # The actual worker receives its videos on3/4, as in the Node adapter.
            assert fds == [3, 4], f'unexpected inherited descriptor layout:{fds}'
            config = {'lease_path':str(lease),'ffmpeg':str(fake),
                      'primary_index':0,'backup_index':0,'dimensions':[[160,120],[640,480]],
                      'frame_times':[{'numerator':'0','denominator':'1'}]*2}
            process = subprocess.Popen([sys.executable, str(worker)], stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       pass_fds=tuple(fds), start_new_session=True)
            process.stdin.write(json.dumps(config).encode())
            process.stdin.close()
            process.stdin = None
            deadline = time.monotonic()+5
            while not ready.exists() and process.poll() is None and time.monotonic()<deadline:
                time.sleep(.01)
            assert ready.exists(), 'owned decoder did not start'
            decoder = json.loads(ready.read_text())
            assert decoder['group'] == process.pid, 'decoder escaped owned process group'
            process.kill()  # Only the owned Python worker; decoder is deliberately left alive.
            assert process.wait(timeout=2) == -signal.SIGKILL
            os.kill(decoder['pid'], 0)
            fd = os.open(lease, os.O_RDWR)
            retained = False
            try:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    retained = True
            finally:
                os.close(fd)
            group_stop_sent = True
            os.killpg(process.pid, signal.SIGKILL)  # Exactly this test's owned decoder group.
            output, error = process.communicate(timeout=3)  # Drain the worker's pipes only.
            fd = os.open(lease, os.O_RDWR)
            release_started = time.monotonic()
            try:
                # Worker pipe EOF does not prove decoder cleanup. Observe
                # the lease itself; never infer release from a PID or EOF alone.
                while True:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX|fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        if time.monotonic()-release_started>2:
                            raise
                        time.sleep(.01)
            finally:
                os.close(fd)
            return {'worker_source_sha256':hashlib.sha256(worker.read_bytes()).hexdigest(),
                    'decoder_live_after_worker_death':True,
                    'lease_retained_after_worker_death':retained,
                    'lease_available_after_owned_group_cleanup':True,
                    'lease_release_wait_ms':round((time.monotonic()-release_started)*1000,3),
                    'owned_stdout_stderr_eof':True,
                    'owned_worker_exit':process.returncode,
                    'qualification':'Controlled process death and descriptor inheritance; no native capture/provider failure was induced.'}
        finally:
            if process is not None:
                if not group_stop_sent:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                process.communicate(timeout=3)
            for fd in fds:
                os.close(fd)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', type=Path, default=Path(__file__).parent.parent/'lib/registered-frame.py')
    result = probe(parser.parse_args().worker)
    print(json.dumps(result))
    sys.exit(0 if result['lease_retained_after_worker_death'] else 1)
