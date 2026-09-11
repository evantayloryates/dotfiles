#!/usr/bin/python3
"""User-local 1Password broker. Only the controlling terminal persists.

Requests transfer stdio descriptors with SCM_RIGHTS; command output and secrets
never pass through broker logging, framing, or an on-disk response file.
"""
import argparse
import array
import ctypes
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import socket
import stat
import struct
import subprocess
import sys
import time

MAX_REQUEST = 1024 * 1024
SIGNALS = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT)
LABEL = "com.taylor.op-agent"


def runtime_dir():
    return Path.home() / "Library/Caches/com.taylor.op-agent"


def real_op():
    for path in ("/opt/homebrew/bin/op", "/usr/local/bin/op"):
        if os.access(path, os.X_OK):
            return path
    raise RuntimeError("Install the official 1Password CLI with Homebrew first")


def private_directory(path, create=False):
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError("Broker directory must be owned by you with mode 700")


def peer_uid(conn):
    if sys.platform == "darwin":
        uid, gid = ctypes.c_uint(), ctypes.c_uint()
        if ctypes.CDLL(None, use_errno=True).getpeereid(conn.fileno(), ctypes.byref(uid), ctypes.byref(gid)):
            raise OSError(ctypes.get_errno(), "getpeereid failed")
        return uid.value
    return struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]


def read_exact(conn, length):
    chunks = bytearray()
    while len(chunks) < length:
        chunk = conn.recv(length - len(chunks))
        if not chunk:
            raise EOFError("Client disconnected")
        chunks.extend(chunk)
    return bytes(chunks)


def receive_request(conn):
    fds = array.array("i")
    try:
        marker, ancillary, flags, _ = conn.recvmsg(1, socket.CMSG_SPACE(4 * fds.itemsize))
        for level, kind, data in ancillary:
            if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
                fds.frombytes(data[:len(data) - len(data) % fds.itemsize])
        if marker != b"O" or flags & socket.MSG_CTRUNC or len(fds) != 3:
            raise ValueError("Expected three stdio descriptors")
        for fd in fds:
            os.set_inheritable(fd, False)
        length = struct.unpack("!I", read_exact(conn, 4))[0]
        if length > MAX_REQUEST:
            raise ValueError("Request too large")
        request = json.loads(read_exact(conn, length))
        args, env, cwd = request["args"], request["env"], request["cwd"]
        if not isinstance(args, list) or not all(isinstance(x, str) and "\0" not in x for x in args):
            raise ValueError("Invalid arguments")
        if not isinstance(env, dict) or not all(isinstance(k, str) and isinstance(v, str) and "=" not in k and "\0" not in k + v for k, v in env.items()):
            raise ValueError("Invalid environment")
        if not isinstance(cwd, str) or not os.path.isabs(cwd):
            raise ValueError("Invalid working directory")
        mask = request["umask"]
        if type(mask) is not int or not 0 <= mask <= 0o777:
            raise ValueError("Invalid umask")
        return request, list(fds)
    except BaseException:
        for fd in fds:
            os.close(fd)
        raise


def kill_group(proc, sig):
    try:
        os.killpg(proc.pid, sig)
    except ProcessLookupError:
        pass


def execute(conn, request, fds, executable):
    # A new process group enables cancellation without killing the persistent
    # session leader. It stays in the broker's session (no setsid here).
    def child_setup():
        os.setpgrp()
        signal.signal(signal.SIGTTOU, signal.SIG_DFL)
        signal.signal(signal.SIGTTIN, signal.SIG_DFL)

    proc = None
    try:
        proc = subprocess.Popen(
            [executable] + request["args"], cwd=request["cwd"], env=request["env"],
            stdin=fds[0], stdout=fds[1], stderr=fds[2], close_fds=True,
            preexec_fn=child_setup, umask=request["umask"],
        )
        os.tcsetpgrp(0, proc.pid)
        for fd in fds:
            os.close(fd)
        fds.clear()
        conn.settimeout(None)
        deadline = None
        disconnected = False
        while proc.poll() is None:
            ready, _, _ = select.select([] if disconnected else [conn], [], [], 0.1)
            if ready:
                control = conn.recv(32)
                if not control:
                    disconnected = True
                    kill_group(proc, signal.SIGTERM)
                    deadline = time.monotonic() + 2
                else:
                    for byte in control:
                        if byte in SIGNALS:
                            kill_group(proc, byte)
                            deadline = time.monotonic() + 2
            if deadline is not None and time.monotonic() >= deadline:
                kill_group(proc, signal.SIGKILL)
        code = proc.returncode
        return 128 - code if code < 0 else code
    finally:
        if proc is not None:
            # Do not leave detached descendants holding secret-bearing FDs or
            # monopolizing the shared session after the originating call ends.
            kill_group(proc, signal.SIGKILL)
            proc.wait()
        os.tcsetpgrp(0, os.getpgrp())


