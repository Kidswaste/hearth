# labcanvas56 (round 56): the Lab preview's layer canvases stop copying their last frame every frame

The owner plays Clink (their three.js game) in the Lab preview at 240 Hz. labplay55 cut the Lab's own JavaScript per
frame and left two things: every layer's WebGL canvas kept its last frame (`preserveDrawingBuffer`), and a game's
`setTimeout` calls each read a stack trace. This pass removes both and looks for any other steady per-frame cost.

Nothing looks different: stills, thumbnails, the reload cover, picking, the layer pictures of a re-run, the frozen
picture, recordings and export stills are byte-identical to before on a fixture (a check proves it). Quality stays full
where frames fit. No new setting, nothing added to any prompt (0 tokens), the same code on Mac and Windows.

## What `preserveDrawingBuffer` cost and who needed it
With it on, the browser can't hand a canvas's drawing buffer to the screen as it is: each frame it copies the whole
buffer (on the GPU) so the page can still read the last frame later. That's one full frame of pixels per layer per
frame: at 4K, 8 MP per layer, 240 times a second (a 3-layer game: ≈ 6 billion pixels a second of copies, plus a second
colour buffer per canvas). Readers of a layer's pixels in the preview page (`tools/three-sandbox.html`), all found:

| Reader | When | Now |
|---|---|---|
| Stills (`three_screenshot`, the Lab's picture / copy picture), the merge (`composite`) | on request | drawn again right before (`glFresh`), or read just after the layers' next frame |
| Thumbnails, the reload cover, OBS frames | on request | the same |
| Picking (✥ click a layer, double-click, Alt+wheel) | on click | read just after the layers' next frame (a game being clicked draws nothing again); at once when no frame is coming |
| The layer pictures a re-run / removed layer cross-fades from | on a re-run | drawn again right before |
| Recording (merged layers) | every frame | merged after the layers drew in that frame (it was merged before they drew, from the kept frames) |
| Export / sequence renders (hidden export page) | every frame | drawn and merged in the same task already: read as they are |
| Filter layers (bloom, grade, vignette… over the layers under them) | every frame | the layers' frames now run bottom first, so a filter reads the frame the layers under it just drew |
| Shader layers reading another layer (`layer:Name`), particles born from a layer | every frame / every 4th | the same (a layer above the reader is drawn again: rare) |
| Sequence transitions (both sides merged) | every frame of a transition | mixed after both scenes drew in that frame |
| labadapt's covered-layer pixel check | twice a second | read right after the layer's next frame (WebGL2: still without waiting); a still layer is drawn again first |
| The 600 ms fallback of a still request | once | drawn again right before |

Kept as before (`preserveDrawingBuffer` stays on): a canvas three.js didn't make through the page's `three` (raw
WebGL, another three.js copy: no frame to draw again), the page's own helper renderers that ask for it, ▶ Play's
window (unchanged), and a layer whose code draws over its last frame or reads its own canvas (`autoClear = false`,
`preserveDrawingBuffer`, `toDataURL`, `toBlob`, `captureStream`, `readPixels`, `transferToImageBitmap` in its code).

## How it works (all in `tools/three-sandbox.html`)
1. **The layers' canvases** (`lcFresh`, `glFresh`, `glReplay`, `glNote`). A WebGLRenderer made through the page's
   `three` (the shim marks it, `__labRNew`) gets a canvas without a kept frame. Each screen draw of such a renderer is
   noted: its scene and camera, viewport, scissor, clear colour and whether it cleared (up to 8 draws since the last
   clear), and when it was drawn. `FR` knows when the browser shows a frame: `FR.E` counts the screen's frames (every
   page frame callback comes through `realRAF`, which notes the frame's time) and `FR.inRaf` is on inside them; a
   canvas drawn in this frame's callbacks, or in this task before the next frame, is read as it is. Otherwise
   `glReplay` draws its last frame again with the same renderer (the same view, camera moves, gestures view, looks,
   overrides, the sequence's camera, the format's pan/zoom; its shadow maps not redrawn: the ones it drew with), and
   the read follows in the same task. A draw outside frame callbacks asks for one frame, so "shown" is always noted.
2. **Layer frames** (`lqRAF`, `lqFlush`). The layers' frame callbacks run in one frame callback of the page's,
   bottom layer first (in the order they asked, within a layer), instead of one browser callback each in the order they
   happened to ask. A director edit re-runs a scene layer and its loop used to land after the filter over it, so the
   filter read the scene's previous frame; now it reads the one just drawn. After the batch: the recording's merge,
   a sequence's transition, and reads that waited for the frame (`glSoon` / `frameSoon`: picking, stills,
   thumbnails, OBS). Two arrays swapped per frame, nothing made per frame; one browser frame callback for all layers
   instead of one each.
