# lab240gpu (round 50): less GPU work per frame in the Lab preview, for 240 Hz on the big screen

At 240 Hz the GPU has 4.2 ms per frame for everything: drawing the layers, the filters, the shadows, and the browser
blending the preview's canvases into the window. This pass counted that work per frame in the scenes you use most and
removed what can't be seen. Nothing looks different: every scene was compared pixel by pixel with the savings on and
off (difference 0 of 255). Nothing added to any prompt (0 tokens), no new setting.

Where it lives: `tools/three-sandbox.html` ("hidden under an opaque top", "shadow maps drawn only when they can change",
`adOpaqueAsync` in "covered layers"), `dev/checks/lab240gpu.js`, `dev/run-checks.js`.

## How it was measured
The GPU here is software (SwiftShader), so work is **counted**, not timed. `dev/checks/lab240gpu.js` puts a dev-only
counter on the preview page's WebGL calls (never shipped) and counts per drawn frame: draw calls, triangles, full-screen
passes and the pixels they shade, clears, render-target binds (a shadow map is one), shader switches, texture uploads,
readPixels that wait for the GPU (sync points) and the ones that don't, and how many canvases the browser blends and
presents. Scenes: an FX stack (3D scene + bloom + grade + lens + grain + vignette), a heavy lit model (230k triangles,
room environment, 2048² shadow map, the camera going round it), kinetic type (3 type layers over a scene), a
visualizer (256 bars + 4000 instances + 30k points), two opaque scenes stacked. Sizes: exact frames 1280×720,
2560×1440, 3840×2160 (one pixel per pixel) and "fit" at devicePixelRatio 1, 1.5 and 2 (`--dpr`). Adaptive quality held
at full. "Before" = the same build with `window.__lab240.set({ off: true })`, which turns all three savings off (the old
code paths, exactly).

## Before → after (per drawn frame)
Columns: layers the browser blends · canvases presented · draw calls · full-screen passes · pixels those passes shade
(M) · pixels cleared (M) · render-target binds · canvases copied into a filter · GPU-waiting reads / s (non-waiting).

| Scene | Size | Before | After |
|---|---|---|---|
| FX stack | 1280×720 | 3 · 3 · 4 · 2 · 1.8 · 2.8 · 0 · 2 · 0 | **1 · 1** · 4 · 2 · 1.8 · 2.8 · 0 · 2 · 0 |
| FX stack | 2560×1440 | 3 · 3 · 4 · 2 · 7.4 · 11.1 · 0 · 2 · 0 | **1 · 1** · 4 · 2 · 7.4 · 11.1 · 0 · 2 · 0 |
| FX stack | fit @1 / @1.5 / @2 | 3 · 3 · 4 · 2 (each) | **1 · 1** · 4 · 2 (each) |
| FX stack | 3840×2160 | the software GPU went down at 4K before and after (bloom's 24 taps × 8.3 M px); by the counts above: 3 → 1 layers of 8.3 M px blended per frame |
| Model, camera going round | 1280×720 | 1 · 1 · 3 · 0 · 0 · 5.1 · 1 · 0 · 0 | 1 · 1 · **2** · 0 · 0 · **0.9** · **0** · 0 · 0 |
| Model | 2560×1440 | 1 · 1 · 3 · 0 · 0 · 7.9 · 1 · 0 · 0 | 1 · 1 · **2** · 0 · 0 · **3.7** · **0** · 0 · 0 |
| Model | 3840×2160 | 1 · 1 · 3 · 0 · 0 · 12.5 · 1 · 0 · 0 | 1 · 1 · **2** · 0 · 0 · **8.3** · **0** · 0 · 0 |
| Model | fit @1 / @1.5 / @2 | 3 draws, 4.8 / 4.8 / 4.7 M cleared, 1 RT | **2** draws, **0.6 / 0.5 / 0.5** M, **0** RT |
| Two opaque scenes | 1280×720 | 2 · 1 · 2 · … · 17.3 sync reads/s | **1** · 1 · 2 · … · **0** (18 non-waiting) |
| Two opaque scenes | 2560×1440 / 4K | 2 · … · 15.8 / 12.4 sync reads/s | **1** · … · **0** |
| Two opaque scenes | fit @1 / @1.5 / @2 | 2 · … · 17.8 / 17.8 / 17.7 sync reads/s | **1** · … · **0** |
| Kinetic type | 720p / 1440p / 4K / fit | 4 · 4 · 5 draws, 3.7 / 14.7 / 33.2 M cleared | the same (see "Not done") |
| Visualizer | 720p / 1440p / fit | 1 · 1 · 258 draws | the same (its 256 bars are the sketch's own draws) |

What that means on a real screen (not timed here): at 4K the FX stack no longer blends and presents two full-screen
layers of 8.3 M px each per frame; a shadowed model shown from all sides no longer draws all its triangles a second
time into the shadow map (one draw pass and a 4.2 M px map clear less per frame); stacked opaque scenes no longer make
the GPU finish its work 15–18 times a second (each wait can cost a frame at 240 Hz).

Pictures (the window's own screenshot of the preview, frozen, savings on vs off): FX stack, model, type, visualizer,
stack: mean difference **0**, max 0. Model with the camera gone round and back, shadow map kept vs drawn every frame:
**0** (and 4 frames of the map skipped during that step).

Looked at and already right (no change): filters at 0 step aside; merged filter passes are minimal (bloom + grade +
grain + vignette in one pass, the lens in another); each filter takes the picture under it once per frame and only when
it changed; video textures upload only on a new decoded frame (three.js 0.186); labdirect's picking reads pixels only
on a pointer event; clears are one per canvas; the preview's pixel ratio follows the screen (no more than it shows in
fit mode).

## Upgrades
1. **Layers under an opaque top aren't blended any more**: a filter that fills the frame with an opaque picture (bloom,
   grade, lens, film looks… every built-in filter) hides everything under it, and so does a layer labadapt found
   covered; those layers' boxes go to opacity 0, so the browser neither blends nor presents them. They still run and
   draw (the filter reads them), still take the pointer (orbit controls, picking), and stills / renders / recordings
   merge the layers themselves, so they're unchanged. Worked out at the start of every frame; a filter stepping aside
   (a slider to 0) shows them again in the same frame; off while editing a scene, in a sequence, with precomps, for 3
   frames after a resize and while a layer wipes in.
2. **Shadow maps drawn only when they can change**: when nothing in a shadowed scene moved except the camera (an orbit,
   a 🎥 camera move, a model shown from all sides), the shadow map is kept instead of drawing every caster again (a
   fresh one every second anyway). A signature of the scene without the view camera decides; anything it can't see (a
   video, an onBeforeRender, a node material) counts as moving; a scene that keeps moving draws its maps as before and
   looks every 32 frames whether it stopped. A sketch that sets `shadowMap.autoUpdate = false` keeps full control. Never
   in exports, stills, renders or the scene editor.
