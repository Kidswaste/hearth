"""(round 69, midilearn69) The mapping math and the MidiMap class of creative-vst-midimap.py, without audio or a plugin.
Run by dev/midilearn69-test.js (python3 -I dev/midilearn69-test.py <repo root> <scratch dir>); prints one JSON line."""
import importlib.util
import json
import math
import sys
import threading
import types
from pathlib import Path

root, scratch = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('midimap', root / 'creative-vst-midimap.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
checks = []


def ok(cond, what):
    if not cond:
        raise AssertionError(what)
    checks.append(what)


near = lambda a, b, eps=1e-6: abs(a - b) <= eps

# ---------- range / invert ----------
ok(near(M.knob_value(0), 0) and near(M.knob_value(127), 1) and near(M.knob_value(64), 64 / 127), 'full range: 0 → 0 %, 127 → 100 %, linear between')
ok(near(M.knob_value(0, .2, .6), .2) and near(M.knob_value(127, .2, .6), .6) and near(M.knob_value(127 // 2, .2, .6), .2 + .4 * 63 / 127), 'a range: the knob covers From…To only')
ok(near(M.knob_value(0, 0, 1, True), 1) and near(M.knob_value(127, 0, 1, True), 0), 'invert: knob down = control up')
ok(near(M.knob_value(0, .2, .6, True), .6) and near(M.knob_value(127, .2, .6, True), .2), 'invert keeps the range')
ok(near(M.knob_value(0, .8, .3), .8) and near(M.knob_value(127, .8, .3), .3), 'From above To runs it backwards')
ok(near(M.knob_value(500), 1) and near(M.knob_value(-3), 0), 'out-of-range CC values are clamped')

# ---------- pickup ----------
ok(M.picks_up(None, .71, .7) and not M.picks_up(None, .2, .7), 'takeover: the knob near the control picks it up, far away it does not')
ok(M.picks_up(.6, .8, .7) and M.picks_up(.8, .6, .7), 'takeover: the knob passing the control (either way) picks it up between two messages')
ok(not M.picks_up(.2, .4, .7) and not M.picks_up(.9, .8, .7), 'takeover: moving on one side of the control never picks it up')

# ---------- smoothing ----------
a512, a256 = M.alpha(512, 48000), M.alpha(256, 48000)
ok(near(1 - (1 - a256) ** 2, a512, 1e-12), 'smoothing is frame-rate independent (two 256-blocks = one 512-block)')
ok(M.alpha(64, 48000) < a512 < 1 and M.alpha(512, 48000, 0) == 1, 'smaller blocks take smaller steps; no smoothing when tau = 0')
v, blocks = 0.0, 0
while v != 1.0 and blocks < 100:
    v, blocks = M.glide(v, 1.0, a512), blocks + 1
ok(v == 1.0 and 3 <= blocks <= 12, 'a full jump glides and lands exactly on the target in %d blocks of 512 (%.0f ms)' % (blocks, blocks * 512 / 48))
first = M.glide(0.0, 1.0, a512)
ok(.3 < first < .8, 'the first block moves %.0f %% of the way: no zipper step, no lag' % (first * 100))
steps, v = [], 0.0
for _ in range(6):
    n = M.glide(v, 1.0, a512)
    steps.append(n - v)
    v = n
ok(all(steps[i] >= steps[i + 1] for i in range(len(steps) - 1)), 'each step is smaller than the last (a smooth curve)')

# ---------- validation ----------
for bad, why in (([{'cc': 1, 'key': 'x'}], 'mod wheel'), ([{'cc': 64, 'key': 'x'}], 'sustain'), ([{'cc': 123, 'key': 'x'}], 'channel mode'),
                 ([{'cc': 21, 'key': ''}], 'no control'), ([{'cc': 21, 'key': 'x', 'min': 1.5}], 'range over 100 %'),
                 ([{'cc': 128, 'key': 'x'}], 'CC 128'), ([{'cc': True, 'key': 'x'}], 'a bool CC'), ([{'cc': 21, 'ch': 16, 'key': 'x'}], 'channel 17'),
                 ([{'cc': 21, 'key': 'x'}] * 65, 'too many')):
    try:
        M.clean(bad)
        raised = False
    except ValueError:
        raised = True
    ok(raised, 'refused: ' + why)
maps, pickup = M.clean([{'cc': 21, 'ch': 0, 'key': 'cutoff', 'label': 'Cutoff'}, {'cc': 21, 'ch': 0, 'key': 'cutoff'}, {'cc': 22, 'key': 'level', 'min': .1, 'max': .9, 'invert': True}], 'nonsense')
ok(len(maps) == 2 and pickup == 'takeover' and maps[1]['invert'] is True and maps[1]['ch'] is None, 'the same knob → control twice is kept once; an unknown pickup is Take over')


# ---------- the class, on a stand-in engine ----------
class Cpp:
    def __init__(self, v):
        self.raw_value = v


def engine(tmp):
    e = types.SimpleNamespace()
    e.index = {'cutoff': Cpp(.7), 'level': Cpp(.5), 'wave': Cpp(0.0), 'macro_1': Cpp(.25)}
    e.parameters = e.index
    e.meta = {'wave': {'kind': 'str', 'label': 'Wave'}, 'cutoff': {'kind': 'norm', 'label': 'Filter cutoff (0–1)'}}
    e.lock = threading.RLock()
    e.editor = False
    e.plugin = object()
    e.cache_dir = str(tmp / 'creative-vst' / 'controls-cache')
    e.midi = types.SimpleNamespace(handles={'Fake Keys': 1})
    return e


tmp = scratch / 'unit'
e = engine(tmp)
m = M.MidiMap(e)
m.loaded('Vital')
ok(m.maps == [] and m.file.name == 'Vital.json' and m.file.parent.name == 'midi-maps', 'per instrument file in <data>/creative-vst/midi-maps')
m.command('midimap-set', {'maps': [{'cc': 21, 'ch': 0, 'key': 'cutoff', 'label': 'Filter cutoff'}], 'pickup': 'takeover'})
ok(m.file.exists() and json.loads(m.file.read_text())['maps'][0]['cc'] == 21, 'saved at once')

cc = lambda n, v, ch=0: bytes([0xB0 | ch, n, v])
ok(m.feed(cc(21, 0)) is True, 'a mapped CC is taken (not passed to the plugin)')
ok(m.feed(cc(21, 0, ch=3)) is False, 'the same CC on another channel passes')
ok(m.feed(cc(1, 90)) is False and m.feed(bytes([0xE0, 0, 100])) is False and m.feed(cc(64, 127)) is False, 'mod wheel, pitch bend, sustain always pass untouched')
ok(m.feed(bytes([0x90, 60, 100])) is False and m.feed(cc(30, 5)) is False, 'notes and unmapped CCs pass')
m.inbox.clear()

def run(blocks=40):
    for _ in range(blocks):
        with e.lock:
            m.tick(512, 48000)

# takeover: the control is at 70 %; the knob at 0 does nothing
m.feed(cc(21, 0)); run()
ok(near(e.index['cutoff'].raw_value, .7) and not m.state[0]['picked'], 'takeover: the knob far below the control leaves it alone (no jump)')
for v in (40, 60, 80):  # 80/127 = 63 %, then 94/127 = 74 % crosses 70 %
    m.feed(cc(21, v)); run(1)
ok(near(e.index['cutoff'].raw_value, .7), 'takeover: still waiting below the control')
m.feed(cc(21, 94)); run(1)
ok(m.state[0]['picked'] and e.index['cutoff'].raw_value > .7, 'takeover: the knob passing the control picks it up and moves it')
run(); ok(near(e.index['cutoff'].raw_value, 94 / 127), 'then the control follows the knob exactly')
m.feed(cc(21, 127)); run(1)
mid = e.index['cutoff'].raw_value
ok(94 / 127 < mid < 1, 'a quick knob move glides (first block %.3f, not 1.0)' % mid)
run(); ok(near(e.index['cutoff'].raw_value, 1.0), 'and lands on it')

# something else moves the control (a preset, the desk, its window): takeover waits again
e.index['cutoff'].raw_value = .2
m.feed(cc(21, 120)); run()
ok(near(e.index['cutoff'].raw_value, .2) and not m.state[0]['picked'], 'moved elsewhere: the knob has to reach it again (no jump back)')
m.feed(cc(21, 26)); run()  # 26/127 = 20.5 %: within the pickup window
ok(m.state[0]['picked'] and near(e.index['cutoff'].raw_value, 26 / 127), 'reached: picked up again')

# jump
m.command('midimap-set', {'maps': [{'cc': 21, 'ch': 0, 'key': 'cutoff'}, {'cc': 22, 'ch': 0, 'key': 'level', 'min': .2, 'max': .6, 'invert': True}, {'cc': 23, 'ch': 0, 'key': 'wave'}], 'pickup': 'jump'})
e.index['cutoff'].raw_value = .7
m.feed(cc(21, 0)); run(1)
ok(e.index['cutoff'].raw_value < .7, 'jump: the control follows at once (smoothed)')
run(); ok(near(e.index['cutoff'].raw_value, 0), 'jump: lands on the knob')
m.feed(cc(22, 0)); run(); ok(near(e.index['level'].raw_value, .6), 'invert + range: knob down → To (60 %)')
m.feed(cc(22, 127)); run(); ok(near(e.index['level'].raw_value, .2), 'invert + range: knob up → From (20 %)')
m.feed(cc(23, 127)); run(1); ok(near(e.index['wave'].raw_value, 1.0), 'a list of choices is set at once (no glide through the choices between)')
saved = json.loads(m.file.read_text())
ok(saved['pickup'] == 'jump' and len(saved['maps']) == 3 and (m.file.parent / 'Vital.prev.json').exists(), 'saved with the pickup; the previous file kept as .prev.json')

# learn: the next CC; the mod wheel is named, not learned; the control touched in the window
m.command('midimap-learn', {'learn': True})
m.feed(cc(1, 50))
ok(m.learn['cc'] is None and m.learn['ignored'] == 'the mod wheel', 'learn: the mod wheel is named and not learned')
m.feed(cc(74, 33, ch=2))
ok(m.learn['cc'] == 74 and m.learn['ch'] == 2 and m.learn['ignored'] is None, 'learn: the next knob is reported (CC 74, channel 3)')
import time
time.sleep(M.WATCH_S * 1.6)
e.index['macro_1'].raw_value = .9  # the owner turns Macro 1 in the plugin's window
end = time.time() + 3
while (m.touched is None) and time.time() < end:
    time.sleep(.05)
ok(m.touched and m.touched['key'] == 'macro_1', 'learn: the control turned in the plugin window is noticed')
 # a preset change moves many controls at once: not "a touch"
e2 = {('p%d' % i): Cpp(.1) for i in range(20)}
e.index.update(e2)
time.sleep(M.WATCH_S * 2.5)
for c in e2.values():
    c.raw_value = .8
time.sleep(M.WATCH_S * 2.5)
ok(m.touched['key'] == 'macro_1', 'learn: a preset change (20 controls at once) is not taken for a touch')
m.command('midimap-learn', {'learn': False})
ok(m.learn is None, 'learn off')

# a file that can't be read is never overwritten
bad = M.MidiMap(engine(tmp))
(m.file.parent / 'Serum 2.json').write_text('{ not json', encoding='utf-8')
bad.loaded('Serum 2')
ok(bad.blocked and bad.maps == [] and 'kept aside' in bad.load_note, 'an unreadable file: no mappings, said plainly')
bad.command('midimap-set', {'maps': [{'cc': 21, 'key': 'cutoff'}]})
aside = list(m.file.parent.glob('Serum 2.unreadable-*.json'))
ok(len(aside) == 1 and aside[0].read_text() == '{ not json' and json.loads((m.file.parent / 'Serum 2.json').read_text())['maps'][0]['cc'] == 21, 'the unreadable file is set aside (kept), then the new one written')
again = M.MidiMap(engine(tmp))
again.loaded('Vital')
ok(len(again.maps) == 3 and again.pickup == 'jump', 'a new host reads Vital\'s mappings back')
st = again.status()
ok(st['instrument'] == 'Vital' and st['maps'][0]['value'] is not None and st['never'] == [1, 64, 120, 121, 122, 123, 124, 125, 126, 127], 'status: rows with live values, what is never taken')
print(json.dumps({'pass': True, 'checks': checks}))
