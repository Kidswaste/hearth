# beat108 (round 108): the Lab with a song rests between its frames on a fast screen, its timing to the music unchanged

Round 107 (`fps107.md`) made the Lab preview page wake only near the frames its 60 / 30 cap draws on a fast screen,
but left the gate off while a song or live sound played ("the beat tick reads the song clock every frame"). The
owner makes music visuals, so the Lab with a song playing, his main use, still woke on every one of the 240 screen
frames to draw 60. This round finds out what that per-frame tick really needed and moves the part that can't wait
for a drawn frame onto the song's own clock.

## What the per-frame tick needed, piece by piece
Everything the preview page does with a playing song was traced to where it runs (`tools/three-sandbox.html`):

| What | Where it ran | Needs frames between drawn ones? |
|---|---|---|
| **The loop points (A–B), the trimmed song's end** (`mediaTick`) | a frame loop of its own, on every screen frame: "has the element's time passed B?" | **Yes.** It acts on the sound (puts the song back at A), so the moment matters whether a picture is drawn or not. At 240 Hz it looked every 4.2 ms; held to drawn frames it would look every 16.7 ms and the song would play up to 12 ms more past B. **Moved onto a timer from the song's position (below).** |
| A recording's end (`recUntil`), footage parts (`partTick`) | the same frame loop | Yes, but a recording, footage and its cuts keep the gate off as before (unchanged). |
| The song's clock for the pictures (`songNow`, labaudio77) | read in each frame (a layer's in / out, keyframes); an audio-clock sample at most every 4 ms | No. Each drawn frame reads the clock at its own show time. The samples come from the sound card's output timestamps, which move once per audio callback (≈ 10 ms): with the gate the page still samples ≈ 140 times a second, more than the clock has news. The pictures against the audio clock: p95 1.39 ms before, 1.34 after. |
| `audio.beat`, `beatPhase`, `bar`, `audio.time`, cues, features, keyframes, layer in / out, the loop helpers | in the layers' code, which the 60 / 30 cap already ran on drawn frames only | No: drawing only, worked out at the drawn frame's show time as before. |
| The ⚡ triggers firing (`audio.kick` / `snare` / `hats`… from the spectrum) | `update()`, run when the scene reads the sound: in drawn frames | No. They were already decided on drawn frames; the same frames now. Fire times unchanged (below). |
| The ⚡ panel's bars | their own 40 ms timer while the panel is open | No (never on frames). |
| `onHit`, `onBar`, `onCue`, `everyBeats` (user code on a beat) | the layer's own frames (capped: drawn frames only) | No. They already landed in the next drawn frame, reading the beat phase at its show time; unchanged. |
| Tap tempo, ⚡ / K S H marker taps | the Lab window, not the preview page | Not affected. |

