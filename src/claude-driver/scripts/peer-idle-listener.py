#!/usr/bin/env python3
"""Private one-shot macOS idle notice receiver; never outputs frame bodies."""
import ctypes, json, os, signal, socket, struct, sys, time

path, expected_pid, expected_uid = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
libc = ctypes.CDLL(None, use_errno=True)
def identity(s):
    pid = struct.unpack('i', s.getsockopt(0, 2, 4))[0]  # SOL_LOCAL/LOCAL_PEERPID
    uid, gid = ctypes.c_uint(), ctypes.c_uint()
    if libc.getpeereid(s.fileno(), ctypes.byref(uid), ctypes.byref(gid)) != 0:
        raise RuntimeError('peer_credentials_unavailable')
    if pid != expected_pid or uid.value != expected_uid:
        raise RuntimeError('peer_identity_refused')

server, owned, result = socket.socket(socket.AF_UNIX), None, {'ok': False, 'nativeSubscriptionCancelled': False, 'releaseAuthorized': False}
def cancelled(*_):
    raise RuntimeError('listener_cancelled')
signal.signal(signal.SIGTERM, cancelled)
try:
    if sys.platform != 'darwin' or os.path.lexists(path):
        raise RuntimeError('listener_platform_or_path_refused')
    os.umask(0o077)
    server.bind(path)
    owned = os.lstat(path)
    server.listen(4)
    print(json.dumps({'ready': True, 'dev': owned.st_dev, 'ino': owned.st_ino}), flush=True)
    config = json.loads(sys.stdin.readline(16384))
    if not isinstance(config, dict) or not isinstance(config.get('lines'), str) or len(config['lines']) > 8192:
        raise RuntimeError('private_control_input_refused')
    with socket.socket(socket.AF_UNIX) as sender:
        sender.settimeout(2)
        sender.connect(config['socket'])
        identity(sender)
        sender.sendall(config['lines'].encode())
        time.sleep(0.15)
        sender.shutdown(socket.SHUT_WR)
    result['subscriptionSent'] = True
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        server.settimeout(max(0.01, deadline-time.monotonic()))
        with server.accept()[0] as connection:
            identity(connection)
            connection.settimeout(max(0.01, deadline-time.monotonic()))
            buffer = b''
            while time.monotonic() < deadline:
                chunk = connection.recv(4096)
                if not chunk:
                    break
                buffer += chunk
                if len(buffer) > 8192:
                    raise RuntimeError('notice_bound_refused')
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    try:
                        frame = json.loads(line)
                    except Exception:
                        raise RuntimeError('notice_json_refused')
                    if frame.get('type') == 'auth':
                        continue  # Kernel PID/UID is mandatory regardless of framing.
                    if frame.get('type') != 'control' or frame.get('action') != 'peer_idle_notice' or frame.get('orig_msg_id') != config['msgId'] or frame.get('from') != 'uds:'+config['socket'] or frame.get('state') not in ['idle','exited','unavailable']:
                        raise RuntimeError('notice_correlation_refused')
                    finished = frame.get('finished_at')
                    if finished is not None and (type(finished) not in [int,float] or not 0 < finished <= time.time()*1000+1000):
                        raise RuntimeError('notice_time_refused')
                    result.update(ok=True, kernelPeerPid=expected_pid, kernelPeerUid=expected_uid, msgId=config['msgId'], state=frame['state'], finishedAt=finished, receivedAt=int(time.time()*1000), detailPresent=isinstance(frame.get('detail'),str), releaseAuthorized=False)
                    break
                if result['ok']:
                    break
            if result['ok']:
                break
    if not result['ok']:
        result['failure'] = 'notice_timeout'
except socket.timeout:
    result['failure'] = 'notice_timeout'
except Exception as e:
    # Fixed error identifiers only: private auth/control inputs never escape.
    result['failure'] = str(e) if isinstance(e, RuntimeError) else type(e).__name__
finally:
    server.close()
    if owned is not None:
        try:
            current = os.lstat(path)
            if (current.st_dev,current.st_ino,current.st_uid) == (owned.st_dev,owned.st_ino,os.getuid()):
                os.unlink(path)
        except FileNotFoundError:
            pass
    result['listenerRemoved'] = not os.path.lexists(path)
    print(json.dumps(result), flush=True)
