# beatload110 (round 110): beat108's flaky comparisons were the measurement; live sound and footage rest between frames too

Two things this round:
1. beat108's own before / after timing comparisons failed now and then under load, a different one each time, the base
   commit too, once with a beat callback 488 ms late. Late beats in the app, or the measurement? (§1)
2. The Lab's frame gate (fps107, beat108) was still off for live sound and video footage: on a 240 Hz screen the
   preview woke on every screen frame with either. Both are gated now, their timing proven the same or better at
   240 Hz and 60 Hz in labchecks109's real scene, and footage's cuts are timed from the video's own clock (§2, §3).

All runs under `flock /tmp/hearth-run.lock` (SwiftShader under Xvfb, 4 CPUs shared with the other streams' runs and
tests). "Under the burn": `burn.js 6` (3 threads spinning and allocating, 3 reading and writing at random over 64 MB
each) in its own session at nice −8, as checks102 did (Hearth's processes run at nice −8; a burner at nice 0 from the
same shell barely touches them). Run names below (b0, i1…, L1…, F1…, G1…) are the logs of this round.

## 1. beat108's flaky comparisons: noise in the measurement, not late beats

### How it was found out
The page and the check were given eyes on every part of a beat callback's and a loop wrap's timing. All checks-only:
nothing runs or is kept unless a check turns it on (`tools/three-sandbox.html`, `window.__labBeat`):
- `log(true)` also keeps **each drawn frame's time after the cap's slot for it** (`capOk`: the frame the 60 fps cap meant
  to draw vs the one it drew), **how late each frame-gate timer fired** (`gateOpen`), **how late each edge-timer wake
  fired** (`edgeWake`), how often the sound was read and whether outside a drawn frame (`update`), and for each ⚡ fire
  its frame: `slots()`, `state()`, `trigs()`.
- `beats()`: the beat list the page's beat helpers count on (`barInfo`'s).
- `cross(true)`: a look at the song's element about every millisecond, noting when its time first reaches the loop's B.
- In beat108's fake screen: how late each of its ticks came, the page's long tasks, how often and how long the real
  frames stalled (the fake screen, like a real one, gives no frames while the page isn't really being drawn).
- The scene's beat callbacks note their beat number and the page time; each is matched to the drawn frame it ran in.

### The 488 ms beat callback: the check's beat list, not the page's
Reproduced on the first instrumented run (i1, 240 Hz, after): `everyBeats` called back for beat 9 at `audio.time`
5.37 s **reading a beat phase of 0.0000**, right on its beat, and the check counted it **487.82 ms late** = 60 / 123 s,
one whole beat. `onHit('beat')` in the same frame: the same.

The check measured lateness against `audio.analysis.beats`, the beats the analysis detected. The page's beat helpers
(`barInfo`) count on the Lab's beat map instead (`ThreeMedia.songMap`: the grid's beats, anchor + k × 60 / BPM, when the
analysis found a straight grid or you set one). The two lists differ by fractions of a millisecond (beat108's "phase read off the beat by
0.1 ms" is that difference). A drawn frame falling between a grid beat and its detected twin is on the new beat for the
page and still on the old one for the check: one beat late on paper. labchecks109's "a beat callback 487.9 ms late" on
the base commit is the same thing (60 / 123 s = 487.8 ms).

**Not a late beat.** Fix (check): beat108 measures against the page's own list (`__labBeat.beats()`) and asserts that no
callback comes for a beat lower than the one before (none in any run).

### The other flakes
**At 60 Hz the two stretches of each run run the same code.** The gate never holds frames on a 60 Hz screen, and steady
play has no loop point for the edge timer: there "before" and "after" are an A/A. Yet they failed:

| Run | 60 Hz comparison that failed | before | after |
|---|---|---:|---:|
| i1 (calm) | everyBeats after its beat, p95 | 16.95 | 21.88 |
| i2 (burn) | everyBeats after its beat, p95 | 81.15 | 93.06 |
| i2 (burn) | ⚡ kick after its kick, p50 | −47.79 | −34.38 |

A beat callback runs in the first drawn frame after its beat. Its lateness is where the beat falls against the cap's
60 fps slots (anywhere in 0–16.7 ms, set by that stretch's phase) + its drawn frame's delay after its slot (and how far
into the frame's work it ran) + one screen frame (the song is read at the frame's show time). The p95 of ~17 callbacks
is their largest or second largest: one late frame moves it by its whole delay. A tolerance of 3 ms on that is noise
by construction.

**Where the delay comes from**: each stretch's drawn frames after their slots (all of them, ≈ 480 calm, ≈ 300–360 under
the burn), and the page's timers:

| 240 Hz | drawn after slot p50 / p95 / max (ms) | fake-screen ticks late p95 | gate timer late p95 / max | edge timer late p95 / max |
|---|---|---:|---|---|
| calm, before (no gate) | 1.5–1.8 / 3.3–3.7 / 71 | 1.0–2.4 | – | – |
| calm, after (gate) | 1.5–1.8 / 3.4–4.2 / 78 | 0.8–2.2 | 1.3–1.7 / 6.4 | 6.3 / 6.9 |
| burn, before | 2.0–2.1 / 37–73 / 213 | 1.0–1.6 | – | – |
| burn, after | 2.1–2.4 / 51–69 / 138 | 0.7–2.2 | **0.37–3.0** / 8.3 | 6.3 / 7.7 |

- Under the burn, drawn frames come 37–73 ms after their slots at p95, **the same with the gate or without**, while the
  page's own timers stay on time (the fake screen's ticks p95 ≤ 2.2 ms; the gate's timer p95 ≤ 3 ms; no long task
  seen). The page wasn't busy: the box's real frames stalled, 28–49 times for 1–3.3 s in an 8 s stretch (SwiftShader
  draws on the same 4 CPUs as the burn; the fake screen has no frame to give then, as a real one wouldn't).
- The beat callbacks track those frames one for one: in i2 (burn, 240 Hz, after) the callbacks 84, 59 and 51 ms late
  ran in frames 69, 93 and 78 ms after their slots.
- **No timer starved.** Not the gate's (p95 0.37–3.0 ms, max 8.3 under the burn, against its slack of a screen frame +
  4 ms), nor the edge timer's (p95 6.3 ms, max 7.7: its slack learns that, 3–20 ms).
