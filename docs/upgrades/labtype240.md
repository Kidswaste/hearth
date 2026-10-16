# labtype240 (round 51): 🅰 text layers drawn only around their text, 🧊 model bloom sharp at any pixel ratio

The two items lab240gpu left as "next". Nothing added to any prompt (0 tokens), no new setting, nothing new on screen.

Where it lives: `tools/three-sandbox.html` ("drawn tight" in `textLayer`, `cvDraw` next to `drawLayer2D`, two small
hooks: the filter's direct source and the particles' layer sampling place a tight canvas; the context pool hands a
canvas back plain), `tools/sandbox-lab3d.js` (`fxSize`), `dev/checks/labtype240.js`, `dev/run-checks.js`.

## Upgrades
1. **🅰 Text layers draw only the box their letters cover.** Each type layer had its own canvas the size of the whole
   frame, cleared, drawn, presented and blended by the browser at every frame, for a title that covers a band of it.
   In the preview its canvas is now the box the glyphs cover (with room to move: the box grows to hold what's drawn
   and shrinks back after 1.5 s of being 3× too big), placed where it shows. It is drawn with the frame's own camera
   cut to that box (2D: the orthographic box; 3D letters: a view offset), so every glyph lands on the same pixel: the
   merged still and the screen are **identical** to the whole-frame canvas (difference 0 of 255 in every scene, at
   pixel ratio 1, 1.5 and 2). Glow, blur-in, outline and outline-draw stay inside each glyph's own quad, so nothing
   is cut. Steps / hit effects (kinetictype), 3D letters, lyrics, paths: unchanged code; only where the picture goes.
2. **A held title stops drawing.** The glyph numbers are sent to the GPU only when one changed; before, they were sent
   (and the layer drawn) at every frame even when nothing moved, so labpace never saw it as still. A title that has
   come in and holds now draws on labpace's once-a-second refresh only (8.3 M px a frame at 4K → nothing).
3. **🧊 Model layers with bloom / depth of field are sharp from the first frame at any pixel ratio.** The composer's
   first picture was made at the window's CSS size (on a Retina / 200 % screen: half the pixels, blurry until you
   resized the window), and later changes of the renderer's ratio (the adaptive quality, Light mode, a heavy model at
   1×) left it behind. It is now sized to the canvas's own pixels before its first frame and follows the ratio (two
   numbers compared per frame). Renders from the export page get the same: a supersampled or 4K render of a model with
   bloom was drawn through a CSS-sized picture too. This one is a visible change: bloom halos are finer (they match
   what a resize already gave).
4. `dev/checks/labtype240.js` (`labtype240` group; also in `lab` and `smooth`): the counts below with the saving off
   and on in one run, budgets, the merged still and the screen compared on / off, the model's composer size.
   `window.__labType.tight(false)` in the preview turns the saving off (the old path exactly);
   `window.__lab240.set({ off: true })` now includes it, so lab240gpu's picture comparison covers it too.

Count: 3 upgrades + 1 check.

