"""(round 69, midilearn69) Map my controller: the owner's knobs / faders → Serum 2 / Vital controls, inside the host.

Loaded by creative-vst-host.py (like creative-vst-liveset.py / creative-vst-sketch.py). docs/upgrades/midilearn69.md.

- feed(message) runs on the MIDI input thread (WinMM callback / python-rtmidi) for every channel message from the
  controller, before it is queued for the plugin. A CC that has a mapping is taken here (queued for the audio thread,
  not passed to the plugin); everything else passes untouched. Never mapped and never taken: pitch bend (not a CC), the
  mod wheel (CC 1), the sustain pedal (CC 64) and the channel-mode messages (CC 120–127).
- tick() runs on the audio worker, under the plugin lock, before each block is rendered: it turns the queued CC values
  into targets (range, invert, pickup), then glides each moving control towards its target with a one-pole smoother
  (TAU_S, per block): no zipper steps, no audible lag. A switch / a list of choices is set at once (no glide through
  the choices in between). Values are the controls' normalized 0–1 values (what the plugin stores), so every mapping
  is a range of 0–100 % of the control.
- Pickup: 'takeover' (default) leaves the control alone until the knob reaches (or passes) the control's current
  value; 'jump' moves it at once. The control moved by something else (a preset, the desk, the AI, its own window)
  makes a takeover mapping wait for the knob again.
- learn: 'midimap-learn' {learn: true} arms it: the next CC (mapped or not, except those above) is reported in status
  ('learned'); meanwhile a watcher reads the controls' values every WATCH_S and reports the one that last moved (the
  owner touched it in the plugin's window, or on the desk): 'touched'. Off with {learn: false} or after LEARN_S.
- Mappings are saved per instrument in <data>/creative-vst/midi-maps/<Vital|Serum 2>.json (written atomically, the
  previous copy kept as .prev.json; a file that can't be read is never overwritten: it is set aside first).
Pure functions (knob_value, picks_up, glide, alpha) are what dev/midilearn69-test.js checks."""
import json
import math
import os
import threading
import time
from collections import deque
from pathlib import Path

ACTIONS = ('midimap-status', 'midimap-learn', 'midimap-set')
FORMAT = 1
MAX_MAPS = 64
NEVER = frozenset([1, 64] + list(range(120, 128)))  # mod wheel, sustain, channel mode: always straight to the plugin
WHY = {1: 'the mod wheel', 64: 'the sustain pedal'}
TAU_S = 0.012          # smoothing time constant: ~95 % of a move in 36 ms, small enough to feel immediate
SNAP = 1e-4            # closer than this to the target: land on it, stop gliding
PICKUP_TOL = 0.025     # takeover: the knob within 2.5 % of the control counts as reaching it
OURS = 0.004           # the control still where we last put it (± this): nobody else moved it
WATCH_S = 0.25         # learn: how often the controls are read for "the last one touched"
LEARN_S = 120.0        # learn switches itself off after this
PRESET_BURST = 8       # more controls than this moving in one read = a preset change, not a touch
PAINT_S = 0.05         # the plugin's window is asked to repaint at most this often while a mapping moves it


# ---------- the mapping math (pure) ----------
def knob_value(cc_value, low=0.0, high=1.0, invert=False):
    """A CC value (0–127) → the control's normalized value within [low, high] (low > high is a reversed range)."""
    t = max(0, min(127, int(cc_value))) / 127.0
    if invert:
        t = 1.0 - t
    return max(0.0, min(1.0, low + (high - low) * t))


def picks_up(previous, now, current, tol=PICKUP_TOL):
    """Takeover: does the knob reach the control? Within tol of it, or it crossed it between two messages."""
    if abs(now - current) <= tol:
        return True
    return previous is not None and (previous - current) * (now - current) <= 0


def alpha(frames, rate, tau=TAU_S):
    """The one-pole smoother's step for one block of `frames` at `rate` (frame-rate independent)."""
    if tau <= 0 or rate <= 0:
        return 1.0
    return 1.0 - math.exp(-(frames / float(rate)) / tau)


