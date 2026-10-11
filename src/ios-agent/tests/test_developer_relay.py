import base64,socket,time,unittest
from developer_relay import PairingRelay
class RelayTests(unittest.TestCase):
 def wait(self,fn):
  until=time.monotonic()+1
  while not fn() and time.monotonic()<until:time.sleep(.005)
  self.assertTrue(fn())
 def test_binary_stream_is_exact_in_both_directions_and_single_consumer(self):
  r=PairingRelay('owner','boot')
  try:
   with socket.create_connection(('127.0.0.1',r.port),timeout=1) as c:
    c.sendall(b'\x00\xffpair');self.wait(lambda:len(r.outgoing)==6)
    response=r.exchange(0,base64.b64encode(b'\xff\x00reply').decode())
    self.assertEqual(base64.b64decode(response['data']),b'\x00\xffpair')
    self.assertEqual(c.recv(32),b'\xff\x00reply')
    self.assertEqual(r.summary()['frames'],1);self.assertEqual(r.summary()['phoneBytes'],7);self.assertEqual(r.summary()['consumerBytes'],6)
    with self.assertRaises(OSError):socket.create_connection(('127.0.0.1',r.port),timeout=.1)
   self.wait(lambda:r.closed)
  finally:r.close();r.thread.join(1)
 def test_duplicate_sequence_closes_and_never_replays_bytes(self):
  r=PairingRelay('owner','boot')
  try:
   r.exchange(0,'')
   with self.assertRaisesRegex(ValueError,'relay_frame_rejected'):r.exchange(0,'')
   self.assertTrue(r.closed)
  finally:r.close();r.thread.join(1)
 def test_byte_limits_and_expiry_close_without_payload_in_summary(self):
  for mode in ('bytes','expired'):
   r=PairingRelay('owner','boot')
   try:
    if mode=='bytes':r.total=r.TOTAL
    else:r.deadline=0
    with self.assertRaises(ValueError):r.exchange(0,'YQ==')
    self.assertNotIn('data',r.summary())
   finally:r.close();r.thread.join(1)
