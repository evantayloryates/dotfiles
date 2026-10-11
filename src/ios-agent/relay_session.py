"""Candidate existing-trust RSD transport; caller owns lifecycle and UI cleanup.

No arbitrary host/port, new pairing, key export, background app task or USB
fallback. The reflected route must be provisioned and separately qualified.
"""
import asyncio
from contextlib import AsyncExitStack, asynccontextmanager
import importlib.metadata
import json
from pathlib import Path
import socket
import time

from cli import request
from paired_transport import tailnet_config


@asynccontextmanager
async def relayed_rsd(r, check, diagnostic):
    state = Path(r['state'])
    serial = r['serial']
    config = tailnet_config(state, serial)
    if config is None or r.get('route') not in ('direct', 'reflected'):
        raise ValueError('fixed_relay_configuration_required')
    if importlib.metadata.version('pymobiledevice3') != '11.15.5':
        raise ValueError('pinned_observer_required')
    check()
    lease = json.loads(Path(r['leaseFile']).read_text())['lease']
    diagnostic['phase'] = 'host_relay_start'
    started = request({'op': 'developer_relay_start', 'lease': lease}, state)
    from pymobiledevice3.remote import tunnel_service
    from pymobiledevice3.remote.tunnel_service import RemotePairingTunnelService
    from pymobiledevice3.remote.userspace_tunnel import UserspaceDialPlane
    from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
    provider = RemotePairingTunnelService(serial, '127.0.0.1', started['port'])
    pairing = asyncio.create_task(provider.connect(autopair=False))
    previous = tunnel_service.USE_USERSPACE_TUNNEL
    original = tunnel_service.create_connection
    if previous:
        pairing.cancel()
        await asyncio.gather(pairing, return_exceptions=True)
        await provider.close()
        raise ValueError('developer_transport_already_active')
    try:
        diagnostic['phase'] = 'provider_first_bytes'
        until = time.monotonic() + 5
        while time.monotonic() < until:
            check()
            status = request({'op': 'developer_relay_status', 'lease': lease}, state)
            if status.get('consumerBytes', 0) > 0:
                break
            if pairing.done():
                await pairing
            await asyncio.sleep(.05)
        else:
            raise ValueError('provider_first_bytes_unconfirmed')
        diagnostic['phase'] = 'native_relay_start'
        command = request({'op': 'action', 'action': 'developer-relay',
                           'args': {'route': r['route']}, 'lease': lease}, state)
        until = time.monotonic() + 12
        while time.monotonic() < until:
            check()
            result = request({'op': 'result', 'id': command['id'], 'lease': lease}, state)
            if result.get('status') == 'completed':
                break
            if result.get('status') not in ('queued', 'sent'):
                raise ValueError('native_relay_start_unconfirmed')
            await asyncio.sleep(.1)
        else:
            raise ValueError('native_relay_start_unconfirmed')
        if not result.get('result', {}).get('started'):
            raise ValueError('native_relay_start_unconfirmed')
        diagnostic['phase'] = 'existing_trust_pair_verify'
        check()
        await asyncio.wait_for(pairing, 25)
        check()
        diagnostic['existingTrustPairVerified'] = True

        def bounded_connection(address):
            if (address[0] != config['address'] or type(address[1]) is not int
                    or not 1024 <= address[1] <= 65535):
                raise ValueError('fixed_authenticated_secondary_required')
            diagnostic['secondaryPort'] = address[1]
            return socket.create_connection(address, timeout=5)

        diagnostic['phase'] = 'authenticated_secondary_direct'
        provider.hostname = config['address']
        tunnel_service.create_connection = bounded_connection
        tunnel_service.USE_USERSPACE_TUNNEL = True
        async with AsyncExitStack() as stack:
            tunnel = await stack.enter_async_context(provider.start_tcp_tunnel())
            diagnostic.update(phase='secondary_rsd_identity', secondaryTunnelEstablished=True)
            tun = tunnel.client.tun
            tun.set_peer(tunnel.address)
            dial = await stack.enter_async_context(UserspaceDialPlane(tun, tunnel.address))
            rsd = RemoteServiceDiscoveryService((tunnel.address, tunnel.port),
                open_connection=dial.dial, auxiliary_metadata=tunnel.auxiliary_metadata)
            stack.push_async_callback(rsd.close)
            await asyncio.wait_for(rsd.connect(), 8)
            if rsd.udid != serial:
                raise ValueError('developer_device_identity_mismatch')
            check()
            diagnostic['rsdIdentityVerified'] = True
            yield rsd, 'reflected-pairing/direct-secondary-userspace'
    finally:
        tunnel_service.create_connection = original
        tunnel_service.USE_USERSPACE_TUNNEL = previous
        if not pairing.done():
            pairing.cancel()
        await asyncio.gather(pairing, return_exceptions=True)
        await provider.close()
