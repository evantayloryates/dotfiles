"""DEV candidate: reflect one phone's developer TCP packets, never payload logs.

Run only in an owned Linux network namespace. Inspiration/public-domain reference:
https://github.com/xddxdd/sidestore-vpn (Tailscale example). Not a delivered lane.
"""
import argparse
import ipaddress
import json
import os
import select
import signal
import struct
import subprocess
import time

VIRTUAL = ipaddress.IPv4Address('10.7.0.1').packed


def reflect(packet, phone):
    if len(packet) < 40 or len(packet) > 1500 or packet[0] != 0x45:
        return None
    if struct.unpack('!H', packet[2:4])[0] != len(packet) or packet[9] != 6:
        return None
    if struct.unpack('!H', packet[6:8])[0] & 0x3fff:
        return None  # No fragments; every admitted packet has TCP ports.
    if packet[12:16] != phone or packet[16:20] != VIRTUAL:
        return None
    ports = struct.unpack('!HH', packet[20:24])
    if 49152 not in ports or packet[32] >> 4 < 5:
        return None
    if (packet[32] >> 4) * 4 + 20 > len(packet):
        return None
    # Swapping addresses preserves both IP and TCP pseudo-header checksum sums.
    result = bytearray(packet)
    result[12:16], result[16:20] = packet[16:20], packet[12:16]
    return bytes(result)


def main():
    import fcntl
    p = argparse.ArgumentParser()
    p.add_argument('--phone', required=True)
    p.add_argument('--seconds', type=int, default=120)
    a = p.parse_args()
    phone = ipaddress.IPv4Address(a.phone)
    if phone not in ipaddress.IPv4Network('100.64.0.0/10') or not 1 <= a.seconds <= 600:
        raise SystemExit('fixed_phone_and_bounded_duration_required')
    fd = os.open('/dev/net/tun', os.O_RDWR)
    name = 'runner_reflect'
    try:
        fcntl.ioctl(fd, 0x400454ca, struct.pack('16sH', name.encode(), 0x0001 | 0x1000))
        subprocess.run(['ip', 'addr', 'add', '10.7.0.0', 'peer', '10.7.0.1', 'dev', name], check=True)
        subprocess.run(['ip', 'link', 'set', name, 'up'], check=True)
        start = time.monotonic()
        end = start + a.seconds
        def stop(*_):
            nonlocal end
            end = 0
        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        request_count = reply_count = syn_ack_count = reset_count = 0
        first_request = first_reply = None
        admitted = rejected = byte_count = 0
        headers = []
        print(json.dumps({'ready': True, 'pid':os.getpid(), 'port': 49152, 'seconds': a.seconds,
                          'payloadLogged': False}), flush=True)
        while time.monotonic() < end:
            if not select.select([fd], [], [], max(0, min(1, end - time.monotonic())))[0]:
                continue
            packet = os.read(fd, 1504)
            output = reflect(packet, phone.packed)
            if output is None:
                rejected += 1
                continue
            if packet[33]&0x12 == 0x12:syn_ack_count += 1
            if packet[33]&0x04:reset_count += 1
            elapsed = round((time.monotonic()-start)*1000, 3)
            if len(headers) < 16:
                source_port,target_port,sequence,ack = struct.unpack('!HHII',packet[20:32])
                headers.append({'atMs':elapsed,'sourcePort':source_port,'targetPort':target_port,
                                'flags':packet[33],'sequence':sequence,'ack':ack,'bytes':len(packet)})
            if struct.unpack('!H',packet[20:22])[0] == 49152:
                reply_count += 1
                if first_reply is None:first_reply = elapsed
            else:
                request_count += 1
                if first_request is None:first_request = elapsed
            os.write(fd, output)
            admitted += 1
            byte_count += len(output)
        print(json.dumps({'ended': True, 'packets': admitted, 'rejected': rejected,
                          'bytes': byte_count, 'requestPackets':request_count, 'replyPackets':reply_count,
                          'synAckPackets':syn_ack_count, 'resetPackets':reset_count, 'firstRequestMs':first_request, 'firstReplyMs':first_reply,
                          'headers':headers, 'payloadLogged': False}), flush=True)
    finally:
        os.close(fd)  # Nonpersistent interface and route disappear.


if __name__ == '__main__':
    main()
