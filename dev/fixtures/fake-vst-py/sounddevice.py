"""(round 61, vstlive61) A fake sounddevice / PortAudio for tests: no sound card needed. Mirrors the real Windows wheel's
shape: the ASIO host API is only there when SD_ENABLE_ASIO was set at import (the real wheel then loads its
*-asio.dll). Devices: a Universal Audio interface on ASIO + WASAPI (+ MME), and the computer's speakers.
An OutputStream pulls blocks from the callback on its own thread at the real block rate and records what it got
(FAKE_SD_LOG). FAKE_SD_STALL_MS makes the 'device' miss a deadline now and then (an underrun reported in status)."""
import json
import os
import threading
import time

import numpy as np

__version__ = '0.5.6-fake'
ASIO = 'SD_ENABLE_ASIO' in os.environ
# (round 64, audiodoctor64) FAKE_SD_NO_ASIO_DLL: the ASIO-enabled PortAudio DLL won't load (missing / blocked), as the
# real wheel would fail at import; creative-vst-offline.import_sounddevice() then imports again without SD_ENABLE_ASIO.
if ASIO and os.environ.get('FAKE_SD_NO_ASIO_DLL'):
    raise OSError('PortAudio library not found (libportaudio64bit-asio.dll)')
# FAKE_SD_ASIO_CRASH: a broken ASIO driver takes the whole process down while PortAudio enumerates it
if ASIO and os.environ.get('FAKE_SD_ASIO_CRASH'):
    os._exit(3)

_apis = [{'name': 'MME', 'devices': [0, 1], 'default_output_device': 1},
         {'name': 'Windows WASAPI', 'devices': [2, 3], 'default_output_device': 3}]
_devices = [
    {'name': 'Microsoft Sound Mapper - Output', 'hostapi': 0, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 44100.0, 'default_low_output_latency': .09},
    {'name': 'Speakers (Realtek(R) Audio)', 'hostapi': 0, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 44100.0, 'default_low_output_latency': .09},
    {'name': 'Monitor 1-2 (Universal Audio Thunderbolt WDM)', 'hostapi': 1, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 48000.0, 'default_low_output_latency': .003},
    {'name': 'Speakers (Realtek(R) Audio)', 'hostapi': 1, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 48000.0, 'default_low_output_latency': .003},
]
if ASIO:
    _apis.append({'name': 'ASIO', 'devices': [4], 'default_output_device': 4})
    _devices.append({'name': 'Universal Audio Thunderbolt', 'hostapi': 2, 'max_output_channels': 24, 'max_input_channels': 24, 'default_samplerate': 96000.0 if os.environ.get('FAKE_SD_ASIO_96K') else 48000.0, 'default_low_output_latency': .0027})
_default_output = 3
# (round 62, parkjam62) FAKE_SD_NO_UA: the laptop on its own in the park (no Universal Audio interface plugged in): its
# speakers on MME / WASAPI, plus a Bluetooth headset on WASAPI that is NOT the default (Park mode must not pick it).
if os.environ.get('FAKE_SD_NO_UA'):
    _apis = [{'name': 'MME', 'devices': [0, 1], 'default_output_device': 1},
             {'name': 'Windows WASAPI', 'devices': [2, 3], 'default_output_device': 2}]
    _devices = [
        {'name': 'Microsoft Sound Mapper - Output', 'hostapi': 0, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 44100.0, 'default_low_output_latency': .09},
        {'name': 'Speakers (Realtek(R) Audio)', 'hostapi': 0, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 44100.0, 'default_low_output_latency': .09},
        {'name': 'Speakers (Realtek(R) Audio)', 'hostapi': 1, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 48000.0, 'default_low_output_latency': .003},
        {'name': 'Headset (WH-1000XM4 Hands-Free AG Audio)', 'hostapi': 1, 'max_output_channels': 2, 'max_input_channels': 0, 'default_samplerate': 16000.0, 'default_low_output_latency': .04},
    ]
    if ASIO:
        _apis.append({'name': 'ASIO', 'devices': [], 'default_output_device': -1})
    _default_output = 2


class _Default:
    device = [None, _default_output]


default = _Default()


class PortAudioError(Exception):
    pass


class WasapiSettings:
    def __init__(self, exclusive=False, auto_convert=False, explicit_sample_format=False):
        self.exclusive = exclusive


class AsioSettings:
    def __init__(self, channel_selectors=None):
        self.channel_selectors = channel_selectors


class CallbackFlags:
    def __init__(self, underflow=False):
        self.output_underflow = underflow

    def __bool__(self):
        return self.output_underflow


def query_hostapis(index=None):
    return _apis if index is None else _apis[index]