3. **The context pool** keys a pooled context by whether it keeps its frame too, so a layer that needs it never gets
   one that doesn't.
4. **Timers** (`within` → `frameOwner`, `ownerNow`): a `setTimeout` / `setInterval` / frame asked for inside a
   layer's own timer callback (or frame callback, labplay55) belongs to that layer with no stack trace read. A timer
   asked from anywhere else is still placed by its stack, as before.
5. For checks: `window.__labCanvas` (`set({ keep })`: canvases made from now on keep their frame, to compare;
   `info()`: canvases by kind, reads, reads as they are, frames drawn again, batches, stack reads; `merge(ids)`,
   `pictures()`).

## Measured (this machine: 4 shared CPUs, software GL, load 9–11 from other streams)
**New check: `dev/checks/labcanvas56.js`** (group `labcanvas56`, also in `smooth`). One page builds a fixed fixture
twice: A with every canvas keeping its frame (`__labCanvas.set({ keep: true })`: the old way), B the new way (after a
warm-up pass: the first fixture after the Lab opens merges a blended layer a shade differently on this machine's software
2D canvas, whichever way the canvases go). The fixture: a shadowed world whose game loop draws the same frame, an
overlay moved / faded / screen-blended that asks for its frames with a new function each time, a layer drawn ONCE and
never again, a vignette filter over them, a DOM layer whose timers chain.

| Picture | A (kept frames) vs B (no kept frames) |
|---|---|
| Director's full picture (`three_screenshot` PNG), the merge (peek), the 24 × 24 probe | byte-identical |
| Thumbnail (the page's small JPEG), the reload cover (JPEG) | byte-identical |
| Picking on an 8 × 6 grid (finds the world, the overlay and the drawn-once cube) | identical |
| Every layer's picture (re-run cross-fades) | byte-identical |
| Frozen: full picture and picking | byte-identical |
| The preview on screen (CDP screenshot of its box) | identical, edge included |
| A recording (1 s, a frame decoded at 0.15 s and 0.6 s) | mean difference 0 of 255, not blank |
| An export still (320 × 180 PNG, hidden export page) | pixel-identical |

Costs (B, last run):
- **Fixture canvases keeping a frame: 4 of 4 → 0 of 4.** A light game (two layers) at a 1920 × 1080 frame: the
  browser's per-frame copies go from **4.15 MP a frame to 0** (at 240 Hz ≈ 1 billion pixels a second of copies on
  the owner's screen; at 4K with three layers ≈ 6 billion). Its GPU process CPU per frame here: 112.5 / 102.1 ms kept
  vs 104.7 / 102.8 ms not (A / B / A / B): the software GPU spends its time elsewhere, so the copy hides in the noise
  on this machine; on a real GPU it is memory bandwidth and a second colour buffer per canvas.
- **Frames drawn again while the game plays: 0** (nothing reads them). Over the whole pictures pass: 853 reads,
  501 read as they were, 352 drawn again (stills, picking while frozen, the once-drawn layer).
- **Layer frames: 1 batch per screen frame** (instead of one browser frame callback per layer).
- **Timers asked from a layer's own timer: 0 stack reads a second** (the DOM layer's chain, ≈ 60 timers a second;
  before: one stack trace read and parsed per timer).
