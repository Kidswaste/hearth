# beatload110 (round 110): beat108's flaky comparisons were the measurement; live sound and footage now rest between frames too

Two things this round:
1. beat108's own before / after timing comparisons failed now and then under load, a different one each time, the base
   commit too, once with a beat callback 488 ms late. Real lateness in the app, or the measurement? (§1)
2. The Lab's frame gate (fps107, beat108) was still off for live sound and for video footage, so on a 240 Hz screen the
   preview woke on every screen frame with either. Both are gated now, with their timing proven the same or better at
   240 Hz and at 60 Hz in labchecks109's real scene (§2, §3).

All runs under `flock /tmp/hearth-run.lock` (SwiftShader under Xvfb, 4 CPUs shared with the other streams' runs and
tests). "Under the burn": `burn.js 6` (3 threads spinning and allocating, 3 reading and writing at random over 64 MB
each) in its own session at nice −8, as checks102 did (Hearth's processes run at nice −8; a burner at nice 0 from the
same shell barely touches them).

## 1. beat108's flaky comparisons: noise in the measurement, not late beats

### How it was found out
The page and the check were given eyes on every part of a beat callback's and a loop wrap's timing (checks only,
nothing runs without them, `tools/three-sandbox.html`, `window.__labBeat`):
- `log(true)` now also keeps **each drawn frame's time after the cap's slot for it** (`capOk`: the frame the 60 fps cap
  meant to draw vs the one it drew), **how late each frame-gate timer fired** (`gateOpen`) and **how late each edge-timer
  wake fired** (`edgeWake`): `slots()`.
- `beats()`: the beat list the page's beat helpers count on (`barInfo`).
- `cross(true)`: a look at the song's element about every millisecond, noting when its time first reaches the loop's B.
- In beat108's fake screen: how late each of its ticks came, the page's long tasks, and how often / how long the real
  frames stalled (the fake screen, like a real one, gives no frames while the page isn't really drawn).
- The scene's beat callbacks note their beat number and the page time; each is matched to the drawn frame it ran in.

### The 488 ms beat callback
Reproduced on the first instrumented run (240 Hz, after): `everyBeats` called back for beat 9 at `audio.time` 5.37 s,
**reading a beat phase of 0.0000** (right on its beat), and the check counted it **487.82 ms late** = 60 / 123 s, one
whole beat. `onHit('beat')` in the same frame: the same.

The check measured lateness against `audio.analysis.beats` (the beats the analysis detected). The page's beat helpers
count on the Lab's beat map, which for a song with a straight grid is that grid (`ThreeMedia.songMap` → `gridBeats`:
anchor + k × 60 / BPM). The two lists differ by fractions of a millisecond (beat108's "phase read off the beat by 0.1 ms"
is that difference). A drawn frame that falls between the grid's beat and the detected one is on the new beat for the
page and still on the old one for the check: one beat late on paper. labchecks109's "a beat callback 487.9 ms late" on
the base commit is the same thing (60 / 123 s = 487.8 ms).

**Not a late beat.** Fix (check): beat108 measures against the page's own list (`__labBeat.beats()`), and asserts no
callback for a beat lower than the one before (none in any run).

### The other flakes
**At 60 Hz the two stretches run the same code.** The gate never holds frames on a 60 Hz screen, and steady play has no
loop point for the edge timer: "before" and "after" are an A/A there. Yet they failed:

| Run | 60 Hz comparison that failed | before | after |
|---|---|---:|---:|
| i1 (quiet) | everyBeats after its beat, p95 | 16.95 | 21.88 |
| i2 (burn) | everyBeats after its beat, p95 | 81.15 | 93.06 |
| i2 (burn) | ⚡ kick after its kick, p50 | −47.79 | −34.38 |