def glide(current, target, a):
    """One block of the smoother: the new value, landing on the target when close."""
    nxt = current + (target - current) * a
    return target if abs(target - nxt) < SNAP else nxt


def clean(raw, pickup='takeover'):
    """The mappings as Hearth sends them → the stored shape, refusing anything odd (the window is not trusted)."""
    if not isinstance(raw, list) or len(raw) > MAX_MAPS:
        raise ValueError('Up to %d mappings per instrument.' % MAX_MAPS)
    out, seen = [], set()
    for m in raw:
        if not isinstance(m, dict):
            raise ValueError('Invalid mapping.')
        cc, ch, key = m.get('cc'), m.get('ch'), m.get('key')
        if isinstance(cc, bool) or not isinstance(cc, int) or not 0 <= cc <= 127 or cc in NEVER:
            raise ValueError('A mapping needs a knob / fader CC (not the mod wheel, sustain or 120–127).')
        if ch is not None and (isinstance(ch, bool) or not isinstance(ch, int) or not 0 <= ch <= 15):
            raise ValueError('Invalid MIDI channel.')
        if not isinstance(key, str) or not key or len(key) > 200:
            raise ValueError('A mapping needs a control.')
        low, high = m.get('min', 0.0), m.get('max', 1.0)
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in (low, high)):
            raise ValueError('A range is 0–100 %.')
        if (cc, ch, key) in seen:
            continue
        seen.add((cc, ch, key))
        label = m.get('label') if isinstance(m.get('label'), str) else key
        out.append({'cc': cc, 'ch': ch, 'key': key, 'label': label[:120], 'min': float(low), 'max': float(high), 'invert': m.get('invert') is True})
    return out, ('jump' if pickup == 'jump' else 'takeover')


