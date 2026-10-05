"""Call-time diagnostics for Theo's audio chain.

Three probes, all cheap, all written to calls.jsonl through the caller-supplied `record`:

- TtsTap: tees every frame the agent's tts_node yields into <recordings>/<call>-theo.wav (exactly the
  audio that left the Air, before Opus/SIP/PSTN) and logs the pacing of those frames. The room output
  holds a 200 ms queue (rtc.AudioSource queue_size_ms=200), so a gap between yielded frames longer
  than that is an audible dropout at the far end; gaps over `stall_ms` are logged per segment.
- loop_lag_monitor: measures asyncio event-loop lag; a blocked loop starves that same 200 ms queue.
- sys_sampler: process CPU %, RSS and 1-min load every `interval` seconds while a call is up.
"""
from __future__ import annotations

import asyncio
import os
import resource
import time
import wave
from collections.abc import AsyncIterable, Callable
from pathlib import Path

from livekit import rtc

Record = Callable[..., None]


class TtsTap:
    def __init__(self, path: Path, record: Record, call: str, stall_ms: int = 120) -> None:
        self.path = path
        self.record = record
        self.call = call
        self.stall_ms = stall_ms
        self._wav: wave.Wave_write | None = None
        self._segments = 0
        self.total_audio_s = 0.0
        self.total_stalls = 0
        self.worst_stall_ms = 0

    def _write(self, f: rtc.AudioFrame) -> None:
        if self._wav is None:
            self._wav = wave.open(str(self.path), "wb")
            self._wav.setnchannels(f.num_channels)
            self._wav.setsampwidth(2)
            self._wav.setframerate(f.sample_rate)
            self.record("tts_tap_open", call=self.call, path=str(self.path), sample_rate=f.sample_rate, channels=f.num_channels)
        self._wav.writeframes(f.data.tobytes())

    async def wrap(self, frames: AsyncIterable[rtc.AudioFrame]) -> AsyncIterable[rtc.AudioFrame]:
        self._segments += 1
        seg = self._segments
        t_req = time.monotonic()
        first = last = None
        audio_s = 0.0
        stalls: list[int] = []
        n = 0
        try:
            async for f in frames:
                now = time.monotonic()
                if last is None:
                    first = now
                else:
                    gap_ms = (now - last) * 1000
                    if gap_ms > self.stall_ms:
                        stalls.append(round(gap_ms))
                last = now
                n += 1
                audio_s += f.samples_per_channel / f.sample_rate
                self._write(f)
                yield f
        finally:
            wall = (last - first) if (first is not None and last is not None) else 0.0
            ttfb = (first - t_req) if first is not None else None
            self.total_audio_s += audio_s
            self.total_stalls += len(stalls)
            self.worst_stall_ms = max(self.worst_stall_ms, max(stalls, default=0))
            self.record(
                "tts_segment", call=self.call, seg=seg, frames=n, audio_s=round(audio_s, 2), wall_s=round(wall, 2),
                ttfb_s=round(ttfb, 3) if ttfb is not None else None, n_stalls=len(stalls),
                max_stall_ms=max(stalls, default=0), stalls_ms=stalls[:20],
            )

    def close(self) -> None:
        if self._wav is not None:
            self._wav.close()
            self._wav = None
        self.record(
            "tts_tap_close", call=self.call, segments=self._segments, audio_s=round(self.total_audio_s, 1),
            n_stalls=self.total_stalls, worst_stall_ms=self.worst_stall_ms, path=str(self.path),
        )


async def loop_lag_monitor(record: Record, call: str, interval: float = 0.05, warn_ms: float = 100) -> None:
    worst = 0.0
    count = 0
    t = time.monotonic()
    try:
        while True:
            await asyncio.sleep(interval)
            now = time.monotonic()
            lag = (now - t - interval) * 1000
            t = now
            if lag > warn_ms:
                count += 1
                worst = max(worst, lag)
                record("loop_lag", call=call, lag_ms=round(lag))
    finally:
        record("loop_lag_summary", call=call, events=count, worst_ms=round(worst))


async def sys_sampler(record: Record, call: str, interval: float = 2.0) -> None:
    t0 = time.monotonic()
    c0 = sum(os.times()[:2])
    try:
        while True:
            await asyncio.sleep(interval)
            t1 = time.monotonic()
            c1 = sum(os.times()[:2])
            cpu = 100 * (c1 - c0) / max(t1 - t0, 1e-6)
            t0, c0 = t1, c1
            rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)
            record("sys", call=call, proc_cpu_pct=round(cpu, 1), rss_mb=round(rss_mb), load1=round(os.getloadavg()[0], 2))
    except asyncio.CancelledError:
        pass
