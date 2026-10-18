"""(round 64, audiodoctor64) /audio doctor's checks on the owner's own PC, in a disposable process (one per check).
Runs with the same private runtime as the Sound desk's host (Pedalboard + numpy + sounddevice) and the same
SD_ENABLE_ASIO switch, so what it sees is what the live host sees. Three actions, request as JSON in argv[1], result
written to the file in argv[2] (plugins may print on stdout; nothing here reads it):
  probe   Python, package versions, which PortAudio DLL loaded (ASIO or plain), host APIs, every device, MIDI inputs
  plugin  load ONE Serum 2 / Vital in this process (crash isolated): name, maker, controls, a half-second test render
  live    a 2-second test on one output: Vital (or a quiet sine) rendered ahead block by block (render time per block
          = DSP load), then played through the device while every callback is timed (intervals, late callbacks,
          underflow flags, the latency PortAudio reports). loopback: a duplex stream on the same device plays a click
          and looks for it on input 1, for the round trip when the owner has patched an output into an input.
Reuses creative-vst-offline.py (import_sounddevice: the ASIO DLL with its fallback) and creative-vst-host.py
(MidiInputs, Engine.choose: the rates the host would try). Never writes anywhere but the result file.
"""
import importlib
import importlib.util
import json
import math
import os
import struct
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def short(error):
    return (str(error) or type(error).__name__)[:300]


def probe(job):
    out = {'python': sys.version.split()[0], 'bits': struct.calcsize('P') * 8, 'executable': sys.executable, 'platform': sys.platform, 'packages': {}}
    for name in ('numpy', 'pedalboard'):
        try:
            out['packages'][name] = {'version': str(getattr(importlib.import_module(name), '__version__', '?'))}
        except Exception as error:
            out['packages'][name] = {'error': short(error)}
    wanted = 'SD_ENABLE_ASIO' in os.environ
    out['asioWanted'] = wanted
    sd = None
    try:
        offline = module('offline', 'creative-vst-offline.py')
        sd = offline.import_sounddevice()
        out['packages']['sounddevice'] = {'version': str(sd.__version__)}
    except Exception as error:
        out['packages']['sounddevice'] = {'error': short(error)}
    # import_sounddevice() drops SD_ENABLE_ASIO when the ASIO DLL wouldn't load (and uses the plain one)
    out['asioDll'] = bool(sd) and 'SD_ENABLE_ASIO' in os.environ
    out['asioFallback'] = bool(sd) and wanted and not out['asioDll']
    if sd:
        try:
            out['portaudio'] = str(sd.get_portaudio_version()[1])
        except Exception:
            out['portaudio'] = ''
        apis = sd.query_hostapis()
        out['hostApis'] = [a['name'] for a in apis]
        devices = []
        for i, d in enumerate(sd.query_devices()):
            devices.append({'id': i, 'name': d['name'], 'api': apis[d['hostapi']]['name'], 'outputs': d['max_output_channels'],
                            'inputs': d.get('max_input_channels', 0), 'rate': d.get('default_samplerate'),
                            'lowMs': round(float(d.get('default_low_output_latency') or 0) * 1000, 1),
                            'default': apis[d['hostapi']].get('default_output_device') == i})
        out['devices'] = devices
        try:
            out['defaultOutput'] = sd.query_devices(kind='output')['name']
        except Exception:
            out['defaultOutput'] = ''
    try:
        host = module('host', 'creative-vst-host.py')
        midi = host.MidiInputs(lambda message: None)
        out['midiInputs'], out['midiBackend'] = midi.ports(), midi.backend
    except Exception as error:
        out['midiInputs'], out['midiBackend'], out['midiError'] = [], None, short(error)
    return out


def location_of(path):
    location = Path(path)
    # JUCE/Pedalboard on Windows expects the inner binary for directory-style bundles (as creative-vst-offline.py does)
    if sys.platform == 'win32' and location.is_dir():
        binaries = list((location / 'Contents' / 'x86_64-win').glob('*.vst3'))
        if len(binaries) != 1:
            raise ValueError('This bundle does not contain one Windows x64 VST3 binary.')
        location = binaries[0]
    return location