So only the loop points needed precise timing between drawn frames, and polling the screen's frames was a coarse way
to get it (one screen frame of slack, plus one step of the element's time).

## What changed
- **The song's edges on their own timer** (`tools/three-sandbox.html`, "the song's edges between drawn frames":
  `edgeArm`, `edgeWake`, `edgeLook`, `mediaEdge`). While a song plays with a loop (A–B) or a trimmed end ahead, a timer
  wakes one audio step (the element's time moves in steps of one audio callback, ≥ 10 ms) + a slack (3–20 ms, learnt
  from how late the timer comes: Windows' timers can be coarse) before the song can reach the edge, then looks every
  ≈ 1 ms until it has, each look its own task so the element's time is fresh (a 1 ms timer asked for from a message
  task: a chain of timers is held to 4 ms after five). A song that doesn't get there (stalled, a busy machine) is
  looked at every 8 ms after 60 ms of fine looks, never a busy loop. The edge is acted on exactly as before (the same
  rule: the element's time reached B, it was in the loop just before), within about a millisecond of the element
  reaching it, drawn frame or not. The frames still look too, whichever sees it first acts. A seek, a play, a new
  region / trim / loop setting or speed arms it again from where the song is.
- **The frame gate holds frames while a song plays** (`gateMs`). Still off with live sound, footage (its frame-exact
  parts), a recording, a sequence, a show, an offline render, ▶ Play, a frame step, the export page and on a 60 Hz
  screen.
- **A fix to round 107's gate, found on the way** (`realRAF`): a frame the gate held answered the id `0`, and the
  page's loops keep the id as "a frame is coming" (`LQ.raf`). In a gated stretch every layer frame asked for queued the
  layers' flush again; the extra flushes ran the next frame's layer callbacks in the same frame, which queued more. With
  one frame loop in a scene it stayed at one (fps107's check scene); with two or more (`onHit`, `everyBeats`, a second
  animation loop), it grew without end: 20,000 callbacks a second within seconds here, until the preview lost its
  graphics context and Hearth remade the page over and over. Held frames now answer an id (`GATE_ID`) and are held
  once. This affected any such scene on a fast screen since round 107, with or without a song.
- **`dev/checks/beat108.js`** (group `beat108` in `dev/run-checks.js`), below. `window.__labBeat` (checks only):
  `legacy(true)` puts the page back as it was before this round (edges in frames only, gate off with a song) for an
  A/B in one run; `log(true)` records each edge acted on and each ⚡ fire with where the song was on its clock.
- **`docs/windows-test-plan.md`** §15: the GPU % with a song on the real 240 Hz screen, and the loop by ear.

## How it was measured: `dev/checks/beat108.js`
fps107's fake screen in the Lab preview's own page (requestAnimationFrame answered on a 240- or 60-a-second grid while
the page is really being drawn), with its rate switched during the run. A generated song (123 BPM: not a whole number
of 60 fps frames a beat, so drawn frames fall at every phase of the beat; a kick on every beat, hats between) on a
scene that reads `audio.time` / `beat` / `kick` / `level` every frame and logs `everyBeats(1)` and `onHit('beat')`.
Each of the four (240 Hz, 60 Hz) × (before, after) runs, in the same page and the same run (the order swapped between
the rates):
- 8 s of steady play: the page's frames a second and per drawn one; the pictures against the audio clock
  (labaudio77's frame log); each beat callback's lateness after its beat on the song's clock and the beat phase it
  read; the ⚡ kick trigger's fires against the nearest kick (the song's heard time at the fire − the kick).
- A loop of 1.1 s crossing its end 8 times while playing, then 3 seeks to 0.3 s before B while playing: where the song
  was when the page put it back at A, past B: on the song's clock (the audio clock's fit at that moment, heard time +
  the output path) and in the element's own time.

## Before → after (one run under the run lock: SwiftShader, 4 shared CPUs)