- **The ⚡ fires** are decided where the scene reads the sound. D1 and G1 counted it: 509–512 reads in 8 s (≈ 64 a
  second, 16 ms apart) in all four stretches, **0 outside a drawn frame**, every fire in a drawn frame, with the gate or
  without. Their p50 against the kicks moves with where the analyser's onsets fall against those frames: 3.5 ms between
  two stretches of the same code at 60 Hz calm (F2), 13 ms under the burn (i2).

**The loop wraps.** "Past B on the song's clock" is (the page's reaction to the element reaching B) + (where B fell in
the element's audio step: its time moves in steps of one audio callback, 10.7 ms calm, 20–60 ms under the burn) + (the
song clock's fit). After a seek it's 3 samples (its p95 is their largest). The first failing run of this round (b0,
240 Hz, after a seek: 19.91 → 25.83 ms) had 2 of its 3 wraps seen by a frame; under the burn (i2) the seek case's
22.94 ms had 20.85 ms of the element's own step in it.

### Something real under load, fixed already by round 108
Loop points looked at in the page's frames (before round 108: `legacy(true)`) came late under the burn, because the
frames did:

| Loop wrap past B, p95 (ms), under the burn | before (frames) i2 / i5 / F3 | after (edge timer) i2 / i5 / F3 |
|---|---:|---:|
| 240 Hz | 88.0 / 127.7 / 93.3 | 45.3 / 34.6 / 23.3 |
| 60 Hz | 93.0 / 83.4 / 42.5 | 26.8 / 19.8 / 28.1 |
| 60 Hz, after a seek | 80.1 / 90.4 / 51.1 | 7.4 / 2.7 / 14.9 |

Round 108's edge timer runs on the song's clock, not on frames, and stays on time when frames stall. **Nothing to fix
in the app for §1.**

### beat108's judging now (`dev/checks/beat108.js`), checks102's way
Tolerances unchanged. A figure over its tolerance is **"can't tell"** (listed in `cantTell`, not failed) only when
what's left after taking out the box's part, measured in the same stretch, is still the same or better; else it fails.
- **Beat callbacks**: each one less its own delay after its drawn frame's cap slot must be the same or better than
  before, or within one cap period + one screen frame of its beat (it ran in the first drawn frame after it).
- **⚡ fires**: the cadence is judged with no allowance (the sound read in drawn frames only, as often with the gate as
  without; every fire in a drawn frame). The fires' p50 over its tolerance is can't tell only while the box's real
  frames stalled in either stretch; on a calm box it fails.
- **Loop wraps**: the page's reaction to the element reaching B (the check's 1 ms look) is judged on its own with no
  allowance; the rest of the figure (the element's step, the clock's fit: the sound engine's) is what the load
  explains when the whole figure is over.
- **New, no allowance**: at 240 Hz the drawn frames as close to their slots with the gate (p50 within 1 ms) and the gate's
  timer on time (p95 ≤ 4 ms).
- The fake screen "ticks like a fast one" counts its rate while it ticks (its stalls left out: i5 under the burn read
  112 a second with 3 s of stalls in it).

## 2. Live sound under the frame gate

### What live sound needs between drawn frames: nothing
Traced in `tools/three-sandbox.html`:

| What | Where it runs | Needs frames between drawn ones? |
|---|---|---|
| The sound's analysis from the Lab window (`'af'` from its audio worklet, or `'live-frame'`) | message tasks, ≈ every 10 ms | No: a message, never a frame |
| Kick / snare attacks, ⚡ triggers, the live tempo (`liveTempo`), `audio.beat` / `beatPhase` / bands | `update()`, when the scene reads the sound: drawn frames | No: at the cap's 60 a second with the gate or without (the layers only run in drawn frames) |
| `onHit`, `everyBeats`, `onBar` | the layer's frames | No: the same drawn frames |
| The ⚡ panel's bars | their own 40 ms timer | No |

`gateMs` kept the gate off for `liveKind` since round 107 ("the beat tick's own timing"). Round 108 found the same of
a song and moved its one frame-bound part (the loop points) onto a timer; live sound has none. **Change:** live sound no
longer keeps the gate off (`GATE.legacy110`, checks only, puts it back for the A/B).

### The fake microphone
`dev/smoke.js --fake-mic`: Chromium's fake capture device (`--use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=<wav> --use-fake-ui-for-media-stream`) plays a drum loop as the microphone: 125 BPM,
a kick on every beat, a snare on 2 and 4, hats on the eighths, 16 beats (7.68 s: a whole number of samples, so the
loop keeps its tempo). `getUserMedia` answers with it in Electron, no prompt. The check starts live sound the owner's
way (`🎧 Live → Microphone`: the Lab window captures, its audio worklet analyses, the preview gets `'af'` frames); the
Lab found the tempo every time (124–126.6 BPM).

### Proof: `dev/checks/beatload110.js`, live part
labchecks109's real scene (Backdrop shader, Beat burst particles, 🧊 model with its 1024² picture, the beat rig's raw loop
+ `onHit` ×3 + `everyBeats` + `onBar`, ✦ Bloom) plus a probe layer, live sound on. 8 s per stretch. On this box the
real scene draws only 22–42 of its 60 frames a second, and its real frames stall 29–61 times a stretch: the raw
figures carry those delays, the same with the gate or without; "less frame delay" takes each event's own frame's delay
after its slot out.

