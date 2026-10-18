"""(round 64, liveset64) Live set for an open mic: the performance side of the Serum 2 / Vital host.

Loaded by creative-vst-host.py (like creative-vst-offline.py) and driven by Hearth's Live set view (tools/liveset.js).
Everything that has to be on time runs HERE, in the host's audio worker, never in Hearth's window:
- a transport (tempo, beats per bar, the sample the bars count from): launches are quantized to the next bar / beat
  by sample position, so a busy window can be late to SEND a press but the sound still lands on the grid;
- clips (park takes, a song's mixdown) loaded once from WAV files Hearth prepared, mixed into the instrument's output
  sample-accurately, looped or one-shot, with 2 ms fade-in edges and a 10 ms fade at a stop;
- one knob per pad: a filter (left = low-pass, right = high-pass, centre = off) using Pedalboard's own filters;
- preset switches on the beat with no gap: the next preset is PRELOADED into a second instance of the same instrument
  (the "twin": loaded and given its state on the host's main thread, off the audio thread), then swapped in at the
  boundary with a 256-sample crossfade; notes held at that moment carry over to the new sound; the old instance
  becomes the twin, so going back to the previous preset is instant too;
- panic: every clip and the instrument fade out together (300 ms), queued launches are dropped, notes are released;
  the transport keeps running so the next press lands on the bar again;
- the run recorder (Rehearse / Perform): the whole mix (instrument + clips, before the monitor volume) streamed to a
  16-bit WAV by a writer thread (the audio worker only queues a block), up to 45 minutes, with a log of every launch,
  switch and panic and its bar.
Idle cost: nothing until Hearth opens a set ('set-open'); the audio worker checks one flag per block."""
import math
import os
import queue
import threading
import time
import wave
from pathlib import Path

XFADE = 256            # samples of crossfade when the twin is swapped in
EDGE = 96              # samples of fade-in at a clip's start (≈ 2 ms at 48 kHz)
STOP_FADE_S = 0.010    # a clip stopped on the grid fades over 10 ms (no click)
PANIC_S = 0.3          # panic: everything fades out over 300 ms
MAX_CLIPS = 64
MAX_CLIP_S = 600       # one clip up to 10 minutes (a whole song's mixdown)
MAX_TOTAL_S = 1800     # all clips together up to 30 minutes of audio in memory
MAX_RUN_S = 45 * 60
ACTIONS = ('set-open', 'set-close', 'set-status', 'set-tempo', 'clip-load', 'clip-unload', 'launch', 'pad-fx',
           'preset-preload', 'preset-switch', 'set-panic', 'run-record', 'run-stop')
STREAMED = ('launch', 'pad-fx', 'preset-switch', 'set-panic', 'set-tempo')


def fx_filter(fx):
    """The one knob: -1 … 0 … 1 → ('low' | 'high' | None, cutoff Hz). Kept identical to LiveSetCore.fxFilter."""
    fx = max(-1.0, min(1.0, float(fx or 0)))
    if abs(fx) < 0.02:
        return None, 0.0
    if fx < 0:
        return 'low', 20000.0 * (150.0 / 20000.0) ** (-fx)
    return 'high', 30.0 * (6000.0 / 30.0) ** fx


class Knob:
    """A pad's filter: Pedalboard's LowpassFilter / HighpassFilter, made on first use, cutoff moved without a reset."""

    def __init__(self):
        self.value = 0.0
        self.kind = None
        self.plugin = None

    def set(self, value):
        self.value = max(-1.0, min(1.0, float(value)))

    def process(self, audio, rate):
        kind, cutoff = fx_filter(self.value)
        if kind is None:
            self.kind, self.plugin = None, None
            return audio
        import pedalboard as pb
        if kind != self.kind or self.plugin is None:
            self.plugin = (pb.LowpassFilter if kind == 'low' else pb.HighpassFilter)(cutoff_frequency_hz=cutoff)
            self.kind = kind
        else:
            self.plugin.cutoff_frequency_hz = cutoff
        return self.plugin(audio, rate, buffer_size=max(32, audio.shape[1]), reset=False)


