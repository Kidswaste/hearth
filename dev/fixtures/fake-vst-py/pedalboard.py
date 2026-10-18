"""(round 61, vstlive61) A fake Pedalboard for tests on a computer without Serum 2 / Vital: just enough of the API
creative-vst-host.py / creative-vst-offline.py use. Put this folder on PYTHONPATH (dev/smoke.js --fake-vst does).
The fake instrument sings a sine per held note (volume follows the 'level' control), logs the MIDI it receives with
its offset when FAKE_PB_LOG is set, and its show_editor() 'turns a knob' and closes after FAKE_EDITOR_S seconds.
Never used by the app itself."""
import json
import math
import os
import threading
import time

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
        object.__setattr__(self, 'parameters', params)
        object.__setattr__(self, '_held', {})
        object.__setattr__(self, '_phase', 0.0)
        object.__setattr__(self, '_calls', 0)
        object.__setattr__(self, '_log', os.environ.get('FAKE_PB_LOG'))
        object.__setattr__(self, '_lock', threading.Lock())
        object.__setattr__(self, '_cost', float(os.environ.get('FAKE_PB_COST_MS', '0')) / 1000)

    def __getattr__(self, key):
        params = object.__getattribute__(self, 'parameters')
        if key in params:
            p = params[key]
            if p.type == bool:
                return bool(p.raw_value >= .5)
            if p.type == str:
                return p.valid_values[int(round(p.raw_value * (len(p.valid_values) - 1)))]
            if p.min_value is None:
                return p.raw_value
            return p.min_value + (p.max_value - p.min_value) * p.raw_value
        raise AttributeError(key)

    def __setattr__(self, key, value):
        params = object.__getattribute__(self, 'parameters')
        if key in params:
            p = params[key]
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
        return json.dumps({k: p.raw_value for k, p in self.parameters.items()}).encode()

    @raw_state.setter
    def raw_state(self, data):
        for k, v in json.loads(data.decode()).items():
            if k in self.parameters:
                self.parameters[k].raw_value = v

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
        level = self.parameters['level'].raw_value
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

    def show_editor(self):
        time.sleep(float(os.environ.get('FAKE_EDITOR_S', '1')))
        self.parameters['macro_0'].raw_value = .9  # the owner 'turned a knob' in the native editor


class VST3Plugin:
    @staticmethod
    def get_plugin_names_for_file(path):
        return [FakeInstrument(_name(path)).name]


def _name(path):
    base = os.path.basename(path.rstrip('/\\')).lower().replace(' ', '')
    return {'vital.vst3': 'Vital', 'serum2.vst3': 'Serum 2'}.get(base, 'Unknown')


def load_plugin(path, plugin_name=None, initialization_timeout=2):
    time.sleep(float(os.environ.get('FAKE_PB_LOAD_S', '0.05')))
    # (round 64, audiodoctor64) FAKE_PB_FAIL=<name>: that plugin refuses to load, as a broken / unlicensed install would
    if os.environ.get('FAKE_PB_FAIL') and os.environ['FAKE_PB_FAIL'] == (plugin_name or _name(path)):
        raise ImportError('Unable to load plugin %s: unsupported plugin format or load failure.' % path)
    return FakeInstrument(plugin_name or _name(path))