def worker(directory, executable):
    signal.signal(signal.SIGTTOU, signal.SIG_IGN)
    signal.signal(signal.SIGTTIN, signal.SIG_IGN)
    def stop(_sig, _frame):
        raise SystemExit(0)
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    endpoint = directory / "agent.sock"
    status = directory / "status.json"
    endpoint.unlink(missing_ok=True)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(str(endpoint))
        os.chmod(endpoint, 0o600)
        listener.listen(128)
        metadata = {"pid": os.getpid(), "session": os.getsid(0), "tty": os.ttyname(0), "executable": executable}
        status.write_text(json.dumps(metadata) + "\n")
        os.chmod(status, 0o600)
        while True:
            conn, _ = listener.accept()
            fds = []
            request = None
            with conn:
                try:
                    if peer_uid(conn) != os.getuid():
                        continue
                    conn.settimeout(5)
                    # Only request descriptors once this caller reaches the
                    # front of the queue. Otherwise a queued SCM_RIGHTS message
                    # retains its stdout pipes even after the caller exits.
                    conn.sendall(b"R")
                    request, fds = receive_request(conn)
                    # A queued caller may already have cancelled or exited.
                    ready, _, _ = select.select([conn], [], [], 0)
                    if ready:
                        conn.sendall(struct.pack("!i", 130))
                        continue
                    code = execute(conn, request, fds, executable)
                    conn.sendall(struct.pack("!i", code))
                except (OSError, ValueError, KeyError, TypeError, EOFError):
                    # Never include request contents, env, arguments, or exception
                    # reprs in diagnostics; any of these can contain secrets.
                    try:
                        conn.sendall(struct.pack("!i", 125))
                    except OSError:
                        pass
                finally:
                    for fd in fds:
                        os.close(fd)
                    request = None
    finally:
        listener.close()
        endpoint.unlink(missing_ok=True)
        status.unlink(missing_ok=True)


def serve(directory, executable):
    os.umask(0o077)
    private_directory(directory, create=True)
    lock = os.open(str(directory / "agent.lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock)
        raise RuntimeError("Broker is already running")
    # pty.fork establishes a session and controlling terminal even when launchd
    # starts us without a terminal. The supervisor retains/drains its master.
    pid, master = pty.fork()
    if pid == 0:
        try:
            worker(directory, executable)
        finally:
            os._exit(0)
    def stop(sig, _frame):
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass
    for sig in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(sig, stop)
    try:
        while True:
            try:
                if not os.read(master, 65536):
                    break
            except OSError as exc:
                if exc.errno == errno.EIO:
                    break
                raise
        _, status = os.waitpid(pid, 0)
        return os.waitstatus_to_exitcode(status)
    finally:
        stop(signal.SIGTERM, None)
        os.close(master)
        os.close(lock)


def client(args, directory=None):
    directory = directory or runtime_dir()
    try:
        private_directory(directory)
        # Calls nested inside `op run` already belong to the authorized session.
        # Execute there directly to avoid deadlocking behind their parent call.
        try:
            status = json.loads((directory / "status.json").read_text())
            if os.getsid(0) == status["session"] == os.getsid(status["pid"]):
                os.execv(status["executable"], [status["executable"]] + args)
        except (OSError, ValueError, KeyError):
            pass
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.connect(str(directory / "agent.sock"))
            if peer_uid(conn) != os.getuid():
                raise RuntimeError("Broker belongs to another user")
            interrupted = [None, None]
            conn.settimeout(0.2)
            def forward(sig, _frame):
                interrupted[:] = [sig, time.monotonic() + 3]
                try:
                    conn.sendall(bytes([sig]))
                except OSError:
                    raise SystemExit(128 + sig)
            def receive(length):
                data = bytearray()
                while len(data) < length:
                    if interrupted[1] is not None and time.monotonic() >= interrupted[1]:
                        raise SystemExit(128 + interrupted[0])
                    try:
                        chunk = conn.recv(length - len(data))
                    except socket.timeout:
                        continue
                    if not chunk:
                        if interrupted[0] is not None:
                            raise SystemExit(128 + interrupted[0])
                        raise EOFError("Broker disconnected")
                    data.extend(chunk)
                return bytes(data)
            previous = {sig: signal.signal(sig, forward) for sig in SIGNALS}
            try:
                if receive(1) != b"R":
                    raise RuntimeError("Broker protocol mismatch")
                if interrupted[0] is not None:
                    return 128 + interrupted[0]
                mask = os.umask(0o077)
                os.umask(mask)
                request = json.dumps({"args": args, "cwd": os.getcwd(), "env": dict(os.environ), "umask": mask}).encode()
                if len(request) > MAX_REQUEST:
                    raise RuntimeError("Request too large")
                conn.sendmsg([b"O"], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array("i", [0, 1, 2]))])
                conn.sendall(struct.pack("!I", len(request)) + request)
                del request
                code = struct.unpack("!i", receive(4))[0]
                if code == 125:
                    print("op broker: command could not be started or request failed (no direct-CLI fallback).", file=sys.stderr)
                return code
            finally:
                for sig, handler in previous.items():
                    signal.signal(sig, handler)
    except (OSError, EOFError, RuntimeError):
        print("op broker unavailable: run ~/dotfiles/install_op_agent.sh or check its LaunchAgent. Refusing direct-CLI fallback.", file=sys.stderr)
        return 125


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("serve", "status"))
    parser.add_argument("--runtime", type=Path, default=runtime_dir())
    parser.add_argument("--executable", help="Absolute official op path; test doubles are supported for tests")
    args = parser.parse_args()
    if args.action == "status":
        private_directory(args.runtime)
        status = json.loads((args.runtime / "status.json").read_text())
        os.kill(status["pid"], 0)
        print(json.dumps(status, indent=2))
        return 0
    executable = args.executable or real_op()
    if not os.path.isabs(executable) or not os.access(executable, os.X_OK):
        parser.error("--executable must be an absolute executable path")
    return serve(args.runtime, executable)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError):
        print("op broker: startup/status failed; check installation and private runtime directory.", file=sys.stderr)
        sys.exit(125)
