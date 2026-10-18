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

(round 64, vstembed64) 48 kHz, faster, the editor inside Hearth (docs/upgrades/vstembed64.md):
- 48 kHz first on every device (ASIO / WASAPI exclusive included); a device that refuses it plays at its own rate, said
  in one line (stats rateNote), and a park take recorded at another rate is converted to 48 kHz once, when written;
- pedalboard and sounddevice are imported once, on the main thread, right after the host says it's ready (warm);
- loading no longer builds every control's Python wrapper (pedalboard samples 1,001 texts per control at load: ~2.6
  million calls for Serum 2); controls are indexed by name, read straight from their C++ parameters, and their list
  (types / ranges / choices) is cached on disk per plugin version (cacheDir from Hearth) or built in the background
  while the keys already play ('controls' returns what is ready so far);
- the editor: show_editor(close_event) so Hearth can close it; creative-vst-embed.py places its window in Hearth's
  ('editor' {embed}, 'editor-place', 'editor-pop', 'editor-embed', 'editor-close'); with the editor open, reading
  controls, a state snapshot / recall and a bounce run off the main thread (pedalboard >= 0.8.8 allows it) and a bounce
  never resets the instance under its open window.
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
BOOT = time.perf_counter()  # (round 64, vstembed64) host start -> ready, reported as timings.bootMs
spec = importlib.util.spec_from_file_location('offline', Path(__file__).with_name('creative-vst-offline.py'))
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)
# (round 64, vstembed64) the editor-in-Hearth layer (Win32 / Mac / test fake)
spec = importlib.util.spec_from_file_location('embedding', Path(__file__).with_name('creative-vst-embed.py'))
embedding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(embedding)
TARGET_RATE = 48000  # (round 64) the Sound desk's rate everywhere: live, renders, previews, park takes, exports
META_FORMAT = 1  # (round 64) bump when the cached control list changes shape
# (round 64) a CPU-bound helper thread (the first-time control list) hands the GIL back to the audio worker quickly
sys.setswitchinterval(.0005)


def lean_pedalboard(pb):
    """(round 64, vstembed64) pedalboard's load_plugin() calls __set_initial_parameter_values__({}), which builds every
    control's wrapper (1,001 text samples each) before returning. With no initial values there is nothing to set:
    skip it, so a plugin loads in the time its own code needs; wrappers are then built one by one when used."""
    mixin = getattr(getattr(pb, '_pedalboard', None), '_PythonExternalPluginMixin', None)
    original = getattr(mixin, '__set_initial_parameter_values__', None)
    if original is None or getattr(original, 'hearth_lean', False):
        return

    def lean(self, parameter_values=None):
        if parameter_values:
            return original(self, parameter_values)
    lean.hearth_lean = True
    mixin.__set_initial_parameter_values__ = lean


def binary_signature(location):
    """(round 64) what changes when the plugin is updated: the binary's (or the bundle's newest file's) size + mtime."""
    location = Path(location)
    try:
        if location.is_file():
            st = location.stat()
            return '%s|%d|%d' % (location.name, st.st_size, st.st_mtime_ns)
        newest = (0, 0, '')
        for pattern in ('*', '*/*', '*/*/*'):
            for f in location.glob('Contents/' + pattern):
                if f.is_file():
                    st = f.stat()
                    newest = max(newest, (st.st_mtime_ns, st.st_size, f.name))
        return '%s|%d|%d|%s' % (location.name, newest[1], newest[0], newest[2])
    except OSError:
        return location.name


