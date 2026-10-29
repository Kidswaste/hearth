# gpuload84 (round 84): nothing in Hearth draws faster than it needs to on a 240 Hz screen

The owner's PC (Windows, RTX 4080, 240 Hz screen): the Lab preview drew 240 frames a second on Auto, and the graphics
card's load made Windows' audio crackle in every app (Spotify, the DAW). That one was fixed first (commit 699dde3:
Auto holds 60, or 30 behind other windows; Max fps keeps the screen's rate). This round looked for every other place
that draws or animates at the screen's rate, or keeps going while nobody can see it, and paced the worst ones.

## How I looked
- Every `requestAnimationFrame` in the app (`git grep -l requestAnimationFrame -- '*.js' '*.html' ':!dev'`: 92 files).
  About 75 of them are one-shot frames (batching a layout, a paint, a focus) and cost nothing at any refresh rate. The
  rest are loops; each was read for what it draws per frame, whether it is capped, and whether it stops when hidden.
- Every endless CSS animation (`animation: … infinite`, ~60 rules) and the rules that pause them (`[data-away]`,
  `[data-hush]`, Motion › Calm / Off, reduced motion).
- Every window's `backgroundThrottling` (whether Chromium may rest a page that can't be seen).
- Electron's own frame switches: none (no `disable-frame-rate-limit` / `disable-gpu-vsync`: gpu52 guards that).

What already rests: Hearth's main window keeps Chromium's default, so minimized, hidden in the tray or fully covered
it draws nothing (rAF and CSS animations stop; `[data-away]` pauses CSS too). The Lab parks its preview when it isn't
on screen. An inactive Lab / Quests / Creative tool is `content-visibility: hidden`, which also stops its frames.

## What I found, ranked by likely cost on a 240 Hz screen

