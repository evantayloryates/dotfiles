#!/usr/bin/env python3
"""Admission/deadline wrapper for owned qualification helpers, not the engine."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import time


def run_probe(command, output, admission, timeout):
    if not command or not 0.05 <= timeout <= 90:
        raise ValueError('command and a 0.05–90 second deadline are required')
    output = Path(output)
    admission = Path(admission)
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    admission.mkdir(mode=0o700, parents=True, exist_ok=True)
    result = {'schema': 'capture-probe-supervision/v1', 'executable': Path(command[0]).name,
              'started_at': time.time(), 'deadline_seconds': timeout,
              'scope': 'Owned qualification child only; installed engine recovery is not tested.'}
    fd = os.open(admission / 'capture-admission.lock', os.O_CREAT | os.O_RDWR, 0o600)
    started = time.monotonic()
    child = None
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            result['outcome'] = 'busy'
            return result
        with os.fdopen(os.open(output / 'stdout.log', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as stdout, \
             os.fdopen(os.open(output / 'stderr.log', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as stderr:
            try:
                child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
            except OSError as error:
                result.update(outcome='launch_failed', errno=error.errno)
                return result
            result['pid'] = child.pid
            try:
                code = child.wait(timeout=timeout)
                result.update(outcome='completed' if code == 0 else 'process_failed', exit_code=code)
            except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
                result['outcome'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'deadline'
                # This isolated group belongs to the child launched above. No
                # shared service, app, recording or arbitrary PID is stopped.
                def stop(sig):
                    try:
                        os.killpg(child.pid, sig)
                    except ProcessLookupError:
                        pass
                stop(signal.SIGTERM)
                try:
                    code = child.wait(timeout=0.75)
                except subprocess.TimeoutExpired:
                    stop(signal.SIGKILL)
                    code = child.wait(timeout=2)
                # A helper can leave a descendant after its main PID exits.
                stop(signal.SIGKILL)
                result.update(exit_code=code, terminated_owned_group=True)
            result['child_reaped'] = child.poll() is not None
            return result
    finally:
        if child is not None and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=2)
            result.update(outcome='supervisor_failed', child_reaped=True)
        result['elapsed_seconds'] = time.monotonic() - started
        with os.fdopen(os.open(output / 'result.json', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as file:
            json.dump(result, file, indent=2)
            file.write('\n')
            file.flush()
            os.fsync(file.fileno())
        os.close(fd)


def main():
    def interrupted(_signal, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--admission', type=Path, required=True, help='Shared directory for this qualification series, not per-run.')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    result = run_probe(command, args.output, args.admission, args.timeout)
    print(json.dumps(result))
    return 0 if result['outcome'] == 'completed' else 75 if result['outcome'] == 'busy' else 124 if result['outcome'] == 'deadline' else 1


if __name__ == '__main__':
    raise SystemExit(main())
