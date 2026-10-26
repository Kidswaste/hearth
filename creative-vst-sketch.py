"""(round 66, bouncelog66) Session log: "Save a 30-second sketch" for the Sound desk (docs/upgrades/bouncelog66.md).

Loaded by creative-vst-host.py (like creative-vst-liveset.py). While live audio runs, the audio worker hands each block
it has made (the instrument + the Live set's clips, before the monitor volume: what the owner hears) to keep(), which
copies it into a ring of the last 30 seconds. Nothing is written anywhere until the owner clicks "Save a sketch":
'sketch-save' then writes the ring's last 30 s (or less, if less was played) as a 16-bit stereo 48 kHz WAV at the path
Hearth's main process chose (job['output'], never one from the window), with 5 ms fades at both ends.
'sketch-status' says how much is kept and how long ago something was last heard (Hearth's session clock counts a
controller-only jam as activity this way, with one small request every 30 s while the desk is on screen).
Cost: one slice copy per block into a preallocated float32 ring (≈ 11.5 MB at 48 kHz); no thread, no lock in the audio
path (a save copies the ring and skips the oldest blocks the worker might be overwriting)."""
import os
import time
import wave

SECONDS = 30.0          # what a sketch keeps
SPARE_S = 0.5           # ring margin: a save never reads the part the audio worker may be writing
SILENT = 1e-4           # a block quieter than this isn't "something heard"
FADE_S = 0.005          # 5 ms fade at both ends of the sketch (no click)
TARGET_RATE = 48000     # every Sound desk file is 48 kHz (creative-vst-host.py TARGET_RATE)
ACTIONS = ('sketch-status', 'sketch-save')


class Sketch:
    def __init__(self, engine):
        self.e = engine
        self.ring = None
        self.rate = 0
        self.at = 0          # next write position in the ring
        self.filled = 0      # frames kept so far (≤ ring size)
        self.heard = None    # time.monotonic() of the last block with sound
        self.saved = 0

    def keep(self, block):
        """Audio worker, after each block: copy it into the ring (allocated on the first block / a rate change)."""
        np = self.e.np
        rate = int(self.e.rate)
        if self.ring is None or rate != self.rate:
            self.rate, self.at, self.filled = rate, 0, 0
            self.ring = np.zeros((2, int((SECONDS + SPARE_S) * rate)), dtype=np.float32)
        n, size = block.shape[1], self.ring.shape[1]
        end = self.at + n
        if end <= size:
            self.ring[:, self.at:end] = block
        else:
            cut = size - self.at
            self.ring[:, self.at:] = block[:, :cut]
            self.ring[:, :n - cut] = block[:, cut:]
        self.at = end % size
        self.filled = min(size, self.filled + n)
        if self.e.peak > SILENT:  # the worker measured this block's peak just before
            self.heard = time.monotonic()

    def status(self):
        kept = 0.0 if not self.rate else min(SECONDS, self.filled / self.rate)
        return {'kept': round(kept, 2), 'seconds': SECONDS, 'running': self.e.running.is_set(),
                'soundAgo': None if self.heard is None else round(time.monotonic() - self.heard, 2), 'saved': self.saved}

    def last(self):
        """The ring's newest min(30 s, filled) frames in time order, as (2, n) float32 (a copy)."""
        np = self.e.np
        if self.ring is None or not self.filled:
            return np.zeros((2, 0), dtype=np.float32), self.rate or 48000
        at, filled, ring = self.at, self.filled, self.ring  # one read of the worker's position
        size = ring.shape[1]
        n = min(filled, int(SECONDS * self.rate), size - int(SPARE_S * self.rate))
        start = (at - n) % size
        out = ring[:, start:start + n].copy() if start + n <= size else np.concatenate([ring[:, start:], ring[:, :n - (size - start)]], axis=1)
        return out, self.rate

    def save(self, job):
        np = self.e.np
        output = job.get('output')
        if not output:
            raise ValueError('No place to save the sketch.')
        audio, rate = self.last()
        if audio.shape[1] < rate * 0.5:
            raise ValueError('Nothing to save yet: play something first (the sketch keeps the last 30 seconds of the desk).')
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if peak < SILENT:
            raise ValueError('The last 30 seconds were silent, so nothing was saved. Play something and save again.')
        frames = round(audio.shape[1] * TARGET_RATE / rate)
        audio, converted = self.e.to_target(audio, rate, frames)
        fade = min(audio.shape[1] // 2, int(FADE_S * TARGET_RATE))
        if fade > 0:
            ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
            audio = audio.copy()
            audio[:, :fade] *= ramp
            audio[:, -fade:] *= ramp[::-1]
        pcm = (np.clip(audio.T, -1, 1) * 32767).astype('<i2')
        part = str(output) + '.part'
        with wave.open(part, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(TARGET_RATE)
            w.writeframes(pcm.tobytes())
        os.replace(part, str(output))
        self.saved += 1
        return {'path': str(output), 'seconds': round(pcm.shape[0] / TARGET_RATE, 3), 'frames': int(pcm.shape[0]),
                'sampleRate': TARGET_RATE, 'peak': round(peak, 5), 'playedRate': rate, 'converted': converted}

    def command(self, action, job):
        if action == 'sketch-status':
            return self.status()
        if action == 'sketch-save':
            return self.save(job)
        raise ValueError('Unknown sketch action.')
