import ipaddress
import struct
import unittest
from probes.packet_reflector import reflect, VIRTUAL


class PacketReflectionTests(unittest.TestCase):
    phone = ipaddress.IPv4Address('100.101.102.103').packed

    def packet(self, source_port=54321, target_port=49152):
        header = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 43, 0, 0x4000, 64, 6, 0, self.phone, VIRTUAL)
        tcp = struct.pack('!HHIIBBHHH', source_port, target_port, 1, 0, 0x50, 2, 1024, 0, 0)
        return header + tcp + b'\x00\xffx'

    def test_request_and_reply_preserve_ports_payload_and_checksum_sum(self):
        for ports in [(54321, 49152), (49152, 54321)]:
            original = self.packet(*ports)
            changed = reflect(original, self.phone)
            self.assertEqual(changed[12:16], VIRTUAL)
            self.assertEqual(changed[16:20], self.phone)
            self.assertEqual(changed[20:], original[20:])
            self.assertEqual(sum(struct.unpack('!10H', changed[:20])), sum(struct.unpack('!10H', original[:20])))

    def test_rejects_other_phone_port_fragments_protocol_and_truncation(self):
        base = self.packet()
        variants = [self.packet(123, 456), base[:-1]]
        for offset, value in [(12, 1), (16, 1), (6, 0x20), (9, 17), (0, 0x46), (32, 0xf0)]:
            item = bytearray(base)
            item[offset] = value
            variants.append(bytes(item))
        for packet in variants:
            self.assertIsNone(reflect(packet, self.phone))


if __name__ == '__main__':
    unittest.main()
