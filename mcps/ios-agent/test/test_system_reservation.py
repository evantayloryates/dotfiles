import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import system_reservation as reservation
import system_runner as runner


class ReservationTests(unittest.TestCase):
    def record(self, **patches):
        now=time.time()
        return dict(version=1,id='a'*32,createdAt=now,expiresAt=now+36000,active=True,pid=os.getpid(),phase='ready',ready=True,sessionId='b'*36,**patches)

    def test_absolute_expiry_and_dead_worker_do_not_renew_on_reads(self):
        r=self.record(); created=r['createdAt']
        self.assertTrue(reservation.live(r,created+35999))
        self.assertFalse(reservation.live(r,created+36000))
        self.assertFalse(reservation.live(r,created-1))
        with patch.object(os,'kill',side_effect=ProcessLookupError):self.assertFalse(reservation.live(r,created+1))
        self.assertEqual(r['expiresAt'],created+36000)

    def test_metadata_is_private_bounded_and_does_not_disclose_native_session(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'record.json';r=self.record();reservation.write_record(file,r)
            self.assertEqual(reservation.read_record(file),r)
            self.assertNotIn('sessionId',reservation.public(r));self.assertNotIn('pid',reservation.public(r));self.assertFalse(reservation.public(r)['inputAuthority'])
            file.chmod(0o644)
            with self.assertRaises(ValueError):reservation.read_record(file)
            file.chmod(0o600);r['expiresAt']+=1;reservation.write_record(file,r)
            with self.assertRaises(ValueError):reservation.read_record(file)
            file.unlink();file.symlink_to(Path(d)/'other')
            with self.assertRaises(OSError):reservation.read_record(file)

    def test_retained_lifetime_ignores_original_input_lease_but_requires_exact_worker_and_deadline(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'record.json';record=self.record();reservation.write_record(file,record)
            r={'reservationFile':str(file),'reservationId':record['id'],'_retentionDeadline':time.monotonic()+10}
            with patch.object(runner,'input_owned',side_effect=AssertionError('old input lease must not own retention')):
                self.assertTrue(runner.owned(r))
                file.with_suffix('.stop').touch();self.assertFalse(runner.owned(r));file.with_suffix('.stop').unlink()
                self.assertFalse(runner.owned(dict(r,_retentionDeadline=time.monotonic()-1)))
                record['pid']+=1;reservation.write_record(file,record);self.assertFalse(runner.owned(r))

    def test_unconfirmed_or_active_reservation_cannot_be_replaced(self):
        with tempfile.TemporaryDirectory() as d:
            root=reservation.directory(d);r=self.record();reservation.write_record(root/'current.json',r);reservation.write_record(root/(r['id']+'.json'),r)
            with self.assertRaisesRegex(ValueError,'existing_reservation_preserved'):reservation.start({'state':d,'durationSeconds':1800})
            r.update(active=False,ready=False,pid=0);reservation.write_record(root/(r['id']+'.json'),r)
            with self.assertRaisesRegex(ValueError,'existing_reservation_preserved'):reservation.start({'state':d,'durationSeconds':1800})

    def test_stop_requires_original_reservation_and_current_exclusive_owner(self):
        with tempfile.TemporaryDirectory() as d:
            root=reservation.directory(d);r=self.record();reservation.write_record(root/'current.json',r);reservation.write_record(root/(r['id']+'.json'),r)
            with self.assertRaisesRegex(ValueError,'matching_reservation_required'):reservation.stop({'state':d,'reservationId':'c'*32})
            with patch.object(runner,'input_owned',return_value=False):
                with self.assertRaisesRegex(ValueError,'system_owner_inactive'):reservation.stop({'state':d,'reservationId':r['id']})
            self.assertFalse((root/(r['id']+'.stop')).exists())


if __name__=='__main__':unittest.main()

class DetachedWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_retained_worker_survives_original_owner_end_and_eof_then_stops_its_own_child(self):
        import asyncio
        from unittest.mock import AsyncMock
        with tempfile.TemporaryDirectory() as d:
            root=reservation.directory(d);now=time.time();identity='a'*32;file=root/(identity+'.json')
            record=dict(version=1,id=identity,createdAt=now,expiresAt=now+30,active=True,pid=0,phase='requested',ready=False)
            reservation.write_record(file,record)
            r=dict(state=d,reservationFile=str(file),reservationId=identity)
            reader=asyncio.StreamReader();reader.feed_data(b'WebDriverAgentRunner-Runner[77:123] start\n');reader.feed_eof()
            class Child:
                pid=77;returncode=None;stdout=reader
                async def wait(self):self.returncode=0
            child=Child();signals=[]
            async def ready(request):
                runner.reservation_update(request,phase='ready',ready=True,sessionId='b'*36)
                return True
            original_sleep=asyncio.sleep
            async def request_stop(seconds):
                # The input turn/connection can end; only the reservation owns lifetime.
                file.with_suffix('.stop').touch()
                await original_sleep(0)
            loop=asyncio.get_running_loop()
            with patch.object(runner,'validate',return_value=('configured',Path(d)/'signed.xctestrun',Path(d)/'runner.log')), \
                 patch.object(runner,'input_owned',side_effect=[True,AssertionError('old lease consulted after reservation armed')]) as initial, \
                 patch.object(runner,'retained_ready',side_effect=ready), \
                 patch.object(runner.asyncio,'create_subprocess_exec',new=AsyncMock(return_value=child)) as spawn, \
                 patch.object(runner.asyncio,'sleep',side_effect=request_stop), \
                 patch.object(loop,'connect_read_pipe',side_effect=AssertionError('detached worker must ignore parent EOF')), \
                 patch.object(runner.os,'killpg',side_effect=lambda pid,sig:signals.append(pid)), \
                 patch.object(runner,'confirm_stopped',new=AsyncMock(return_value=(True,1))) as confirmed:
                await runner.main(r)
                self.assertEqual(initial.call_count,1);self.assertEqual(spawn.await_count,1)
                self.assertEqual(signals,[77]);confirmed.assert_awaited_once_with('configured',{77})
            final=reservation.read_record(file)
            self.assertEqual(final['phase'],'stopped');self.assertTrue(final['runnerStopped']);self.assertFalse(final['active'])
