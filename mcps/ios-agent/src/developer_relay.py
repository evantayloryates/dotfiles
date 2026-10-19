"""Experimental, single-stream foreground pairing relay. No payload logging."""
import base64
import socket
import threading
import time


class PairingRelay:
    CHUNK = 16384
    BUFFER = 262144
    TOTAL = 4 * 1024 * 1024

    def __init__(self, lease, boot, clock=time.monotonic):
        self.lease, self.boot, self.clock = lease, boot, clock
        self.deadline = clock() + 60
        self.lock = threading.Lock()
        self.outgoing = bytearray()
        self.incoming = bytearray()
        self.total = 0
        self.phone_bytes = 0
        self.consumer_bytes = 0
        self.sequence = 0
        self.reason = None
        self.closed = False
        self.connected = False
        self.listener = socket.socket()
        self.listener.bind(('127.0.0.1', 0))
        self.listener.listen(1)
        self.listener.settimeout(.2)
        self.port = self.listener.getsockname()[1]
        self.thread = threading.Thread(target=self._pump, daemon=True)
        self.thread.start()

    def close(self, reason='stopped'):
        with self.lock:
            self.closed = True
            self.reason = self.reason or reason
        try:
            self.listener.close()
        except OSError:
            pass

    def exchange(self, sequence, encoded):
        if type(sequence) is not int or not isinstance(encoded, str) or len(encoded) > 22000:
            self.close('invalid_frame')
            raise ValueError('relay_frame_rejected')
        try:
            data = base64.b64decode(encoded, validate=True)
        except ValueError:
            self.close('invalid_frame')
            raise ValueError('relay_frame_rejected') from None
        with self.lock:
            if sequence != self.sequence:
                self.closed = True
                raise ValueError('relay_frame_rejected')
            if self.closed or self.clock() >= self.deadline:
                raise ValueError('relay_closed')
            if len(data) > self.CHUNK or len(self.incoming) + len(data) > self.BUFFER or self.total + len(data) > self.TOTAL:
                self.closed = True
                self.reason = 'byte_limit'
                raise ValueError('relay_byte_limit')
            self.incoming.extend(data)
            self.phone_bytes += len(data)
            self.total += len(data)
            outgoing = bytes(self.outgoing[:self.CHUNK])
            del self.outgoing[:len(outgoing)]
            self.sequence += 1
            return {'sequence': sequence, 'data': base64.b64encode(outgoing).decode(), 'closed': False}

    def _pump(self):
        client = None
        try:
            while not self.closed and self.clock() < self.deadline:
                if client is None:
                    try:
                        client, _ = self.listener.accept()
                        client.settimeout(.05)
                        self.connected = True
                        self.listener.close()  # Exactly one local consumer.
                    except socket.timeout:
                        continue
                with self.lock:
                    pending = bytes(self.incoming[:self.CHUNK])
                if pending:
                    sent = client.send(pending)
                    with self.lock:
                        del self.incoming[:sent]
                try:
                    data = client.recv(self.CHUNK)
                except socket.timeout:
                    continue
                if not data:
                    break
                with self.lock:
                    if len(self.outgoing) + len(data) > self.BUFFER or self.total + len(data) > self.TOTAL:
                        self.reason = 'byte_limit'
                        break
                    self.outgoing.extend(data)
                    self.consumer_bytes += len(data)
                    self.total += len(data)
        except OSError:
            pass
        finally:
            if client:
                client.close()
            self.close('consumer_closed_or_deadline')

    def summary(self):
        return {'scope': 'foreground-fixed-loopback-pairing-candidate', 'port': self.port,
                'connected': self.connected, 'closed': self.closed, 'bytes': self.total,
                'frames': self.sequence, 'phoneBytes': self.phone_bytes, 'consumerBytes': self.consumer_bytes,
                'deadlineSeconds': 60, 'reason': self.reason, 'payloadLogged': False}
