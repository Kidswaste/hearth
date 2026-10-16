# labscrub (round 49): scrubbing and zooming the Lab timeline at 240 Hz

Goal: dragging the playhead, zooming and scrolling the waveform, and dragging a clip in the Lab timeline should feel
instant on a 240 Hz screen, with a full scene (8 layers, keyframe lanes open, a 🅰 kinetic type layer) on a
4-minute song. When you let go, the preview must show the exact frame where the playhead stopped.

Where it lives: `tools/three-media.js` (the timeline: seeks, drawing, the waveform / beat grid pictures, the wheel, the
scrub sound), `tools/three-sandbox.html` (one small hook: a timeline seek is answered after a drawn frame),
`tools/three.js` (one small hook: a dragged layer's live props go to the preview once a frame).

## What I found (traced with `dev/checks/labscrub.js` + `dev/trace-stats.js`)
1. **Seeks queued up instead of coalescing (the big one).** Every pointer move sent a seek to the preview, and the
   preview answered every one. With 8 layers the preview draws far slower than a mouse moves, so a fast scrub left a
   queue: 126 seeks for 2 drawn frames here. After letting go, the preview still showed 1.44 s (the start of the
   drag) and the window stayed busy for about 70 s working through the queue.
2. **The whole timeline canvas was redrawn per move** while scrubbing (129 full redraws, ≈ 4.6 ms each here with 8
   tracks and 5 lanes), although only the playhead (its own element), the time and the lane values change.
3. **The waveform and the beat grid were rebuilt on every wheel event** while zooming or scrolling (one picture per
   view: every new view = a new picture, column by column), synchronously inside the wheel handler (handlers p95
   ≈ 18 ms).
4. **Forced style / layout per move**: the canvas' place read on every pointer move, and the playheads' style
   written before the header column's text was drawn (its font setting then restyled the page): 317 forced
   recalcs (342 ms) in one scrub.
5. **A dragged clip sent a layer message per pointer event** (53 for 80 moves while the preview drew 5 frames).
6. **Shift+wheel didn't scroll on Windows** (and Linux, and macOS mouse wheels): Chromium turns Shift+wheel into a
   sideways wheel (deltaX), and the timeline only read deltaY with Shift held, so it moved by 0.
7. No scrub sound existed.

## Measured (before → after)
`dev/checks/labscrub.js` on Xvfb + SwiftShader, a 4-core machine shared with four other agents (load 8–17), the
same check on the base commit (40a5550 + the counters only) and on this branch. Inputs come in bursts ~4 ms apart,
like a fast mouse or trackpad. CPU = the Lab window's main-thread CPU time from the trace, per input. The counts are
exact; the ms are this machine's (several times a Mac's).

