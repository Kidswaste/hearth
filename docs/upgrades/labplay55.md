# labplay55 (round 55): a game scene playing in the Lab preview, with less of the Lab's own work per frame

The owner edits Clink (their three.js game) in the Lab and wants the preview to play it at the screen's rate (240 Hz on
their Windows PC with an RTX card) without opening a separate ▶ Play window. This pass played a throwaway game-like
scene in the Lab preview and measured what the Lab does on every frame on top of the game. It then cut the steady
per-frame work a playing game doesn't need.

Nothing looks different and nothing behaves differently: the same frames are drawn, at the same quality. Nothing is
added to any prompt (0 tokens). No new setting. The code paths are the same on Mac and Windows.

## How it was measured
**New check: `dev/checks/labplay55.js`** (group `labplay55`, also in `smooth`).
- **The fixture** is a Clink-like game in one layer:
  - a shadowed world: a 2048² sun shadow map, a 2K ground texture and 60 shadowed crates with a 2K texture;
  - a scoreboard drawn into a CanvasTexture every frame;
  - **6 projectiles added every frame**, each with its own cloned material, removed 0.8 s later.

  A 🧊 GLB model layer (an animation clip) and a DOM HUD layer sit on top. The HUD asks for its frames with a new
  function each time, as many games do. There is no song. It plays in the Lab preview (not frozen, not ▶ Play) at a
  320×180 frame, so this machine's software GPU keeps up. Quality is held at full so runs compare.
- **Stretches** (6 s each): `still` (hands off), `hover` (the mouse moving over the playing game, 60 moves a second),
  `panel` (the mouse over the Lab's sliders), and `fits` (see below).
- **Main-thread JS per preview frame** comes from two CDP sampling profiles at once: the Lab window, and the
  preview's own process (it is a separate process here). The time is split into:
  - the game: its code, three.js, and the WebGL calls it makes through the page's thin counting hooks;
  - the preview page's own Lab work (`three-sandbox.html`);
  - the Lab window.
- **Also counted, per stretch**:
  - the preview's frames and gaps (its pace meter);
  - messages the preview sends the Lab, per frame;
  - frames and timers the Lab window asks for, per second;
  - the still check's scene signatures (whole-scene walks) and "pokes", per frame;
  - GPU read-backs (readPixels, finish, fence waits).
- **Before** is this round's base (a794501), run from a copy with the same check. A dev-only counter (`sigs` in
  `__labPace.state()`) was patched into that copy so the signatures could be counted.
- **This machine**: 4 shared CPUs, software GL, and a load of 11–15 from other streams. A frame takes 130–220 ms
  here, almost all of it the software GPU, so frame gaps can't show the difference. The JS ms per frame and the counts
  can. On the owner's PC the same JS runs about 3× faster, and the GPU isn't the limit.

