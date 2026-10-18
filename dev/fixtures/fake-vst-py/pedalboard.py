"""(round 61, vstlive61) A fake Pedalboard for tests on a computer without Serum 2 / Vital: just enough of the API
creative-vst-host.py / creative-vst-offline.py use. Put this folder on PYTHONPATH (dev/smoke.js --fake-vst does).
The fake instrument sings a sine per held note (volume follows the 'level' control), logs the MIDI it receives with
its offset when FAKE_PB_LOG is set, and its show_editor() 'turns a knob' and closes after FAKE_EDITOR_S seconds.
Never used by the app itself.

(round 64, vstembed64) Shaped like the real package where the host's speed-ups touch it (pedalboard 0.9.26,
_pedalboard.py / ExternalPlugin.h): load_plugin() calls __set_initial_parameter_values__({}), which builds every
control's wrapper (real: 1,001 text samples each; here FAKE_PB_WRAP_MS per control); a lookup by name scans every
control (real: _get_parameter compares names; here FAKE_PB_NAME_US per control per lookup); `_parameters` lists the
C++-side parameters (name, raw_value, string_value); `_pedalboard` carries the mixin and the naming helpers.
show_editor(close_event) honours the event (FAKE_EDITOR_S=hold: open until closed); with HEARTH_VST_FAKE_WIN32=1 it
opens a window in fakewin32 titled "Pedalboard" and, like JUCE's parameter dispatcher on the editor's message loop,
copies the instrument's control values into what that window shows every 10 ms (window['shown'])."""
import json
import math
import os
import threading
import time
import types

import numpy as np

__version__ = '0.9.26-fake'


class Parameter:
    def __init__(self, name, kind, low=None, high=None, value=0.0, choices=()):
        self.name, self.type, self.min_value, self.max_value = name, kind, low, high
        self.step_size = None
        self.valid_values = list(choices)
        self.raw_value = value


class FakeInstrument:
    def __init__(self, name):
        object.__setattr__(self, 'name', name)
        object.__setattr__(self, 'manufacturer_name', 'Hearth test')
        object.__setattr__(self, 'is_instrument', True)
        object.__setattr__(self, 'is_effect', False)
        object.__setattr__(self, 'reported_latency_samples', 0)
        params = {
            'level': Parameter('Level', float, 0.0, 1.0, .5),
            'cutoff': Parameter('Filter cutoff', float, None, None, .7),  # an unbounded control (normalized 0–1)
            'mono': Parameter('Mono', bool, value=0.0),
            'wave': Parameter('Wave', str, value=0.0, choices=['sine', 'saw']),
            # (round 62, parkjam62) what Park mode lowers on battery: voices (1–32, now 16) and oversampling (now 4x)
            'polyphony': Parameter('Polyphony', float, 1.0, 32.0, 15 / 31),
            'oversampling': Parameter('Oversampling', str, value=.5, choices=['1x', '2x', '4x']),
        }
        for i in range(int(os.environ.get('FAKE_PB_PARAMS', '40'))):
            params['macro_%d' % i] = Parameter('Macro %d' % i, float, 0.0, 1.0, .25)
        object.__setattr__(self, '_params', params)
        object.__setattr__(self, '_built', set())  # (round 64) controls whose 'wrapper' was built (FAKE_PB_WRAP_MS each)
        object.__setattr__(self, '_held', {})
        object.__setattr__(self, '_phase', 0.0)
        object.__setattr__(self, '_calls', 0)
        object.__setattr__(self, '_log', os.environ.get('FAKE_PB_LOG'))
        object.__setattr__(self, '_lock', threading.Lock())
        object.__setattr__(self, '_cost', float(os.environ.get('FAKE_PB_COST_MS', '0')) / 1000)

    # ---- (round 64, vstembed64) the real package's costs and shapes
    def _charge(self, keys):
        cost = float(os.environ.get('FAKE_PB_WRAP_MS', '0')) / 1000
        built = object.__getattribute__(self, '_built')
        todo = [k for k in keys if k not in built]
        if cost and todo:
            time.sleep(cost * len(todo))
        built.update(todo)

    def _lookup(self, key):
        """pedalboard's getattr / setattr by python name: every wrapper when the name map lacks it, else this one; plus
        the C++ side's scan over every control's name."""
        params = object.__getattribute__(self, '_params')
        try:
            names = object.__getattribute__(self, '__python_to_cpp_names__')
        except AttributeError:
            names = {}
        self._charge(list(params) if key not in names else [key])
        scan = float(os.environ.get('FAKE_PB_NAME_US', '0')) / 1e6
        if scan:
            time.sleep(scan * len(params))
        return params[key]

    def __set_initial_parameter_values__(self, parameter_values=None):
        self._charge(list(object.__getattribute__(self, '_params')))
        for key, value in (parameter_values or {}).items():
            setattr(self, key, value)

    @property
    def parameters(self):
        self._charge(list(self._params))
        return self._params

    @property
    def _parameters(self):
        return [_Cpp(key, p) for key, p in self._params.items()]

    def _get_parameter_by_python_name(self, key):
        return self._lookup(key) if key in self._params else None

    def __getattr__(self, key):
        params = object.__getattribute__(self, '_params')
        if key in params:
            p = self._lookup(key)
            if p.type == bool:
                return bool(p.raw_value >= .5)
            if p.type == str:
                return p.valid_values[int(round(p.raw_value * (len(p.valid_values) - 1)))]
            if p.min_value is None:
                return p.raw_value
            return p.min_value + (p.max_value - p.min_value) * p.raw_value
        raise AttributeError(key)

    def __setattr__(self, key, value):
        params = object.__getattribute__(self, '_params')
        if key in params:
            p = self._lookup(key)
            if p.type == bool:
                p.raw_value = 1.0 if value else 0.0
            elif p.type == str:
                p.raw_value = p.valid_values.index(value) / max(1, len(p.valid_values) - 1)
            else:
                p.raw_value = (value - p.min_value) / (p.max_value - p.min_value)
            return
        object.__setattr__(self, key, value)

    @property
    def raw_state(self):
        return json.dumps({k: p.raw_value for k, p in self._params.items()}).encode()

    @raw_state.setter
    def raw_state(self, data):
        for k, v in json.loads(data.decode()).items():
            if k in self._params:
                self._params[k].raw_value = v

    def __call__(self, midi, duration, sample_rate, num_channels=2, buffer_size=512, reset=True):
        frames = int(round(duration * sample_rate))
        if reset:
            self._held.clear()
        if self._log and midi:
            with open(self._log, 'a') as f:
                for message, offset in midi:
                    f.write(json.dumps({'call': self._calls, 'offset': round(offset * sample_rate), 'msg': list(message), 'rate': sample_rate, 'frames': frames}) + '\n')
        object.__setattr__(self, '_calls', self._calls + 1)
        if self._cost:
            time.sleep(self._cost)
        # (round 63, soundbank63) messages take effect at their offset (an offline bounce has a note on AND its note
        # off in one call: the Sound bank's preview); live blocks (offsets inside the block) sound as before.
        out = np.zeros(frames, dtype=np.float32)
        level = self._params['level'].raw_value
        events = sorted(midi, key=lambda m: m[1])
        start = 0
        for i in range(len(events) + 1):
            end = frames if i == len(events) else max(start, min(frames, int(round(events[i][1] * sample_rate))))
            if end > start and not (i < len(events) and end == start):
                t = np.arange(end - start) / sample_rate
                for note, velocity in list(self._held.items()):
                    out[start:end] += (np.sin(2 * math.pi * 440 * 2 ** ((note - 69) / 12) * (t + start / sample_rate) + self._phase) * velocity * level * .3).astype(np.float32)
                start = end
            if i == len(events):
                break
            message = events[i][0]
            kind = message[0] & 0xF0
            if kind == 0x90 and message[2]:
                self._held[message[1]] = message[2] / 127
            elif kind == 0x80 or (kind == 0x90 and not message[2]):
                self._held.pop(message[1], None)
            elif kind == 0xB0 and message[1] in (120, 123):
                self._held.clear()
        object.__setattr__(self, '_phase', self._phase + 2 * math.pi * frames / sample_rate)
        return np.stack([out, out]).astype(np.float32)

    def show_editor(self, close_event=None):
        hold = os.environ.get('FAKE_EDITOR_S', '1')
        end = None if hold == 'hold' else time.monotonic() + float(hold)
        window = None
        if os.environ.get('HEARTH_VST_FAKE_WIN32') == '1':
            import fakewin32
            refuse = os.environ.get('FAKE_EMBED_REFUSE') == self.name  # (a test: this instrument's editor can't be a child window)
            window = fakewin32.create(os.getpid(), title='Pedalboard', cls='JUCE_refuse' if refuse else 'JUCE_7f3a2c10', w=int(os.environ.get('FAKE_EDITOR_W', '880')), h=int(os.environ.get('FAKE_EDITOR_H', '560')))
        closed_by_hearth = False
        try:
            while True:
                if close_event is not None and close_event.is_set():
                    closed_by_hearth = True
                    break
                if end is not None and time.monotonic() >= end:
                    break
                if window is not None:
                    if not fakewin32.alive(window):
                        break
                    fakewin32.show_values(window, {k: p.raw_value for k, p in self._params.items()})
                time.sleep(.01)
        finally:
            if window is not None:
                fakewin32.destroy(window)
        if not closed_by_hearth:
            self._params['macro_0'].raw_value = .9  # the owner 'turned a knob' in the native editor


