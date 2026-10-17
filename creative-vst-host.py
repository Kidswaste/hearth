"""Persistent, isolated Serum 2 / Vital host. Authenticated loopback control only.
Audio is generated continuously in short blocks; PortAudio only copies queued PCM.
"""
import base64
import importlib.util
import json
import math
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


def identity(path):
    name = Path(path).name.lower().replace(' ', '')
    allowed = {'vital.vst3': 'Vital', 'serum2.vst3': 'Serum 2'}
    if name not in allowed:
        raise ValueError('Only Serum 2 and Vital are supported.')
    return allowed[name]


class Engine:
    def __init__(self):
        import numpy as np
        self.np = np
        self.plugin = None
        self.parameters = {}
        self.path = None
        self.lock = threading.RLock()
        self.audio = None
        self.worker = None
        self.running = threading.Event()
        self.events = queue.Queue(maxsize=256)
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
                # A renderer crash/lost focus cannot leave notes sounding forever.
                if self.active_notes and time.monotonic() - self.last_control > 5:
                    messages.append((bytes([0xB0, 123, 0]), 0.0))
                    self.active_notes.clear()
                with self.lock:
                    began = time.perf_counter()
                    block = self.plugin(messages, duration=self.frames / self.rate, sample_rate=self.rate,
                                        num_channels=2, buffer_size=self.frames, reset=False)
                    self.process_ms = (time.perf_counter() - began) * 1000
                    self.max_process_ms = max(self.max_process_ms, self.process_ms)
                if block.shape != (2, self.frames) or not np.isfinite(block).all():
                    raise ValueError('Plugin returned an invalid live audio block.')
                self.peak = float(np.max(np.abs(block)))
                self.processed += 1
                pcm = np.ascontiguousarray(np.clip(block.T * self.gain, -.98, .98), dtype=np.float32)
                while self.running.is_set():
                    try:
                        self.blocks.put(pcm, timeout=.05)
                        break
                    except queue.Full:
                        continue
        except Exception as error:
            self.error = str(error)[:500]
            self.running.clear()

    def start(self, job):
        import sounddevice as sd
        if self.audio and self.running.is_set():
            return self.stats()
        self.stop()
        self.frames = int(job.get('buffer', 512))
        if self.frames not in (256, 512, 1024):
            raise ValueError('Choose a 256, 512 or 1024 sample buffer.')
        self.rate = 48000
        gain = float(job.get('gain', .2))
        if not math.isfinite(gain) or not 0 <= gain <= .5:
            raise ValueError('Volume outside 0–0.5.')
        self.gain = gain
        self.error, self.underruns, self.processed = '', 0, 0
        self.process_ms, self.max_process_ms = 0.0, 0.0
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
        device = job.get('device')
        if device is not None:
            device = int(device)
        self.device = device
        self.audio = sd.OutputStream(samplerate=self.rate, channels=2, dtype='float32',
                                     blocksize=self.frames, device=device, latency='low', callback=callback)
        self.running.set()
        self.worker = threading.Thread(target=self.produce, daemon=True)
        self.worker.start()
        deadline = time.monotonic() + 2
        while self.blocks.qsize() < 2 and self.running.is_set() and time.monotonic() < deadline:
            time.sleep(.002)
        try:
            if not self.running.is_set():
                raise ValueError(self.error)
            self.audio.start()
        except Exception:
            self.stop()
            raise
        return self.stats()

    def stop(self):
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
        if self.plugin and self.path:
            with self.lock:
                self.plugin([(bytes([0xB0, 123, 0]), 0.0), (bytes([0xB0, 120, 0]), 0.0)],
                            duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=False)
        return self.stats()

    def stats(self):
        return {'playing': bool(self.running.is_set() and self.audio and self.audio.active),
                'sampleRate': self.rate, 'buffer': self.frames, 'queuedMs': 3 * self.frames / self.rate * 1000,
                'deviceLatencyMs': float(self.audio.latency) * 1000 if self.audio else 0,
                'underruns': self.underruns, 'blocks': self.processed, 'peak': self.peak,
                'processMs': self.process_ms, 'maxProcessMs': self.max_process_ms,
                'error': self.error, 'editorOpen': self.editor, 'gain': self.gain, 'device': self.device}

    def command(self, job):
        action = job['action']
        self.last_control = time.monotonic()
        if action == 'devices':
            import sounddevice as sd
            devices = [{'id': i, 'name': d['name'], 'api': sd.query_hostapis(d['hostapi'])['name']}
                       for i, d in enumerate(sd.query_devices()) if d['max_output_channels'] >= 2]
            try:
                default_name = sd.query_devices(kind='output')['name'].strip()
                preferred = next((d['id'] for d in devices if d['api'] == 'Windows WASAPI' and d['name'].startswith(default_name)), None)
            except Exception:
                preferred = None
            return {'devices': devices, 'preferred': preferred}
        if action == 'live-status':
            return self.stats()
        if action == 'live-stop':
            return self.stop()
        if not self.plugin or self.path != job.get('plugin'):
            raise ValueError('Load the selected instrument first.')
        if action == 'live-start':
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
            return {'silenced': True}
        if action == 'volume':
            gain = float(job['gain'])
            if not math.isfinite(gain) or not 0 <= gain <= .5:
                raise ValueError('Volume outside 0–0.5.')
            self.gain = gain
            return {'gain': self.gain}
        if action == 'patch':
            return self.patch(job.get('parameters', {}))
        if action in ('inspect', 'snapshot', 'render'):
            if self.editor:
                raise ValueError('Close the native editor before capturing, recalling or exporting a patch.')
            # Full parameter enumeration is slow; live controls use the fast patch action instead.
            was_playing = self.running.is_set()
            if was_playing:
                self.stop()
            try:
                with self.lock:
                    output = offline.run({**job, 'action': 'render' if action == 'render' else 'inspect'}, self.plugin)
                if action == 'render':
                    output['audio'] = base64.b64encode(Path(job['output']).read_bytes()).decode('ascii')
                    self.plugin([], duration=512 / 48000, sample_rate=48000, num_channels=2, buffer_size=512, reset=True)
                return output
            finally:
                if was_playing:
                    self.start({'gain': self.gain, 'buffer': self.frames, 'device': self.device})
        raise ValueError('Unknown live host action.')


