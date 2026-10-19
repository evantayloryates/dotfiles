"""Bounded, read-only evidence for the fixed phone; never guesses lock state."""
import json
import os
import plistlib
import re
import socket
import subprocess
import time
from pathlib import Path
from cli import request
from install import TAILSCALE
from paired_transport import tailnet_config


def fixed_serial(state):
    file = Path(state) / 'web-device.json'
    if file.is_symlink() or not file.is_file() or file.stat().st_mode & 0o077 or file.stat().st_size > 4096:
        raise ValueError('private_fixed_device_required')
    serial = json.loads(file.read_text()).get('hardwareUDID')
    if not isinstance(serial, str) or not re.fullmatch(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}', serial):
        raise ValueError('private_fixed_device_required')
    return serial


def usb_match(tree, serial):
    # ioreg reports USB serials with or without the CoreDevice UDID dash.
    expected = serial.replace('-', '').lower()
    pending = [tree]
    count = 0
    while pending:
        node = pending.pop()
        count += 1
        if count > 10000:
            raise ValueError('bounded_usb_inventory_required')
        if isinstance(node, list):
            pending.extend(node)
        elif isinstance(node, dict):
            actual = node.get('USB Serial Number')
            if isinstance(actual, str) and actual.replace('-', '').lower() == expected:
                return True
            children = node.get('IORegistryEntryChildren', [])
            if isinstance(children, list):
                pending.extend(children)
    return False


def usb_attached(serial):
    result = subprocess.run(['/usr/sbin/ioreg', '-a', '-p', 'IOUSB', '-l'],
                            capture_output=True, timeout=3)
    if result.returncode or len(result.stdout) > 2 * 1024 * 1024:
        raise ValueError('usb_inventory_unavailable')
    return usb_match(plistlib.loads(result.stdout), serial)


def ping_phone(address):
    result = subprocess.run([TAILSCALE, 'ping', '--c=1', '--timeout=2s', address],
                            env={**os.environ, 'TAILSCALE_BE_CLI': '1'},
                            capture_output=True, timeout=4)
    # A failed binary/configuration lookup is unknown, not a negative ping.
    text = result.stdout[:8192].decode('utf-8', errors='replace')
    # A pong is reachability whatever the exit code: with --c=1 tailscale exits
    # 1 after a DERP-relayed pong ("direct connection not established").
    if 'pong from ' in text:
        return True
    if 'timed out' in text.lower() or 'timeout waiting for' in text.lower() or 'no matching peer' in text.lower():
        return False
    return None


def developer_endpoint_tcp(address):
    # Fixed paired endpoint only. TCP acceptance is not authenticated RSD readiness.
    try:
        with socket.create_connection((address, 49152), timeout=1.5):
            return 'accepted'
    except ConnectionRefusedError:
        return 'refused'
    except TimeoutError:
        return 'timeout'
    except OSError:
        return 'unavailable'


def peer_status():
    value = subprocess.run([TAILSCALE, 'status', '--json'],
                           env={**os.environ, 'TAILSCALE_BE_CLI': '1'},
                           capture_output=True, timeout=3)
    if value.returncode or len(value.stdout) > 2 * 1024 * 1024:
        raise ValueError('tailnet_inventory_unavailable')
    return json.loads(value.stdout)


# Reachable phone, no foreground app/page: the next step is a launch, not
# waiting. Without it an idle Home Screen reads as an undrivable phone.
LAUNCH_NEXT = ('Phone answers over the paired tailnet, but no Kickoff DEV app or enrolled page is foreground. '
               'Native: ios_device_launch target=kickoff-dev, then ios_wait_ready surface=native, then ios_begin. '
               'Browser: ios_web_open (it launches the page). Lock state remains unknown until a launch reports foregroundVerified.')


def diagnose(state):
    result = {'observedAt': time.time(), 'usbAttached': None,
              'usbEnumerationDetected': None,
              'usbObservation': 'unavailable; physical cable state unknown',
              'tailnetConfigured': None, 'tailnetPeerKnown': None,
              'tailnetPeerOnline': None, 'tailnetPingSucceeded': None,
              'bridgeReadyToAcquire': None, 'bridgeReason': 'unavailable',
              'lockState': 'unknown', 'developerChannelVerified': False,
              'developerEndpointTCP': None,
              'phoneInputSent': False, 'repairsPerformed': False}
    try:
        ready = request({'op': 'ready_wait', 'timeoutSeconds': 0}, Path(state), timeout=2)
        result['bridgeReadyToAcquire'] = ready.get('readyToAcquire') is True
        result['bridgeReason'] = ('fresh_foreground_bridge' if result['bridgeReadyToAcquire'] else
                                 'another_owner' if ready.get('reason') == 'another_owner' else
                                 'no_fresh_foreground_bridge')
    except Exception:
        pass
    try:
        serial = fixed_serial(state)
    except Exception:
        result['next'] = 'Fixed phone configuration unavailable; no USB or peer identity inferred.'
        return result
    try:
        detected = usb_attached(serial)
        result['usbEnumerationDetected'] = detected
        # An absent registry entry is not evidence that Taylor unplugged the
        # cable: charging-only, accessory approval and failed enumeration all
        # have the same negative result. Preserve the positive legacy field,
        # but never turn a negative inventory into a physical setup claim.
        result['usbAttached'] = True if detected else None
        result['usbObservation'] = ('fixed phone enumerated on USB; developer readiness separate'
                                    if detected else
                                    'fixed phone not enumerated; physical cable state unknown')
    except Exception:
        pass
    try:
        config = tailnet_config(state, serial)
        result['tailnetConfigured'] = config is not None
        if config:
            if result['bridgeReason'] != 'another_owner':
                result['developerEndpointTCP'] = developer_endpoint_tcp(config['address'])
            status = peer_status()
            peers = [peer for peer in status.get('Peer', {}).values()
                     if config['address'] in peer.get('TailscaleIPs', [])]
            result['tailnetPeerKnown'] = bool(peers)
            if len(peers) == 1:
                result['tailnetPeerOnline'] = peers[0].get('Online') if type(peers[0].get('Online')) is bool else None
                result['tailnetPingSucceeded'] = ping_phone(config['address'])
    except Exception:
        pass
    if result['bridgeReadyToAcquire'] and result['developerEndpointTCP'] == 'refused':
        result['next'] = 'App/page bridge is available, but the paired developer TCP endpoint refused. Use the working bridge; after Wi-Fi-Off restore Wi-Fi through its owned shortcut if needed. This does not prove lock, cable or VPN failure.'
    elif result['bridgeReadyToAcquire']:
        result['next'] = 'Acquire the intended app/page and verify it; reachability does not prove developer-channel or system-input readiness.'
    elif result['bridgeReason'] == 'another_owner':
        result['next'] = 'Wait for the current owner. Do not launch, repair or request phone changes.'
    elif result['tailnetPingSucceeded'] is True:
        result['next'] = LAUNCH_NEXT
    elif result['usbAttached'] is True:
        result['next'] = 'Fixed phone is detected on USB. Inspect the paired developer channel; after Wi-Fi-Off use Runner Wi-Fi On, then verify connectivity. Do not request cable reconnection.'
    elif result['developerEndpointTCP'] == 'accepted':
        result['next'] = LAUNCH_NEXT
    else:
        result['next'] = 'No working route is established by these reads. Wait for availability; after Wi-Fi-Off restore Wi-Fi through an available paired route. Do not infer lock, cellular state, an unplugged cable or a defective cable. A negative USB inventory alone does not justify a cable request.'
    return result