A beat callback runs in the first drawn frame after its beat, so its lateness is (where the beat falls against the
cap's 60 fps slots: anywhere in 0–16.7 ms, set by that stretch's phase) + (its drawn frame's delay after its slot, and
how far into the frame's work it ran). The p95 of ~17 callbacks is their largest or second largest: one late frame
moves it by the whole delay.

**Where the delay comes from** (the drawn frames after their slots, every frame of each 8 s stretch, ≈ 300–480):

| 240 Hz | drawn after slot p50 / p95 / max (ms) | fake-screen ticks late p95 | gate timer late p95 / max | edge timer late p95 / max |
|---|---|---:|---|---|
| quiet, before (no gate) | 1.6 / 3.7 / 71 | 1.0 | – | – |
| quiet, after (gate) | 1.6 / 3.4–4.1 / 78 | 0.8 | 1.3–1.5 / 6.4 | 6.3 / 6.9 |
| burn, before | 2.1 / 60 / 213 | 1.3 | – | – |
| burn, after | 2.2 / 55 / 138 | 0.8 | **0.37 / 8.3** | 6.3 / 7.7 |

- Under the burn, drawn frames come 55–60 ms after their slots at p95, **the same with the gate or without**, while the
  page's own timers stay on time (the fake screen's ticks p95 ≤ 1.5 ms; the gate's timer p95 0.37 ms; no long task).
  The page wasn't busy: the box's real frames stalled (SwiftShader draws on the same CPUs as the burn; the fake
  screen, like a real one, has no frames to give while the page isn't really drawn: 40–55 stalls over 100 ms per 8 s
  stretch in the real scene under load).
- The beat callbacks track those frames one for one: in the burn run, the 240 Hz "after" callbacks 84, 59 and 51 ms
  late were in frames 69, 93 and 53 ms after their slots.
- **No timer starved.** Not the gate's (p95 0.37 ms, max 8.3 under the burn, against its slack of a screen frame + 4 ms)
  nor the edge timer's (p95 6.3 ms, max 7.7: its slack learns that, 3–20 ms).

**The loop wraps.** "Past B on the song's clock" is (the page's reaction to the element reaching B) + (where B fell in
the element's audio step: the element's time moves in steps of one audio callback, 10.7 ms here calm, 20–60 ms under
the burn) + (the song clock's fit). After a seek it's 3 samples (its p95 is their largest). In the failing run of
round 110's first look (b0, 240 Hz, after a seek: 19.91 → 25.83 ms), 2 of 3 wraps were seen by a frame; under the burn
(i2) the seek case's 22.94 ms had 20.85 ms of the element's own step in it.

### Something real under load, already fixed by round 108
Loop points looked at in the page's frames (the way before round 108, `legacy(true)`) came late under the burn, because
the frames did:

| Loop wrap past B, p95 (ms), under the burn | before (frames) | after (edge timer) |
|---|---:|---:|
| 240 Hz | 88.0 | 45.3 |
| 60 Hz | 93.0 | 26.8 |
| 60 Hz, after a seek | 80.1 | 7.4 |

Round 108's edge timer runs on the song's clock, not on frames, so it stays on time when frames stall. Nothing to fix
in the app for §1.

### beat108's judging now (`dev/checks/beat108.js`), checks102's way
Tolerances unchanged. A figure over its tolerance is **"can't tell"** (listed in `cantTell`, not failed) only when what's
left after taking out the box's part, measured in the same frames, is still the same or better within that tolerance;
otherwise it fails:
- **Beat callbacks and ⚡ fires**: each one less its own delay after its drawn frame's cap slot.
- **Loop wraps**: the page's reaction to the element reaching B (the check's 1 ms look) is judged on its own with no
  allowance; the rest of the figure (the element's step, the clock's fit) is the sound engine's: its growth, after over
  before, is what the load explains.
- **New, with no allowance**: at 240 Hz the drawn frames as close to their slots with the gate (p50 within 1 ms, ≈ 480
  frames: where the gate itself would show) and the gate's timer on time (p95 ≤ 4 ms).
- Beats against the page's own list; no callback for a beat before the last one.

## 2. Live sound under the frame gate

### What live sound needs between drawn frames: nothing
Traced in `tools/three-sandbox.html`:

| What | Where it runs | Needs frames between drawn ones? |
|---|---|---|
| The sound's analysis arriving from the Lab window (`'af'` from its audio worklet, or `'live-frame'`) | message tasks, ≈ every 10 ms | No: a message, never on a frame |
| Kick / snare attacks, ⚡ triggers, the live tempo (`liveTempo`), `audio.beat` / `beatPhase` / bands | `update()`, run when the scene reads the sound: in drawn frames | No: at the cap's 60 a second with the gate or without (the layers only run in drawn frames) |
| `onHit`, `everyBeats`, `onBar` | the layer's frames | No: the same drawn frames |
| The ⚡ panel's bars | their own 40 ms timer | No |

`gateMs` kept the gate off for `liveKind` since round 107 ("the beat tick's own timing"); round 108 found the same was
true of a song and moved the one thing that needed it (the loop points) onto a timer. Live sound has no loop points.
**Change:** `liveKind` no longer keeps the gate off (`GATE.legacy110`, checks only, puts it back for the A/B).

### The fake microphone
`dev/smoke.js --fake-mic`: Chromium's fake capture device (`--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=<wav> --use-fake-ui-for-media-stream`) plays a drum loop as the microphone: 125 BPM,
a kick on every beat, a snare on 2 and 4, hats on the eighths, 16 beats (7.68 s: a whole number of samples, so the loop
keeps its tempo), looping. `getUserMedia` answers with it in Electron, no prompt. The check starts live sound the
owner's way (`🎧 Live → Microphone`: the Lab window captures, its audio worklet analyses, the preview gets the `'af'`
frames) and the Lab found the tempo: 124.7–125.1 BPM in every stretch.

