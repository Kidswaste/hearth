# labpace (round 33): the Lab preview paced for 60–240 Hz screens, and light

Goal: the Three.js Lab preview should feel right on a fast screen (120–240 Hz) and stay light. Motion should run at the
same speed on any screen, a picture that isn't changing should stop drawing, a hidden Lab should do no work, and a
laptop on battery should go lighter by itself. Nothing new shows on screen by default.

Where it lives: `tools/three-sandbox.html` ("Frame pacing", `<pace-core>`; small hooks in the render wrapper, the
layer frame wrapper, the four page loops, `applyCap`, the adapt core's `floor`), `tools/three.js` (the battery, the
Frame pace row and readout, the battery note text, `cmd().pace()` and `perf().pace`), `tools/three-lab.css` (the
readout), per-frame templates in `tools/three-fx-templates.js`, `tools/three-gallery-data.js` and `tools/three-data.js`,
and one line in the director's on-demand help (`mcp/three-guide.js`, the audio helpers topic, not the prompt).

## What I found (the starting point)
- **The render loop**: each layer drives its own `requestAnimationFrame` / `setAnimationLoop`. The sandbox wraps rAF
  per layer (freeze, hidden, parked and the fps cap), so there's one callback per layer per frame and no double
  loops. Nothing draws from `setInterval`. Physics uses fixed steps on the scene's clock, and particles and shaders
  use time.