class Clip:
    def __init__(self, slot, audio, loop, gain):
        self.slot, self.audio, self.loop, self.gain = slot, audio, bool(loop), float(gain)
        self.length = audio.shape[1]
        self.state = 'stopped'      # stopped · queued · playing · stopping
        self.start_at = None        # absolute sample the clip starts (or started) at
        self.stop_at = None         # absolute sample its stop fade begins
        self.knob = Knob()


class LiveSet:
    def __init__(self, engine):
        self.e = engine
        self.np = engine.np
        self.active = False
        self.bpm, self.beats, self.origin = 120.0, 4, 0
        self.quantize = 'bar'
        self.clips = {}
        self.twin = None
        self.twin_id = None
        self.twin_path = None
        self.twin_lock = threading.RLock()
        self.twin_load_ms = 0
        self.preloading = False
        self.current_id = None      # the preset the live instance plays (None = the desk's own sound)
        self.swap = None            # {'id', 'at'} a switch waiting for its boundary
        self.xf = None              # {'old', 'start'} a crossfade in progress
        self.swaps = []
        self.held = {}              # notes held right now (note -> velocity), carried over at a swap
        self.inst_knob = Knob()
        self.panic_at = None
        self.panic_len = 0
        self.log = []
        self.run = None
        self.last_error = ''

    # ---------- the grid ----------
    def spb(self):
        return 60.0 / self.bpm * self.e.rate

    def earliest(self):
        # the next block the worker will render (the one being rendered now may already be past this point)
        return self.e.position + self.e.frames

    def boundary(self, unit=None, at=None):
        """The first bar / beat line at or after `at` (default: the next block). 'now' = the next block itself."""
        unit = unit or self.quantize
        p = self.earliest() if at is None else at
        if unit == 'now':
            return p
        step = self.spb() * (self.beats if unit == 'bar' else 1)
        k = math.ceil((p - self.origin) / step - 1e-9)
        return int(round(self.origin + max(0, k) * step))

    def where(self, sample):
        beats = (sample - self.origin) / self.spb()
        return {'bar': int(beats // self.beats) + 1, 'beat': int(beats % self.beats) + 1}

    def note(self, kind, **data):
        if len(self.log) < 4000:
            at = data.get('at', self.earliest())
            run = self.run
            # 'sample': where it is in the run's WAV (a stream restart mid-run continues the file)
            wav = at - run['from'] + run['shift'] if run is not None and not run['done'] else at
            self.log.append({'kind': kind, **self.where(at), **data, 'sample': wav})

    # ---------- commands (any connection thread; 'preset-preload' runs on the host's main thread) ----------
    def command(self, action, job):
        np = self.np
        if action == 'set-open':
            bpm, beats = float(job.get('bpm') or 120), int(job.get('beats') or 4)
            if not (math.isfinite(bpm) and 40 <= bpm <= 240) or not 2 <= beats <= 7:
                raise ValueError('Tempo 40–240 BPM, 2–7 beats a bar.')
            if not self.e.running.is_set():
                raise ValueError('Start live audio first.')
            if not self.active:
                self.bpm, self.beats, self.origin = bpm, beats, self.earliest()
                self.log, self.swaps, self.current_id = [], [], job.get('id') or None
            self.quantize = job.get('quantize') if job.get('quantize') in ('bar', 'beat', 'now') else 'bar'
            self.active = True
            return self.status()
        if action == 'set-close':
            self.close()
            return {'closed': True}
        if action == 'set-status':
            return self.status()
        if not self.active:
            raise ValueError('Open the live set first.')
        if action == 'set-tempo':
            bpm = float(job.get('bpm') or 0)
            if not (math.isfinite(bpm) and 40 <= bpm <= 240):
                raise ValueError('Tempo 40–240 BPM.')
            p = self.earliest()
            beat = (p - self.origin) / self.spb()      # the beat we are on stays where it is: only the speed changes
            self.bpm = bpm
            self.origin = int(round(p - beat * self.spb()))
            self.note('tempo', bpm=bpm)
            return {'bpm': bpm}
        if action == 'clip-load':
            return self.load_clip(job)
        if action == 'clip-unload':
            self.clips.pop(str(job.get('slot')), None)
            return {'clips': len(self.clips)}
        if action == 'launch':
            return self.launch(str(job.get('slot')), job.get('mode') or 'toggle', job.get('at'))
        if action == 'pad-fx':
            fx = float(job.get('fx') or 0)
            if not math.isfinite(fx):
                raise ValueError('Knob outside −1…1.')
            slot = str(job.get('slot') or '')
            knob = self.inst_knob if slot in ('', 'synth') else self.clips[slot].knob
            was = fx_filter(knob.value)[0]
            knob.set(fx)
            if fx_filter(knob.value)[0] != was:  # logged when the filter turns on / off / flips side, not every move
                self.note('fx', slot=slot or 'synth', filter=fx_filter(knob.value)[0] or 'off')
            if job.get('gain') is not None and slot in self.clips:
                self.clips[slot].gain = max(0.0, min(4.0, float(job['gain'])))
            return {'fx': fx}
        if action == 'preset-preload':
            return self.preload(job)
        if action == 'preset-switch':
            pid = str(job.get('id') or '')
            if self.twin is None or self.twin_id != pid or self.preloading:
                raise ValueError('That preset is not preloaded yet.')
            if self.swap or self.xf:
                raise ValueError('A preset switch is already on its way.')
            at = self.boundary(job.get('at') or 'beat')
            self.swap = {'id': pid, 'at': at, 'fx': job.get('fx')}
            return {'switchAt': at, **self.where(at)}
        if action == 'set-panic':
            seconds = float(job.get('fade') or PANIC_S)
            self.panic_len = max(1, int(round(max(0.02, min(3.0, seconds)) * self.e.rate)))
            self.panic_at = self.earliest()
            for c in self.clips.values():
                if c.state == 'queued':
                    c.state, c.start_at = 'stopped', None
            self.swap = None
            self.note('panic')
            return {'panic': True, 'fadeMs': round(self.panic_len / self.e.rate * 1000)}
        if action == 'run-record':
            return self.run_start(job)
        if action == 'run-stop':
            return self.run_stop()
        raise ValueError('Unknown live set action.')

    def load_clip(self, job):
        np = self.np
        slot, path = str(job.get('slot') or ''), job.get('file')
        if not slot or len(slot) > 64:
            raise ValueError('A pad needs an id.')
        if not path or not str(path).lower().endswith('.wav'):
            raise ValueError('A clip is a WAV file.')
        if len(self.clips) >= MAX_CLIPS and slot not in self.clips:
            raise ValueError('A live set holds up to %d clips.' % MAX_CLIPS)
        with wave.open(str(path), 'rb') as w:
            channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            if width not in (2, 3, 4) or channels not in (1, 2):
                raise ValueError('Clips are 16/24/32-bit PCM WAV, mono or stereo.')
            if frames > MAX_CLIP_S * rate:
                raise ValueError('A clip is up to 10 minutes.')
            raw = w.readframes(frames)
        if width == 3:
            b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
            ints = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
            ints = np.where(ints >= 1 << 23, ints - (1 << 24), ints)
            data = ints.astype(np.float32) / float(1 << 23)
        else:
            data = np.frombuffer(raw, dtype='<i2' if width == 2 else '<i4').astype(np.float32) / (32768.0 if width == 2 else 2147483648.0)
        data = data.reshape(-1, channels).T
        if channels == 1:
            data = np.vstack([data, data])
        if rate != self.e.rate:     # once, at load: linear resampling to the stream's rate
            n = max(1, int(round(data.shape[1] * self.e.rate / rate)))
            x = np.linspace(0, data.shape[1] - 1, n)
            data = np.vstack([np.interp(x, np.arange(data.shape[1]), ch) for ch in data]).astype(np.float32)
        total = sum(c.length for k, c in self.clips.items() if k != slot) + data.shape[1]
        if total > MAX_TOTAL_S * self.e.rate:
            raise ValueError('The set\'s clips add up to more than 30 minutes; split it into two sets.')
        loop = bool(job.get('loop'))
        if loop and job.get('bars'):     # a loop plays exactly its bars (trimmed / padded to the grid at the set's tempo)
            want = int(round(float(job['bars']) * self.beats * self.spb()))
            if 0 < want and abs(want - data.shape[1]) < self.e.rate * 2:
                data = data[:, :want] if data.shape[1] >= want else np.pad(data, ((0, 0), (0, want - data.shape[1])))
        gain = 10 ** (float(job.get('gainDb') or 0) / 20)
        clip = Clip(slot, np.ascontiguousarray(data, dtype=np.float32), loop, gain)
        clip.knob.set(job.get('fx') or 0)
        old = self.clips.get(slot)
        if old and old.state in ('playing', 'stopping'):
            clip.state, clip.start_at, clip.stop_at = old.state, old.start_at, old.stop_at
        self.clips[slot] = clip
        return {'slot': slot, 'seconds': clip.length / self.e.rate, 'loop': clip.loop, 'clips': len(self.clips)}

    def launch(self, slot, mode, at):
        c = self.clips.get(slot)
        if c is None:
            raise ValueError('No such pad loaded.')
        unit = at if at in ('bar', 'beat', 'now') else self.quantize
        playing = c.state in ('playing', 'queued') and c.stop_at is None
        if mode == 'stop' or (mode == 'toggle' and playing):
            if c.state == 'queued':
                c.state, c.start_at = 'stopped', None
                return {'slot': slot, 'state': 'stopped'}
            if c.state == 'playing':
                c.stop_at = max(self.boundary(unit), c.start_at)
                c.state = 'stopping'
                self.note('stop', slot=slot, at=c.stop_at)
                return {'slot': slot, 'state': 'stopping', 'at': c.stop_at, **self.where(c.stop_at)}
            return {'slot': slot, 'state': c.state}
        if c.state in ('playing', 'stopping') and mode == 'play' and c.stop_at is None:
            return {'slot': slot, 'state': 'playing'}
        at_sample = self.boundary(unit)
        c.state, c.start_at, c.stop_at = 'queued', at_sample, None
        self.note('launch', slot=slot, at=at_sample)
        return {'slot': slot, 'state': 'queued', 'at': at_sample, **self.where(at_sample)}

    # ---------- the twin: the next preset, loaded off the audio thread ----------
    def preload(self, job):
        """On the host's MAIN thread (serve routes it there): a second instance of the open instrument gets the preset's
        state and is warmed up at the stream's rate / block size; the audio worker never waits for any of it."""
        import base64
        import zlib
        import pedalboard as pb
        pid, encoded = str(job.get('id') or ''), job.get('state')
        if not pid or not isinstance(encoded, str):
            raise ValueError('A preset pad needs its state.')
        if self.swap or self.xf:
            raise ValueError('A preset switch is on its way; preload after it.')
        if self.twin is not None and self.twin_id == pid and self.twin_path == self.e.path:
            return {'preloaded': pid, 'loadMs': 0, 'cached': True}
        began = time.perf_counter()
        self.preloading = True
        try:
            raw = base64.b64decode(encoded[3:] if encoded.startswith('z1:') else encoded, validate=True)
            if encoded.startswith('z1:'):
                inflater = zlib.decompressobj()
                raw = inflater.decompress(raw, 64 * 1024 * 1024 + 1)
                if len(raw) > 64 * 1024 * 1024 or not inflater.eof:
                    raise ValueError('Expanded preset exceeds 64 MB.')
            with self.twin_lock:
                if self.twin is None or self.twin_path != self.e.path:
                    location = Path(self.e.path)
                    if os.name == 'nt' and location.is_dir():
                        binaries = list((location / 'Contents' / 'x86_64-win').glob('*.vst3'))
                        if len(binaries) != 1:
                            raise ValueError('Expected one Windows x64 plugin binary.')
                        location = binaries[0]
                    name = self.e.plugin.name
                    self.twin = pb.load_plugin(str(location), plugin_name=name, initialization_timeout=2)
                    self.twin_path = self.e.path
                self.twin_id = None
                self.twin.raw_state = raw
                # warm it at the stream's own rate and block size, so its first live block costs what any block costs
                frames, rate = self.e.frames, self.e.rate
                self.twin([(bytes([0xB0, 123, 0]), 0.0)], duration=frames / rate, sample_rate=rate, num_channels=2, buffer_size=frames, reset=True)
                for _ in range(3):
                    self.twin([], duration=frames / rate, sample_rate=rate, num_channels=2, buffer_size=frames, reset=False)
                self.twin_id = pid
                # (round 64, vstembed64) the twin's controls indexed here, off the audio thread, for the switch (e.adopt)
                self.twin_index = self.e.index_of(self.twin) if hasattr(self.e, 'index_of') else None
        finally:
            self.preloading = False
        self.twin_load_ms = round((time.perf_counter() - began) * 1000)
        return {'preloaded': pid, 'loadMs': self.twin_load_ms}

    # ---------- the audio worker's two hooks ----------
    def render(self, messages):
        """Replaces the plain plugin call while a set is open: carries a pending switch out at its sample."""
        e, np = self.e, self.np
        frames, rate, pos = e.frames, e.rate, e.position
        sw, xf = self.swap, self.xf
        kw = dict(duration=frames / rate, sample_rate=rate, num_channels=2, buffer_size=frames, reset=False)
        if sw and xf is None and sw['at'] < pos + frames and self.twin is not None and not self.preloading:
            off = max(0, sw['at'] - pos)
            before = [(m, o) for m, o in messages if round(o * rate) < off]
            after = [(m, o) for m, o in messages if round(o * rate) >= off]
            self.track(before)
            carry = [(bytes([0x90, n, v]), off / rate) for n, v in self.held.items()]
            self.track(after)
            old, new = e.plugin, self.twin
            with self.twin_lock:
                a = old(before, **kw)
                b = new(carry + after, **kw)
                if hasattr(e, 'adopt'):  # (round 64, vstembed64) the twin's index was made at preload: nothing built here
                    old_index = e.index
                    e.adopt(new, getattr(self, 'twin_index', None))
                    self.twin_index = old_index
                else:
                    e.plugin, e.parameters = new, new.parameters     # the switch: from here the twin is the instrument
                self.twin, self.twin_id = old, self.current_id
            previous, self.current_id = self.current_id, sw['id']
            if sw.get('fx') is not None:
                self.inst_knob.set(sw['fx'])
            self.swap = None
            self.xf = {'old': old, 'start': pos + off}
            self.swaps.append({'id': sw['id'], 'from': previous, 'at': pos + off, **self.where(pos + off)})
            self.note('switch', id=sw['id'], at=pos + off)
            return self.blend(a, b, pos, frames)
        self.track(messages)
        b = e.plugin(messages, **kw)
        if xf is not None:
            end = xf['start'] + XFADE
            last = end <= pos + frames
            a = xf['old']([(bytes([0xB0, 123, 0]), (frames - 1) / rate), (bytes([0xB0, 120, 0]), (frames - 1) / rate)] if last else [], **kw)
            return self.blend(a, b, pos, frames)
        return b

    def blend(self, a, b, pos, frames):
        np, xf = self.np, self.xf
        t = (np.arange(pos, pos + frames) - xf['start']) / XFADE
        w = np.clip(t, 0.0, 1.0).astype(np.float32)
        if pos + frames >= xf['start'] + XFADE:
            self.xf = None
        return a * (1 - w) + b * w

    def track(self, messages):
        for m, _ in messages:
            kind = m[0] & 0xF0
            if kind == 0x90 and len(m) > 2 and m[2]:
                self.held[m[1]] = m[2]
            elif kind == 0x80 or (kind == 0x90 and len(m) > 2):
                self.held.pop(m[1], None)
            elif kind == 0xB0 and len(m) > 1 and m[1] in (120, 123):
                self.held.clear()

    def mix(self, block):
        """After the instrument's block (and parkjam62's loop recorder): the synth's knob, the clips, the panic fade, the
        run recorder. Returns the block Hearth hears."""
        e, np = self.e, self.np
        frames, rate, pos = e.frames, e.rate, e.position
        end = pos + frames
        out = self.inst_knob.process(block, rate) if self.inst_knob.value else block
        out = np.array(out, dtype=np.float32, copy=True)
        stop_fade = max(1, int(STOP_FADE_S * rate))
        for c in list(self.clips.values()):
            if c.state == 'stopped' or c.start_at is None or c.start_at >= end:
                continue
            if c.state == 'queued':
                c.state = 'playing'
            a = max(pos, c.start_at)
            b = end if c.stop_at is None else min(end, c.stop_at + stop_fade)
            if not c.loop:
                b = min(b, c.start_at + c.length)
            if b > a:
                idx = np.arange(a, b) - c.start_at
                seg = c.audio[:, idx % c.length if c.loop else idx]
                env = np.ones(b - a, dtype=np.float32)
                if idx[0] < EDGE:
                    env *= np.clip(idx / EDGE, 0.0, 1.0)
                if c.stop_at is not None:
                    env *= np.clip(1.0 - (np.arange(a, b) - c.stop_at) / stop_fade, 0.0, 1.0)
                seg = seg * (env * c.gain)
                if c.knob.value:
                    seg = c.knob.process(np.ascontiguousarray(seg, dtype=np.float32), rate)
                out[:, a - pos:b - pos] += seg
            if (c.stop_at is not None and end >= c.stop_at + stop_fade) or (not c.loop and end >= c.start_at + c.length):
                c.state, c.start_at, c.stop_at = 'stopped', None, None
        if self.panic_at is not None and self.panic_at < end:
            g = np.clip(1.0 - (np.arange(pos, end) - self.panic_at) / self.panic_len, 0.0, 1.0).astype(np.float32)
            out *= g
            if end >= self.panic_at + self.panic_len:
                for c in self.clips.values():
                    c.state, c.start_at, c.stop_at = 'stopped', None, None
                self.panic_at = None
                e.sequence, e.seq_release = None, True
                e.active_notes.clear()
                try:
                    e.events.put_nowait(bytes([0xB0, 123, 0]))
                except queue.Full:
                    pass
        run = self.run
        if run is not None and not run['done'] and run['rate'] == rate and end > run['from']:
            try:
                run['queue'].put_nowait(out[:, max(0, run['from'] - pos):].copy())
            except queue.Full:
                self.run['dropped'] += 1
        return out

    # ---------- the run recorder ----------
    def run_start(self, job):
        if self.run is not None and not self.run['done']:
            raise ValueError('A run is already being recorded.')
        if not self.e.running.is_set():
            raise ValueError('Start live audio first.')
        path = Path(str(job.get('output') or ''))
        if not path.name.lower().endswith('.wav'):
            raise ValueError('The run is recorded to a WAV file.')
        part = path.with_name(path.name + '.part')
        run = {'path': path, 'part': part, 'rate': self.e.rate, 'frames': 0, 'peak': 0.0, 'levels': [], 'acc': 0.0, 'accn': 0,
               'queue': queue.Queue(maxsize=4096), 'done': False, 'dropped': 0, 'kind': str(job.get('kind') or 'Rehearsal')[:20],
               'from': self.earliest(), 'shift': 0, 'logFrom': len(self.log), 'started': time.time(), 'error': ''}
        self.note('run', run=run['kind'])

        def write():
            np = self.np
            try:
                with wave.open(str(part), 'wb') as w:
                    w.setnchannels(2)
                    w.setsampwidth(2)
                    w.setframerate(int(run['rate']))
                    while True:
                        try:
                            block = run['queue'].get(timeout=.1)
                        except queue.Empty:
                            if run['done']:
                                break
                            continue
                        if block is None:
                            break
                        if run['frames'] >= MAX_RUN_S * run['rate']:
                            continue
                        w.writeframes((np.clip(block.T, -1, 1) * 32767).astype('<i2').tobytes())
                        run['frames'] += block.shape[1]
                        run['peak'] = max(run['peak'], float(np.max(np.abs(block))))
                        run['acc'] += float(np.sum(block.astype(np.float64) ** 2))
                        run['accn'] += block.size
                        if run['accn'] >= run['rate'] * 2 * 10:      # one RMS level per 10 s for the proof
                            run['levels'].append(round(10 * math.log10(run['acc'] / run['accn'] + 1e-12), 1))
                            run['acc'], run['accn'] = 0.0, 0
            except Exception as error:
                run['error'] = str(error)[:300]
        run['thread'] = threading.Thread(target=write, daemon=True)
        run['thread'].start()
        self.run = run
        return {'recording': True, 'kind': run['kind']}

    def run_stop(self):
        run = self.run
        if run is None:
            raise ValueError('No run is being recorded.')
        run['done'] = True
        try:
            run['queue'].put(None, timeout=1)
        except queue.Full:
            pass
        run['thread'].join(timeout=10)
        self.run = None
        if run['error']:
            raise ValueError('The run could not be written: ' + run['error'])
        if run['accn']:
            run['levels'].append(round(10 * math.log10(run['acc'] / run['accn'] + 1e-12), 1))
        os.replace(run['part'], run['path'])
        log = self.log[run['logFrom']:]
        return {'path': str(run['path']), 'kind': run['kind'], 'seconds': run['frames'] / run['rate'], 'sampleRate': run['rate'],
                'peak': round(run['peak'], 5), 'silent': run['peak'] < 1e-4, 'levels': run['levels'][:300], 'dropped': run['dropped'],
                'startedAt': run['started'], 'events': [{k: v for k, v in x.items() if k != 'at'} for x in log][:2000],
                'bars': max(1, int(math.ceil(run['frames'] / (self.spb() * self.beats))))}

    def status(self):
        e = self.e
        pos = e.position
        run = self.run
        return {'open': self.active, 'bpm': self.bpm, 'beats': self.beats, 'origin': self.origin, 'position': pos, 'rate': e.rate,
                'quantize': self.quantize, **self.where(pos),
                'pads': {k: {'state': c.state, 'at': c.start_at if c.state == 'queued' else c.stop_at if c.state == 'stopping' else None,
                             'fx': c.knob.value, 'seconds': c.length / e.rate, 'loop': c.loop} for k, c in self.clips.items()},
                'current': self.current_id, 'twin': self.twin_id, 'preloading': self.preloading, 'twinLoadMs': self.twin_load_ms,
                'switch': dict(self.swap, **self.where(self.swap['at'])) if self.swap else None, 'swaps': self.swaps[-8:],
                'synthFx': self.inst_knob.value, 'panic': self.panic_at is not None,
                'run': {'recording': True, 'kind': run['kind'], 'seconds': run['frames'] / run['rate'], 'peak': run['peak'], 'dropped': run['dropped']} if run else None,
                'underruns': e.underruns, 'latencyMs': round(float(e.audio.latency) * 1000 + e.depth * e.frames / e.rate * 1000, 1) if e.audio else 0,
                'playing': bool(e.running.is_set()), 'error': self.last_error or e.error}

    def on_stop(self):
        """Live audio stopped (Pause, a device / buffer change, the desk closing): clips stop and the bars count again from
        the next start (the stream's sample count restarts). A run being recorded stays open: it simply gets no blocks
        until the sound is back, and 'run-stop' still writes it."""
        for c in self.clips.values():
            c.state, c.start_at, c.stop_at = 'stopped', None, None
        self.swap, self.xf, self.panic_at = None, None, None
        self.held.clear()
        self.origin = 0
        if self.run is not None and not self.run['done']:
            self.run['from'], self.run['shift'] = 0, self.run['frames'] + self.run['queue'].qsize() * self.e.frames

    def close(self):
        if self.run is not None:
            try:
                self.run_stop()
            except Exception:
                pass
        self.active = False
        self.clips.clear()
        self.swap, self.xf, self.panic_at = None, None, None
        with self.twin_lock:
            self.twin, self.twin_id, self.twin_path = None, None, None   # the second instance's memory goes back
        self.inst_knob = Knob()
        self.held.clear()