### Proof: `dev/checks/beatload110.js`, live part (RESULTS-LIVE)

## 3. Video footage under the frame gate

### What footage needed between drawn frames
| What | Where it ran | With the gate |
|---|---|---|
| A cut's jump (the part's end) | a timer set from the video's own presented frames (`requestVideoFrameCallback` → `partFrame`), and the page's frames looking at the element's time (`partTick`) | The video's frames come as the compositor presents them: under load seldom (≈ 5 a second here), and then the page's frames caught most cuts: with the gate 16.7 ms apart instead of 4.2. **Moved onto the edge timer too** (below). |
| A held frame's end | only the page's frames (`partTick`: the video's clock stands still on a held frame, no video frame comes) | **A timer of its own** (`holdArm`) |
| Seeking into removed frames while playing | the page's frames | **From the video's frame too** (`partTick` from `watchFrames`) |
| The texture, `media.frame`, `media.onFrame` | the video's own frames | unchanged |

### Changes (`tools/three-sandbox.html`)
- `gateMs`: footage (`isVideo`, `fparts`) no longer keeps the gate off (`GATE.legacy110` puts it back).
- **A part's end on the edge timer** (`edgeNext`, `partTick(t, src)`, `partLead`): while footage plays its cut list, the
  song's edge timer (round 108) wakes before the current part's end on the video's own clock, `partLead` before it (the
  same lead `partFrame` jumps by: 0.6 of a frame plus how late the page's timers have been), and jumps there unless the
  frame-exact jump from the video's frame is already waiting. Each part entered arms it again.
- **A held frame's end on its own timer** (`holdArm`).
- Played into removed frames with no part to end (a seek there while playing): the next part at once from the video's
  frame.
- **A bug found on the way, fixed for both** (with the gate or without): a removed frame the decoder presented after a
  cut **into a held frame** went to the sketch. `watchFrames` keeps removed frames from the sketch, but skipped that
  rule while the current part was a held frame; the cut had already made the held frame current, so a frame decoded
  before the jump got through (f90 of a cut f60–89 → f105 held, at 60 Hz under load, in the "before" stretch of run L3).
  Now a removed frame is never handed on; the hold stands.
- A looped region over footage (the cut list gives way to it) has its loop points on the edge timer too.

### Proof: `dev/checks/beatload110.js`, footage part (RESULTS-FOOTAGE)

## Runs
(RUNS)

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **The Lab rests between frames with live sound and with video too.** On a 240 Hz screen the Lab drew at most 60
  pictures a second but, with live sound (🎧 Live) or a video playing, still woke up 240 times a second. Now it wakes
  about half as often, the same as with a song. Your visuals react to the sound exactly as fast as before.
- **Video cuts stay exact on a busy computer.** When the computer is busy, the Lab now times each cut in your footage
  from the video's own clock, so it jumps on time instead of showing a bit of what you cut. A frame you cut can no
  longer slip into your scene right before a held (frozen) frame, and frozen frames end on time.
- **Behind the scenes:** the Lab's beat timing check no longer fails at random on a busy test machine. Its "one beat
  late" failures were the check comparing against a slightly different list of beats than the Lab uses; the beats
  themselves were on time.