class MidiMap:
    def __init__(self, engine):
        self.e = engine
        self.maps = []
        self.pickup = 'takeover'
        self.by_cc = {}            # (channel, cc) -> [mapping index]
        self.inbox = deque(maxlen=512)  # (index, cc value): from the MIDI thread to the audio thread
        self.state = []            # per mapping: {'picked', 'prev', 'cc', 'at'}
        self.glides = {}           # key -> {'cur', 'target', 'step': bool}
        self.ours = {}             # key -> (value we last wrote, monotonic time)
        self.name = ''
        self.file = None
        self.load_note = ''
        self.saved_at = None
        self.blocked = False       # the file exists but couldn't be read: set aside before the next save
        self.learn = None          # {'armed', 'since', 'cc', 'ch', 'value', 'at', 'ignored'}
        self.touched = None        # {'key', 'label', 'at'}
        self.watcher = None
        self.dirty = False
        self.painter = None
        self.events = 0
        self.taken = 0

    # ---------- where they live ----------
    def folder(self):
        cache = getattr(self.e, 'cache_dir', None)
        return Path(cache).parent / 'midi-maps' if cache else None

    def loaded(self, name):
        """The instrument now in this host (Vital / Serum 2): its mappings from disk."""
        if name == self.name and self.file is not None:
            return
        self.name, self.maps, self.pickup, self.blocked, self.load_note = name, [], 'takeover', False, ''
        folder = self.folder()
        self.file = folder / (name + '.json') if folder else None
        if self.file is not None and self.file.exists():
            try:
                data = json.loads(self.file.read_text(encoding='utf-8'))
                if not isinstance(data, dict) or data.get('format') != FORMAT:
                    raise ValueError('not a mapping file')
                self.maps, self.pickup = clean(data.get('maps') or [], data.get('pickup'))
            except Exception as error:
                self.blocked = True
                self.maps = []
                self.load_note = 'Your saved mappings for %s could not be read (%s); they are kept aside, nothing was overwritten.' % (name, str(error)[:80])
        self.index()

    def index(self):
        by = {}
        for i, m in enumerate(self.maps):
            by.setdefault((m['ch'], m['cc']), []).append(i)
        self.by_cc = by
        self.state = [{'picked': self.pickup == 'jump', 'prev': None, 'cc': None, 'at': None} for _ in self.maps]
        self.inbox.clear()

    def save(self):
        if self.file is None:
            self.load_note = 'Mappings are kept for this session only (no data folder).'
            return False
        self.file.parent.mkdir(parents=True, exist_ok=True)
        if self.blocked and self.file.exists():
            aside = self.file.with_name('%s.unreadable-%d.json' % (self.name, int(time.time())))
            os.replace(self.file, aside)
            self.blocked = False
        elif self.file.exists():
            try:
                prev = self.file.with_name(self.name + '.prev.json')
                prev.write_bytes(self.file.read_bytes())
            except OSError:
                pass
        part = self.file.with_name(self.file.name + '.part')
        part.write_text(json.dumps({'format': FORMAT, 'instrument': self.name, 'pickup': self.pickup, 'maps': self.maps}, indent=1), encoding='utf-8')
        os.replace(part, self.file)
        self.saved_at = time.time()
        return True

    # ---------- the MIDI input thread ----------
    def feed(self, message):
        """True: this message was taken (a mapped CC); False: it goes on to the plugin untouched."""
        if len(message) < 3 or (message[0] & 0xF0) != 0xB0:
            return False  # notes, pitch bend, pressure, program change: never ours
        ch, cc, value = message[0] & 0x0F, message[1], message[2]
        learn = self.learn
        if learn is not None and learn.get('armed'):
            if cc in NEVER:
                learn['ignored'] = WHY.get(cc, 'CC %d' % cc)
            else:
                learn.update({'cc': cc, 'ch': ch, 'value': value, 'at': time.time(), 'ignored': None})
        if cc in NEVER:
            return False
        hits = self.by_cc.get((ch, cc), []) + self.by_cc.get((None, cc), [])
        if not hits:
            return False
        self.events += 1
        for i in hits:
            self.inbox.append((i, value))
        return True

    # ---------- the audio worker (plugin lock held) ----------
    def read(self, key):
        index = self.e.index
        if index is not None:
            return float(index[key].raw_value)
        return float(self.e.parameters[key].raw_value)

    def write(self, key, value):
        index = self.e.index
        if index is not None:
            index[key].raw_value = value
        else:
            self.e.parameters[key].raw_value = value
        self.ours[key] = (value, time.monotonic())
        self.dirty = True

    def stepped(self, key):
        m = getattr(self.e, 'meta', {}).get(key)
        return bool(m and m.get('kind') in ('bool', 'str'))

    def tick(self, frames, rate):
        if not self.inbox and not self.glides:
            return
        while self.inbox:
            try:
                i, value = self.inbox.popleft()
            except IndexError:
                break
            if i >= len(self.maps):
                continue
            self.apply(i, value)
        if not self.glides:
            return
        a = alpha(frames, rate)
        for key in list(self.glides):
            g = self.glides[key]
            g['cur'] = g['target'] if g['step'] else glide(g['cur'], g['target'], a)
            try:
                self.write(key, g['cur'])
            except Exception:
                self.glides.pop(key, None)
                continue
            if g['cur'] == g['target']:
                self.glides.pop(key, None)
        self.wake_painter()

    def apply(self, i, cc_value):
        m, s = self.maps[i], self.state[i]
        key = m['key']
        try:
            current = self.read(key)
        except Exception:
            return
        g = self.glides.get(key)
        mine = self.ours.get(key)
        # somebody else moved it (a preset, the desk, the AI, its own window): takeover waits for the knob again
        if mine is not None and abs(current - mine[0]) > OURS:
            self.glides.pop(key, None)
            g = None
            for j in self.by_key(key):
                self.state[j]['picked'] = self.pickup == 'jump'
                self.state[j]['prev'] = None
            self.ours.pop(key, None)
        target = knob_value(cc_value, m['min'], m['max'], m['invert'])
        s['cc'], s['at'] = cc_value, time.time()
        if self.pickup != 'jump' and not s['picked']:
            where = g['target'] if g else current
            if not picks_up(s['prev'], target, where):
                s['prev'] = target
                return
            s['picked'] = True
        s['prev'] = target
        self.taken += 1
        if g is None:
            self.glides[key] = {'cur': current, 'target': target, 'step': self.stepped(key)}
        else:
            g['target'] = target

    def by_key(self, key):
        return [j for j, m in enumerate(self.maps) if m['key'] == key]

    # ---------- the plugin's window shows the moves ----------
    def wake_painter(self):
        if not self.e.editor or (self.painter is not None and self.painter.is_alive()):
            return
        self.painter = threading.Thread(target=self.paint, daemon=True)
        self.painter.start()

    def paint(self):
        quiet = 0.0
        while quiet < 2.0 and self.e.editor:
            time.sleep(PAINT_S)
            if self.dirty:
                self.dirty, quiet = False, 0.0
                try:
                    self.e.embed.repaint()
                except Exception:
                    pass
            else:
                quiet += PAINT_S

    # ---------- learn: the next CC, and the control last touched ----------
    def arm(self, on):
        if not on:
            self.learn = None
            return
        self.learn = {'armed': True, 'since': time.time(), 'cc': None, 'ch': None, 'value': None, 'at': None, 'ignored': None}
        self.touched = None
        if self.watcher is None or not self.watcher.is_alive():
            self.watcher = threading.Thread(target=self.watch, daemon=True)
            self.watcher.start()

    def watch(self):
        """While learning: read every control's value every WATCH_S (in slices, the plugin lock per slice so audio
        never waits long) and remember the one that last moved by itself — the owner turned it in the plugin's window."""
        before = None
        while self.learn is not None and time.time() - self.learn['since'] < LEARN_S:
            index = self.e.index
            if index is None or self.e.plugin is None:
                time.sleep(WATCH_S)
                continue
            keys, now = list(index), {}
            for start in range(0, len(keys), 200):
                with self.e.lock:
                    for key in keys[start:start + 200]:
                        try:
                            now[key] = float(index[key].raw_value)
                        except Exception:
                            pass
            if before is not None:
                fresh = time.monotonic()
                moved = [(abs(v - before.get(k, v)), k) for k, v in now.items() if abs(v - before.get(k, v)) > SNAP
                         and not (k in self.ours and fresh - self.ours[k][1] < 1.0)]
                if 0 < len(moved) <= PRESET_BURST:
                    key = max(moved)[1]
                    meta = getattr(self.e, 'meta', {}).get(key) or {}
                    label = meta.get('label') or getattr(index.get(key), 'name', key)
                    self.touched = {'key': key, 'label': label, 'at': time.time()}
            before = now
            time.sleep(WATCH_S)
        if self.learn is not None and time.time() - self.learn['since'] >= LEARN_S:
            self.learn = None

    # ---------- Hearth's requests ----------
    def status(self):
        rows = []
        for m, s in zip(self.maps, self.state):
            try:
                with self.e.lock:
                    value = self.read(m['key'])
            except Exception:
                value = None
            rows.append({**m, 'value': value, 'picked': s['picked'], 'knob': s['prev'], 'cc_value': s['cc']})
        learn = dict(self.learn) if self.learn else None
        return {'instrument': self.name, 'pickup': self.pickup, 'maps': rows, 'learn': learn, 'touched': self.touched,
                'file': str(self.file) if self.file else None, 'savedAt': self.saved_at, 'note': self.load_note,
                'events': self.events, 'taken': self.taken, 'listening': bool(self.e.midi.handles), 'never': sorted(NEVER)}

    def command(self, action, job):
        if not self.name and job.get('name'):
            self.loaded(job['name'])  # normally done when the instrument loads (Engine.load)
        if action == 'midimap-learn':
            self.arm(job.get('learn') is True)
            return self.status()
        if action == 'midimap-set':
            maps, pickup = clean(job.get('maps'), job.get('pickup', self.pickup))
            with self.e.lock:
                self.maps, self.pickup = maps, pickup
                self.glides.clear()
                self.index()
            if job.get('learn') is False:
                self.learn = None
            self.save()
            return self.status()
        return self.status()
