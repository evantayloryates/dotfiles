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

def input_owned(r):
    if not local_owned(r):return False
    lease = json.loads(Path(r['leaseFile']).read_text())['lease']
    return (request({'op':'status'}, Path(r['state']), timeout=2).get('lease') or {}).get('id') == lease

def owned(r):
    if r.get('reservationFile'):
        from system_reservation import owned as reservation_owned
        return time.monotonic() < r.get('_retentionDeadline',0) and reservation_owned(r)
    return input_owned(r)


def arm_reservation(r):
    from system_reservation import read_record, write_record
    file = Path(r['reservationFile'])
    expected = Path(r['state']).resolve() / 'system-reservations' / (r['reservationId'] + '.json')
    if file != expected or file.resolve() != file:
        raise ValueError('private_reservation_required')
    record = read_record(file)
    if record['id'] != r['reservationId'] or record.get('phase') != 'requested' or record.get('pid') != 0 or record.get('active') is not True or not record['createdAt'] <= time.time() < record['expiresAt']:
        raise ValueError('reservation_identity_changed')
    r['_retentionDeadline'] = time.monotonic() + max(0, record['expiresAt']-time.time())
    record.update(pid=os.getpid(), phase='starting')
    write_record(file, record)


def reservation_update(r, **fields):
    from system_reservation import read_record, write_record
    file = Path(r['reservationFile']); record = read_record(file)
    if record['id'] != r['reservationId'] or record.get('pid') != os.getpid():
        raise ValueError('reservation_identity_changed')
    record.update(fields); write_record(file, record)


async def retained_ready(r):
    """One session, created by the retained runner; no native input."""
    from urllib.request import Request, urlopen
    address = json.loads((Path(r['state'])/'system-driver.json').read_text())['address']
    def http(route, body=None):
        request = Request('http://' + address + ':8100' + route,
                          data=None if body is None else json.dumps(body).encode(),
                          headers={'Content-Type':'application/json'})
        with urlopen(request, timeout=2) as response:
            data = response.read(65537)
        if len(data) > 65536:raise ValueError('bounded_reservation_response_required')
        value = json.loads(data)
        if value.get('value',{}).get('error'):raise ValueError('reservation_provider_rejected')
        return value
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if not owned(r):return False
        try:
            ready = (await asyncio.to_thread(http, '/status')).get('value',{}).get('ready') is True
            if ready:break
        except Exception:pass
        await asyncio.sleep(.5)
    else:return False
    if not owned(r):return False
    response = await asyncio.to_thread(http, '/session', {'capabilities':{'alwaysMatch':{'shouldWaitForQuiescence':False,'waitForIdleTimeout':1,'shouldUseCompactResponses':True}}})
    sid = response.get('sessionId') or response.get('value',{}).get('sessionId')
    if not isinstance(sid,str) or not re.fullmatch('[A-Fa-f0-9-]{36}',sid):return False
    if not owned(r):return False
    reservation_update(r, phase='ready', ready=True, sessionId=sid)
    return True

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

async def confirm_stopped(serial, started):
    # DVT may still be settling immediately after xcodebuild teardown. One
    # additional bounded readback avoids mistaking that for a running overlay.
    # Each verification reads the current PID; only our exact started PID can
    # be stopped, never a replacement runner.
    for attempt, budget in enumerate((15, 8), 1):
        try:
            if await asyncio.wait_for(verify_stopped(serial, started), budget):
                return True, attempt
        except Exception:pass
        if attempt == 1:await asyncio.sleep(0.25)
    return False, 2

def startup_gate(text):
    # Only this concrete Xcode preflight error proves a physical unlock gate.
    # Generic lock words, missing transport and XCTest authorization differ.
    if ('Error Domain=com.apple.dt.deviceprep Code=-3' in text and
            'because the device is locked.' in text):
        return 'physical_unlock_required'
    return None

async def collect_runner_output(reader, log, started):
    carry=b'';reported_gate=None
    with log.open('r+b') as output:
        while chunk:=await reader.read(8192):
            text=(carry+chunk).decode(errors='replace')
            started.update(int(x) for x in re.findall(r'WebDriverAgentRunner-Runner\[(\d+):',text))
            gate=startup_gate(text)
            if gate and gate!=reported_gate:
                reported_gate=gate;print(json.dumps({'startupGate':gate}),flush=True)
            carry=(carry+chunk)[-2048:]
            if output.tell()+len(chunk)>1024*1024:
                output.seek(-min(output.tell(),512*1024),os.SEEK_END);tail=output.read();output.seek(0);output.write(tail);output.truncate()
            output.write(chunk);output.flush()

async def main(r):
    serial, run, log = validate(r)
    if not input_owned(r):raise ValueError('system_owner_inactive')
    retained = bool(r.get('reservationFile'))
    if retained:arm_reservation(r)
    child = None; pump = None; started = set()
    reason = 'explicit_end_or_eof'
    try:
        fd = os.open(log, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
        os.close(fd)
        child = await asyncio.create_subprocess_exec('/usr/bin/xcrun','xcodebuild','test-without-building',
            '-xctestrun',str(run),'-destination','id='+serial,'-destination-timeout','20',
            '-collect-test-diagnostics','never',
            stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT,start_new_session=True)
        pump=asyncio.create_task(collect_runner_output(child.stdout,log,started))
        print(json.dumps({'started':True}),flush=True)
        if retained:
            if not await retained_ready(r):
                reason='reservation_start_unconfirmed'
                return
            stopping=None
            transport=None
        else:
            reader = asyncio.StreamReader()
            transport, _ = await asyncio.get_running_loop().connect_read_pipe(lambda:asyncio.StreamReaderProtocol(reader),sys.stdin)
            stopping = asyncio.create_task(reader.readline())
        grace=OwnershipGrace()
        try:
            while stopping is None or not stopping.done():
                if child.returncode is not None:reason='runner_exited';break
                try:
                    if not retained and not local_owned(r):reason='owner_inactive';break
                except Exception:reason='owner_inactive';break
                try:confirmed=await asyncio.to_thread(owned,r)
                except Exception:confirmed=None
                if not grace.permits(confirmed,time.monotonic()):
                    reason='reservation_expired_or_ended' if retained and confirmed is False else 'owner_unconfirmed' if confirmed is None else 'owner_inactive'
                    break
                if stopping is None:await asyncio.sleep(1)
                else:await asyncio.wait([stopping],timeout=1)
        finally:
            if stopping:stopping.cancel()
            if transport:transport.close()

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
        stopped, attempts = await confirm_stopped(serial, started)
        if retained:
            reservation_update(r, phase='stopped', active=False, ready=False, runnerStopped=stopped, reason=reason, verificationAttempts=attempts)
        print(json.dumps({'stopped':True,'runnerStopped':stopped,'verificationAttempts':attempts,'reason':reason}),flush=True)

if __name__ == '__main__':
    r = json.loads(sys.argv[1])
    try:asyncio.run(main(r))
    except Exception:
        if r.get('reservationFile'):
            try:
                from system_reservation import read_record, write_record
                file=Path(r['reservationFile']); record=read_record(file)
                if record['id']==r['reservationId'] and record.get('phase')=='requested' and record.get('pid')==0:
                    record.update(phase='stopped',active=False,ready=False,runnerStopped=True,reason='preflight_not_started')
                    write_record(file,record)
            except Exception:pass
        print(json.dumps({'started':False,'reason':'system_runner_unavailable'}),flush=True);sys.exit(1)