def load(job):
    import pedalboard as pb
    began = time.perf_counter()
    plugin = pb.load_plugin(str(location_of(job['plugin'])), plugin_name=job.get('name') or None, initialization_timeout=10)
    return plugin, round((time.perf_counter() - began) * 1000)


def plugin_check(job):
    import numpy as np
    plugin, load_ms = load(job)
    began = time.perf_counter()
    audio = plugin([(bytes([0x90, 60, 100]), 0.0), (bytes([0x80, 60, 0]), .3)], duration=.5, sample_rate=48000, num_channels=2, buffer_size=512)
    render_ms = round((time.perf_counter() - began) * 1000)
    finite = bool(np.isfinite(audio).all())
    peak = float(np.max(np.abs(audio))) if audio.size and finite else 0.0
    return {'name': plugin.name, 'maker': getattr(plugin, 'manufacturer_name', ''), 'instrument': bool(getattr(plugin, 'is_instrument', False)),
            'controls': len(plugin.parameters), 'loadMs': load_ms, 'renderMs': render_ms, 'peak': round(peak, 4), 'silent': peak < 1e-5, 'finite': finite}


def live(job):
    import numpy as np
    offline = module('offline', 'creative-vst-offline.py')
    host = module('host', 'creative-vst-host.py')
    sd = offline.import_sounddevice()
    frames = int(job.get('buffer') or 256)
    if frames not in host.BUFFERS:
        raise ValueError('Choose a 64, 128, 256, 512 or 1024 sample buffer.')
    device = job.get('device')
    device = None if device is None else int(device)
    exclusive = bool(job.get('exclusive'))
    info, api, extra, rate = host.Engine.choose(None, sd, device, exclusive)
    seconds = max(.5, min(4.0, float(job.get('seconds') or 2)))
    total = int(rate * seconds)
    blocks = math.ceil(total / frames)
    audio = np.zeros((blocks * frames, 2), dtype=np.float32)
    render = []
    loop = bool(job.get('loopback'))
    source = 'click' if loop else 'sine'
    if job.get('plugin') and not loop:
        plugin, load_ms = load(job)
        source = plugin.name
        plugin([], duration=frames / rate, sample_rate=rate, num_channels=2, buffer_size=frames, reset=True)
        on, off = int(.05 * rate), int((seconds - .4) * rate)
        for b in range(blocks):
            start, midi = b * frames, []
            for note in (60, 64, 67):
                if start <= on < start + frames:
                    midi.append((bytes([0x90, note, 96]), (on - start) / rate))
                if start <= off < start + frames:
                    midi.append((bytes([0x80, note, 0]), (off - start) / rate))
            began = time.perf_counter()
            block = plugin(midi, duration=frames / rate, sample_rate=rate, num_channels=2, buffer_size=frames, reset=False)
            render.append((time.perf_counter() - began) * 1000)
            audio[start:start + frames] = np.asarray(block, dtype=np.float32).T[:frames]
        if not np.isfinite(audio).all():
            raise ValueError('%s produced invalid audio.' % source)
    else:
        t = np.arange(total) / rate
        envelope = np.minimum(1, np.minimum(t / .02, (seconds - t) / .05)).clip(0, 1)
        audio[:total, 0] = audio[:total, 1] = (np.sin(2 * math.pi * 440 * t) * envelope).astype(np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0:
        audio *= min(1.0, .2 / peak)  # quiet: a test, not a performance
    click = None
    if loop:
        click = int(.5 * rate)
        audio[:] = 0  # silence around one short click, so the input hears only the click (and the room / line noise)
        audio[click:click + 8] = .5
    state = {'pos': 0, 'stamps': [], 'flags': 0, 'underflow': 0}
    heard = np.zeros(blocks * frames, dtype=np.float32) if loop else None

    def play(outdata, count):
        state['stamps'].append(time.perf_counter())
        pos = state['pos']
        chunk = audio[pos:pos + count]
        outdata[:len(chunk)] = chunk
        if len(chunk) < count:
            outdata[len(chunk):] = 0
        state['pos'] = pos + count

    def flagged(status):
        if status:
            state['flags'] += 1
        if getattr(status, 'output_underflow', False):
            state['underflow'] += 1

    if loop:
        inputs = int(info.get('max_input_channels') or 0)
        if inputs < 1:
            raise ValueError('%s has no inputs, so it cannot hear its own output. Run the loopback test on your interface.' % info['name'])

        def callback(indata, outdata, count, timing, status):
            flagged(status)
            pos = state['pos']
            if pos < len(heard):
                take = indata[:min(count, len(heard) - pos), 0]
                heard[pos:pos + len(take)] = take
            play(outdata, count)
        stream = sd.Stream(samplerate=rate, blocksize=frames, device=(device, device), channels=(1, 2), dtype='float32',
                           latency='low', callback=callback, extra_settings=(extra, extra) if extra else None)
    else:
        def callback(outdata, count, timing, status):
            flagged(status)
            play(outdata, count)
        stream = sd.OutputStream(samplerate=rate, channels=2, dtype='float32', blocksize=frames, device=device, latency='low',
                                 callback=callback, extra_settings=extra)
    began = time.perf_counter()
    stream.start()
    deadline = time.monotonic() + seconds + 3
    while state['pos'] < total and time.monotonic() < deadline:
        time.sleep(.01)
    latency = stream.latency
    stream.abort()
    stream.close()
    stamps = state['stamps']
    gaps = [(b - a) * 1000 for a, b in zip(stamps, stamps[1:])]
    block_ms = frames / rate * 1000
    gaps_sorted = sorted(gaps)
    out = {'deviceName': info['name'], 'api': api, 'exclusive': exclusive, 'sampleRate': rate, 'buffer': frames, 'seconds': seconds,
           'source': source, 'callbacks': len(stamps), 'expectedCallbacks': math.ceil(total / frames), 'blockMs': round(block_ms, 3),
           'meanGapMs': round(sum(gaps) / len(gaps), 3) if gaps else 0, 'maxGapMs': round(max(gaps), 2) if gaps else 0,
           'p99GapMs': round(gaps_sorted[int(len(gaps_sorted) * .99)], 2) if gaps else 0,
           'lateCallbacks': sum(1 for g in gaps if g > block_ms * 1.5 + 1), 'statusFlags': state['flags'], 'underflows': state['underflow'],
           'outputLatencyMs': round(float(latency[1] if isinstance(latency, (tuple, list)) else latency) * 1000, 1),
           'ranMs': round((time.perf_counter() - began) * 1000), 'finished': state['pos'] >= total}
    if render:
        out['renderMeanMs'] = round(sum(render) / len(render), 3)
        out['renderMaxMs'] = round(max(render), 2)
        out['dspPct'] = round(sum(render) / len(render) / block_ms * 100, 1)
        out['loadMs'] = load_ms
    if loop:
        out['inputLatencyMs'] = round(float(latency[0]) * 1000, 1) if isinstance(latency, (tuple, list)) else None
        before = heard[:click]
        noise = float(np.sqrt(np.mean(before ** 2))) if before.size else 0.0
        level = max(.02, noise * 6)
        after = np.nonzero(np.abs(heard[click:]) > level)[0]
        if after.size:
            samples = int(after[0])
            out['loopback'] = {'heard': True, 'roundTripMs': round(samples / rate * 1000, 2), 'samples': samples,
                               'levelDb': round(20 * math.log10(max(1e-9, float(np.max(np.abs(heard[click:]))))), 1)}
        else:
            out['loopback'] = {'heard': False, 'noiseDb': round(20 * math.log10(max(1e-9, noise)), 1)}
    return out


ACTIONS = {'probe': probe, 'plugin': plugin_check, 'live': live}

if __name__ == '__main__':
    response = Path(sys.argv[2])
    try:
        request = json.loads(sys.argv[1])
        result = {'ok': True, **ACTIONS[request['action']](request)}
    except Exception as error:
        result = {'ok': False, 'error': short(error), 'kind': type(error).__name__}
    response.write_text(json.dumps(result, allow_nan=False, default=str), encoding='utf-8')