| | 240 Hz before | 240 Hz after | 60 Hz before | 60 Hz after |
|---|---:|---:|---:|---:|
| Page frames a second / drawn a second | 246.7 / 60.0 | **139.3** / 59.9 | 62.0 / 60.0 | 62.5 / 60.0 |
| **Page frames per drawn frame** | **4.11** | **2.33** | 1.03 | 1.04 |
| Page timers a second (the gate's one per drawn frame, the edge's looks) | 6 | 66 | 6 | 6.1 |
| Loop wrap past B on the song's clock, p50 / p95 (ms) | 32.7 / 34.4 | **26.7 / 32.3** | 35.7 / 44.7 | **22.5 / 25.3** |
| … in the element's own time, p50 / p95 (ms: one audio step) | 14.3 / 14.6 | 11.9 / 13.5 | 14.6 / 14.6 | 12.1 / 13.1 |
| Loop wrap past B after a seek just before it, p50 / p95 (ms) | 21.2 / 22.1 | **16.3 / 18.2** | 17.7 / 18.6 | **7.6 / 8.5** |
| Wraps acted on by a frame / by the edge timer | 8 / 0 | 2 / 6 | 8 / 0 | 2 / 6 |
| Pictures against the audio clock, p50 / p95 (ms) | 0.97 / 1.39 | 0.69 / 1.34 | 0.32 / 1.78 | 0.35 / 1.64 |
| `everyBeats` callback after its beat, p50 / p95 (ms; within one drawn frame) | 9.9 / 15.5 | 9.3 / 17.3 | 8.2 / 15.0 | 5.4 / 14.7 |
| Beats missed / phase read off the beat by | 0 / 0.1 ms | 0 / 0.1 ms | 0 / 0.1 ms | 0 / 0.1 ms |
| ⚡ kick fire vs the kick heard, p50 / p95 (ms; before the speakers: the analyser hears the sound as it's made) | −44.8 / −32.9 | −44.5 / −35.3 | −46.2 / −38.0 | −44.8 / −36.4 |

- **Frames:** from about 4 to about 2.3 wakes per drawn frame with a song at 240 Hz (the same as fps107's Lab without a
  song: one held frame and the drawn one), the same 60 drawn. At 60 Hz there was nothing to save.
- **The loop point:** earlier at both rates, never early (the same rule: the element's time reached B). What's left
  past B is mostly one audio step of the element's time (how the browser reports where the song is: ≈ 12–15 ms here).
  The song-clock figure also carries the output path's estimate, the same in both columns.
- **Beats, beat phase, triggers, pictures:** the same within the scheduling noise of one drawn frame (8 s, 17 beats
  per run): they are decided on drawn frames, before and after. The beat callback's spread is one drawn frame
  (16.7 ms), as it always was; `onHit('beat')` (a pulse over 0.9) can skip a beat at 60 drawn frames a second exactly as
  before this round (16 of 17 in one run), `everyBeats` never does.
- The check's budgets: ≤ 2.6 page frames per drawn one at 240 Hz with a song; every timing figure the same or better
  than before within a tolerance for noise (the loop's p50 / p95 within 1 ms, after a seek 2 ms, the pictures 1.5 ms,
  the beat callbacks 3 ms, the ⚡ fires' p50 4 ms), never a wrap before B, every beat called back once with its phase,
  the same drawn frames a second. `BEAT108_REPORT = 1` reports without failing.

## What's left
- **Live sound** still keeps the gate off. Its beat (the tempo clock, the kick attacks) is also decided on reads in drawn
  frames, so it most likely can be gated the same way, but the check has no live input to prove it with; a next round
  can add a simulated one (the hub's `live-frame` messages).
- **Footage** (a video song, its cut parts) keeps the gate off: its parts are cut frame-exact from the frame loop.
- **What the element reports**: the loop's last bit past B is now the browser's own step in the song's time (one audio
  callback). Wrapping on the song's predicted position instead would cut that too, but would change when the loop
  jumps (a guess instead of the sound engine's word); not done.
- The numbers are from a faked screen; §15 of the Windows test plan asks for the real one's GPU % and an ear on the loop.

## Runs
- `beat108`: pass (the table above).
- `fps107 labpace labfps89 labboot gpuload84 labaudio77 labaudio beatlink perfectloop unit:labaudio77-test
  unit:boot-test`: 11 / 11 pass (labfps89 noted one 450 ms frame as "can't tell under load", as it does under load).
- `release`: 304 / 307 passed (the 3 known Codex failures), 0 temp folders left; `unit:boot-test` passes.
- On the way, the first runs of beat108 kept losing the preview's graphics context on the 240 Hz fake screen; that was
  the gate's runaway above (20,000 frame callbacks a second with the check scene's three frame loops), fixed before the
  numbers above were taken.

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **The Lab rests between its frames while your song plays, too.** On a 240 Hz screen the Lab drew at most 60 pictures
  a second, but with a song playing it still woke up 240 times a second. Now it wakes about 140 times, the same as
  without a song. The pictures, the beats, the kicks and everything that follows the music land exactly where they did.
- **Loops snap back a little sooner.** When a loop reaches its end, the Lab jumps back a few milliseconds sooner than
  before (about 5 ms sooner on a 240 Hz screen and 13 ms on a 60 Hz one), so less of the next beat slips in before the
  jump.
- **A fix for scenes with several music reactions on fast screens.** Since the last update, a scene with two or more
  things following the beat (say an "on each beat" and a "on each bar") could make the preview work harder and harder on
  a 240 Hz screen until it had to restart. Fixed.
