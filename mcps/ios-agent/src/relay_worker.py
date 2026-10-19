"""Private nearby transport: retain one authenticated RSD channel across owner handoff.

stdio belongs to one MCP connection. No network listener or pairing payload output.
Managed MCP lifecycle passed nearby; cellular remains a separate open gate.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
import re
import sys
import time

from device_observer import owned, browser_launch, browser_debug, shortcut_home, resource_profile
from relay_session import relayed_rsd
from signals import signal_context

logging.disable(logging.CRITICAL)


def owner_request(value, state):
    if not isinstance(value, dict) or set(value) != {'ownerFile', 'leaseFile'}:
        raise ValueError('fixed_worker_owner_required')
    owner, lease = (Path(value[key]) for key in ('ownerFile', 'leaseFile'))
    base = state / 'mcp-sessions'
    if (owner.name != 'owner.json' or lease.name != 'lease.json'
            or owner.parent != lease.parent or owner.parent.parent != base
            or not re.fullmatch('[a-f0-9]{32}', owner.parent.name)
            or any(p.is_symlink() or not p.is_file() or p.stat().st_mode & 0o077
                   for p in (owner, lease))
            or owner.parent.is_symlink() or base.is_symlink()):
        raise ValueError('private_worker_owner_required')
    return value


async def lines():
    reader = asyncio.StreamReader(limit=65536)
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin)
    return reader


def emit(value):
    print(json.dumps(value), flush=True)


async def main():
    reader = await lines()
    raw = await asyncio.wait_for(reader.readline(), 5)
    initial = json.loads(raw)
    if set(initial) != {'state', 'serial', 'ownerFile', 'leaseFile'}:
        raise ValueError('fixed_worker_initialization_required')
    state = Path(initial['state'])
    if state != Path.home() / 'Library/Application Support/ios-agent':
        raise ValueError('fixed_worker_state_required')
    owner_request({k: initial[k] for k in ('ownerFile', 'leaseFile')}, state)
    r = {**initial, 'route': 'reflected'}
    diagnostic = {}
    owned(r)
    async with relayed_rsd(r, lambda: owned(r), diagnostic) as (rsd, transport):
        emit({'ok': True, 'event': 'ready', 'transport': transport,
              'rsdIdentityVerified': True, 'newPairingAttempted': False})
        # Startup lineage must not leak into later independent MCP calls.
        os.environ.pop('IOS_AGENT_SIGNAL_CONTEXT', None)
        started = activity = time.monotonic()
        handoff_until = 0
        while time.monotonic() - started < 1200 and time.monotonic() - activity < 1200:
            try:
                raw = await asyncio.wait_for(reader.readline(), .25)
            except asyncio.TimeoutError:
                if time.monotonic() >= handoff_until:
                    owned(r)
                continue
            if not raw:
                return
            c = json.loads(raw)
            if not isinstance(c, dict) or type(c.get('id')) is not int:
                raise ValueError('fixed_worker_request_required')
            context = c.pop('signalContext', {})
            if (not isinstance(context, dict) or len(context) > 8 or
                    len(json.dumps(context)) > 1024):
                raise ValueError('bounded_worker_signal_context_required')
            cid = c['id']
            with signal_context(**context):
                try:
                    op = c.get('op')
                    if op == 'close':
                        emit({'id': cid, 'ok': True, 'closed': True})
                        return
                    if op == 'handoff' and set(c) == {'id', 'op'}:
                        owned(r)
                        if handoff_until:
                            raise ValueError('worker_handoff_already_pending')
                        handoff_until = time.monotonic() + 10
                        emit({'id': cid, 'ok': True, 'handoffWindowMs': 10000})
                        continue
                    if op == 'bind' and set(c) == {'id', 'op', 'owner'}:
                        if not handoff_until or time.monotonic() >= handoff_until:
                            raise ValueError('worker_handoff_expired')
                        candidate = {**r, **owner_request(c['owner'], state)}
                        owned(candidate)
                        r = candidate
                        handoff_until = 0
                        activity = time.monotonic()
                        emit({'id': cid, 'ok': True, 'ownerBound': True})
                        continue
                    if handoff_until:
                        raise ValueError('worker_handoff_pending_no_input')
                    owned(r)
                    if op != 'observe' or set(c) != {'id', 'op', 'request'}:
                        raise ValueError('fixed_worker_operation_required')
                    q = c['request']
                    if not isinstance(q, dict) or set(q) - {'kind', 'browser', 'url', 'profile', 'debug'}:
                        raise ValueError('fixed_worker_observation_required')
                    request = {**r, **q}
                    kind = q.get('kind')
                    if kind == 'browser-launch':
                        value = await asyncio.wait_for(browser_launch(request, rsd), 20)
                    elif kind == 'browser-debug':
                        value = await asyncio.wait_for(browser_debug(request, rsd), 30)
                    elif kind == 'shortcut-home':
                        value = await asyncio.wait_for(shortcut_home(request, rsd), 8)
                    elif kind == 'resource-profile':
                        value = await asyncio.wait_for(resource_profile(request, rsd), 15)
                    else:
                        raise ValueError('fixed_worker_observation_required')
                    owned(r)
                    activity = time.monotonic()
                    emit({'id': cid, 'ok': True, 'value': value, 'transport': transport})
                except Exception as error:
                    emit({'id': cid, 'ok': False, 'reason': 'relay_operation_unconfirmed',
                          'failureType': type(error).__name__, 'replay': False})
                    return  # Unknown input or ownership outcomes never reuse the channel.


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as error:
        emit({'ok': False, 'reason': 'relay_worker_unconfirmed',
              'failureType': type(error).__name__, 'replay': False})
        sys.exit(1)
