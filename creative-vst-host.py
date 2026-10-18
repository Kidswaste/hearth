"""Persistent, isolated Serum 2 / Vital host. Authenticated loopback control only.
Audio is generated continuously in short blocks; PortAudio only copies queued PCM.

(round 61, vstlive61) Live mode, additive to Codex's design (docs/upgrades/vstlive61.md):
- one host process per open instrument (creative-vstmain.js pool), the instrument loaded once and kept;
- PortAudio from sounddevice's Windows wheel, which bundles an ASIO-enabled DLL (SD_ENABLE_ASIO, set by Hearth):
  ASIO devices (the Universal Audio driver) are listed and opened directly; WASAPI exclusive / shared as well;
- the render-ahead queue holds ~5 ms (adaptive on underruns) instead of a fixed 2 blocks + 1;
- the owner's MIDI controller is read in THIS process (WinMM on Windows, python-rtmidi elsewhere when installed), so
  notes reach the plugin without passing through Hearth's window;
- a sample-accurate phrase sequencer runs in the audio thread (Hearth only sends the pattern once);
- each connection gets its own thread and a persistent "stream" connection carries notes / knob moves without a
  reply, so a slow snapshot never delays a note;
- parameter reads for the desk hold the plugin lock per control, so reading Serum 2's controls doesn't stop audio;
- gain changes ramp per block, Stop fades out over one block, DSP load / latency / underruns are reported.

(round 62, parkjam62) Capture the moment (docs/upgrades/parkjam62.md): a 1–16 bar loop recorder in the audio thread.
'record' arms a take (bars × beats at a BPM, from now or from the first note played), the worker keeps the
instrument's own output (before the monitor volume) and every note that reached the plugin (Hearth's keys, the
controller, phrases) with its sample position; 'record-take' writes the WAV (16-bit) and returns the notes.
"""
import base64
import importlib.util
import json
import math
import os
import queue
import socket
import sys
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('offline', Path(__file__).with_name('creative-vst-offline.py'))
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)
# (round 64, liveset64) the Live set's transport / clips / preset twin / run recorder (docs/upgrades/liveset64.md)
spec = importlib.util.spec_from_file_location('liveset', Path(__file__).with_name('creative-vst-liveset.py'))
liveset = importlib.util.module_from_spec(spec)
spec.loader.exec_module(liveset)

BUFFERS = (64, 128, 256, 512, 1024)  # (round 61) 64–512 for live play; 1024 kept from Codex's first version
AHEAD_MS = 5.0  # (round 61) audio rendered ahead of the device: enough for a Python thread's wake-up, small to feel


def identity(path):
    name = Path(path).name.lower().replace(' ', '')
    allowed = {'vital.vst3': 'Vital', 'serum2.vst3': 'Serum 2'}
    if name not in allowed:
        raise ValueError('Only Serum 2 and Vital are supported.')
    return allowed[name]