- labplay55 (the Clink-like game, ms of the Lab page's own JS per preview frame, still / hover / panel): base
  0.29 / 0.16 / 0.27; after, two runs: 0.72 / 0.31 / 0.30 and 0.28 / 0.30 / 0.39. Within this machine's noise (load
  10–11; one run's "still" caught a GC in the frame wrapper); the still check's scene walks stay at 0–0.09 a frame.

## Other per-frame costs looked at with a game playing
- **The layers' frame callbacks** were one browser frame callback each: now one batch (above). That also fixed an
  ordering problem: a re-run scene layer's loop landed after the filter over it, so the filter read the previous frame.
- **labadapt's covered-layer pixel check** read the canvas from a timer, long after its frame: it now reads right
  after the layer's next frame (still without waiting on WebGL2).
- **A filter's merge of the layers under it** drew a layer skipped as covered (fully under an opaque one in the same
  merge): it's left out now (the opaque layer over it is in the merge), so the covered layer isn't drawn again for it.
- **Clicking a playing game** (✥ picking) read its canvases back at the click: now right after the next frame.
- Looked at, left: `styleLayer` reads three style properties per layer per frame (cheap, and it stays correct when
  something else sets them); `__layerClock` (a model layer's clock, a few µs).

## Tests
- `node --check` on the preview page's three scripts (extracted), `dev/run-checks.js`; the check's body compiles.
- `sh dev/run-checks.sh --exact labcanvas56 labadapt seqsolid labplay55 labgpu lab240gpu labpace unit:labpace-test
  labsmooth54 labdirect sequence playloop lazy unit:boot-test`: **14 / 14 pass** (after the merge of playlatency).
- `flock /tmp/hearth-gameready.lock sh dev/run-checks.sh --exact playlatency`: pass (▶ Play's one canvas, merged in).
- `capture-lab` fails "the moving Lab sends frames" on this branch and on the base (c09e048) alike: not this change.
- An earlier run caught two real regressions, fixed: labadapt (a filter's merge drew the covered layer again every
  frame) and seqsolid (the sequence watch read a transition before its mix in that frame).

## Edits outside the lane
`dev/run-checks.js` (the `labcanvas56` group and the `smooth` list), `HANDOFF.md` (one sentence on the layer canvases).
Merged playlatency's branch (▶ Play's one canvas without a kept frame, `gmFresh`): one read helper now, `glFresh`,
which sends ▶ Play's canvas to `gmFresh`; the context line takes either reason to drop the kept frame.

## Risks / next
- A layer that draws over its last frame without saying so in its own code (autoClear turned off from an imported
  module, a manual `clear()` pattern hidden in a library) now starts each frame from a cleared buffer: trails would
  stop accumulating. The code test covers `autoClear = false`, `autoClear: false`, `preserveDrawingBuffer`, and
  reading its own canvas. If Clink turns autoClear off, its canvas keeps the old behaviour (no gain, no change).
- Drawing a frame again reproduces what three.js drew from the scene and camera; a frame made of more than 8 screen
  draws, or one whose `onBeforeRender` changes state, can come out slightly different in a still. A moving game is
  never drawn again for a read while it plays (the read waits for its next frame) except stills from a task.
- Layer frame order changed from "the order they asked" to bottom first: layers that pass data to each other through
  globals see it one frame sooner or later than before (not visible).
- On this machine the GPU-side saving can't be timed (software GPU); it is counted.

## For the patch notes
- Playing your game in the Lab preview is lighter on the graphics card: each layer no longer copies its whole picture
  on every frame (on a 4K screen at 240 Hz that was billions of pixels a second).
- Stills, thumbnails, the Lab's picture of a scene, clicking a layer, recordings and exports look exactly as before:
  a new check compares every one of them, byte for byte.
- Filters (bloom, grade, vignette…) over a scene you just edited now use that scene's current frame, not the one
  before it.
- Clicking a layer on a playing game reads the game's next frame instead of drawing the game again to see what you
  clicked.
- Games that use timers (setTimeout / setInterval) cost the Lab nothing extra per timer any more.
- The "lighten to stay smooth" check of covered layers works with the new canvases and no longer redraws them for
  filters.
