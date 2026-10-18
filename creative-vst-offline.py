"""One plugin per disposable process. Protocol travels in files, never plugin stdout.
Requires the separately installed, pinned Pedalboard runtime; no network access here.
(round 64, vstembed64) Renders are 48 kHz (RATE); state encode / decode helpers shared with the live host; job['lean']
skips the full control listing; job['reset'] = False keeps the instance (the live host's editor may be open on it).
"""
import base64
import contextlib
import json
import math
import os
import sys
import wave
import zlib
from pathlib import Path


def import_sounddevice():
    """(round 61, vstlive61) sounddevice's Windows wheel (0.5.1+) ships two PortAudio DLLs; the one with ASIO is picked
    when SD_ENABLE_ASIO is set at import (creative-vstmain.js sets it). If that DLL is missing or won't load, the plain
    one (WASAPI / DirectSound / MME / WDM-KS) is used instead: never a crash for want of ASIO."""
    try:
        import sounddevice as sd
    except OSError:
        if 'SD_ENABLE_ASIO' not in os.environ:
            raise
        os.environ.pop('SD_ENABLE_ASIO', None)
        import sounddevice as sd
    return sd


RATE = 48000  # (round 64, vstembed64) every file the Sound desk writes is 48 kHz


def decode_state(encoded):
    """(round 64, vstembed64) a stored patch ('z1:' + base64 zlib, or plain base64) to the plugin's raw state."""
    raw = base64.b64decode(encoded[3:] if encoded.startswith('z1:') else encoded, validate=True)
    if encoded.startswith('z1:'):
        inflater = zlib.decompressobj()
        raw = inflater.decompress(raw, 64 * 1024 * 1024 + 1)
        if len(raw) > 64 * 1024 * 1024 or not inflater.eof:
            raise ValueError('Expanded preset exceeds 64 MB.')
    return raw


def encode_state(raw_state):
    """(round 64, vstembed64) the plugin's raw state as Codex's portable 'z1:' string (8 MB compressed at most)."""
    state = zlib.compress(raw_state, 6)
    if len(state) > 8 * 1024 * 1024:
        raise ValueError('Compressed plugin state exceeds the 8 MB preset limit. Choose a lighter patch.')
    return 'z1:' + base64.b64encode(state).decode('ascii')


def normalized_parameter(p):
    if p.type in (float, int):
        return p.min_value is None or p.max_value is None or not math.isfinite(p.min_value) or not math.isfinite(p.max_value)
    # Continuous controls expressed as unit-bearing strings (e.g. Vital ADSR seconds)
    # must remain fully addressable instead of truncating a list of thousands of values.
    return p.type == str and len(p.valid_values) > 128


def parameter_entry(plugin, key, p):
    """(round 61, vstlive61) one control as the desk / chat tools see it (was the loop body in run())."""
    value = getattr(plugin, key)
    if p.type == bool:
        value = bool(value)
    elif isinstance(value, (int, float)):
        value = float(value)
    else:
        value = str(value)
    low, high, step = getattr(p, 'min_value', None), getattr(p, 'max_value', None), getattr(p, 'step_size', None)
    display = str(getattr(plugin, key))
    normalized = normalized_parameter(p)
    if normalized:
        value, low, high, step = float(p.raw_value), 0, 1, .001
    return {'key': key, 'label': p.name + (' (0–1)' if normalized else ''), 'value': value, 'display': display,
            'min': low, 'max': high, 'step': step if step is None or math.isfinite(step) else None,
            'choices': list(p.valid_values)[:512] if isinstance(value, str) else []}