| H2 (calm box, final code) | 240 before | 240 after | 60 after | 60 before |
|---|---:|---:|---:|---:|
| Page frames a second (per drawn one) | 143.6 (3.81) | **83.3 (2.09)** | 42.6 (1.19) | 39.7 (1.19) |
| Drawn after their slot, p50 (ms) | 2.1 | 2.2 | 14.7 | 14.7 |
| Gate timer late, p95 (ms) | – | 0.7 | – | – |
| Real frames stalled (times, s of the 8) | 48, 2.8 | 51, 2.9 | 57, 1.6 | 53, 2.0 |
| ⚡ kick reaction (fire − the sound's arrival), p50 / p95 (ms) | 12.3 / 78.5 | 11.9 / 74.6 | 12.8 / 53.8 | 12.2 / 47.0 |
| … less frame delay, p50 / p95 | 1.6 / 21.8 | **1.0 / 11.6** | −8.3 / 1.1 | −9.3 / 9.2 |
| everyBeats after its live beat, p50 / p95 (ms) | 8.5 / 197.2 | 12.1 / 88.7 | 14.1 / 51.3 | 13.8 / 54.7 |
| … less frame delay, p50 / p95 | −2.1 / 15.1 | **−8.3 / 14.4** | −11.4 / 12.9 | −13.0 / 3.4 |
| Kicks fired / live beats called back (none skipped, twice or back) | 20 / 17 | 22 / 17 | 22 / 17 | 22 / 17 |

| F7 (under the burn; the ⚡ reaction then counted from the first crossing after a re-arm) | 240 before | 240 after | 60 after | 60 before |
|---|---:|---:|---:|---:|
| Page frames a second (per drawn one) | 82.2 (3.80) | **59.7 (2.49)** | 26.5 (1.20) | 26.1 (1.20) |
| Real frames stalled (times, s of the 8) | 29, 4.9 | 32, 4.8 | 36, 4.0 | 35, 4.1 |
| ⚡ kick reaction, p50 / p95 (ms) | 30.8 / 129.7 | 48.7 / 175.7 | 13.2 / 89.7 | 22.7 / 159.7 |
| … less frame delay, p50 / p95 | −12.5 / 9.7 | **1.8 / 13.4** | −12.3 / 9.7 | −11.2 / 11.7 |
| everyBeats after its live beat, p50 / p95 (ms) | 16.4 / 166.7 | 41.1 / 225.3 | 11.7 / 136.3 | 18.2 / 156.3 |
| … less frame delay, p50 / p95 | −36.8 / 13.3 | **−34.7 / 13.9** | −72.0 / 3.8 | −72.6 / 14.3 |
| Live beats skipped / twice / counted back | 0 | 3 | 1 | 1 |

- **Frames:** 3.8 → 2.1–2.5 page frames per drawn one at 240 Hz (a song's since round 108: 2.2–2.4). Nothing to save
  at 60 Hz.
- **Timing:** in every "after" stretch, each event less its frame's delay is the same or better than before, or within
  one cap period of its cause: the ⚡ reacts in the first drawn frame after the sound arrives, a beat callback in the
  first after its beat, with the gate or without. The raw p50 / p95 differences are the frames' delays (the box), as the 60 Hz A/A pairs show.

## 3. Video footage under the frame gate

### What footage needed between drawn frames
| What | Where it ran | With the gate |
|---|---|---|
| A cut's jump (a part's end) | a timer set from the video's presented frames (`requestVideoFrameCallback` → `partFrame`), and the page's frames looking at the element's time (`partTick`) | The video's frames come as the compositor presents them; on a busy box ≈ 3–5 a second, and the page's frames caught most cuts after the part's end (even before: 4.2 ms apart at 240 Hz). With the gate they'd be 16.7 ms apart. **Moved onto the edge timer, from the video's own clock.** |
| A held frame's end | only the page's frames (the video's clock stands still on a held frame: no video frame comes) | **A timer of its own** |
| Seeking into removed frames while playing | the page's frames | **From the video's frame too** |
| The texture, `media.frame`, `media.onFrame` | the video's own frames | unchanged |

### Changes (`tools/three-sandbox.html`)
- `gateMs`: footage (`isVideo`, `fparts`) no longer keeps the gate off (`GATE.legacy110` puts it back).
- **A part's end on the edge timer** (`edgeNext`, `partTick(t, src)`, `partLead`): while footage plays its cut list,
  round 108's edge timer wakes before the current part's end on the video's own clock and jumps `partLead` before it
  (the same lead `partFrame` aims for from the frame on screen: 0.6 of a frame plus how late the page's timers have
  been). Whichever of the two comes first jumps. Each part entered arms it again.
- **A held frame's end on a timer of its own** (`holdArm`): a wake 4 ms early, then looks ≈ 1 ms apart.
- Played into removed frames with no part to end (a seek there while playing): the next part at once, from the
  video's frame.
- A looped region over footage (the cut list gives way to it) has its loop points on the edge timer too.
- **Two bugs found on the way, fixed for both (with the gate or without):**
  - **A removed frame reached the sketch before a held frame.** `watchFrames` keeps removed frames from the sketch, but
    skipped that rule while the current part was a held frame; the cut had already made the held frame current, so a
    frame decoded before the jump got through (f90 of a cut f60–89 → f105 held: run L3, 60 Hz, before). Now a removed
    frame is never handed on; the hold stands.
  - **Footage stopped on a held frame and sent elsewhere played frozen.** A held frame plays at rate 0; a seek (a click
    on the timeline) or a new cut list put the footage in another part without its speed, so it stayed at rate 0 and
    never moved again (run L4: both 60 Hz stretches presented no frame after a stop inside a hold). `partRate` sets the
    part's speed (or starts the hold) on a seek and on a new cut list.

### Proof: `dev/checks/beatload110.js`, footage part
The same real scene; a 30 fps video with its sound (frame numbers burned in), a cut list of six half-second parts with
a second removed between each and three frames held 0.25 s, looped: ≈ 16 cuts and 8 holds in each 10 s stretch. "Cut
ahead" is how far before the part's end, on the video's own clock, the page jumped (negative: removed footage played).

| H2 (calm box, final code) | 240 before | 240 after | 60 after | 60 before |
|---|---:|---:|---:|---:|
| Page frames a second (per drawn one) | 111.2 (3.76) | **71.8 (2.26)** | 32.9 (1.20) | 36.4 (1.19) |
| Removed frames handed to the sketch | 0 | 0 | 0 | 0 |
| Cut ahead of the part's end, p50 / min (ms) | −4.7 / −71.3 | **19.3 / −4.7** | **21.1 / 18.3** | −4.7 / −28.7 |
| Cuts after the part's end | 15 of 16 | **2 of 16** | **0 of 16** | 12 of 15 |
| … made by: the video's frame / the edge timer / a page frame / a late video frame | 4 / – / 8 / 4 | 0 / 14 / 2 / 0 | 0 / 16 / 0 / 0 | 7 / – / 8 / 0 |
| Held frame let go after its end, p50 / max (ms) | 5.2 / 86 | **0.9 / 5.1** | **0.6 / 12.8** | 34.2 / 66.7 |

| F7 (under the burn) | 240 before | 240 after | 60 after | 60 before |
|---|---:|---:|---:|---:|
| Page frames a second (per drawn one) | 62.6 (3.60) | **43.1 (2.33)** | 21.1 (1.19) | 21.6 (1.19) |
| Removed frames handed to the sketch | 0 | 0 | 0 | 0 |
| Cut ahead of the part's end, p50 / min (ms) | −4.7 / −120 | **20.6 / −52.7** | **20.8 / −4.7** | −4.7 / −122 |
| Cuts after the part's end | 9 of 14 | **2 of 16** | **1 of 16** | 11 of 13 |
| … made by: the video's frame / the edge timer / a page frame / a late video frame | 9 / – / 2 / 3 | 1 / 14 / 1 / 0 | 1 / 14 / 1 / 0 | 5 / – / 6 / 2 |
| Held frame let go after its end, p50 / max (ms) | 46.1 / 170 | **0 / 5.8** | **0.5 / 5.4** | 84.5 / 241 |

- **Frames:** 3.8 → 2.3 page frames per drawn one at 240 Hz.
- **Cuts:** before, on this box, most cuts came after the part's end (12–15 of 16, by up to 71–122 ms of removed
  footage, its sound included), at 240 Hz as at 60: the video's frames were too few to time them and the page's frames
  caught them late. Now cuts jump ≈ 19–21 ms ahead of the part's end from the video's clock, at both rates; 0–2 of 16
  still came after it (by at most 4.7 ms calm, 53 ms under the burn: the edge timer's wake itself late on a box that
  busy).
- **Held frames** end within about a millisecond of their length (p50; max 5–13 ms), instead of up to a drawn frame and
  more late (p50 5–85 ms here, with the box's late frames).
- Still never a removed frame in the sketch.

## Files
- `tools/three-sandbox.html`: `gateMs` (live sound, footage); footage: `edgeNext` / `mediaEdge` / `partTick(t, src)` /
  `partLead` (a part's end on the edge timer), `holdArm`, `partRate`, `watchFrames` (removed frames during a hold, a
  stale part), `enterPart`; checks only: `CAPLOG` (in `rafStep`, `gateOpen`, `edgeWake`), `TRIGLOG` (reads, fires,
  `trigArrive` for live arrivals), `partNote`, `window.__labBeat` (`legacy110`, `slots`, `beats`, `cross` /
  `crossings`, `arrivals`, `state`).
- `dev/smoke.js`: `--fake-mic` (`fakeMicWav`, `window.SMOKE_FAKE_MIC`).
- `dev/checks/beatload110.js` (new; group `beatload110` in `dev/run-checks.js`), `dev/checks/beat108.js` (judging,
  instrumentation), `dev/checks/realscene-lib.js` (its fake screen counts the real frames' stalls: `P.load()`).
- `docs/windows-test-plan.md` §16.

## Runs
All under the run lock; "burn" as above.

**beat108 with this round's judging** (final code):

| Run | Box | Result | Can't tell (listed, not failed) |
|---|---|---|---|
| G1 | calm | ✓ | none |
| G2 | **burn** | ✓ | 240 Hz everyBeats p95 42.9 → 116.6 (less frame delay 14.7 → 12.6); 60 Hz 54.0 → 82.7 (9.7 → 15.6, within one drawn frame + one screen frame of the beat) |
| G3 | calm | ✓ | 60 Hz everyBeats p95 14.7 → 17.8 (less frame delay 12.1 → 10.9) |

Earlier runs of the same check while the judging was being built: F2 ✓ and F4 ✓ (calm, nothing listed), F3 (burn) ✖ on
the ⚡ kick's p50 at 240 Hz (−48.6 → −42.9) with a first try at taking the frame delay out of the fires (biased: a late
frame lets the analyser hear more of the kick); the diagnostic run D1 then showed the fires' cadence identical with the
gate or without, and the fires are judged as above since. On round 109's judging the first runs here (b0, i1, i2)
each had one to four comparisons out (§1), the 488 ms one among them.

beat108's own figures in the last runs (240 Hz), page frames per drawn one before → after: 4.09–4.16 → 2.23–2.42 calm,
3.71–3.76 → 2.22–2.29 under the burn; the loop wrap past B p95 26–30 ms after (30–53 before) calm, 23–35 ms after
(70–128 before) under the burn.

**beatload110** (each ✖ below was a line of the check's own, fixed in the check after; every timing comparison held):
- F1 (calm) ✖ on one line: the footage stretches' "the scene's loops ran" (realscene-lib) wanted the beat rig's
  `onHit('kick')`, which didn't fire on the footage's softer thump; the ⚡ kick's bar is now set for it each stretch.
  Live and footage timing all ✓ (the tables above).
- F7 (burn) ✖ on two lines: the live tempo's beat order (3 against 0; now judged against the stalls, see "What's left")
  and the drawn-frames-a-second floor (18.5 a second under the burn).
- G4 (calm) ✖ on two lines: "the same drawn frames a second" (36.4 → 39.8 over the stretch; corrected for the stalls it
  read 55 → 62, an over-correction: now judged with the drawn frames' place after their slots when the box stalls) and
  "the gate holds no frames at 60 Hz" (9 in 8 s: after a stall the fake 60 Hz screen's ticks come bunched and the gate
  takes it for a fast screen for a moment; the cap still decides which frame draws: now reported, not asserted).
  Live: 2.08 page frames per drawn one at 240 Hz after (3.71 before), every event less its frame's delay the same or
  better; footage: 16 cuts 21.3 ms ahead (p50) after, 1 after the end, vs 14 of 16 after the end before; held frames
  0.4 / 2.5 ms late (p50 / max) vs 3.2 / 49.9.
- H1 (calm) ✖ on one line: the ⚡ reaction's p95 at 240 Hz after, 32.9 ms less its frame's delay: the reaction was
  counted from the first analysis frame over the bar since the trigger re-armed, and the kick band hovered at the bar
  (dipped under it, back over): the drawn frame that read it under rightly didn't fire. Now counted from the analysis
  frame that brought the band over the bar for that fire.
- **H2 (calm, final code): ✓** (the tables above), two can't-tell lines: 240 Hz everyBeats p50 8.5 → 12.1 (less frame
  delay −2.1 → −8.3), 60 Hz ⚡ reaction p95 47.0 → 53.8 (9.2 → 1.1).

**The others** (F5, F6; this round's app code): `fps107` ✓, `labfps89` ✓ (one 233 ms frame "can't tell under load":
172.8 ms waiting for a CPU), `labcompile90` ✓ (one 167 ms frame, can't tell, the same way), `labaudio77` ✓,
`perfectloop` ✓, `labpace` ✓, `gpuload84` ✓, `labframes` ✓, `labframes-more` ✓ (footage: frame-exact steps, cuts, the
sketch never sees a removed frame, at 60 Hz on the real screen).

**`release`** (full output read for ✖): **303 / 308 passed**, the 3 known Codex failures (KNOWN_FAIL), 1 opt-in
skipped, 0 temp folders left, `unit:boot-test` ✓. Two ✖:
- `unit:project-desk-test`: **mine.** It runs `capOk` from the preview page on its own, and this round's drawn-frame log
  was inside it (`CAPLOG is not defined`). The log moved to `capOk`'s caller (`rafStep`); `capOk` is as it was. Run
  again: ✓ (H1, with the other unit tests that slice the preview page: labaudio77, labpace, framebar, labfps72,
  perfectloop, labadapt, playchurn81, scene-recording, labshadow91, physics, boot-test: all ✓).
- `unit:liveset64-test`: "no underrun while the heavy preset loaded and switched (0 → 1)": the Sound desk's Python host
  (Codex's, untouched here) had one audio underrun on the loaded box. Run again alone under the lock: ✓ (H1).

## For Codex
No Codex-owned file was edited.

## What's left
- **Live tempo under load.** The live tempo clock takes each kick's time when a drawn frame reads it (`liveTempo(now)` in
  `runTriggers`). Frames that come late (the box's) move its phase: under the burn the 240 Hz "after" stretch of F7
  had one live beat skipped and two counted back, "before" none (and the 60 Hz A/A pair one each). Taking each kick at
  its sound's arrival (the `'af'` frame's) would steady it, but would move where `audio.beat` lands by about half a
  drawn frame, and the owner calibrates live latency by ear: not done without him.
- The numbers are from a faked screen; `docs/windows-test-plan.md` §16 asks for the real one's GPU % with live sound
  and footage, and an eye on the cuts and held frames.

## For the patch notes
- **The Lab rests between frames with live sound and with video too.** On a 240 Hz screen the Lab drew at most 60
  pictures a second, but with live sound (🎧 Live) or a video playing it still woke up 240 times a second. Now it wakes
  a bit more than half as often, the same as with a song, and your visuals react to the sound exactly as fast as before.
- **Video cuts stay exact on a busy computer.** The Lab now times each cut in your footage from the video's own clock,
  so it jumps on time instead of letting a bit of the part you cut play (and be heard) when the computer is busy. Frozen
  frames end on time too.
- **Two video fixes.** A frame you cut could slip into your scene right before a frozen frame; and a video stopped on a
  frozen frame, then moved elsewhere on the timeline, could stay frozen when you pressed play. Both fixed.
- **Behind the scenes:** the Lab's beat timing check no longer fails at random on a busy test machine. Its "one beat
  late" failure was the check comparing against a slightly different list of beats than the Lab uses; the beats
  themselves were on time.