## What the Lab adds per frame: what was looked at
| Suspect | Found | Done |
|---|---|---|
| **The still check** (labpace: "draw only when the picture can change") | A moving scene is walked whole (every object, material, uniform) on most frames: every frame for the first 30, then every 8th. **Every poke started it over**: a pointer move over the preview, or a message from the Lab. With the mouse over a playing game, that was a whole-scene walk per renderer on every frame (2 a frame here). | **Fixed** (1) |
| A frame loop asked for with a new function every frame (`requestAnimationFrame(() => tick())`) | The page read and parsed a stack trace on every such call to find the layer it belongs to (`owner`: 9 ms of 6 s here) | **Fixed** (2) |
| ▣ Present's upload counter (round 52) | It wrapped **every** `activeTexture` / `bindTexture` call (many a frame) to know which texture an upload goes to | **Fixed** (3) |
| The song loop / sequence clock | Each asked for a frame of its own on every screen frame, with no song or sequence, and did nothing | **Fixed** (4) |
| The program cache's `useProgram` hook | Ran with rest / spread arguments on every material switch | **Fixed** (5) |
| Messages to the Lab per frame | None: the stats line goes twice a second (`stats` 0.2–0.4 a frame at 5–8 fps) | Already right |
| The Lab window (timeline, HUD, stats, pills, inspector) | Asks for ≈ 2 frames a second (the stats line); 0.12–0.5 ms a preview frame, all of it the twice-a-second stats paint, hints, the jank watch | Already right |
| Audio analysis with no song | The demo beat is three numbers; the spectrum / waveform are filled only when a sketch reads them (round 21) | Already right |
| GPU read-backs | 0 that wait (labadapt's covered-layer look reads asynchronously, round 50) | Already right |
| ResizeObserver / layout in the window | Nothing fires while the game plays | Already right |
| The scene doctor / inspector | Nothing per frame (it looks after a run) | Already right |
| Layer compositing | Each layer is its own canvas (here 2 WebGL + the HUD's DOM), blended by the browser; layers under an opaque filter aren't (round 50) | Left (see "Not done") |
| Adaptive "lighter to stay smooth" | Steps down only after two windows of 45 frames with over 25 % of frames late (> 1.35 × the screen's frame time). With frames that fit it stays at full: checked (`fits`) | Already right, now checked |

## Before → after (2 pairs, the same check; ms of main-thread JS per preview frame)
(The first pair's HUD asks for its frames with a new function each time; the second pair's "after" ran before fixes 2
and 5, with a HUD that reuses its function.)
| Stretch | Lab page's own work | The game (its JS + three.js) | Lab window | Scene walks a frame | Frame gap median / p95 (ms) |
|---|---:|---:|---:|---:|---|
| **Pointer over the playing game** | 0.70 / 0.81 → **0.32 / 0.23** | 2.46 / 2.77 → 3.00 / 2.15 | 0.26 / 0.37 → 0.49 / 0.32 | 2.0 / 2.0 → **0 / 0** | 174 / 333, 130 / 233 → 171 / 300, 167 / 283 |
| **Hands off** | 0.72 / 0.93 → **0.14 / 0.22** | 2.21 / 2.00 → 1.58 / 1.58 | 0.27 / 0.27 → 0.27 / 0.32 | 1.28 / 1.42 → **0.08 / 0.34** ¹ | 130 / 200, 154 / 317 → 164 / 350, 208 / 367 |
| **Pointer over the sliders** | 0.67 / 0.43 → **0.43 / 0.27** | 2.05 / 3.19 → 3.84 / 3.93 | 0.12 / 0.17 → 0.35 / 0.18 | 2.0 / 1.61 → **0.05 / 0.07** | 218 / 400, 147 / 267 → 177 / 267, 213 / 450 |

¹ The second "after" run still caught the end of a renderer's 30-look warm-up at this machine's 5 fps. The check now
waits until every renderer is past it. The final run (12 fps) read 0.06 / 0 / 0.05 walks a frame, with the Lab page at
0.36 / 0.30 / 0.18 ms a frame against the game's 2.02 / 2.69 / 2.00.

- **The Lab page's own work fell from 13–46 % of the game's JS (≈ 30 % in most runs) to 7–14 %**, on average from
  0.71 to 0.27 ms a frame here. Its remaining work: the per-layer frame
  wrapper, the compositor's per-layer look, the frame counter and adaptive quality, the stats twice a second.
- **The whole-scene walks** went from 1.3–2 a frame (one per renderer, per frame) to 0–0.08 a frame. Here a walk is
  ≈ 0.12 ms for ≈ 200 objects. For a real game of 2,000 objects it is ≈ 0.8 ms (labpace's Node bench on this machine).
  Before, at 240 Hz with the mouse over the preview, 2 renderers walked that every frame: ≈ 1.6 ms here, ≈ 0.5 ms on
  the owner's faster CPU, of a 4.2 ms frame. Now it's
  one walk in 32 frames per renderer, and none for a pointer move.
- **Frame gaps** don't move here: the software GPU takes 130–220 ms a frame. The game's own ms per frame varies by
  ±40 % between runs with the machine's load.
- **The adaptive quality** stayed at full in the `fits` stretch (target = 2 × the frames' median) before and after.
  It never went lighter where frames fit.

## The fixes (all in `tools/three-sandbox.html`, the preview page)
1. **The still check leaves a moving game alone** (`paceCore().still`).
   - A poke (a pointer move, a message, a slider) on a scene that is moving no longer walks it again and starts the
     30 every-frame looks over. It draws (it would anyway), and its next look compares with its last one, as before.
   - A scene that has moved for 2 s (and 30 looks) is looked at on every 32nd frame instead of every 8th.
   - A game that stops is still caught within 32 frames. From then on it's looked at on every frame again, so a
     still picture stops drawing as before.
   - A poke on a still picture still draws at once.
2. **Frames asked for inside a layer's own frame callback** are that layer's, with no stack trace (`within1` /
   `frameOwner`). A frame asked from anywhere else is still placed by its stack, as before.
3. **Present's upload counter** asks the context which texture is bound, at the upload (`getParameter`: the
   context keeps its bindings, no GPU round trip), instead of following every `activeTexture` / `bindTexture`.
   Cube maps, 3D and array textures are told apart by their target. Before, they were keyed by texture unit only.
4. **The song's loop / trim / recording-end loop** runs only while a song or footage plays (its `play` starts it
   again). **The sequence clock** runs only while a sequence is on the page (`sqKick`). With neither, each asked for
   a frame on every screen frame.
5. **`useProgram`** through the program cache: one argument, no rest / spread.
- New for checks: `__labPace.state().sigs` (whole-scene walks since `reset()`) and `__labPace.gates()` (each
  renderer's still gate: moving / same / looks).

## Not done (next)
- **Each layer's canvas keeps `preserveDrawingBuffer`** (stills and merges read the canvases between frames). The
  browser copies each shown canvas when it presents it. ▶ Play merges plain layers into one canvas. Doing that in the
  Lab preview would change how stills, the layer menu and the picking work, so not here.
- **A game's `setTimeout` calls** still read a stack trace each, to know their layer. Games rarely make one a frame.

## Tests
- `node --check` on the preview page's three scripts (extracted), `dev/checks/labplay55.js`, `dev/labpace-test.js`
  and `dev/run-checks.js`.
- `unit:labpace-test`: new lines for a game with the pointer over it (drawn every frame, no signature per poke), a
  game moving for 2 s (≈ 1 look in 32), and a long-moving game that stops (caught within 32 frames). The old lines
  pass unchanged (a still picture, pokes, a change within 15 ms, an animating scene ≈ 1 in 8 in its first seconds).
- `labplay55`: before / after above. The base fails the walk budget (1.28–2 a frame); the branch passes.
- `node dev/run-checks.js --exact labplay55 unit:labpace-test labpace labsmooth54 lab240gpu playloop lazy
  unit:boot-test`: all pass. labplay55 failed once on the walk budget (0.5) because of the warm-up note above, not
  the app. After the warm-up fix it passed twice in a row.

## Edits outside the lane
`dev/run-checks.js` (the `labplay55` group, `smooth` list) and `dev/labpace-test.js` (three lines). Everything else
is in the preview page (`tools/three-sandbox.html`), where the changes are small and self-contained.

## For the patch notes
- Playing your game right in the Lab preview is lighter: the Lab's own work per frame around a game dropped to about
  a third of what it was.
- Moving the mouse over a playing game in the preview no longer makes the Lab re-check the whole scene on every
  frame. On a big scene at 240 Hz, that could take a good slice of each frame.
- A scene that keeps moving is checked for "has it stopped?" 4× less often. When it does stop, the preview still stops
  redrawing it within a moment, as before.
- Games that ask for their next frame in a new way each frame cost the Lab nothing extra any more.
- With no song or sequence, two of the preview's background loops no longer run every frame.
- Nothing looks different, and the quality stays at full when your frames fit. A new check keeps it this way.
