"""(round 61, vstlive61) A fake python-rtmidi for tests: one controller, 'Fake Keys', that plays note 64 for 300 ms
shortly after it is opened (FAKE_MIDI_NOTE=0 to keep it quiet). Never used by the app itself.

(round 69, midilearn69) FAKE_MIDI_INBOX=<file>: the controller also plays what a test appends to that file, one JSON line
each, from the moment the port opens: [176, 21, 64] (a MIDI message: a knob, a fader, pitch bend…), or
{"knob": "cutoff", "value": 0.3} (the owner turning that control in the plugin's own window: the fake instrument's
value changes without Hearth). Only complete lines are read."""
import os
import threading
import time

_open = set()


class MidiIn:
    def __init__(self):
        self._cb = None
        self._port = None

    def get_ports(self):
        return ['Fake Keys']

    def ignore_types(self, sysex=True, timing=True, active_sense=True):
        pass

    def open_port(self, index):
        if index in _open:
            raise RuntimeError('port busy')
        _open.add(index)
        self._port = index
        if os.environ.get('FAKE_MIDI_NOTE', '1') != '0':
            threading.Thread(target=self._play, daemon=True).start()
        if os.environ.get('FAKE_MIDI_INBOX'):  # (round 69, midilearn69)
            threading.Thread(target=self._inbox, args=(os.environ['FAKE_MIDI_INBOX'],), daemon=True).start()

    def _inbox(self, file):
        import json
        def lines():
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    text = f.read()
            except OSError:
                return []
            return text.split('\n')[:-1]  # complete lines only
        done = len(lines())
        port = self._port
        while self._port == port and port in _open:
            todo = lines()
            for line in todo[done:]:
                try:
                    item = json.loads(line)
                except ValueError:
                    continue
                if isinstance(item, dict) and 'knob' in item:
                    import pedalboard
                    for inst in list(pedalboard._INSTANCES):
                        p = inst._params.get(item['knob'])
                        if p is not None:
                            p.raw_value = float(item['value'])
                elif self._cb:
                    self._cb((list(item), 0.0), None)
            done = max(done, len(todo))
            time.sleep(.01)

    def _play(self):
        time.sleep(.3)
        for message in ([0x90, 64, 100], [0xB0, 1, 64], [0xF8], [0x80, 64, 0]):
            if self._cb:
                self._cb((message, 0.0), None)
            time.sleep(.3 if message[0] == 0x90 else .01)

    def set_callback(self, fn, data=None):
        self._cb = fn

    def close_port(self):
        _open.discard(self._port)
        self._cb = None

    def delete(self):
        pass