- **Speed depended on the screen.** The templates' music envelopes (`kick = Math.max(kick * 0.9, audio.kick)`) and
  spins (`rotation.y += 0.01`) step once per frame. On a 240 Hz screen in Auto fps (which runs at the screen's rate)
  they spun 4× faster and kicks faded 4× sooner. 26 such lines were in templates the owner starts from.
- **A still scene drew every frame.** A sketch's loop calls `render()` each frame even when nothing moved: full GPU
  work at the screen's rate for an identical picture.
- **A parked Lab still woke up every frame.** Layer frames already waited in the park queue. But the page's own loops
  (the frame counter, the compositor tick, the song's loop-point tick, the sequence clock) asked for a frame every
  frame forever, so a hidden Lab woke its page 60–240 times a second for nothing.
- **Electron**: `main.js` has no `disable-frame-rate-limit` or `disable-gpu-vsync` switch (good: vsync-paced rAF,
  no tearing, no wasted frames). The main window keeps the default `backgroundThrottling`, and the Stage window turns
  it off on purpose (a second screen must keep playing). Left as is.
- labadapt has no lower resolution while dragging. It only steps down after sustained slow windows.

## Measured (before → after)
`dev/checks/labpace.js`, SwiftShader under Xvfb (a 60 Hz display) on a busy shared machine, 640×360 frame. Absolute
fps are low here, so read the ratios. "Before" is the same build with pacing switched off (`__labPace.on(false)`),
interleaved with "after", twice each.

| What | Before | After |
|---|---|---|
| **A still scene** (a knot + 40 spheres, drawn each frame by its loop): frames drawn / s | 13.4–16.7 | **1.7** (a refresh a second + the probe's own messages) |
| Same: WebGL draw calls / s | 547–683 | **68 (−88 to −90 %)** |
| The scene changes itself (a timer, no message): first frame drawn after the change | — | **17 ms** (one frame here), then still again after 3 frames |
| A slider moved / a pointer over the preview | — | draws at once (4 / 3 frames) |
| **A parked Lab** (another tool in front): draw calls in 2 s | 0 | 0 |
| Same: page frames asked for in 2 s | every frame (4 loops re-arming forever, ≈ 120+ at 60 Hz, ≈ 480+ at 240 Hz) | **1** (the probe's own message woke it once) |
| Back on screen: first frame drawn | — | 110 ms (with the hub's message round trip) |
| **A spin written per frame**, turn per second at the screen's rate vs a 5 fps cap: the old `+= 0.01` | proportional to the fps: 0.18–0.21 at 18–21 fps vs 0.05 at 5 fps | — |
| Same written with `f60` (`+= 0.01 * f60`) | — | **0.60 / 0.62 / 0.60** (18 fps / 5 fps / 21 fps: equal within noise) |
| An animated scene, pacing off vs on: frames drawn / s · frame gap p50 · p95 · σ | 20.6 · 50 · 67 · 12.9 ms | 21.8 · 50 · 67 · 14.2 ms (same within this machine's noise) |
| The still-picture signature's cost per looked-at frame (this scene, SwiftShader machine) | — | 105–140 µs; Node: 0.3 µs per object (500 objects: 245 µs), an animating scene is looked at on 1 frame in 8 |
| Battery: Auto fps · preview resolution | screen rate · 100 % | **60 fps at most · 85 %** (step 1), back to screen rate · 100 % when plugged in |

In Node (`dev/labpace-test.js`, fake 60 / 120 / 144 / 240 Hz clocks): with f60 a spin, a damped drift and a kick
envelope come out the same at every rate (spin 1.20 / 1.21 / 1.21 / 1.21 turns in 2 s, 1.19 capped at 30; the kick
envelope matches 0.9 per 1/60 s to 1e-15). Without f60, 240 Hz spun 4.8 against 1.2. A still scene at 240 Hz for
3 s draws 7 frames instead of 720. A change made by the scene's own code shows within 3 frames (≤ 15 ms) at 240 Hz
and on the next frame at 60 Hz.

## Upgrades

### The same speed on every screen
1. **f60 in every sketch frame**: each frame callback gets `f60`, that frame's length counted in 60 fps frames (1 at
   60 Hz, 0.5 at 120, 0.25 at 240, 2 when a cap skips a frame). Motion written per frame (`x *= 0.9 ** f60`,
   `a += 0.01 * f60`) keeps its 60 fps speed everywhere. Offline renders use their own frame times, the first frame
   after a pause counts as 1, and a ¼ s hitch doesn't make motion jump.
2. **The templates are paced**: 26 per-frame lines in the FX templates, the gallery and the starter sketches now go
   through f60: kick and snare envelopes, peak meters, spectrum holds, spins and damping. New scenes from them move
   and pulse the same at 60, 120 and 240 Hz. Saved scenes keep their own code.
3. **The director knows**: the director's help on audio helpers (read on demand, not in the prompt) tells it to write
   per-frame motion with f60.

### Draw only when the picture can change
4. **A still picture stops drawing**: when a three.js layer's next frame would match the one on screen, it stops
   drawing after two identical frames. The check is a signature of everything that changes the picture: transforms,
   visibility, materials, uniforms, textures, geometry and instance versions, lights, camera, background and fog,
   canvas size, exposure and the preview's own resolution. No pixels are read. The layer's code keeps running.
5. **It draws again at once**: on a slider, any message from the Lab, a pointer, a key or a resize. A change the
   scene makes by itself shows within one 60 Hz frame (15 ms), and the picture is drawn again once a second anyway,
   in case of a change the signature can't see.
6. **Never where it could be wrong**: these always draw: video textures, custom shader hooks it can't read (an
   `onBeforeCompile` without `userData.shader`, `onBeforeRender`), renderers that draw more than once a frame
   (post-processing, render targets), scenes over 4,000 objects, and layers another layer reads. The same goes for
   a layer's first frames, cross-fades, sequences, precomps, the scene editor, frame steps, stills, recordings,
   exports and the export page.
7. **Cheap**: the signature is skipped on 7 frames in 8 while a scene moves, and is worked out at most every 15 ms
   while it's still. A material or geometry shared by many objects is read once.

### A hidden Lab does nothing
8. **The parked page sleeps**: with the Lab off screen and nothing to do (no recording, no offline render, no song
   or sequence playing), the frame counter, the compositor, the song's loop-point tick and the sequence clock stop
   asking for frames. Showing the Lab, any message, a pointer or any render wakes them.

### Battery and interaction
9. **On battery, lighter by itself**: when the computer runs on battery (the browser's battery status), Auto fps holds
   60 at most and the preview starts at labadapt's first step (85 % resolution). Plugged back in, both return at once.
   The corner note says "lighter on battery · full quality in renders". Renders, stills and recordings stay full
   quality, and a fixed fps setting or adapting turned off is respected.
10. **Smooth orbit / drag / scrub on a slow preview**: while a pointer is held (or the wheel turns) over the preview
    and frames are slow, it draws at 70 % of its resolution. On release it's full again at once. It only latches
    when frames are slow, never while things are smooth, and only with "Lighten to stay smooth" on.

### Frame pace readout
11. **⋯ › Frame pace** (Lab toolbar): the row shows the preview's pace right in the menu: "120 fps · steady", "a few
    drops", "uneven", "still · not drawing", "parked · not drawing", plus "· battery". Ticking it keeps a tiny readout
    in the preview's top-left corner. It's off by default, hidden in Present and full screen, and adds no rows.
12. `/lab perf` (`perf().pace`) reports the pace too: fps, the label, frames drawn / skipped / refreshed, the
    signature's cost and battery.

## Tests
Run: `sh dev/run-checks.sh labpace lazy unit:boot-test smooth-lab labframes perfectloop smooth32 labadapt`: all pass
(labpace failed once on a readout timing; fixed by making "still" robust to the probe's own message, then passed).
- `node dev/labpace-test.js` (unit): 59 checks. They cover f60 values, equal progress at 60 / 120 / 144 / 240 Hz,
  under a cap and with jitter, and the "before" (4× at 240 Hz). They lint that no per-frame decay, spin or damping is
  left without f60 in the three template files, and that the guide line is there. The signature sees 17 kinds of
  change and the right things make a scene "live". Its cost at 100 / 500 / 2000 objects is measured. The gate is
  covered: draws then stops, the refresh, poke, own change ≤ 15 ms, live, sparse looks while moving. So are a still
  scene's draws at 60 and 240 Hz, the meter's labels and the battery floor in the ladder.
- `dev/checks/labpace.js` (lab group, `--fake-engines`): the measurements above, plus the Frame pace row and readout,
  the battery note, drag at 70 %, and a screenshot of a still (not drawing) scene coming back with the picture.
- `sh dev/run-checks.sh labpace` runs both, plus `labadapt-test`.

## Edits outside the lab lane
- `mcp/three-guide.js` (labdirector): one phrase in the audio helpers topic (on-demand help, not in the prompt; the
  prompt stays byte-stable).
- `tools/three-fx-templates.js`, `tools/three-gallery-data.js`, `tools/three-data.js`: per-frame lines rewritten with
  f60 (same look at 60 Hz).
- `dev/run-checks.js`: the check in the `lab` group, the unit test, a `labpace` group.

## Caveats
- Scenes the owner or the director already wrote with per-frame steps keep their own speed (their code isn't
  rewritten). The director now knows f60 for new code, and asking it to "make it frame-rate independent" will do it.
- The still check covers the usual three.js scene. Something it can't see shows within a second (the refresh). The
  listed exceptions always draw. 2D canvas and raw WebGL layers are not gated (they keep drawing as before).
- Battery status comes from Chromium's battery API: macOS Low Power Mode and Windows battery saver aren't exposed
  separately (on battery is what's seen). A desktop without a battery is never "on battery".
- Measured on SwiftShader under load. On a real GPU the absolute numbers are smaller and the ratios hold. True 120 /
  240 Hz pacing was simulated (Node clocks, the fps cap), since no fast display exists here.

## For the patch notes
- Lab scenes now move at the same speed on any screen: a 120 or 240 Hz monitor no longer makes the templates spin
  faster or kicks fade sooner.
- A scene that isn't moving stops drawing (about 88 % fewer GPU draw calls on a still scene in our test). It starts
  again the instant anything changes: a slider, the mouse, the music or the scene itself.
- A hidden Lab now truly sleeps: no drawing and no wake-ups until you come back to it.
- On battery, the preview goes a little lighter by itself (60 fps at most, 85 % resolution, with a small note). Plugged
  in, it's back to full at once. Renders, stills and recordings are always full quality.
- Orbiting or dragging over a slow preview stays fluid: it draws a bit lighter while you hold the mouse, full again
  when you let go.
- New: ⋯ › Frame pace shows how steady the preview is ("120 fps · steady"). Tick it to keep a tiny readout in the
  corner; it's off by default.
- Caveat: scenes you already made keep their own speed. Ask the director to make one "frame-rate independent" if it
  spins too fast on a fast screen.