class MidiInputs:
    """(round 61, vstlive61) The owner's controller → the plugin, inside the host process.
    Windows: WinMM through ctypes (no extra package; a port another program holds open is skipped with its name).
    Elsewhere: python-rtmidi if it is installed. Channel messages only (notes, CC, pitch bend, pressure, program)."""

    def __init__(self, sink):
        self.sink = sink
        self.handles = {}
        self.events = 0
        self.last = ''
        self.failed = []
        self.backend = None
        self._win = None
        if sys.platform == 'win32':
            self.backend = 'winmm'
        else:
            try:
                import rtmidi  # noqa: F401  (optional; not installed by Hearth's setup)
                self.backend = 'rtmidi'
            except Exception:
                self.backend = None

    def feed(self, data):
        if not data or data[0] < 0x80 or data[0] >= 0xF0:
            return
        kind = data[0] & 0xF0
        message = bytes(data[:2] if kind in (0xC0, 0xD0) else data[:3])
        self.events += 1
        if kind == 0x90 and len(message) == 3 and message[2]:
            self.last = 'note %d' % message[1]
        elif kind == 0xB0:
            self.last = 'CC %d' % message[1]
        self.sink(message)

    def _winmm(self):
        if self._win:
            return self._win
        import ctypes
        from ctypes import wintypes
        winmm = ctypes.WinDLL('winmm')

        class CAPS(ctypes.Structure):
            _fields_ = [('wMid', wintypes.WORD), ('wPid', wintypes.WORD), ('vDriverVersion', wintypes.UINT),
                        ('szPname', wintypes.WCHAR * 32), ('dwSupport', wintypes.DWORD)]
        proc_type = ctypes.WINFUNCTYPE(None, wintypes.HANDLE, wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)
        winmm.midiInGetNumDevs.restype = wintypes.UINT
        winmm.midiInGetDevCapsW.argtypes = [ctypes.c_size_t, ctypes.POINTER(CAPS), wintypes.UINT]
        winmm.midiInOpen.argtypes = [ctypes.POINTER(wintypes.HANDLE), wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, wintypes.DWORD]
        for name in ('midiInStart', 'midiInStop', 'midiInReset', 'midiInClose'):
            getattr(winmm, name).argtypes = [wintypes.HANDLE]

        def on_message(handle, message, instance, param1, param2):
            if message == 0x3C3:  # MIM_DATA: status | data1 << 8 | data2 << 16
                self.feed(bytes([param1 & 0xFF, (param1 >> 8) & 0x7F, (param1 >> 16) & 0x7F]))
        self._win = {'ctypes': ctypes, 'wintypes': wintypes, 'dll': winmm, 'caps': CAPS, 'proc': proc_type(on_message)}
        return self._win

    def ports(self):
        try:
            if self.backend == 'winmm':
                w = self._winmm()
                names = []
                for i in range(w['dll'].midiInGetNumDevs()):
                    caps = w['caps']()
                    if w['dll'].midiInGetDevCapsW(i, w['ctypes'].byref(caps), w['ctypes'].sizeof(caps)) == 0:
                        names.append(caps.szPname)
                return names
            if self.backend == 'rtmidi':
                import rtmidi
                probe = rtmidi.MidiIn()
                try:
                    return list(probe.get_ports())
                finally:
                    probe.delete() if hasattr(probe, 'delete') else None
        except Exception:
            return []
        return []

    def open(self, which):
        """which: 'all' (default), 'off', or one port name. Returns the names actually opened."""
        self.close()
        if which == 'off' or not self.backend:
            return []
        for index, name in enumerate(self.ports()):
            if which not in (None, '', 'all') and name != which:
                continue
            try:
                if self.backend == 'winmm':
                    w = self._winmm()
                    handle = w['wintypes'].HANDLE()
                    callback = w['ctypes'].cast(w['proc'], w['ctypes'].c_void_p).value
                    if w['dll'].midiInOpen(w['ctypes'].byref(handle), index, callback, 0, 0x30000) != 0:  # CALLBACK_FUNCTION
                        raise OSError('in use by another program')
                    w['dll'].midiInStart(handle)
                    self.handles[name] = handle
                else:
                    import rtmidi
                    port = rtmidi.MidiIn()
                    port.ignore_types(sysex=True, timing=True, active_sense=True)
                    port.open_port(index)
                    port.set_callback(lambda event, data=None: self.feed(event[0]))
                    self.handles[name] = port
            except Exception as error:
                self.failed.append('%s (%s)' % (name, str(error)[:80]))
        return list(self.handles)

    def close(self):
        for name, handle in list(self.handles.items()):
            try:
                if self.backend == 'winmm':
                    dll = self._winmm()['dll']
                    dll.midiInStop(handle)
                    dll.midiInReset(handle)
                    dll.midiInClose(handle)
                else:
                    handle.close_port()
            except Exception:
                pass
        self.handles = {}
        self.failed = []

    def stats(self):
        return {'backend': self.backend, 'open': list(self.handles), 'events': self.events, 'last': self.last,
                'failed': self.failed[:4]}


