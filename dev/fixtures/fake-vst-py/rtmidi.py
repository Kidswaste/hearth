"""(round 61, vstlive61) A fake python-rtmidi for tests: one controller, 'Fake Keys', that plays note 64 for 300 ms
shortly after it is opened (FAKE_MIDI_NOTE=0 to keep it quiet). Never used by the app itself."""
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