def run(job, plugin=None, guard=None):
    # (round 61, vstlive61) guard: a lock held around each native call (the state, one parameter at a time) rather
    # than around the whole enumeration, so the live audio thread keeps rendering while 2,600 controls are read.
    guard = guard or contextlib.nullcontext()
    import numpy as np
    import pedalboard as pb
    if job['action'] == 'status':
        sd = import_sounddevice()
        return {'version': pb.__version__, 'python': sys.version.split()[0], 'realtime': True, 'sounddevice': sd.__version__}
    location = Path(job['plugin'])
    # JUCE/Pedalboard on Windows expects the inner binary for directory-style bundles.
    if sys.platform == 'win32' and location.is_dir():
        binaries = list((location / 'Contents' / 'x86_64-win').glob('*.vst3'))
        if len(binaries) != 1:
            raise ValueError('This bundle does not contain one Windows x64 VST3 binary.')
        location = binaries[0]
    if job['action'] == 'names':
        return {'names': pb.VST3Plugin.get_plugin_names_for_file(str(location))}
    if plugin is None:
        plugin = pb.load_plugin(str(location), plugin_name=job.get('name') or None, initialization_timeout=2)
    if job.get('state'):
        raw = decode_state(job['state'])  # (round 64, vstembed64) the same decoding, shared with the host's state-only snapshot
        with guard:
            plugin.raw_state = raw
    for key, value in job.get('parameters', {}).items():
        if key not in plugin.parameters:
            raise ValueError('Unknown parameter: ' + key)
        p = plugin.parameters[key]
        if normalized_parameter(p):
            if not isinstance(value, (float, int)) or not 0 <= value <= 1:
                raise ValueError('Normalized parameter outside 0–1: ' + key)
            p.raw_value = value
        else:
            setattr(plugin, key, value)
    if job['action'] == 'editor':
        plugin.show_editor()  # Own process main thread; returns after user closes the editor.
    result = {'name': plugin.name, 'maker': plugin.manufacturer_name,
              'instrument': plugin.is_instrument, 'effect': plugin.is_effect,
              'latency': plugin.reported_latency_samples, 'parameters': []}
    # (round 64, vstembed64) job['lean']: the host lists the controls itself from its cached list (no full re-read here)
    for key, p in ([] if job.get('lean') else plugin.parameters.items()):
        with guard:
            result['parameters'].append(parameter_entry(plugin, key, p))
    with guard:
        raw_state = plugin.raw_state
    result['state'] = encode_state(raw_state)
    if job['action'] == 'render':
        # (round 64, vstembed64) renders, previews and exports at 48 kHz, the live stream's rate: no resampling, and the
        # plugin isn't prepared again for another rate between live play and a bounce.
        sr = RATE
        duration = max(.1, min(20, float(job.get('duration', 4))))
        if plugin.is_instrument:
            midi = []
            for note in job.get('notes', [])[:128]:
                key = max(0, min(127, int(note['note'])))
                start = max(0, min(duration, float(note['time'])))
                end = min(duration, start + max(.02, float(note['length'])))
                midi.extend([(bytes([0x90, key, 100]), start), (bytes([0x80, key, 0]), end)])
            midi.sort(key=lambda m: m[1])
            # (round 64) reset=False while the editor is open: a reset may re-create the plugin under its open window
            audio = plugin(midi, duration=duration, sample_rate=sr, num_channels=2, buffer_size=512, reset=job.get('reset', True) is not False)
        else:
            from pedalboard.io import AudioFile
            with AudioFile(job['input']) as source:
                if source.duration > 20:
                    raise ValueError('Effect input is limited to 20 seconds.')
                if source.samplerate == sr:  # (round 64) already 48 kHz: read as it is (resampled once at most)
                    audio = source.read(source.frames)
                else:
                    with source.resampled_to(sr) as resampled:
                        audio = resampled.read(resampled.frames)
            if audio.shape[0] == 1:
                audio = np.repeat(audio, 2, axis=0)
            if audio.shape[0] != 2:
                raise ValueError('Please use mono or stereo input.')
            tail = max(0, min(4, float(job.get('tail', 1))))
            audio = np.pad(audio, ((0, 0), (0, int(sr * tail))))
            audio = plugin(audio, sample_rate=sr, buffer_size=512, reset=job.get('reset', True) is not False)
        if not np.isfinite(audio).all():
            raise ValueError('Plugin produced invalid audio. Try another patch.')
        peak = float(np.max(np.abs(audio))) if audio.size else 0
        if peak > .98:
            audio = audio * (.98 / peak)
        pcm = (np.clip(audio.T, -1, 1) * 32767).astype('<i2')
        with wave.open(job['output'], 'wb') as f:
            f.setnchannels(audio.shape[0]); f.setsampwidth(2); f.setframerate(sr); f.writeframes(pcm.tobytes())
        result.update({'seconds': audio.shape[1] / sr, 'peak': peak, 'limited': peak > .98,
                       'silent': peak < .00001, 'sampleRate': sr, 'channels': audio.shape[0]})
    return result


if __name__ == '__main__':
    request, response = map(Path, sys.argv[1:3])
    try:
        result = {'ok': True, **run(json.loads(request.read_text(encoding='utf-8')))}
    except Exception as error:
        result = {'ok': False, 'error': str(error)[:1600]}
    response.write_text(json.dumps(result, allow_nan=False), encoding='utf-8')