def query_devices(device=None, kind=None):
    if device is None and kind is None:
        return [dict(d) for d in _devices]
    if device is None:
        device = _default_output
    if not 0 <= int(device) < len(_devices):
        raise PortAudioError('Error querying device %s' % device)
    return dict(_devices[int(device)])


def check_output_settings(device=None, channels=None, dtype=None, extra_settings=None, samplerate=None):
    d = query_devices(device, 'output')
    api = _apis[d['hostapi']]['name']
    if (api == 'ASIO' or getattr(extra_settings, 'exclusive', False)) and samplerate != d['default_samplerate']:
        raise PortAudioError('Invalid sample rate [PaErrorCode -9997]')
    if channels > d['max_output_channels']:
        raise PortAudioError('Invalid number of channels')


class OutputStream:
    def __init__(self, samplerate, channels, dtype, blocksize, device=None, latency=None, callback=None, extra_settings=None):
        check_output_settings(device, channels, dtype, extra_settings, samplerate)
        self.samplerate, self.channels, self.blocksize, self.device = samplerate, channels, blocksize, device
        self.callback, self.extra_settings = callback, extra_settings
        self.latency = blocksize / samplerate + .002
        self.active = False
        self._thread = None
        self._stop = threading.Event()
        self.pulled, self.nonzero, self.peak = 0, 0, 0.0
        self._log = os.environ.get('FAKE_SD_LOG')
        self._stall = float(os.environ.get('FAKE_SD_STALL_MS', '0')) / 1000

    def _run(self):
        period = self.blocksize / self.samplerate
        out = np.zeros((self.blocksize, self.channels), dtype=np.float32)
        due = time.perf_counter()
        n = 0
        while not self._stop.is_set():
            n += 1
            late = self._stall and n % 50 == 0
            if late:
                time.sleep(self._stall)
            self.callback(out, self.blocksize, None, CallbackFlags(bool(late)))
            self.pulled += 1
            peak = float(np.max(np.abs(out)))
            self.peak = max(self.peak, peak)
            if peak > 0:
                self.nonzero += 1
            due += period
            wait = due - time.perf_counter()
            if wait > 0:
                time.sleep(wait)
            else:
                due = time.perf_counter()
        if self._log:
            with open(self._log, 'a') as f:
                f.write(json.dumps({'device': self.device, 'rate': self.samplerate, 'blocksize': self.blocksize, 'exclusive': getattr(self.extra_settings, 'exclusive', False), 'pulled': self.pulled, 'nonzero': self.nonzero, 'peak': self.peak, 'asio': ASIO}) + '\n')

    def start(self):
        self.active = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def abort(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self.active = False

    stop = abort

    def close(self):
        self.active = False


# (round 64, audiodoctor64) what /audio doctor's live test also uses: the PortAudio version, and a duplex Stream whose
# input hears its own output FAKE_SD_LOOP_SAMPLES later (default 480) when FAKE_SD_LOOPBACK is set (the owner patched
# an output into an input), else a quiet noise floor.
def get_portaudio_version():
    return (1246976, 'PortAudio V19.7.0-devel, revision fake' + (' (ASIO)' if ASIO else ''))


class Stream(OutputStream):
    def __init__(self, samplerate, blocksize, device=(None, None), channels=(1, 2), dtype='float32', latency=None, callback=None, extra_settings=None):
        out_dev = device[1] if isinstance(device, (tuple, list)) else device
        in_dev = device[0] if isinstance(device, (tuple, list)) else device
        if query_devices(in_dev).get('max_input_channels', 0) < channels[0]:
            raise PortAudioError('Invalid number of channels')
        OutputStream.__init__(self, samplerate, channels[1], dtype, blocksize, out_dev, latency, None, extra_settings[1] if isinstance(extra_settings, (tuple, list)) else extra_settings)
        self.duplex_callback, self.in_channels = callback, channels[0]
        self.latency = (blocksize / samplerate + .003, blocksize / samplerate + .002)
        self._delay = int(os.environ.get('FAKE_SD_LOOP_SAMPLES', '480'))
        self._loop = bool(os.environ.get('FAKE_SD_LOOPBACK'))
        self._sent = np.zeros(0, dtype=np.float32)
        rng = np.random.default_rng(1)
        self._noise = lambda n: (rng.standard_normal(n) * .0005).astype(np.float32)
        self.callback = self._duplex

    def _duplex(self, outdata, frames, timing, status):
        indata = np.zeros((frames, self.in_channels), dtype=np.float32)
        start = self.pulled * frames - self._delay
        if self._loop and start + frames > 0:
            lo = max(0, start)
            got = self._sent[lo:start + frames]
            indata[lo - start:lo - start + len(got), 0] = got
        indata[:, 0] += self._noise(frames)
        self.duplex_callback(indata, outdata, frames, timing, status)
        self._sent = np.concatenate([self._sent, outdata[:, 0].copy()])