| What | Before | After |
|---|---:|---:|
| **Scrub** (241 moves across 4 min and back): seeks sent to the preview | 126 | **5–11** (one per frame it draws) |
| … seeks waiting per drawn preview frame | up to 139 | **≤ 1–2** |
| … the preview on the exact frame after letting go | still 1.44 s at +0.4 s; window busy ≈ 70 s | **exact, 0.45–1.4 s** here (its next drawn frame; the preview draws 2–5 fps on this loaded machine) |
| … full timeline redraws | 129 | **0** (only the header column's lane values) |
| … main-thread CPU per move | 5.4 ms (+ the queue after) | **1.8 ms** |
| … total CPU for the stretch | 1,298 ms (+ ≈ 70 s busy after) | **430 ms** |
| … forced style / layout | 317 (342 ms) | **1 (10 ms, not ours)** |
| **Pan** (60 sideways trackpad steps at one zoom): waveform + grid rebuilds | 21 + 21 | **1 + 1** |
| … wheel handlers p95 | 18.7 ms | 1.5–10 ms (the work moved to one frame) |
| **Zoom** (60 pinch steps in and out): waveform + grid rebuilds | 37 + 37 (every drawn step) | **10 + 10** (18 at load 30, when steps come > 160 ms apart) |
| … main-thread CPU per step | 7.8 ms | **4.1 ms** |
| … wheel handlers p95 · forced recalcs | 18.1 ms · 40 | 0.9–5.9 ms · 1 |
| **Clip drag** (80 moves): layer messages to the preview | 53 | **12** (one per frame) |
| **Scrub sound** (80 moves): grains played · extra CPU per move | — | 12 · ≈ +0.2 ms |
| A JS profile of a pan stretch (after) | — | < 60 ms of JS in 60 steps: the rest is the renderer |

## Upgrades

### Scrubbing
1. **One seek at a time, always the newest**: while you drag the playhead, the preview gets the next position only
   after it has drawn the last one (it answers after a frame its fps cap let the layers draw); meanwhile only the
   newest time waits. A fast scrub never piles up seeks the preview can't draw, and the preview follows the
   pointer as fast as it can draw.
2. **The exact frame on release**: the last seek is always where the playhead stopped, so the preview lands on that
   exact time (checked: its clock and the frame it drew last both equal the playhead to the millisecond). A play
   pressed right after sends the waiting seek first; loading a song clears the queue.
3. **No full redraw while scrubbing**: only the timeline's header column (the lane values at the playhead) is drawn
   again; the playhead and time move on their own elements. Playback with lanes open draws only that column too (it
   redrew the whole canvas 20 times a second).
4. **No layout read per move**: the canvas' place is read once per drag (and once per wheel burst), and the
   playheads are placed after the canvas is drawn (their style write made the next canvas font restyle the page).
5. **The control row isn't walked per scrub frame**: a scrub frame draws the timeline and places the playheads, not
   the 30-odd buttons and inputs of the media bar.

### Zooming and scrolling the waveform
6. **The waveform and the beat grid are cached a view either side**: at one zoom, scrolling (trackpad, Shift+wheel,
   the overview, a jump, following the playhead while it plays) only picks another part of the same picture. A new
   picture is drawn when you go past it (once per ~view), capped at ≈ 12,000 device pixels across.
7. **A pinch stretches the last picture**: while you zoom with the trackpad or the wheel, the current waveform and
   grid are stretched (up to 4× either way) and drawn crisp 160 ms after your fingers rest.
8. **One draw per frame**: wheel events change the view at once and the timeline is drawn once in the coming frame (a
   trackpad sends several a frame; each one drew everything inside the handler).
9. **Section names stay readable when scrolled**: the section names are drawn over the cached picture per view, so a
   section that started off screen keeps its name at the left edge.
10. **Shift+wheel scrolls on Windows** (and with a Mac mouse wheel): the sideways wheel Chromium makes of it is read.

### Dragging clips and values
11. **A dragged layer's changes go to the preview once a frame**: dragging a clip's bar, its edges, or a value in the
    Layers panel merges the moves of a frame into one message (the final one on release is sent as before).

### Hearing where you are
12. **Scrub sound**: dragging the playhead plays short slices of the song where it is (60 ms, faded, at the Lab's
    volume, ≤ 1 every 45 ms), like a DJ's jog wheel. A click to jump stays silent; it only sounds once you move. Its
    own small audio context starts on the first scrub and sleeps 1.5 s after the last one. On by default (cheap:
    ≈ 0.2 ms per move); off in the play button's right-click menu ("Sound while dragging the playhead").

### Measuring
13. `dev/checks/labscrub.js`: the 8-layer, 4-minute scene above; scrub, pan, zoom, clip drag and scrub sound with real
    input bursts; budgets on CPU per move, late frames, seeks per drawn frame and per move, waveform rebuilds, clip
    messages per move, and how soon the exact frame shows after letting go (zoom rebuilds are counted per timeline
    draw, so a loaded machine spacing the pinch steps doesn't fail it). `window.LS_TRACE = 1` adds the trace
    per stretch, `window.LS_PROFILE = 'pan'` a JS profile. In the `lab` and `smooth` groups and its own `labscrub`
    group (`sh dev/run-checks.sh labscrub`).

Count: 13 upgrades (12 user-facing behaviours and fixes, 1 measuring tool).

## Tests
`sh dev/run-checks.sh --exact labscrub labpace labkeys labdirect kinetictype sequence music idlecpu inputlatency lazy
unit:boot-test`: see the final report for the outcome. `node --check` on every file touched.

## Edits outside the lane
- `tools/three-sandbox.html` (labgpu's file): `sendState(x)` takes extra fields; `mediaCommand` takes `ack`; a small
  `ackSeek()` (6 lines).
- `tools/three.js` (labhub's file): `editLayer`'s live sends go through a per-frame merge (`livePend`, `liveFlush`).
- `dev/run-checks.js`: the check in both `lab` lines, in `smooth`, and a `labscrub` group.

## Caveats
- The preview here draws only a few frames a second (8 WebGL layers on software GL on a loaded machine), so "the
  exact frame after letting go" took 0.45–0.7 s in the check; on a real GPU it is the next preview frame.
- Seeks from the footage side (a video with frame-exact stepping, `tools/three-frames.js`) keep their own path.
- While a pinch is under way the waveform is a stretched picture for up to 160 ms (slightly soft), then crisp.
- The scrub sound uses the analysis' 22 kHz copy of the song (lighter than the full file); it isn't heard on a
  scene's own timeline (no song) or with the music muted.

## For the patch notes
- Scrubbing the Lab timeline is instant now, even with many layers: the preview follows your pointer as fast as it
  can draw and never falls behind, and when you let go it shows exactly the frame where the playhead stopped.
- Before, a fast scrub on a busy scene could leave the preview catching up for a long time afterwards; that's gone.
- Zooming and scrolling the waveform are much lighter: the waveform and beat grid are kept as pictures, so scrolling
  only moves them and a trackpad pinch stretches them until your fingers rest.
- New: you hear the song under the playhead while you drag it (a short slice, like a DJ's jog wheel). A click to jump
  stays silent. Turn it off in the ▶ button's right-click menu.
- Dragging a clip or a layer value sends one update per frame to the preview instead of one per mouse move.
- Fix: Shift+wheel scrolls the timeline sideways on Windows (it didn't move before).