class _Cpp:
    """(round 64) a C++-side parameter as pedalboard's `_parameters` lists them: name, raw_value, string_value."""

    def __init__(self, key, p):
        self.key, self._p, self.name = key, p, p.name

    @property
    def raw_value(self):
        return self._p.raw_value

    @raw_value.setter
    def raw_value(self, v):
        self._p.raw_value = v

    def get_text_for_raw_value(self, raw):
        p = self._p
        if p.type == bool:
            return 'On' if raw >= .5 else 'Off'
        if p.type == str:
            return p.valid_values[int(round(raw * (len(p.valid_values) - 1)))]
        if p.min_value is None:
            return '%g' % raw
        return '%g' % (p.min_value + (p.max_value - p.min_value) * raw)

    @property
    def string_value(self):
        return self.get_text_for_raw_value(self._p.raw_value)


_pedalboard = types.SimpleNamespace(
    _PythonExternalPluginMixin=FakeInstrument,
    to_python_parameter_name=lambda cpp: cpp.key,
    PARAMETER_NAME_REGEXES_TO_IGNORE=[],
    strip_common_float_suffixes=lambda text: text,
)


class VST3Plugin:
    @staticmethod
    def get_plugin_names_for_file(path):
        return [FakeInstrument(_name(path)).name]


def _name(path):
    base = os.path.basename(path.rstrip('/\\')).lower().replace(' ', '')
    return {'vital.vst3': 'Vital', 'serum2.vst3': 'Serum 2'}.get(base, 'Unknown')


def load_plugin(path, plugin_name=None, initialization_timeout=2, parameter_values=None):
    time.sleep(float(os.environ.get('FAKE_PB_LOAD_S', '0.05')))
    plugin = FakeInstrument(plugin_name or _name(path))
    # like the real constructor (ExternalPlugin.h): the mixin's hook runs at once, every wrapper unless the host skips it
    type(plugin).__set_initial_parameter_values__(plugin, parameter_values or {})
    return plugin