def serve(config, response):
    engine = Engine()
    main_tasks = queue.Queue()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(('127.0.0.1', 0))
    server.listen(8)
    response.write_text(json.dumps({'ok': True, 'port': server.getsockname()[1]}), encoding='utf-8')
    def request_thread():
        while True:
            conn, _ = server.accept()
            with conn:
                try:
                    conn.settimeout(120)
                    payload = bytearray()
                    while not payload.endswith(b'\n'):
                        block = conn.recv(65536)
                        if not block:
                            raise ValueError('Incomplete request.')
                        payload.extend(block)
                        if len(payload) > 16_000_000:
                            raise ValueError('Request too large.')
                    job = json.loads(payload)
                    if job.pop('token', None) != config['token']:
                        raise ValueError('Invalid host token.')
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
                        if job['action'] == 'inspect' and engine.path != job.get('plugin'):
                            if engine.editor_requested:
                                raise ValueError('Close the native editor before changing instruments.')
                            done = queue.Queue(maxsize=1)
                            main_tasks.put(('load', job, done))
                            loaded = done.get(timeout=90)
                            if isinstance(loaded, Exception):
                                raise loaded
                        if job['action'] in ('inspect', 'snapshot', 'render'):
                            if engine.editor_requested:
                                raise ValueError('Close the native editor before capturing or exporting a patch.')
                            done = queue.Queue(maxsize=1)
                            main_tasks.put(('command', job, done))
                            result = done.get(timeout=90)
                            if isinstance(result, Exception):
                                raise result
                        else:
                            result = engine.command(job)
                    result = {'ok': True, **result}
                except Exception as error:
                    result = {'ok': False, 'error': str(error)[:1600]}
                try:
                    conn.sendall((json.dumps(result, allow_nan=False) + '\n').encode())
                except OSError:
                    pass
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
            try:
                engine.editor = True
                engine.plugin.show_editor()
            except Exception as error:
                engine.error = str(error)[:500]
            finally:
                engine.editor = False
                engine.editor_requested = False
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
