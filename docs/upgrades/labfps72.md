# labfps72 (round 72): heavy scenes in the Lab preview and ▶ Play

The owner: "Play does look best but the framerate is abysmal". His reports showed the Lab preview's render p95 at
**1.6 s** and WebGL context losses. This stream built a heavy stress scene, measured it in the Lab preview and in ▶ Play,
found what costs what, and fixed the causes that Hearth controls.

Nothing is added to any prompt (0 tokens). The same code runs on Mac and Windows. There is one new visible control,
Quality (auto / full), and it replaces a hidden menu item.

## What "render p95 1.6 s" is
The number in the report is the Lab's `p95` stats figure (jank.js keeps the worst one per window). It is the CPU time
spent **inside three.js' `render()` calls** of a frame, summed over the layers. That time includes:
- shader compiles and links (`getProgramParameter` waits for them);
- texture uploads (a 4K picture with its mipmaps);
- the browser blocking the page when the GPU is behind (command-buffer back-pressure).

On this machine the stress scene's render p95 is 510–570 ms with **0 compiles and 0 uploads**, so here it is all GPU
back-pressure. A p95 of 1.6 s on an RTX 4080 means the graphics card itself is seconds behind. Chromium's GPU watchdog
(and Windows' TDR, at 2 s) resets the GPU when it falls that far behind, and every WebGL context is lost. **The losses
and the 1.6 s come from the same cause**: more GPU work per frame than the card can do at the screen's rate. Then the
reset's recovery added a second, heavier wave of work (see "Context loss" below).

## The stress scene and the check
**New check: `dev/checks/labfps72.js`**. It is opt-in: header `// opt-in: LABFPS72`, run as
`LABFPS72=1 node dev/run-checks.js --exact labfps72`, group `labfps72`. Its video fixture is made by run-checks with ffmpeg.

The scene has 9 layers, each its own WebGLRenderer as the Lab makes them. Counts are 0.3× owner size, so this software
GPU draws at all (`LF72_K`):
- **World**: a 4K ground picture plus three more 4K pictures, a 2048² sun shadow, a point light's 6-face shadow, 45
  torus knots.
- **Crowd**: an InstancedMesh of 1,500 people, moved every frame, with its own shadowed sun.
- **Particles**: 45,000 points, moved every frame.
- **Bloom**: EffectComposer + UnrealBloom + OutputPass.
- **Video**: a 1280×720 VP9 VideoTexture.
- **Over 1–3**: small overlays.
- **Vignette**: a filter layer over all of the above.

What it measures, per stretch:
- frame gaps p50 / p95;
- render work p50 / p95;
- GPU-process ms a frame (the software GPU draws there);
- GPU time from **EXT_disjoint_timer_query_webgl2** where the card has it (it is here: the check wraps each layer's
  render() in a TIME_ELAPSED query and reads the results without waiting);
- draw calls a frame, renders per displayed frame, uploads / re-uploads a frame, compiles / links;
- sync read-backs a frame, GC ms a frame (a CDP profile of the preview's own process);
- contexts alive and losses.

The stretches: steady, 🎲 Shuffle ×3, another tool in front, a modal `<dialog>` over the Lab, the glass A/B, 3 layer
re-runs, every context lost and given back, and ▶ Play with Quality full vs auto (a pixel-heavy game and the stress
scene).

Budgets are counts and ratios, which stay steady on a loaded machine: 0 compiles, ≤ 1 big upload a frame, ≤ 30 fps
under a dialog, rebuilt in place, auto faster where pixels are the cost. Times are reported, not budgeted.

## What was looked at, and what was found (this machine: 4 shared CPUs, SwiftShader, load 3–4)
| Suspect | Found | Done |
|---|---|---|
| ▶ Play never lowers resolution | It draws at the screen's pixel ratio with MSAA, always (`ready-lock`, adapt off). A GPU-bound game on a big screen can only drop frames | **Quality: auto** (1) |
| Context-loss recovery under a heavy scene | 9 contexts lost and restored: the first was back at 0.59 s, but the scene took **9.3 s** to rebuild. The Lab gives the GPU 4 s, so on the base it **made a whole new page** (every shader compiled and every picture uploaded again, right after a reset) | **fixed** (2) |
| Work behind a dialog | The preview drew at its full rate under a modal `<dialog>` or the ⌘K palette | **30 fps cap** (3) |
| Big pictures arriving together | All decoded pictures were handed to three.js at once: N 4K uploads (+ mipmaps) in one frame | **one a frame** (4) |
| No visible quality control in the Lab | "Lighten to stay smooth" was hidden in right-click › View; the stats line said "preview 70%" | **Quality chip** (5) |
| Shader recompiles on slider tweaks | 🎲 Shuffle ×3: **0** compiles / links (before and after) | already right |
| Compiles / uploads while just playing | 0 compiles; 0.08 uploads a frame (the video's new frames) and 1.9 re-uploads (video + the filter's merge) | already right |
| Sync GPU read-backs (readPixels / finish / fence waits) | **0** a frame (labadapt and labcanvas56 read asynchronously) | already right |
| Double drawing (picture redrawn for a read, thumbnails, capture) | 0 redraws while playing; thumbnails at most every 3 min; Stage / ▶ Play park the preview | already right |
| Renders per displayed frame | 23 = 8 layers + Bloom's ~13 passes + the filter: no layer drawn twice | already right |
| GC | 0–0.05 ms a frame (gcchurn60 held) | already right |
| Hidden / minimised / another tool | 1 frame in 5 s (parked) | already right |
| Glass (backdrop-filter) over the animating preview | none (polish.css already turns it off there); GPU 1544 vs 1535 ms with it forced off | already right |
| Too many WebGL contexts (Chromium's 16) | 17 contexts alive in one Lab page without a loss here; 3 re-runs of a 9-layer scene: 9 alive, 0 losses | not a cause here: left as it was (a pool cap was tried and taken out) |
| What the GPU time goes to | Hiding one layer at a time: the **Crowd** (instanced, shadowed: its vertices drawn twice) was 730 of 1033 ms; particles ≈ 180 ms; the filter's merge small at this size | the scene's own content: Quality auto / the framebar's Why? |
| 240 Hz vs 60 pacing | f60 and the pace meter (labpace) already make motion the same at any rate | already right |

## The fixes
1. **▶ Play: Quality auto** (new `gamequality-preload.js`, a third preload of the game session, for Lab scenes and HTML
   builds alike).
   - When the game's frames miss the screen's refresh, it draws fewer pixels: 85 %, then 75 %, then 67 % of the
     screen's pixel size in each direction. It climbs back a step at a time when there's room. A climb that misses
     goes straight back, and the next try waits twice as long.
   - Frames come at whole refreshes (vsync), so one step can show no gain yet. The next step is then tried.
   - Down to the floor with no gain means the pixels weren't the cost (the game's own JS, its vertices). It goes back
     to every pixel and is left alone for 30 s, then 60 s, then for the rest of that play.
   - **How it works**: the scale lives in `window.devicePixelRatio` as the game reads it. three.js'
     `setPixelRatio(devicePixelRatio)`, the Lab-scene shim and a game's own resize code all agree. On a step, each
     renderer three.js announced is given the new ratio once.
   - **No per-frame work**: a 24-frame look once a second, only while playing, never hidden (a few µs a frame during a
     look; 0.4 ms in a whole play that never stepped). Each step costs one resize of the drawing buffer: ≈ 0.4 s on this
     software GPU (1.3 s for the 3 steps of the test game), a few ms on a real card. There are a handful per play, and
     climbs wait 8–64 s.
   - **Where**: Hearth's ▶ Play right-click › **Quality: Auto / Full**, the F chip's line ("Quality auto · 85 %") and its
     **Quality** button (switches live), `/game quality auto|full`.
2. **Context loss: rebuilt in place**. The first context that comes back now says so (`gpu-restoring`, `first`), and the
   Lab switches from its 4 s GPU wait to the 20 s rebuild wait. A heavy scene is rebuilt where it is, with its song,
   sliders and view, instead of a new page that compiles and uploads everything again.
3. **Behind a modal**: while a `<dialog>` opened with showModal() or the ⌘K palette is over the Lab, the preview draws
   30 frames a second at most, whatever the fps setting. Never on the Stage window or while recording; a show
   (Present / ▶ Play lock) is unchanged. It is watched by two quiet MutationObservers (the `open` attribute, the body's
   children), so it adds no per-frame work.
4. **Big pictures one a frame**: a decoded reference of 1 MP or more is handed to its texture in a frame of its own. A
   scene with six 4K pictures used to upload all six (plus mipmaps) inside one render().
   - Small pictures, videos and the export page go at once.
   - A render's exact frames still wait for every picture.
   - A hidden page hands them over on a 150 ms timer.
5. **The Lab's Quality chip**: the stats line shows **Quality: auto**, or "Quality: auto · 70 %" while the preview is
   lighter. Like the rest of the line it shows when you point at the preview (the ◐ in the corner already says when
   it's lighter; framebar64's compact line is kept). A click picks Auto or Full. It is the same setting as the old
   "Lighten to stay smooth", which right-click › View now calls "Quality: auto".

## Before → after (the same check; base fee53a5 copied aside vs this branch, run back to back, 2 pairs: run 2 · run 3)
| | before | after |
|---|---:|---:|
| ▶ Play, a pixel-heavy game (1599×999), fps | 4.9 · 4.7 (there's only full) | **full 4.9 · 4.3 → auto 9.4 · 8.9** (scale 0.67, canvas 1071×669) |
| ▶ Play, same, GPU ms a frame | 668 · 694 | full 670 → **auto 331** |
| ▶ Play, the stress scene (vertex-bound here), fps | 0.7 · 0.7 | full 0.7 · 1.0 / auto 0.9 · 0.9 (it stays at every pixel) |
| All 9 contexts lost under the stress scene | **a new page** both times (the 4 s wait passed; no message from the page by then) | **rebuilt in place** both times: first context back 0.59 · 0.66 s, drawing again 9.3 · 7.6 s |
| Preview under a modal dialog: its cap | none (full rate) | **30** |
| Most big pictures uploaded in one frame | 1 (4 pictures) ¹ | 1, handed over one a frame (4 held → 4 frames) |
| Lab stress, steady: fps / render p50 / p95 ms | 1.8 · 1.5 / 8 · 9 / 570 · 734 | 2.0 · 2.2 / 8 · 10 / 531 · 1552 ² |
| GPU ms a frame: GPU process / timer query (run 3) | 1730 · 1549 / 1127 | 1548 · 1540 / 935 |
| Draw calls / renders per displayed frame | 147 / 23 | 148 / 23 |
| Compiles while playing / on 🎲 Shuffle ×3 | 0 / 0 | 0 / 0 |
| Sync read-backs a frame / redraws for reads / GC ms a frame | 0 / 0 / 0–0.05 | 0 / 0 / 0 |
| Another tool in front: frames in 5 s | 1 | 1 |

² The render p95 swings 0.5–1.5 s between runs on this loaded machine (one run read 1.55 s, the owner's own number): it
is the GPU being behind, not Hearth's code. The GPU's own time (timer query) and the GPU process' time don't swing.

¹ At this machine's 2 fps the four 4K decodes finished in different frames already. At 240 Hz they land within the same
4 ms far more often. The queue itself is proven in `dev/labfps72-test.js` (4 big → 4 frames, small at once, the timer
fallback).

The Lab preview's own steady numbers don't move, and weren't meant to: its per-frame overhead was already cut in
rounds 55–64. Its cost here is the scene's content (the crowd).

## What only the owner's RTX 4080 / 240 Hz can tell
- **The real GPU ms a frame** of his scenes. Running the check on his PC reports the timer-query GPU time
  (`gpuTimerMsPerFrame`) next to the 240 Hz budget of 4.17 ms.
- **Whether Quality auto picks a good step at 240 Hz**: whether 85 % / 75 % fits and whether text-free 3D at 67 % looks
  fine on his screen. It must stay at 100 % for a game that already fits.
- **Context losses**: whether resets still happen with Quality auto keeping frames under budget, and whether a reset now
  recovers in place (one calm note, no reload).
- **D3D11 shader compile times** (ANGLE's HLSL compile): the check counts compiles. Their time only shows on Windows.
- **The ⌘K palette / dialogs over a 240 Hz preview**: the GPU drops to 30 fps while they're open (Task Manager's GPU
  graph).
- **Big pictures**: a scene with several 4K references should open without one long frozen frame.

## Tests
- `node dev/labfps72-test.js` (unit, in UNIT), 29 checks:
  - Quality auto on fake games: GPU-bound at 240 Hz steps down until it fits (vsync quantised), CPU-bound tries 3 times
    and stops, a heavy moment passes and it climbs back, a climb that misses comes back with a longer wait, Full never
    steps, the 67 % floor;
  - the preview page's modal cap and lock order;
  - the uploads' queue with fake frames and timers;
  - the ▶ Play wiring (menu, argument, preload, F chip).
- `labfps72` (report mode for before / after, 2 pairs): **after: every step passes, both runs**. Before: 5 fail both
  runs (no cap under a dialog, a new page after the loss, ▶ Play quality ×3).
- Touched checks, under the run lock (≤ 5 per hold): unit:boot-test, lazy, glrecover, gamemode, gamelook, gamefps54,
  labplay55, labcanvas56, lab240edit, labpace, playbudget, gameready, framepace57 **all pass**. framebar64 failed once
  on its compact-line rule: the first version kept "Quality: auto · 70 %" on screen while lighter. The chip now shows
  with the rest of the line on hover, and framebar64 passes.
- Units: labfps72-test, labpace-test, gamemode-test, gamefps54-test, playbudget-test, glrecover-test, framebar-test,
  gamehooks55-test, datasafe-scan, winmac-test: all pass.
- `node --check` on every touched JS file and the preview page's four inline scripts (extracted).

## Edits outside the lane (small, additive)
- `gamemode.js`: the Quality item, `/game quality`, the pref sent to the game.
- `gamemodemain.js`: the preload registration, `quality` in `--hearth-game`, the chip's Quality to the hub.
- `game-preload.js`: the chip's line and button.
- `tools/game-api.md`: the contract.
- `dev/run-checks.js`: the group, the unit test, the clip fixture.
- The Lab: `tools/three.js`, `tools/three-sandbox.html`, `tools/three-lab.css`.

## Upgrades
1. ▶ Play **Quality: auto**: a heavy game draws fewer pixels when its frames miss the refresh, and goes back up when
   there's room.
2. Quality auto only keeps a lower resolution when it really makes the game faster. Otherwise it gives the pixels back
   and stops trying.
3. ▶ Play's right-click › **Quality: Auto / Full**.
4. The F chip says the quality ("Quality auto · 85 %") and has a **Quality** button to switch it live.
5. `/game quality auto | full`.
6. The Lab's stats line: a **Quality: auto / full** chip, one click to switch ("Quality: auto · 70 %" while the
   preview is lighter).
7. The preview draws 30 fps at most while a dialog or ⌘K is open over the Lab.
8. Big pictures reach the graphics card one per frame: no long freeze when a scene with several 4K references opens.
9. After a graphics card reset, a heavy scene is rebuilt in place instead of reloading the whole preview.
10. An opt-in stress check (`labfps72`) that measures heavy scenes in the Lab and in ▶ Play, with the GPU's own time
    where the card has timer queries.

## For the patch notes
- ▶ Play has a new **Quality: auto** setting, on by default. When your game can't keep up with your screen, it draws a
  little fewer pixels (down to two thirds) and goes back to full when there's room. If fewer pixels don't make it
  faster, it goes straight back to full. Switch it to **Full** from ▶ Play's right-click menu or the F stats chip.
- In the Lab, point at the preview: the stats line now shows **Quality: auto**. Click it to choose Auto or Full. When
  the preview is drawing lighter to stay smooth, it says so, for example "Quality: auto · 70 %".
- While a dialog or the ⌘K search is open over the Lab, the preview slows to 30 frames a second, so the graphics card
  isn't working flat out behind it.
- Scenes with several big pictures open without one long freeze: the pictures go to the graphics card one at a time.
- If your graphics card resets while a heavy scene is playing, the Lab now rebuilds the scene where it is. Before, a
  slow recovery made the whole preview reload, which was the heaviest thing it could do right after a reset.
