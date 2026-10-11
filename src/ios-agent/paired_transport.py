"""Explicit paired developer transport. Tailnet mode never falls back to USB/LAN."""
from contextlib import asynccontextmanager, AsyncExitStack
import ipaddress
import json
import re
from pathlib import Path


def tailnet_config(state, serial):
    p = Path(state) / 'developer-tailnet.json'
    if not p.exists() and not p.is_symlink():
        return None
    if p.is_symlink() or not p.is_file() or p.stat().st_mode & 0o077 or p.stat().st_size > 4096:
        raise ValueError('private_developer_tailnet_configuration_required')
    data = json.loads(p.read_text())
    if (not isinstance(data,dict) or set(data) != {'version', 'transport', 'address', 'serial'} or type(data['version']) is not int or data['version'] != 1
            or data['transport'] != 'tailnet' or data['serial'] != serial
            or not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', serial or '')):
        raise ValueError('fixed_developer_tailnet_configuration_required')
    try:
        address = ipaddress.ip_address(data['address'])
    except (ValueError, TypeError):
        raise ValueError('fixed_developer_tailnet_address_required') from None
    if address.version != 4 or address not in ipaddress.ip_network('100.64.0.0/10'):
        raise ValueError('fixed_developer_tailnet_address_required')
    return data


@asynccontextmanager
async def paired_rsd(state, serial, check, transport='configured'):
    """One operation, one separately authenticated userspace tunnel, exact UDID."""
    if transport not in ('configured', 'usb-recovery'):
        raise ValueError('fixed_developer_transport_required')
    if transport == 'usb-recovery':
        # Explicit read-only recovery, never an automatic fallback from tailnet.
        from connectivity import usb_attached
        check()
        if usb_attached(serial) is not True:
            raise ValueError('fixed_usb_device_not_enumerated')
        from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
        async with NativeRemotedTunnel(serial=serial) as rsd:
            if rsd.udid != serial:
                raise ValueError('developer_device_identity_mismatch')
            check()
            yield rsd, 'usb-recovery-native-remoted'
        return
    config = tailnet_config(state, serial)
    check()
    if config is None:
        from pymobiledevice3.remote.native_tunnel import NativeRemotedTunnel
        async with NativeRemotedTunnel(serial=serial) as rsd:
            if rsd.udid != serial:
                raise ValueError('developer_device_identity_mismatch')
            check()
            yield rsd, 'native-remoted'
        return
    from pymobiledevice3.remote import tunnel_service
    from pymobiledevice3.remote.tunnel_service import RemotePairingTunnelService
    from pymobiledevice3.remote.userspace_tunnel import UserspaceDialPlane
    from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
    # Each observer has its own process; PyTCP and this flag are process globals.
    previous = tunnel_service.USE_USERSPACE_TUNNEL
    if previous:
        raise ValueError('developer_transport_already_active')
    try:
        async with AsyncExitStack() as stack:
            provider = RemotePairingTunnelService(serial, config['address'], 49152)
            stack.push_async_callback(provider.close)
            await provider.connect(autopair=False)
            check()
            tunnel_service.USE_USERSPACE_TUNNEL = True
            tunnel = await stack.enter_async_context(provider.start_tcp_tunnel())
            tun = tunnel.client.tun
            tun.set_peer(tunnel.address)
            dial = await stack.enter_async_context(UserspaceDialPlane(tun, tunnel.address))
            rsd = RemoteServiceDiscoveryService((tunnel.address, tunnel.port),
                open_connection=dial.dial, auxiliary_metadata=tunnel.auxiliary_metadata)
            stack.push_async_callback(rsd.close)
            await rsd.connect()
            if rsd.udid != serial:
                raise ValueError('developer_device_identity_mismatch')
            check()
            yield rsd, 'tailnet-paired-userspace'
    finally:
        tunnel_service.USE_USERSPACE_TUNNEL = previous