### Where the whole frame is still used (on purpose)
Renders / exports / stills taken at full quality (the export page, a recording, `fullRes()`), the scene editor, a 🎥
camera move or a moved view (labgestures) on that layer, a format's pan / zoom (multiformat), precomps, scene-editor
placements on it. Merges (stills, the record merge, a filter's picture of what's under it, the sequence's sides,
particles born from a layer, labdirect's picking and outline, a re-run's cross-fade) place the tight canvas where it
shows (`cvDraw`, or the canvas's offset, which they already read).

## How it was measured
As lab240gpu: the GPU here is software, so work is **counted** per drawn frame by lab240gpu's dev-only WebGL wrapper
(copied into the check): pixels the browser blends (every shown canvas), pixels cleared, canvases presented and their
pixels, draws. "Before" = the same build with `__labType.tight(false)`. Adaptive quality held at full. Exact frames
are one pixel per pixel; "fit" is the smoke window (806×745 CSS) at devicePixelRatio 1 / 1.5 / 2 (`--dpr`).

## Before → after (M px per drawn frame: blended = cleared = presented; the 3D scene under them is one frame)
| Scene | Size | Before | After |
|---|---|---|---|
| 3 titles over a 3D scene (lab240gpu's "kinetic type") | 1280×720 | 3.69 | **1.16** |
| | 2560×1440 | 14.75 | **4.44** |
| | 3840×2160 | 33.18 | **9.85** |
| | fit @1 / @1.5 / @2 | 2.40 / 2.52 / 1.87 | **0.85 / 0.81 / 0.62** |
| A kinetic line (steps on a clock, punch, outline drawn on, glow) | 1280×720 | 1.84 | **1.16** |
| | 2560×1440 | 7.37 | **4.4–6.1** (a line as wide as the frame) |
| | 3840×2160 | 16.59 | **9.78** |
| | fit @1 / @1.5 / @2 | 1.20 / 1.26 / 0.93 | **0.94 / 0.81 / 0.63** |
| 3D letters (chrome, turning) | 1280×720 | 1.84 | **1.03** |
| | 2560×1440 | 7.37 | **4.01** |
| | 3840×2160 | 16.59 | **11.29** (turning letters sweep a bigger box) |
| | fit @1 / @1.5 / @2 | 1.20 / 1.26 / 0.93 | **0.67 / 0.68 / 0.49** |
| A held title, nothing else | 1280×720 / 1440p / 4K | 0.92 / 3.69 / 8.29, drawn every frame | **0.10 / 0.32 / 0.67** per drawn frame, drawn ≈ once a second |

Layers blended stay the same count (each layer is still its own canvas: blend modes, opacity and order per layer are
unchanged); what shrinks is their size. Draw calls are unchanged. Re-sizes of the box ("leases"): 2–10 per layer
over a whole measurement (a new size, the saving toggled, words stepping in), never one a frame.

**Model with bloom**, the composer's first picture: at pixel ratio 2, 439×266 (the window's CSS size) for an 878×532
canvas → **878×532**; at 1.5, 705×397 → **1057×595**; at 1, unchanged (806×745).

Pictures (frozen, saving on vs off): merged still and screen, 4 scenes × pixel ratio 1 / 1.5 / 2: mean difference 0,
max 0 (the screen at pixel ratio 2: max 1 on 2 pixels, the window's own compositing).

## Tests
- `node --check` on the sandbox page's three scripts (extracted), `tools/sandbox-lab3d.js`, the check's body,
  `dev/run-checks.js`.
- `labtype240`: passes (720p / 1440p / fit at --dpr 1, 1.5, 2, and 4K; budgets, 8 picture comparisons, the model).
- Passed: lab240gpu, kinetictype, labdirect, labmaterials, renderfast, lazy, unit:boot-test; type and lab3d-models
  after a re-run alone (type first showed a real interaction: a held title let the preview doze, so a kick value set
  from outside showed late; `__labType.drive` now wakes it).
- idlecpu fails the same way on the base commit (the main process's 42 timers/min, not the preview).

## Not done
- One shared atlas canvas for every text layer (one canvas instead of one per layer): each layer keeps its own
  canvas so its blend mode, opacity, order, labdirect handles and layer groups stay per layer.
- A long kinetic line as wide as the frame saves less (its box is the frame's width); words that punch or bounce
  hold a taller box for up to 1.5 s.

## For the patch notes
- Text layers (🅰, including text that moves with the music and 3D letters) are much lighter in the Lab preview: each
  one now draws only the area around its words instead of a whole frame. Three titles on a 4K screen: from 33 to 10
  million pixels per frame. They look exactly the same: we compared them pixel by pixel.
- A title that has come in and holds still no longer redraws at every frame.
- 🧊 3D models with bloom or depth of field are now sharp on a Retina / high-resolution screen from the first frame;
  before, they looked soft until you resized the window. Bloom halos look a little finer as a result. Renders of them
  at 4K or supersampled are sharper too.
- Renders, exports and stills of text layers are unchanged.