class LazyParams:
    """(round 64, vstembed64) plugin.parameters without building them all: the keys come from the C++ index, a control's
    wrapper is built (and cached by pedalboard) the first time it is used."""

    def __init__(self, engine):
        self.e = engine

    def __contains__(self, key):
        return key in (self.e.index or {})

    def __getitem__(self, key):
        return self.e.wrapper(key)

    def __iter__(self):
        return iter(list(self.e.index or {}))

    def __len__(self):
        return len(self.e.index or {})

    def keys(self):
        return list(self.e.index or {})

    def items(self):
        return ((key, self[key]) for key in self.keys())
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
        # (round 64, vstembed64) fast controls, cached list, editor in Hearth, timings
        self.pb = None
        self.index = None  # python key -> C++ parameter (rebuilt after anything that may re-create the instance)
        self.meta = {}  # python key -> {label, kind, min, max, step, choices}
        self.meta_bad = set()
        self.meta_done = False
        self.meta_source = ''
        self.meta_ms = 0
        self.meta_gen = 0
        self.digest = ''
        self.signature = ''
        self.cache_dir = None
        self.rate_note = ''
        self.editor_event = None
        self.editor_note = ''
        self.embed = embedding.Embedder(*embedding.backend())
        self.timings = {}
        self.strip = lambda text: text
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
        lean_pedalboard(pb)  # (round 64) no full control read inside load_plugin()
        self.pb = pb
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
        self.timings['pluginMs'] = round((time.perf_counter() - began) * 1000)
        # (round 64) controls indexed from the C++ list (no wrappers built); Codex's full dict only on an unknown pedalboard
        self.index_controls()
        self.parameters = LazyParams(self) if self.index is not None else plugin.parameters
        # Pedalboard prepares/reloads native processors on their owning main thread.
        plugin([], duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=True)
        self.index_controls()  # a reset may re-create the instance: its C++ parameters are new
        self.loaded_ms = round((time.perf_counter() - began) * 1000)
        self.signature = binary_signature(location) + '|pedalboard ' + str(getattr(pb, '__version__', '?'))
        self.start_meta()

    # ---------- (round 64, vstembed64) fast controls ----------
    def index_controls(self):
        """python key -> the plugin's C++ parameter, the way pedalboard names them; pedalboard is told the names so a
        control's wrapper is built alone when it's first used (not all of them)."""
        self.index = self.index_of(self.plugin)
        if self.index is not None:
            import hashlib
            self.digest = hashlib.sha1('\n'.join('%s=%s' % (k, c.name) for k, c in self.index.items()).encode('utf-8', 'replace')).hexdigest()

    def adopt(self, plugin, index=None):
        """(round 64) another instance of the same instrument becomes the live one (liveset64's preset twin): its index
        made beforehand (index_of, off the audio thread), so the switch costs nothing."""
        self.plugin = plugin
        self.index = index if index is not None else self.index_of(plugin)
        self.parameters = LazyParams(self) if self.index is not None else plugin.parameters

    def index_of(self, plugin):
        pbm = getattr(self.pb, '_pedalboard', None)
        listing = getattr(plugin, '_parameters', None) if plugin is not None else None
        if pbm is None or listing is None or not hasattr(pbm, 'to_python_parameter_name'):
            return None
        ignore = getattr(pbm, 'PARAMETER_NAME_REGEXES_TO_IGNORE', ())
        self.strip = getattr(pbm, 'strip_common_float_suffixes', lambda text: text)
        index = {}
        for cpp in listing:
            if any(r.match(cpp.name) for r in ignore):
                continue
            key = pbm.to_python_parameter_name(cpp)
            if key:
                index[key] = cpp
        try:
            names = getattr(plugin, '__python_to_cpp_names__')
        except AttributeError:
            names = None
        if not isinstance(names, dict):
            names = {}
            setattr(plugin, '__python_to_cpp_names__', names)
        for key, cpp in index.items():
            names[key] = cpp.name
        try:
            getattr(plugin, '__python_parameter_cache__')
        except AttributeError:
            setattr(plugin, '__python_parameter_cache__', {})  # pedalboard's own wrapper cache (it makes it the same way)
        return index

    def wrapper(self, key):
        if self.index is None:
            return self.plugin.parameters[key]
        if key not in self.index:
            raise KeyError(key)
        p = self.plugin._get_parameter_by_python_name(key)
        if p is None:
            raise KeyError(key)
        return p

    def built_wrapper(self, key):
        """The control's pedalboard wrapper, made straight from its C++ name when pedalboard's class is there (one name
        scan instead of two per control: it matters across Serum 2's 2,600), else through pedalboard's own lookup."""
        pbm = getattr(self.pb, '_pedalboard', None)
        make = getattr(pbm, 'AudioProcessorParameter', None)
        try:
            cache = getattr(self.plugin, '__python_parameter_cache__')
        except AttributeError:
            cache = None
        if make is None or not isinstance(cache, dict) or self.index is None or key not in self.index:
            return self.wrapper(key)
        name = self.index[key].name
        if name not in cache:
            cache[name] = make(self.plugin, name)
        return cache[name]

    def meta_of(self, key):
        """What parameter_entry() reports about a control, minus its value: label, kind, range, choices."""
        p = self.built_wrapper(key)
        normalized = offline.normalized_parameter(p)
        if normalized:
            kind, low, high, step = 'norm', 0, 1, .001
        else:
            kind = 'bool' if p.type == bool else 'num' if p.type in (int, float) else 'str'
            low, high, step = getattr(p, 'min_value', None), getattr(p, 'max_value', None), getattr(p, 'step_size', None)
        if step is not None and not math.isfinite(step):
            step = None
        return {'key': key, 'label': p.name + (' (0–1)' if normalized else ''), 'kind': kind, 'min': low, 'max': high, 'step': step,
                'choices': list(p.valid_values)[:512] if kind == 'str' else []}

    def fast(self, key, m):
        """A control's value and text straight from its C++ parameter (call with self.lock held)."""
        cpp = self.index[key]
        text = str(cpp.string_value)
        kind = m['kind']
        if kind == 'norm':
            value = float(cpp.raw_value)
        elif kind == 'bool':
            value = bool(cpp.raw_value >= .5)
        elif kind == 'num':
            try:
                value = float(self.strip(text))
            except (TypeError, ValueError):
                value = float(getattr(self.plugin, key))
        else:
            value = text
        return {'value': value, 'display': text}

    def cache_file(self):
        if not self.cache_dir or not self.signature:
            return None
        import hashlib
        name = hashlib.sha1(('%d|%s|%s' % (META_FORMAT, self.path, self.signature)).encode('utf-8', 'replace')).hexdigest()[:24]
        return Path(self.cache_dir) / (name + '.json')

    def load_meta(self):
        file = self.cache_file()
        try:
            data = json.loads(file.read_text(encoding='utf-8')) if file and file.is_file() else None
        except (OSError, ValueError):
            data = None
        if not isinstance(data, dict) or data.get('format') != META_FORMAT or data.get('digest') != self.digest or not isinstance(data.get('meta'), dict):
            return False
        meta = {k: m for k, m in data['meta'].items() if k in self.index and isinstance(m, dict)}
        bad = set(k for k in data.get('bad', []) if k in self.index)
        if len(meta) + len(bad) < len(self.index):
            return False
        self.meta, self.meta_bad = meta, bad
        self.meta_done, self.meta_source = True, 'cache'
        return True

    def save_meta(self):
        file = self.cache_file()
        if not file:
            return
        try:
            file.parent.mkdir(parents=True, exist_ok=True)
            tmp = file.with_suffix('.part')
            tmp.write_text(json.dumps({'format': META_FORMAT, 'plugin': Path(self.path).name, 'signature': self.signature, 'digest': self.digest,
                                       'meta': self.meta, 'bad': sorted(self.meta_bad)}, allow_nan=False), encoding='utf-8')
            os.replace(tmp, file)
        except (OSError, ValueError):
            pass

    def start_meta(self):
        """The control list: from the disk cache when this plugin version was seen before, else built in the background
        (one wrapper at a time, after the instrument already plays); 'controls' answers with what is ready so far."""
        self.meta_gen += 1
        gen, began = self.meta_gen, time.perf_counter()
        self.meta, self.meta_bad, self.meta_done, self.meta_source = {}, set(), False, ''
        if self.index is None:
            self.meta_done, self.meta_source = True, 'pedalboard'
            return
        if self.load_meta():
            self.meta_ms = round((time.perf_counter() - began) * 1000)
            return

        def build():
            for n, key in enumerate(list(self.index)):
                if gen != self.meta_gen:
                    return
                if key in self.meta or key in self.meta_bad:
                    continue
                try:
                    self.meta[key] = self.meta_of(key)
                except Exception:
                    self.meta_bad.add(key)
                if n % 8 == 7:
                    time.sleep(0)
            if gen == self.meta_gen:
                self.meta_done, self.meta_source = True, 'read'
                self.meta_ms = round((time.perf_counter() - began) * 1000)
                self.save_meta()
        threading.Thread(target=build, daemon=True).start()

    def entry(self, key):
        """One control as parameter_entry() shows it (+ kind), fast when its description is known."""
        m = self.meta.get(key)
        if m is None and self.index is not None and key in self.index and key not in self.meta_bad:
            m = self.meta[key] = self.meta_of(key)
        if m is None:
            with self.lock:
                return offline.parameter_entry(self.plugin, key, self.parameters[key])
        with self.lock:
            return {**m, **self.fast(key, m)}

    def controls(self, job):
        """(round 64) the desk's controls: every control described so far with its current value. ready: all of them."""
        info = {'name': self.plugin.name, 'maker': getattr(self.plugin, 'manufacturer_name', ''), 'instrument': self.plugin.is_instrument,
                'effect': getattr(self.plugin, 'is_effect', False), 'latency': getattr(self.plugin, 'reported_latency_samples', 0)}
        if self.index is None:
            out = offline.run({'action': 'inspect', 'plugin': self.path}, self.plugin, guard=self.lock)
            out.pop('state', None)
            return {**out, 'ready': True, 'count': len(out['parameters']), 'built': len(out['parameters']), 'source': 'pedalboard', 'metaMs': 0}
        entries = []
        # while the list is still being read, a page asks for a few (limit): the count is cheap, the entries aren't
        limit = int(job.get('limit') or 0) if not self.meta_done else 0
        for key in list(self.index):
            m = self.meta.get(key)
            if m is None:
                continue
            if limit and len(entries) >= limit:
                break
            with self.lock:
                try:
                    entries.append({**m, **self.fast(key, m)})
                except Exception:
                    pass
        return {**info, 'parameters': entries, 'ready': self.meta_done, 'count': len(self.index) - len(self.meta_bad), 'built': len(self.meta),
                'source': self.meta_source, 'metaMs': self.meta_ms}

    def wait_meta(self, seconds=120):
        end = time.monotonic() + seconds
        while not self.meta_done and time.monotonic() < end:
            time.sleep(.02)
        if not self.meta_done:
            raise ValueError('The instrument is still reading its controls.')

    def state(self, job):
        """(round 64) a state-only snapshot / recall: no control listing (the desk refreshes what it shows itself)."""
        with self.lock:
            if job.get('state'):
                self.plugin.raw_state = offline.decode_state(job['state'])
            raw = self.plugin.raw_state
        return {'state': offline.encode_state(raw)}

    def inspect(self, job):
        """(round 64) Codex's inspect / snapshot, from the cached control list (same fields), off the main thread."""
        with self.lock:
            if job.get('state'):
                self.plugin.raw_state = offline.decode_state(job['state'])
        self.wait_meta()
        out = self.controls(job)
        with self.lock:
            out['state'] = offline.encode_state(self.plugin.raw_state)
        for key in ('ready', 'count', 'built', 'source', 'metaMs'):
            out.pop(key, None)
        return out

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
        if self.editor:
            self.embed.repaint()  # (round 64) the plugin's own knobs show the new values at once
        return {'changed': list(values)}

    def values(self, keys):
        """(round 61, vstlive61) current values of a few controls (reflects knob moves made in the native editor)."""
        if not isinstance(keys, list) or len(keys) > 512 or any(not isinstance(k, str) for k in keys):
            raise ValueError('Ask for up to 512 parameter keys.')
        out = {}
        for key in keys:
            if key not in self.parameters:
                raise ValueError('Unknown parameter: ' + key)
            entry = self.entry(key)  # (round 64) straight from the C++ parameter when the control is known
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
        # (round 64, vstembed64) 48 kHz first everywhere (an ASIO driver may switch the interface to it); a device that
        # refuses it plays at its own rate and the readout says so in one line.
        rates = [TARGET_RATE, own, 44100]
        last = None
        for rate in dict.fromkeys(rates):
            try:
                sd.check_output_settings(device=device, channels=2, dtype='float32', samplerate=rate, extra_settings=extra)
                self.rate_note = '' if rate == TARGET_RATE else '%s refused 48 kHz, so it plays at %s kHz (its own rate); loops you record are saved at 48 kHz.' % (info['name'], '%g' % (rate / 1000))
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
                'plugin': self.path,
                # (round 64, vstembed64) the rate asked for and why it differs, the editor in Hearth, the control list, timings
                'targetRate': TARGET_RATE, 'rateNote': self.rate_note if self.audio else '', 'editor': {**self.embed.state(), 'note': self.editor_note or self.embed.note},
                'controlsReady': self.meta_done, 'controlsSource': self.meta_source, 'controlsBuilt': len(self.meta), 'timings': self.timings}

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
        # (round 64, vstembed64) every file is 48 kHz: a take played at another rate (a device that refused 48 kHz) is
        # converted here, once; at 48 kHz it is written as it was played.
        audio, converted = self.to_target(audio, int(take['rate']), round(take['total'] * TARGET_RATE / take['rate']))
        pcm = (np.clip(audio.T, -1, 1) * 32767).astype('<i2')
        with wave.open(str(job['output']), 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(TARGET_RATE)
            w.writeframes(pcm.tobytes())
        notes = sorted(take['notes'], key=lambda n: (n['time'], n['note']))
        return {'bars': take['bars'], 'beats': take['beats'], 'bpm': take['bpm'], 'sampleRate': TARGET_RATE, 'frames': int(pcm.shape[0]),
                'seconds': pcm.shape[0] / TARGET_RATE, 'peak': round(take['peak'], 5), 'silent': take['peak'] < 1e-4, 'notes': notes,
                'startedAt': take['started'], 'playedRate': int(take['rate']), 'converted': converted}

    def to_target(self, audio, rate, frames):
        """(round 64) audio (2, n) at rate -> (2, frames) at 48 kHz: pedalboard's resampler when there, else linear."""
        np = self.np
        if rate == TARGET_RATE:
            return audio, False
        try:
            from pedalboard.io import StreamResampler
            r = StreamResampler(rate, TARGET_RATE, 2)
            out = np.concatenate([r.process(np.ascontiguousarray(audio, dtype=np.float32)), r.process(None)], axis=1)
        except Exception:
            x = np.arange(frames) * (rate / TARGET_RATE)
            out = np.stack([np.interp(x, np.arange(audio.shape[1]), ch, right=0.0) for ch in audio]).astype(np.float32) if audio.shape[1] else np.zeros((2, frames), np.float32)
        out = out[:, :frames]
        if out.shape[1] < frames:
            out = np.pad(out, ((0, 0), (0, frames - out.shape[1])))
        return out, True

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
        if action == 'editor-place':  # (round 64, vstembed64) the placeholder moved / scrolled / got covered (streamed)
            return {'editor': self.embed.place(job.get('embed') if isinstance(job.get('embed'), dict) else {})}
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
        if action == 'controls':  # (round 64, vstembed64)
            return self.controls(job)
        if action in ('inspect', 'snapshot', 'render'):
            # (round 64) state-only snapshots / recalls and Codex's inspect from the cached control list: off the main
            # thread, the editor may stay open (pedalboard runs VST3s on background threads since 0.8.8).
            if action == 'snapshot' and job.get('stateOnly'):
                return self.state(job)
            if action != 'render' and self.index is not None and not job.get('parameters'):
                return self.inspect(job)
            if self.editor and action != 'render':
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
            keep = bool(self.editor)  # (round 64) never reset (re-create) the instance under its open editor window
            try:
                with self.lock:
                    output = offline.run({**job, 'action': 'render', 'reset': not keep, 'lean': self.index is not None}, self.plugin)
                    self.index_controls()
                output['audio'] = base64.b64encode(Path(job['output']).read_bytes()).decode('ascii')
                if not keep:
                    self.plugin([], duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=True)
                    with self.lock:
                        self.index_controls()
                if self.index is not None:  # (round 64) the controls as they are now (the Sound bank reads them)
                    self.wait_meta()
                    output['parameters'] = [{k: v for k, v in e.items() if k != 'kind'} for e in self.controls(job)['parameters']]
                return output
            finally:
                if was_playing:
                    self.start(was)
        raise ValueError('Unknown live host action.')


STREAMED = ('midi', 'patch', 'volume', 'panic', 'sequence', 'editor-place') + liveset.STREAMED  # (round 61) fire-and-forget on the stream connection · (round 64, liveset64) pad presses · (round 64, vstembed64) editor layout


def serve(config, response):
    embedding.dpi_aware()  # (round 64, vstembed64) before any window: the same physical pixels as Hearth's window
    engine = Engine()
    engine.cache_dir = config.get('cacheDir')  # (round 64) the control lists, per plugin version (Hearth's data folder)
    engine.timings['bootMs'] = round((time.perf_counter() - BOOT) * 1000)
    main_tasks = queue.Queue()
    # (round 64) warm: the heavy imports happen once, first thing on the main thread, while Hearth already connects
    main_tasks.put(('warm', None, None))
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('127.0.0.1', 0))
    server.listen(16)
    response.write_text(json.dumps({'ok': True, 'port': server.getsockname()[1], 'bootMs': engine.timings['bootMs']}), encoding='utf-8')

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
                    # (round 64, vstembed64) closable from Hearth; placed inside Hearth's window when job['embed'] says where
                    engine.editor_event, engine.editor_note = threading.Event(), ''
                    try:
                        known = [w['hwnd'] for w in engine.embed.b.windows(os.getpid())] if engine.embed.b else []
                    except Exception:
                        known = []
                    main_tasks.put(('editor', job, None))
                    want = job.get('embed') if isinstance(job.get('embed'), dict) else None
                    result = {'editorOpen': True, 'editor': engine.embed.opened(want, known, stop=lambda: not engine.editor_requested)}
                elif job['action'] in ('editor-embed', 'editor-pop', 'editor-close'):
                    result = {'editor': editor_action(job)}
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
                    elif job['action'] in ('inspect', 'snapshot', 'render'):
                        # (round 64, vstembed64) with the editor open (it holds the main thread) or the fast control list,
                        # these run here, off the main thread, under the plugin lock
                        if engine.editor_requested or (job['action'] != 'render' and engine.index is not None):
                            result = engine.command(job)
                        else:
                            result = on_main('command', job)
                    elif job['action'] == 'preset-preload':  # (round 64, liveset64) the twin loads on this main thread
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

    def editor_action(job):
        """(round 64, vstembed64) the editor frame's buttons: here (a floating editor goes into Hearth), pop out, close."""
        action = job['action']
        if action == 'editor-close':
            if engine.editor_event:
                engine.editor_event.set()
            end = time.monotonic() + 3
            while engine.editor_requested and time.monotonic() < end:
                time.sleep(.01)
            return engine.embed.state()
        if not engine.editor_requested:
            raise ValueError('Open the editor first.')
        if action == 'editor-pop':
            return engine.embed.pop_out()
        return engine.embed.embed(job.get('embed') if isinstance(job.get('embed'), dict) else None)

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
                try:
                    engine.plugin.show_editor(engine.editor_event)  # (round 64) Hearth can close it (close_event)
                except TypeError:
                    engine.plugin.show_editor()  # a pedalboard without close_event
            except Exception as error:
                engine.editor_note = 'The editor could not open: %s' % str(error)[:300]  # (round 64) not an audio error
            finally:
                engine.editor = False
                engine.editor_requested = False
                engine.embed.closed()
                engine.editor_closes += 1  # (round 61) the desk re-reads the controls changed in the editor
        elif action == 'warm':
            # (round 64, vstembed64) import pedalboard and sounddevice once, before the first instrument is asked for
            began = time.perf_counter()
            try:
                import pedalboard  # noqa: F401
                lean_pedalboard(pedalboard)
                offline.import_sounddevice()
            except Exception:
                pass  # the request that needs them reports the real error
            engine.timings['importMs'] = round((time.perf_counter() - began) * 1000)
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