3. **Covered-layer checks without a GPU stall**: labadapt's twice-a-second look at whether the top layer is opaque (9
   pixels) now reads into a buffer and collects the answer at the next look, instead of making the GPU finish
   everything first (15–18 waits a second → 0 on WebGL2).
4. `dev/checks/lab240gpu.js` (lab, smooth and its own `lab240gpu` group): the counts above, budgets per scene per frame
   (layers, presented, passes, uploads, render-target binds, draws, no GPU-waiting reads), and the picture comparisons.
   `window.__lab240.info()` in the preview says what is hidden and how many shadow maps were kept.

Count: 3 upgrades + 1 check.

## Tests
- `node --check` on the sandbox page's three scripts (extracted), the check's body, `dev/run-checks.js`.
- `lab240gpu`: passes (720p / 1440p / fit, budgets + 7 picture comparisons). 4K and --dpr 1.5 / 2 measured with
  `L240_SIZES` / `--dpr` (table above).
- Passed: labgpu, labadapt, lab3d-models, kinetictype, labdirect, idlecpu, renderfast, lazy, unit:boot-test,
  unit:labadapt-test.
- Failed the same way on the base commit (machine load ~10, run twice): `labpace`'s "the sketch changes itself (a timer)
  … draws again within a frame or two" (lag 100 ms here, 50 ms on base: both fail) and `unit:labpace-test`'s two
  signature-cost timing lines (346 / 1422 µs here, 363 / 1496 µs on base). The pace code isn't touched.
- Found while measuring: at 4K the software GPU process went down on the FX stack (before and after alike); the check
  measures 4K one scene per run on request.

## Not done (next)
- **Transparent full-frame layers** (kinetic type, overlays): each is a whole-frame canvas the browser blends and
  presents even though the text covers a band of it. Drawing them into a canvas the size of their text, or several type
  layers into one, would cut 3 × 8.3 M px at 4K for a 3-line title; it changes how type layers are built (their own
  renderer each), so not here.
- **Exact frame sizes draw at the frame's own pixels** (a 4K frame in a small preview draws 4K): on purpose, the preview
  matches the export; drawing at the screen's size would change thin lines and fine textures slightly.
- 🧊 model layers with bloom / depth of field: their composer's first target is sized in CSS pixels (blurry at DPR 2 until
  a resize), and the canvas keeps a multisampled buffer the composer's last pass doesn't need. Fixing the first makes
  the picture sharper (a visible change) and costs more GPU; left for the lab3d owner.
- Every sketch context keeps `preserveDrawingBuffer: true` (stills and merges read canvases between frames): each drawn,
  shown canvas costs a copy when presented. Upgrade 1 removes it for the hidden ones.

## For the patch notes
- The Lab preview does less GPU work per frame, so 240 Hz holds better on a big screen. Nothing looks different: we
  compared every test scene pixel by pixel.
- Scenes with filters on top (bloom, grade, lens, film looks): the layers under them are no longer blended into the
  window as well, since the filter covers them anyway. On a 4K screen that's two full-screen layers less per frame.
- 3D models and shadowed scenes: when only the camera moves (an orbit, a camera move, showing a model from all sides),
  the shadows are no longer redrawn every frame.
- Two opaque scenes on top of each other no longer make the graphics card stop and wait twice a second.
- Your sketches, stills, renders and exports are unchanged.
- Caveat: text layers still cost a full frame each; that's next.