class Engine:
    def __init__(self):
        import numpy as np
        self.np = np
        self.plugin = None
        self.parameters = {}
        self.path = None
        self.lock = threading.RLock()
        self.control = threading.RLock()  # (round 61) start / stop from concurrent connections, one at a time
        self.audio = None
        self.worker = None
        self.running = threading.Event()
        self.events = queue.Queue(maxsize=1024)
        self.blocks = queue.Queue(maxsize=2)
        self.gain = .2
        self.frames = 512
        self.rate = 48000
        self.device = None
        self.peak = 0.0
        self.underruns = 0
        self.processed = 0
        self.error = ''
        self.editor = False
        self.editor_requested = False
        self.last_control = time.monotonic()
        self.active_notes = set()
        self.process_ms = 0.0
        self.max_process_ms = 0.0
        # (round 61, vstlive61) live mode state
        self.exclusive = False
        self.api = ''
        self.device_name = ''
        self.depth = 1
        self.applied_gain = 0.0
        self.fading = False
        self.faded = threading.Event()
        self.load_avg = 0.0
        self.position = 0
        self.sequence = None
        self.seq_held = set()
        self.seq_release = False
        self.setup = None
        self.midi_choice = 'all'
        self.midi = MidiInputs(self.from_controller)
        self.editor_closes = 0
        self.stream_errors = 0
        self.last_stream_error = ''
        self.loaded_ms = 0
        self.started_ms = 0
        self.recent_underruns = []
        self.take = None  # (round 62, parkjam62) the loop being recorded (record / capture / record-take)
        self.take_note = ''
        self.liveset = liveset.LiveSet(self)  # (round 64, liveset64) idle until Hearth opens a set ('set-open')

    def from_controller(self, message):
        # Notes from the controller never touch active_notes: the stale-note guard is for Hearth's own keys only.
        if self.running.is_set():
            try:
                self.events.put_nowait(message)
            except queue.Full:
                pass

    def load(self, job):
        import pedalboard as pb
        expected = identity(job['plugin'])
        if job.get('name') and job['name'] != expected:
            raise ValueError('Only the Serum 2 and Vital instruments can be loaded.')
        if self.path == job['plugin'] and self.plugin:
            return
        if self.editor:
            raise ValueError('Close the native editor before changing instruments.')
        self.stop()
        began = time.perf_counter()
        location = Path(job['plugin'])
        if sys.platform == 'win32' and location.is_dir():
            binaries = list((location / 'Contents' / 'x86_64-win').glob('*.vst3'))
            if len(binaries) != 1:
                raise ValueError('Expected one Windows x64 plugin binary.')
            location = binaries[0]
        plugin = pb.load_plugin(str(location), plugin_name=expected, initialization_timeout=2)
        if plugin.name != expected or not plugin.is_instrument:
            raise ValueError('This file is not the supported instrument.')
        self.plugin, self.path = plugin, job['plugin']
        self.parameters = plugin.parameters
        # Pedalboard prepares/reloads native processors on their owning main thread.
        plugin([], duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=True)
        self.loaded_ms = round((time.perf_counter() - began) * 1000)

    def patch(self, values):
        if not isinstance(values, dict) or len(values) > 512:
            raise ValueError('Invalid parameter patch.')
        # Validate every key/value before mutating any parameter.
        for key, value in values.items():
            if key not in self.parameters:
                raise ValueError('Unknown parameter: ' + key)
            p = self.parameters[key]
            if offline.normalized_parameter(p):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                    raise ValueError('Normalized parameter outside 0–1: ' + key)
            elif p.type == bool:
                if not isinstance(value, bool):
                    raise ValueError('Expected a switch value: ' + key)
            elif p.type in (int, float):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not p.min_value <= value <= p.max_value:
                    raise ValueError('Parameter outside its range: ' + key)
            elif value not in p.valid_values:
                raise ValueError('Unknown parameter choice: ' + key)
        with self.lock:
            old = {k: float(self.parameters[k].raw_value) for k in values}
            try:
                for key, value in values.items():
                    p = self.parameters[key]
                    if offline.normalized_parameter(p):
                        p.raw_value = value
                    else:
                        setattr(self.plugin, key, value)
            except Exception:
                for key, value in old.items():
                    self.parameters[key].raw_value = value
                raise
        return {'changed': list(values)}

    def values(self, keys):
        """(round 61, vstlive61) current values of a few controls (reflects knob moves made in the native editor)."""
        if not isinstance(keys, list) or len(keys) > 512 or any(not isinstance(k, str) for k in keys):
            raise ValueError('Ask for up to 512 parameter keys.')
        out = {}
        for key in keys:
            if key not in self.parameters:
                raise ValueError('Unknown parameter: ' + key)
            with self.lock:
                entry = offline.parameter_entry(self.plugin, key, self.parameters[key])
            out[key] = {'value': entry['value'], 'display': entry['display']}
        return {'values': out}

    def schedule(self, job):
        """(round 61, vstlive61) a phrase played sample-accurately by the audio thread. notes: [{note, time, length,
        velocity?}] in seconds from now; loop: seconds (0 = once). An empty list stops the phrase (its notes released)."""
        notes = job.get('sequence') or []
        if not isinstance(notes, list) or len(notes) > 256:
            raise ValueError('A phrase has up to 256 notes.')
        if not notes:
            self.sequence = None
            self.seq_release = True
            return {'sequence': False}
        if not self.running.is_set():
            raise ValueError('Start live audio first.')
        loop = float(job.get('loop') or 0)
        if not math.isfinite(loop) or not 0 <= loop <= 64:
            raise ValueError('Loop length outside 0–64 seconds.')
        events = []
        for n in notes:
            key = int(n['note'])
            if not 0 <= key <= 127:
                raise ValueError('MIDI note outside 0–127.')
            start, length = float(n['time']), float(n['length'])
            if not (math.isfinite(start) and math.isfinite(length)) or start < 0 or length <= 0 or start > 64 or (loop and start >= loop):
                raise ValueError('Invalid note timing.')
            velocity = max(1, min(127, int(n.get('velocity', 100))))
            on, off = round(start * self.rate), round(min(start + length, loop or start + length) * self.rate) - 1
            events.append((on, bytes([0x90, key, velocity])))
            events.append((max(on + 1, off), bytes([0x80, key, 0])))
        events.sort(key=lambda e: (e[0], e[1][0] == 0x90))  # offs before ons at the same sample
        span = max(t for t, _ in events) + 1
        self.seq_release = True  # release the previous phrase's notes
        self.sequence = {'start': self.position + self.frames, 'loop': round(loop * self.rate), 'events': events, 'span': span}
        return {'sequence': True, 'notes': len(notes)}

    def due(self, pos, frames):
        seq = self.sequence
        if not seq:
            return []
        start, length, events, span = seq['start'], seq['loop'], seq['events'], seq['span']
        end, out = pos + frames, []
        if length:
            k0, k1 = max(0, (pos - start - span) // length), max(0, (end - start) // length)
        else:
            k0 = k1 = 0
        for k in range(int(k0), int(k1) + 1):
            base = start + k * length
            for t, message in events:
                at = base + t
                if pos <= at < end:
                    out.append((message, (at - pos) / self.rate))
                    (self.seq_held.add if message[0] == 0x90 else self.seq_held.discard)(message[1])
        if not length and end - start >= span and self.sequence is seq:
            self.sequence = None
        return out

    def produce(self):
        np = self.np
        try:
            while self.running.is_set():
                messages = []
                while True:
                    try:
                        messages.append((self.events.get_nowait(), 0.0))
                    except queue.Empty:
                        break
                if self.seq_release:
                    self.seq_release = False
                    messages.extend((bytes([0x80, n, 0]), 0.0) for n in self.seq_held)
                    self.seq_held.clear()
                messages.extend(self.due(self.position, self.frames))
                # A renderer crash/lost focus cannot leave notes sounding forever.
                # (round 61) Hearth's own held keys are released one by one (CC 123 would also cut the controller's).
                if self.active_notes and time.monotonic() - self.last_control > 5:
                    messages.extend((bytes([0x80, n, 0]), 0.0) for n in list(self.active_notes))
                    self.active_notes.clear()
                with self.lock:
                    began = time.perf_counter()
                    # (round 64, liveset64) with a set open, a preset switch is carried out at its exact sample here
                    block = self.liveset.render(messages) if self.liveset.active else self.plugin(messages, duration=self.frames / self.rate, sample_rate=self.rate,
                                        num_channels=2, buffer_size=self.frames, reset=False)
                    self.process_ms = (time.perf_counter() - began) * 1000
                    self.max_process_ms = max(self.max_process_ms, self.process_ms)
                if block.shape != (2, self.frames) or not np.isfinite(block).all():
                    raise ValueError('Plugin returned an invalid live audio block.')
                if self.take is not None:
                    self.capture(block, messages)  # (round 62, parkjam62) the loop recorder keeps this block
                if self.liveset.active:
                    block = self.liveset.mix(block)  # (round 64, liveset64) clips, pad knobs, panic fade, the run recorder
                self.position += self.frames
                self.load_avg = self.load_avg * .9 + .1 * self.process_ms / (self.frames / self.rate * 1000)
                self.peak = float(np.max(np.abs(block)))
                self.processed += 1
                # (round 61) the gain ramps across the block (no zipper noise); a Stop fades this block to silence.
                target = 0.0 if self.fading else self.gain
                ramp = np.linspace(self.applied_gain, target, self.frames, dtype=np.float32)[:, None]
                self.applied_gain = target
                pcm = np.ascontiguousarray(np.clip(block.T * ramp, -.98, .98), dtype=np.float32)
                while self.running.is_set():
                    try:
                        self.blocks.put(pcm, timeout=.05)
                        break
                    except queue.Full:
                        continue
                if self.fading:
                    self.faded.set()
        except Exception as error:
            self.error = str(error)[:500]
            self.running.clear()

    def choose(self, sd, device, exclusive):
        """(round 61, vstlive61) the stream settings this device accepts: ASIO and WASAPI exclusive run at the device's
        own rate (the UA Console's rate for an Apollo / Volt); shared streams prefer 48 kHz like Codex's first version."""
        info = sd.query_devices(device, kind='output')
        api = sd.query_hostapis(info['hostapi'])['name']
        extra = None
        if exclusive:
            if api != 'Windows WASAPI':
                raise ValueError('Exclusive mode is a WASAPI option; choose the WASAPI entry of this interface.')
            extra = sd.WasapiSettings(exclusive=True)
        own = int(info.get('default_samplerate') or 48000)
        rates = [own, 48000, 44100] if exclusive or api == 'ASIO' else [48000, own, 44100]
        last = None
        for rate in dict.fromkeys(rates):
            try:
                sd.check_output_settings(device=device, channels=2, dtype='float32', samplerate=rate, extra_settings=extra)
                return info, api, extra, rate
            except Exception as error:
                last = error
        raise ValueError('%s refused stereo float audio at %s Hz: %s' % (info['name'], '/'.join(str(r) for r in dict.fromkeys(rates)), str(last)[:200]))

    def start(self, job):
        with self.control:
            sd = offline.import_sounddevice()
            frames = int(job.get('buffer', 512))
            if frames not in BUFFERS:
                raise ValueError('Choose a 64, 128, 256, 512 or 1024 sample buffer.')
            gain = float(job.get('gain', .2))
            if not math.isfinite(gain) or not 0 <= gain <= .5:
                raise ValueError('Volume outside 0–0.5.')
            device = job.get('device')
            if device is not None:
                device = int(device)
            exclusive = bool(job.get('exclusive'))
            midi = job.get('midiIn') or self.midi_choice
            # (round 61) the same settings while running: only the volume changes; other settings restart the stream.
            if self.audio and self.running.is_set():
                if self.setup == (device, exclusive, frames):
                    self.gain = gain
                    if midi != self.midi_choice:
                        self.midi_choice = midi
                        self.midi.open(midi)
                    return self.stats()
            self.stop()
            began = time.perf_counter()
            info, api, extra, rate = self.choose(sd, device, exclusive)
            self.frames, self.rate, self.gain, self.device, self.exclusive = frames, rate, gain, device, exclusive
            self.api, self.device_name = api, info['name']
            self.depth = max(1, math.ceil(AHEAD_MS / (frames / rate * 1000)))
            with self.blocks.mutex:
                self.blocks.maxsize = self.depth
            self.error, self.underruns, self.processed = '', 0, 0
            self.process_ms, self.max_process_ms, self.load_avg = 0.0, 0.0, 0.0
            self.applied_gain, self.fading, self.position, self.recent_underruns = 0.0, False, 0, []
            self.last_control = time.monotonic()

            def callback(out, frames, timing, status):
                if status:
                    self.underruns += 1
                try:
                    block = self.blocks.get_nowait()
                    if len(block) == frames:
                        out[:] = block
                    else:
                        out.fill(0)
                        self.underruns += 1
                except queue.Empty:
                    out.fill(0)
                    self.underruns += 1
            self.audio = sd.OutputStream(samplerate=rate, channels=2, dtype='float32', blocksize=frames,
                                         device=device, latency='low', callback=callback, extra_settings=extra)
            self.running.set()
            self.worker = threading.Thread(target=self.produce, daemon=True)
            self.worker.start()
            deadline = time.monotonic() + 2
            while self.blocks.qsize() < self.depth and self.running.is_set() and time.monotonic() < deadline:
                time.sleep(.002)
            try:
                if not self.running.is_set():
                    raise ValueError(self.error)
                self.audio.start()
            except Exception:
                self.stop()
                raise
            self.setup = (device, exclusive, frames)
            self.midi_choice = midi
            self.midi.open(midi)
            self.started_ms = round((time.perf_counter() - began) * 1000)
            return self.stats()

    def stop(self):
        with self.control:
            self.midi.close()
            # (round 61) one faded block before the device stops: no click on Stop / device change.
            if self.audio and self.running.is_set() and getattr(self.audio, 'active', False):
                self.faded.clear()
                self.fading = True
                self.faded.wait(timeout=.2)
                time.sleep(min(.12, (self.depth + 1) * self.frames / self.rate))
            self.fading = False
            self.running.clear()
            if self.audio:
                self.audio.abort()
                self.audio.close()
                self.audio = None
            if self.worker:
                self.worker.join(timeout=2)
                if self.worker.is_alive():
                    raise ValueError('Audio worker did not stop. Stop the plugin host to recover.')
                self.worker = None
            for q in (self.events, self.blocks):
                while not q.empty():
                    try:
                        q.get_nowait()
                    except queue.Empty:
                        break
            self.active_notes.clear()
            # (round 62, parkjam62) a take cut short by a stop / device change is dropped, with a reason for the desk
            if self.take is not None and not self.take['done']:
                self.take, self.take_note = None, 'Live audio stopped before the loop was finished; nothing was kept.'
            self.sequence, self.seq_release = None, False
            self.seq_held.clear()
            self.liveset.on_stop()  # (round 64, liveset64) clips stop; a run being recorded stays open
            self.setup = None
            if self.plugin and self.path:
                with self.lock:
                    self.plugin([(bytes([0xB0, 123, 0]), 0.0), (bytes([0xB0, 120, 0]), 0.0)],
                                duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=False)
            return self.stats()

    def adapt(self):
        """(round 61, vstlive61) underruns in the last 2 s → render one more block ahead (up to ~4 blocks / 8)."""
        now = time.monotonic()
        self.recent_underruns = [(t, n) for t, n in self.recent_underruns if now - t < 2] + [(now, self.underruns)]
        grew = self.recent_underruns[-1][1] - self.recent_underruns[0][1]
        if self.running.is_set() and grew > 2 and self.depth < 8:
            self.depth += 1
            with self.blocks.mutex:
                self.blocks.maxsize = self.depth
            self.recent_underruns = [(now, self.underruns)]

    def stats(self):
        playing = bool(self.running.is_set() and self.audio and self.audio.active)
        if playing:
            self.adapt()
        block_ms = self.frames / self.rate * 1000
        device_ms = float(self.audio.latency) * 1000 if self.audio else 0
        return {'playing': playing,
                'sampleRate': self.rate, 'buffer': self.frames, 'queuedMs': self.depth * block_ms,
                'deviceLatencyMs': device_ms,
                'underruns': self.underruns, 'blocks': self.processed, 'peak': self.peak,
                'processMs': self.process_ms, 'maxProcessMs': self.max_process_ms,
                'error': self.error, 'editorOpen': self.editor, 'gain': self.gain, 'device': self.device,
                # (round 61, vstlive61)
                'exclusive': self.exclusive, 'api': self.api, 'deviceName': self.device_name, 'depth': self.depth,
                'latencyMs': round(device_ms + self.depth * block_ms, 1), 'load': round(self.load_avg * 100, 1),
                'midi': self.midi.stats(), 'sequence': self.sequence is not None, 'editorCloses': self.editor_closes,
                'loadedMs': self.loaded_ms, 'startedMs': self.started_ms, 'streamErrors': self.stream_errors, 'streamError': self.last_stream_error,
                'plugin': self.path}

    # ---------- (round 62, parkjam62) the loop recorder ----------
    def record(self, job):
        """Arm a take: bars (1, 2, 4, 8, 16) × beats (2–7) at bpm (50–220), from the next block ('now') or from the
        first note played ('note'). Up to 90 s; live audio must be on (the take is what the owner hears)."""
        bars, beats, bpm = int(job.get('bars') or 4), int(job.get('beats') or 4), float(job.get('bpm') or 120)
        if bars not in (1, 2, 4, 8, 16):
            raise ValueError('Record 1, 2, 4, 8 or 16 bars.')
        if not 2 <= beats <= 7 or not math.isfinite(bpm) or not 50 <= bpm <= 220:
            raise ValueError('Tempo outside 50–220 BPM (2–7 beats a bar).')
        if not self.running.is_set():
            raise ValueError('Start live audio first.')
        total = round(bars * beats * 60 / bpm * self.rate)
        if total > 90 * self.rate:
            raise ValueError('A loop is up to 90 seconds: fewer bars or a faster tempo.')
        self.take_note = ''
        self.take = {'bars': bars, 'beats': beats, 'bpm': bpm, 'rate': self.rate, 'total': total, 'frames': 0, 'chunks': [],
                     'notes': [], 'held': {}, 'armed': job.get('wait') == 'note', 'done': False, 'peak': 0.0, 'started': None}
        return self.take_status()

    def capture(self, block, messages):
        """Called by the audio worker after each block: keeps the block (from the first note when armed) and the notes."""
        take = self.take
        if take is None or take['done']:
            return
        start = 0
        if take['armed']:
            ons = [round(offset * self.rate) for message, offset in messages if len(message) == 3 and message[0] & 0xF0 == 0x90 and message[2]]
            if not ons:
                return
            start, take['armed'] = min(ons), False
        if take['started'] is None:
            take['started'] = time.time()
        base = take['frames'] - start
        for message, offset in messages:
            at = round(offset * self.rate)
            if at < start or len(message) < 3:
                continue
            t, kind, key = base + at, message[0] & 0xF0, message[1]
            if t >= take['total']:
                continue
            if kind == 0x90 and message[2]:
                if key in take['held']:
                    self.close_note(take, key, t)
                take['held'][key] = (t, message[2])
            elif (kind == 0x80 or kind == 0x90) and key in take['held']:
                self.close_note(take, key, t)
        part = block[:, start:start + take['total'] - take['frames']]
        take['chunks'].append(part)
        take['frames'] += part.shape[1]
        take['peak'] = max(take['peak'], float(self.np.max(self.np.abs(part))) if part.size else 0.0)
        if take['frames'] >= take['total']:
            for key in list(take['held']):
                self.close_note(take, key, take['total'])
            take['done'] = True

    @staticmethod
    def close_note(take, key, end):
        start, velocity = take['held'].pop(key)
        if len(take['notes']) < 4096:
            take['notes'].append({'note': key, 'time': start / take['rate'], 'length': max(1, end - start) / take['rate'], 'velocity': velocity})

    def take_status(self):
        take = self.take
        if take is None:
            return {'recording': False, 'done': False, 'note': self.take_note}
        return {'recording': not take['done'], 'armed': take['armed'], 'done': take['done'], 'bars': take['bars'], 'beats': take['beats'],
                'bpm': take['bpm'], 'seconds': take['total'] / take['rate'], 'progress': round(take['frames'] / take['total'], 4),
                'notes': len(take['notes']) + len(take['held']), 'note': self.take_note}

    def record_take(self, job):
        """The finished take as a 16-bit stereo WAV at job['output'] (Hearth reads it), plus its notes."""
        import wave
        take = self.take
        if take is None or not take['done']:
            raise ValueError('No finished loop yet.' if take is None else 'The loop is still recording.')
        self.take = None
        np = self.np
        audio = np.concatenate(take['chunks'], axis=1) if take['chunks'] else np.zeros((2, 0), dtype=np.float32)
        pcm = (np.clip(audio.T, -1, 1) * 32767).astype('<i2')
        with wave.open(str(job['output']), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(int(take['rate']))
            w.writeframes(pcm.tobytes())
        notes = sorted(take['notes'], key=lambda n: (n['time'], n['note']))
        return {'bars': take['bars'], 'beats': take['beats'], 'bpm': take['bpm'], 'sampleRate': take['rate'], 'frames': int(pcm.shape[0]),
                'seconds': pcm.shape[0] / take['rate'], 'peak': round(take['peak'], 5), 'silent': take['peak'] < 1e-4, 'notes': notes,
                'startedAt': take['started']}

    def devices(self):
        """(round 61, vstlive61) every stereo output with its host API (ASIO listed when the ASIO DLL is loaded), plus
        the controller inputs. Hearth's renderer orders them (tools/workbench-vst-live.js: ASIO / UA first)."""
        sd = offline.import_sounddevice()
        apis = sd.query_hostapis()
        devices = []
        for i, d in enumerate(sd.query_devices()):
            if d['max_output_channels'] < 2:
                continue
            api = apis[d['hostapi']]
            devices.append({'id': i, 'name': d['name'], 'api': api['name'], 'outputs': d['max_output_channels'],
                            'rate': d.get('default_samplerate'), 'lowMs': round(float(d.get('default_low_output_latency') or 0) * 1000, 1),
                            'default': api.get('default_output_device') == i})
        try:
            default_name = sd.query_devices(kind='output')['name'].strip()
            preferred = next((d['id'] for d in devices if d['api'] == 'Windows WASAPI' and d['name'].startswith(default_name)), None)
        except Exception:
            preferred = None
        return {'devices': devices, 'preferred': preferred, 'asio': any(a['name'] == 'ASIO' for a in apis),
                'asioDll': 'SD_ENABLE_ASIO' in os.environ, 'midiInputs': self.midi.ports(), 'midiBackend': self.midi.backend}

    def command(self, job):
        action = job['action']
        self.last_control = time.monotonic()
        if action == 'devices':
            return self.devices()
        if action == 'live-status':
            return self.stats()
        if action == 'live-stop':
            return self.stop()
        if action == 'record-status':  # (round 62, parkjam62)
            return self.take_status()
        if action == 'record-cancel':
            self.take, self.take_note = None, ''
            return self.take_status()
        if action == 'record-take':
            return self.record_take(job)
        if not self.plugin or self.path != job.get('plugin'):
            raise ValueError('Load the selected instrument first.')
        if action in liveset.ACTIONS:  # (round 64, liveset64)
            return self.liveset.command(action, job)
        if action in ('live-start', 'open'):
            return self.start(job)
        if action == 'midi':
            if not self.running.is_set():
                raise ValueError('Start live audio first.')
            note = int(job.get('note', 60))
            if not 0 <= note <= 127:
                raise ValueError('MIDI note outside 0–127.')
            on = bool(job.get('on', False))
            velocity = max(1, min(127, int(job.get('velocity', 100))))
            self.events.put_nowait(bytes([0x90 if on else 0x80, note, velocity if on else 0]))
            (self.active_notes.add if on else self.active_notes.discard)(note)
            return {'note': note, 'on': on}
        if action == 'panic':
            if self.running.is_set():
                self.events.put_nowait(bytes([0xB0, 123, 0]))
            self.active_notes.clear()
            self.sequence, self.seq_release = None, True
            return {'silenced': True}
        if action == 'volume':
            gain = float(job['gain'])
            if not math.isfinite(gain) or not 0 <= gain <= .5:
                raise ValueError('Volume outside 0–0.5.')
            self.gain = gain
            return {'gain': self.gain}
        if action == 'patch':
            return self.patch(job.get('parameters', {}))
        if action == 'values':
            return self.values(job.get('keys', []))
        if action == 'sequence':
            return self.schedule(job)
        if action == 'record':  # (round 62, parkjam62)
            return self.record(job)
        if action == 'midi-in':
            self.midi_choice = job.get('midiIn') or 'all'
            opened = self.midi.open(self.midi_choice) if self.running.is_set() else []
            return {'midiIn': self.midi_choice, 'open': opened}
        if action in ('inspect', 'snapshot', 'render'):
            if self.editor:
                raise ValueError('Close the native editor before capturing, recalling or exporting a patch.')
            # (round 61) reading controls / recalling a patch keeps the audio running: the plugin lock is held per
            # native call (offline.run's guard). Only an offline bounce needs the instance to itself.
            if action != 'render':
                return offline.run({**job, 'action': 'inspect'}, self.plugin, guard=self.lock)
            # Full parameter enumeration is slow; live controls use the fast patch action instead.
            was_playing = self.running.is_set()
            was = {'gain': self.gain, 'buffer': self.frames, 'device': self.device, 'exclusive': self.exclusive, 'midiIn': self.midi_choice}
            if was_playing:
                self.stop()
            try:
                with self.lock:
                    output = offline.run({**job, 'action': 'render'}, self.plugin)
                output['audio'] = base64.b64encode(Path(job['output']).read_bytes()).decode('ascii')
                self.plugin([], duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=True)
                return output
            finally:
                if was_playing:
                    self.start(was)
        raise ValueError('Unknown live host action.')


STREAMED = ('midi', 'patch', 'volume', 'panic', 'sequence') + liveset.STREAMED  # (round 61) fire-and-forget on the stream connection · (round 64, liveset64) pad presses


def serve(config, response):
    engine = Engine()
    main_tasks = queue.Queue()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('127.0.0.1', 0))
    server.listen(16)
    response.write_text(json.dumps({'ok': True, 'port': server.getsockname()[1]}), encoding='utf-8')

    def on_main(action, job):
        done = queue.Queue(maxsize=1)
        main_tasks.put((action, job, done))
        result = done.get(timeout=90)
        if isinstance(result, Exception):
            raise result
        return result

    def stream(conn, rest):
        """(round 61, vstlive61) one persistent connection from Hearth's main process: newline JSON jobs, no replies."""
        conn.settimeout(None)
        buffer = bytearray(rest)
        while True:
            while b'\n' in buffer:
                line, _, remainder = bytes(buffer).partition(b'\n')
                buffer = bytearray(remainder)
                try:
                    job = json.loads(line)
                    if job.get('action') not in STREAMED:
                        raise ValueError('Not a streamed action.')
                    engine.command(job)
                except Exception as error:
                    engine.stream_errors += 1
                    engine.last_stream_error = str(error)[:300]
            block = conn.recv(65536)
            if not block:
                return
            buffer.extend(block)
            if len(buffer) > 4_000_000:
                return

    def handle(conn):
        with conn:
            try:
                conn.settimeout(120)
                payload = bytearray()
                while b'\n' not in payload:
                    block = conn.recv(65536)
                    if not block:
                        raise ValueError('Incomplete request.')
                    payload.extend(block)
                    if len(payload) > 16_000_000:
                        raise ValueError('Request too large.')
                first, _, rest = bytes(payload).partition(b'\n')
                job = json.loads(first)
                if job.pop('token', None) != config['token']:
                    raise ValueError('Invalid host token.')
                if job.get('action') == 'stream':
                    return stream(conn, rest)
                if job.get('plugin'):
                    identity(job['plugin'])
                    if job.get('name') not in (None, '', identity(job['plugin'])):
                        raise ValueError('Only Serum 2 and Vital instruments are allowed.')
                if job['action'] == 'names':
                    result = {'names': [identity(job['plugin'])]}
                elif job['action'] == 'status':
                    result = offline.run({'action': 'status'})
                elif job['action'] == 'editor':
                    if not engine.plugin or engine.path != job['plugin']:
                        raise ValueError('Load the instrument first.')
                    if engine.editor_requested:
                        raise ValueError('Native editor is already open.')
                    engine.editor_requested = True
                    main_tasks.put(('editor', job, None))
                    result = {'editorOpen': True}
                else:
                    if job['action'] in ('inspect', 'open') and engine.path != job.get('plugin'):
                        if engine.editor_requested:
                            raise ValueError('Close the native editor before changing instruments.')
                        on_main('load', job)
                    if job['action'] == 'open':
                        # (round 61) load (above) + live audio when asked: the first note right after opening.
                        result = {'name': identity(job['plugin']), 'loadedMs': engine.loaded_ms}
                        if job.get('live'):
                            result.update(engine.command({**job, 'action': 'live-start'}))
                    elif job['action'] in ('inspect', 'snapshot', 'render', 'preset-preload'):  # (round 64, liveset64) the twin loads on this main thread
                        if engine.editor_requested:
                            raise ValueError('Close the native editor before capturing or exporting a patch.')
                        result = on_main('command', job)
                    else:
                        result = engine.command(job)
                result = {'ok': True, **result}
            except Exception as error:
                result = {'ok': False, 'error': str(error)[:1600]}
            try:
                conn.sendall((json.dumps(result, allow_nan=False) + '\n').encode())
            except OSError:
                pass

    def request_thread():
        # (round 61) one thread per connection: a note or a knob move never waits behind a snapshot or a bounce.
        while True:
            conn, _ = server.accept()
            threading.Thread(target=handle, args=(conn,), daemon=True).start()
    threading.Thread(target=request_thread, daemon=True).start()
    while True:
        action, job, done = main_tasks.get()
        if action == 'load':
            try:
                engine.load(job)
                done.put(True)
            except Exception as error:
                done.put(error)
        elif action == 'editor':
            # The native editor owns this (main) thread until it closes; audio runs on the worker + PortAudio threads.
            try:
                engine.editor = True
                engine.plugin.show_editor()
            except Exception as error:
                engine.error = str(error)[:500]
            finally:
                engine.editor = False
                engine.editor_requested = False
                engine.editor_closes += 1  # (round 61) the desk re-reads the controls changed in the editor
        elif action == 'command':
            try:
                done.put(engine.command(job))
            except Exception as error:
                done.put(error)


if __name__ == '__main__':
    request, response = map(Path, sys.argv[1:3])
    config = json.loads(request.read_text(encoding='utf-8'))
    try:
        if config.get('action') == 'serve':
            serve(config, response)
        else:
            if config.get('plugin'):
                expected = identity(config['plugin'])
                if config.get('name') not in (None, '', expected):
                    raise ValueError('Only Serum 2 and Vital instruments are allowed.')
                config['name'] = expected
            response.write_text(json.dumps({'ok': True, **offline.run(config)}, allow_nan=False), encoding='utf-8')
    except Exception as error:
        response.write_text(json.dumps({'ok': False, 'error': str(error)[:1600]}), encoding='utf-8')
