"""Own one signed XCTest runner; EOF/dead owner ends it independently of MCP."""
import asyncio
import json
import logging
import os
from pathlib import Path
import plistlib
import re
import signal
import sys
import time
from cli import request

logging.disable(logging.CRITICAL)
BUNDLE = 'com.dev.kudos.fit.WebDriverAgentRunner.xctrunner'

def validate(r):
    config = Path(r['state'])/'system-driver.json'
    if config.is_symlink() or config.stat().st_mode & 0o077:
        raise ValueError('private_system_driver_configuration_required')
    c = json.loads(config.read_text())
    device = json.loads((Path(r['state'])/'web-device.json').read_text())
    if not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', device['hardwareUDID']):
        raise ValueError('configured_device_required')
    run = Path(c['xctestrun']).resolve()
    derived = (Path.home()/'Library/Developer/Xcode/DerivedData').resolve()
    if not run.is_relative_to(derived) or run.suffix != '.xctestrun':
        raise ValueError('signed_existing_runner_required')
    data = plistlib.loads(run.read_bytes())
    hosts = [v.get('TestHostBundleIdentifier') for v in data.values() if isinstance(v, dict) and 'TestHostBundleIdentifier' in v]
    if hosts != [BUNDLE]:raise ValueError('fixed_runner_bundle_required')
    log = Path(r['log'])
    if log.parent.is_symlink() or log.parent.stat().st_mode & 0o077:
        raise ValueError('private_runner_log_required')
    return device['hardwareUDID'], run, log

def local_owned(r):
    o = json.loads(Path(r['ownerFile']).read_text())
    if o.get('active') is not True or time.time()-o.get('heartbeatAt',0)>20 or time.time()-o.get('activityAt',0)>1200:return False
    os.kill(o['pid'], 0)
    return True

def owned(r):
    if not local_owned(r):return False
    lease = json.loads(Path(r['leaseFile']).read_text())['lease']
    return (request({'op':'status'}, Path(r['state']), timeout=2).get('lease') or {}).get('id') == lease

class OwnershipGrace:
    """Only a live local owner can ride out brief unconfirmed broker reads.

    Native mutations independently confirm the broker lease before dispatch.
    False means a confirmed mismatch and must stop immediately.
    """
    def __init__(self):self.unknown_since=None
    def permits(self, result, now):
        if result is False:return False
        if result is True:self.unknown_since=None;return True
        if self.unknown_since is None:self.unknown_since=now
        return now-self.unknown_since<15

async def verify_stopped(serial, started):
    from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
    from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
    from pymobiledevice3.services.dvt.instruments.process_control import ProcessControl
    async with NativeRemotedTunnel(serial=serial) as rsd, DvtProvider(rsd) as dvt, ProcessControl(dvt) as control:
        pid = await control.process_identifier_for_bundle_identifier(BUNDLE)
        if pid > 0:
            if pid not in started:return False
            await control.kill(pid)
        return await control.process_identifier_for_bundle_identifier(BUNDLE) == 0

async def collect_runner_output(reader, log, started):
    carry=b''
    with log.open('r+b') as output:
        while chunk:=await reader.read(8192):
            text=(carry+chunk).decode(errors='replace')
            started.update(int(x) for x in re.findall(r'WebDriverAgentRunner-Runner\[(\d+):',text));carry=chunk[-256:]
            if output.tell()+len(chunk)>1024*1024:
                output.seek(-min(output.tell(),512*1024),os.SEEK_END);tail=output.read();output.seek(0);output.write(tail);output.truncate()
            output.write(chunk);output.flush()

async def main(r):
    serial, run, log = validate(r)
    if not owned(r):raise ValueError('system_owner_inactive')
    child = None; pump = None; started = set()
    reason = 'explicit_end_or_eof'
    try:
        fd = os.open(log, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
        os.close(fd)
        child = await asyncio.create_subprocess_exec('/usr/bin/xcrun','xcodebuild','test-without-building',
            '-xctestrun',str(run),'-destination','id='+serial,'-destination-timeout','20',
            stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT,start_new_session=True)
        pump=asyncio.create_task(collect_runner_output(child.stdout,log,started))
        print(json.dumps({'started':True}),flush=True)
        reader = asyncio.StreamReader()
        transport, _ = await asyncio.get_running_loop().connect_read_pipe(lambda:asyncio.StreamReaderProtocol(reader),sys.stdin)
        stopping = asyncio.create_task(reader.readline())
        grace=OwnershipGrace()
        try:
            while not stopping.done():
                if child.returncode is not None:reason='runner_exited';break
                try:
                    if not local_owned(r):reason='owner_inactive';break
                except Exception:reason='owner_inactive';break
                try:confirmed=await asyncio.to_thread(owned,r)
                except Exception:confirmed=None
                if not grace.permits(confirmed,time.monotonic()):
                    reason='owner_unconfirmed' if confirmed is None else 'owner_inactive';break
                await asyncio.wait([stopping],timeout=1)
        finally:
            stopping.cancel();transport.close()
    finally:
        if child and child.returncode is None:
            try:os.killpg(child.pid,signal.SIGINT)
            except ProcessLookupError:pass
            try:await asyncio.wait_for(child.wait(),5)
            except asyncio.TimeoutError:
                try:os.killpg(child.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:await asyncio.wait_for(child.wait(),3)
                except asyncio.TimeoutError:
                    try:os.killpg(child.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    await child.wait()
        if pump:
            try:await asyncio.wait_for(pump,2)
            except Exception:pass
        stopped=False
        try:stopped=await asyncio.wait_for(verify_stopped(serial,started),15)
        except Exception:pass
        print(json.dumps({'stopped':True,'runnerStopped':stopped,'reason':reason}),flush=True)

if __name__ == '__main__':
    try:asyncio.run(main(json.loads(sys.argv[1])))
    except Exception:print(json.dumps({'started':False,'reason':'system_runner_unavailable'}),flush=True);sys.exit(1)
