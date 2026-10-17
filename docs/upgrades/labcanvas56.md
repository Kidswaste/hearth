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
| Stills (`three_screenshot`, ⌘/Ctrl+S picture, copy picture), the merge (`composite`) | on request | drawn again right before (`glFresh`), or read just after the layers' next frame |
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
NUMBERS

## Other per-frame costs looked at with a game playing
OTHERS

## Tests
TESTS

## Edits outside the lane
`dev/run-checks.js` (the `labcanvas56` group and the `smooth` list), `HANDOFF.md` (one sentence on the layer canvases).

## Risks / next
RISKS

## For the patch notes
PATCH