| # | Where | What it drew | Before | Already paused when hidden? | Now |
|---|---|---|---|---|---|
| 1 | ▶ Play (Clink and every game) | the game's own frames | the screen's rate (by design: no fps cap; Quality: auto lowers *resolution*, it has no fps Auto) | on screen: never slowed (on purpose, gpuplay76). **Minimized: drew on** (backgroundThrottling off) | unchanged while on screen (no "Auto" fps mode exists to cap, see below). **Minimized: the page may rest** |
| 2 | Lab preview | the scene | 240 on Auto | yes (parks) | fixed in 699dde3: Auto ≤ 60 (30 behind) |
| 3 | Stage window (shows on a 2nd screen) | the scene | the screen's rate during a show (by design) | **minimized: drew on** | **minimized: the page may rest**; on screen unchanged |
| 4 | Shader nodes editor preview (`nodes-shader.js`) | a full-canvas WebGL2 fragment shader, `preserveDrawingBuffer` | **240 a second, paused too**, as long as the dialog was open | no (only `document.hidden`, via rAF) | **≤ 60 playing, ≤ 30 with another app in front, ≤ 10 paused, nothing off screen** |
| 5 | Lab › Tools › Shader playground and Model viewer (`three-sandbox.html` shader / viewer pages) | a full-pane shader / a model with orbit controls | the screen's rate (`setAnimationLoop`, not under the Lab's cap) | yes when the tab / tool is hidden (cross-origin frame in a hidden pane) | **≤ 60**. Also found: both tabs drew **nothing at all** (see "Bug found on the way") |
| 6 | Lab pickers: 🅰 kinetic type (22 cards), 🎵 visualizers (17), ⬟ shapes (21) | a 2D canvas per card in view, every frame | the screen's rate while a picker is open | yes (`document.hidden`) | **≤ 30 frames a second** (thumbnails) |
| 7 | Endless CSS animations: busy dots, typing dots, the streaming reply shimmer, spinners, sync / progress sweeps, the node editor's wire flow, rec / live pulses, the look's glints and swirls | each one makes the GPU redraw the window every screen frame | 240 window redraws a second while any one runs | hidden window: yes. Idle 1 min: only the look's ambient loops; **indicators never** | **another app in front for 5 s without input here: every endless animation pauses where it is**; input in the window or Hearth in front again plays them on at once; never while Hearth records itself |
| 8 | Kit › Easing preview dot (`kit.js`; also the Lab's Tools › Easing tab) | a style write + layout of the dot | **every frame forever** once opened, also while the Lab's Easing tab sat behind another tab (still in the page) | no | **≤ 60, nothing while not on screen** (a look twice a second) |
| 9 | Lab timeline while a song plays (`three-media.js` tick) | the beat tick (click track), cue watch, playhead placement | per frame, light JS; the playheads glide on the compositor | yes (stops when the Lab is hidden, round 16/21) | left: light, and the beat tick wants every frame |
| 10 | Creative workbench mini-game (`tools/workbench-core.js` `gameHTML`) | a 768×512 2D canvas | **every frame, even before Play is pressed** | rAF only | left: a game the owner makes, and a Codex file. Listed under "For Codex" |
| 11 | Storyboard animatic (`tools/workbench-story.js`) | seeks the board every frame while it plays | the screen's rate while playing | yes (stops when hidden) | left (Codex file, only while playing) |
| 12 | Creative studies (`tools/creative-games.js`, `creative-preview.html`) | a small game canvas | the screen's rate while Start is on | yes (pauses on hidden / blur) | left (games) |
| 13 | Lab beat dots (`three-music.js`, `three-stage.js` HUD, `liveset.js` cursor): Web Animations with `iterations: Infinity` | a dot | compositor, every frame while shown | yes (hidden window) | left (small, tempo indicators; CSS pausing doesn't reach them) |
| — | Already paced, nothing to do | voice waveform (30/s, only while listening) · project banner (worker, 30 fps, stops when hidden) · the F chip in a game (rides the game's frames, only while shown) · the director's game probe and 📈 Test play performance (the game's own frames, 20 s) · capture cursor glide (only while catching up) · the hitch map / play budget pages (game time) | | | |

## What changed
- **`nodes-shader.js`** (Shader nodes editor preview): paced on the frame time: 60 a second playing, 30 when Hearth
  isn't the window in front (`document.hasFocus()`), 10 paused (a knob or the mouse still shows), nothing while the
  canvas isn't visible (`checkVisibility`), looking again twice a second.
- **`kit.js`** (Easing preview): 60 a second at most; nothing while the tool isn't visible.
- **`tools/three-kinetic.js`, `tools/three-shapes.js`, `tools/three-vis.js`** (the pickers' animated cards): 30 a second.
  Card time is read from the clock, so motion keeps its speed.
- **`tools/three-sandbox.html`**: `toolPace()` caps the Shader playground's and Model viewer's own loops at 60 (they
  aren't under the preview's Auto); `window.__toolPace` counts their frames for the check. Nothing in the sketch
  preview's path changed.
- **`idlecpu.js` / `idlecpu.css`** (the "hush", lazy group `idlecpu`): `<html data-blurhush>` after 5 s with another
  app in front and no input in Hearth's window: `animation-play-state: paused` on everything. It follows the main
  process's own focus events (`window:focus`), so clicking into a web view or a frame inside Hearth doesn't count as
  leaving. A pointer move over the window, a key, a click, or Hearth in front again resumes them in the same frame.
  `IdleCpu.state()` reports `focused`, `blurHushed`, `blurHushes`.
- **`gamemodemain.js`** (▶ Play window) and **`main.js`** (Stage window): `backgroundThrottling` stays off while on
  screen (gpuplay76's choice: never slowed on another screen or partly covered); on `minimize` the page may rest
  (`webContents.setBackgroundThrottling(true)`), on `restore` it's off again. Not Windows-only.
- **`powerwisemain.js`** (tests only: its test hook answers only under the test harness, `HEARTH_TEST_SAVE_DIR`): `power.test({ winEvent, windows })` sends a window event
  (Xvfb has no window manager to minimize) and lists each window's page and throttling.

### Bug found on the way
The Lab's **Shader playground** and **Model viewer** tabs showed nothing: their page's own renderer is made through the
three.js module's blob URL, and the sandbox read that as a stale layer module's renderer and dropped it at once (no
canvas, no loop). Stale layer modules only exist on the sketch page, so that drop is now for the sketch page only
(one condition in `trackRenderer`). Both tabs draw again, at 60 a second at most.

### ▶ Play and Clink: no change while on screen
gpuplay76 kept ▶ Play at the screen's own rate on purpose, and its only "Auto" is **Quality: auto**, which changes the
resolution, not the frame rate. There is no Auto fps mode to cap the way the Lab's was, so following the rules I didn't
add one. If the crackle also happens while playing Clink, the next step is a ▶ Play fps choice mirroring the Lab
(Auto ≤ 60 · Max = the screen's rate), which is a user-visible decision for the owner.

## The check: `dev/checks/gpuload84.js` (group `gpuload84`)
The test machine's screen is 60 Hz (Xvfb), so a **240 Hz screen is faked**: `requestAnimationFrame` (of Hearth's window,
or of a Lab tool's own page through its eval message) is driven by a 240-a-second timer, and each fixed loop's drawn
frames are counted against it (WebGL2 draws, 2D canvas paints inside the picker, style writes on the Easing dot).
- Kit › Easing: ≤ 60 moves a second (the fake screen ticks ≥ 150), none while not on screen.
- Shader nodes preview: ≤ 60, ≤ 30 with another app in front, ≤ 10 paused, 0 off screen, draws again on screen.
- The three pickers: ≤ 30 frames a second and never every frame.
- Lab Shader playground and Model viewer: ≤ 60 draws a second (and they draw at all).
- Blur hush: a busy dot pulses in front; another app in front: still moving before 5 s, then paused (no CSS animation
  running anywhere); a pointer move resumes; Hearth in front again resumes; never while recording.
- Minimized: the Stage window and a ▶ Play game window are not throttled on screen, throttled minimized, not again
  restored.

## What's left
- ▶ Play has no fps choice (see above). Owner's call.
- The workbench mini-game draws every frame from the moment its page shows (Codex file, a game).
- Web Animations beat dots in the Lab keep animating when another app is in front (small).
- On a real 240 Hz Windows PC the numbers here are from a faked screen; the 📈 Test play performance card and the Lab's
  Frame pace readout are the ways to see them on the real one.

## For Codex
No Codex-owned file was edited. Two suggestions in your files, both optional:
- `tools/workbench-core.js` `gameHTML`: the generated mini-game redraws its whole canvas every frame even while not
  playing; drawing only while `playing` (and once on reset) would let it rest.
- `tools/workbench-story.js` `play()`: the animatic seeks on every screen frame; 60 a second would look the same.

## For the patch notes
- **Quieter graphics card, no more crackling sound.** On a fast screen (like a 240 Hz one) several parts of Hearth drew
  up to 240 pictures a second, which kept the graphics card busy enough to make sound crackle in other apps. They now
  draw only as often as you can see a difference:
  - the shader node editor's live preview: 60 a second (30 when you're in another app, 10 when paused, none when it
    isn't on screen);
  - the moving previews in the Lab's text, visualizer and shape pickers: 30 a second;
  - the Lab's Shader playground and Model viewer: 60 a second;
  - the Easing tool's moving dot: 60 a second, and it stops when you can't see it.
- **Hearth rests while you work in another app.** Five seconds after you switch to your DAW or Spotify, Hearth's
  spinning and pulsing bits freeze where they are. Move the mouse over Hearth or click back into it and they move again
  at once.
- **A minimized game or Stage window rests.** Minimize a game you're playing with ▶ Play, or the Stage window, and it
  stops drawing until you bring it back.
- **Fixed: the Lab's Shader playground and Model viewer were blank.** They show their picture again.
