# onepass: a v2 scene's plain layers share one GPU pass (Nov 10)

Scenes v2 (docs/upgrades/scenes-v2-webgpu.md) left one cost per layer: on the scene's picture (4× MSAA, half-float)
every plain layer was a GPU pass of its own, stored, resolved and submitted each time, and every pass carried a GPU
timestamp query read back every frame. All in tools/three-sandbox.html, block "Scenes v2". Old-format scenes never
reach this code.

## What changed
- **One pass for a run of plain layers** (`g2PassHook`, `g2RunEnd`, `g2DepthReset`, `g2Render`, `g2Draw`). The first
  plain layer opens the pass as before; each next one draws into the same open pass after a depth-only quad put the
  depth back to far (WebGPU can't clear inside a pass); the pass ends once: one store, one MSAA resolve, one submit.
  A layer with a colour background (it clears the picture), one with occlusion queries, or one that isn't plain
  (opacity, blend, move, mask) ends the run and gets its own pass as before. 6 plain layers: 8 passes a frame → 3
  (1 + three.js's 2 for the copy to the screen); 20 layers: 22 → 3.
- **Each layer's uniform buffers are its own.** three.js r186 keeps the camera's uniforms in buffers shared by every
  material that uses the same ones, written at once, while a pass's draws run only when it is submitted: two unlit
  layers in one pass both drew with the last layer's camera. A v2 layer's built shaders now sit under its own key in
  three.js's cache (`nodes.getForRenderCacheKey`) and its shared buffers in its own table
  (`renderer.debug.onNodeBuilderCreated`). GPU pipelines are still shared.
- **A fall-back.** What is in one pass stands or falls together: if the graphics card ever refuses a frame while
  layers share a pass, the page goes back to a pass per layer for good and says so once in the console
  (`__labG2.state().onepassErr`). Not WebGPU, or a three.js without these internals: a pass per layer as before.
- **GPU time only when looked at.** Timestamp queries and their read-back run only while the Lab's whole stats line
  shows (the pointer over the preview, the same switch as each layer's own measure) or a check asks
  (`__labG2.timing(true)`). Otherwise the line says "– ms GPU".
- **A bug found on the way, there before this round.** Removing a v2 layer disposed the one geometry three.js gives
  every Sprite; r186 then kept handing out its freed buffer, so after any re-run of a scene with sprites the graphics
  card refused every pass that drew a sprite, every frame ("Buffer used in submit while destroyed"): that layer was
  gone without a word. `g2Unmount` now leaves a sprite's geometry alone.

## What didn't work
- A context node per layer to keep built shaders apart: `compileAsync` builds in the background after the node is put
  back, objects were built twice and the second build freed a buffer the open pass used.
- A depth quad placed at the far plane by its vertices came out in front of everything; it writes its depth per pixel
  (`depthNode`) instead.
- Keeping a pass per layer and only skipping the resolve until the last one (tried in between): right pixels, about
  0.7 ms less at 4K with 6 layers, nothing at 1080p or with 20 layers, where the cost is the passes themselves.

## Measured (RTX 4080, Nov 10)
`dev/checks/scenesv2-bench.js`: frames back to back until the graphics card is done, ms a frame; 10 rounds, the ways
in turn; best round (median). Other sessions were using the same GPU, so the medians swing; "before" is the old
drawing in the same run (a pass per layer, a timestamp query each).

| | before | one pass | one pass, no MSAA | passes a frame |
|---|---|---|---|---|
| 6 layers, 1080p | 4.09 (5.54) | 1.93 (2.30) | 1.48 (2.00) | 8 → 3 |
| 6 layers, 4K | 2.86 (12.69) | 6.71 (10.92) | 1.87 (7.59) | 8 → 3 |
| 20 layers, 1080p | 3.89 (15.55) | 1.98 (2.96) | 1.03 (2.41) | 22 → 3 |
| 20 layers, 4K | 4.24 (6.29) | 2.65 (4.15) | 2.37 (3.53) | 22 → 3 |

The page's own share of a frame (making and sending the commands): 6 layers 0.5 → 0.4 ms, 20 layers 1.47 → 0.94 ms.
The 6-layer 4K row is too disturbed to read (best rounds 2.9 to 6.7 ms within one way). On the unchanged page earlier
the same day, in quieter runs: 6 layers 1.34 ms at 1080p and 2.26 at 4K, 20 layers 3.6 and 3.9.

## Checks (SMOKE_GPU_FLAGS="--ignore-gpu-blocklist")
- New `scenesv2-onepass`: five still layers with different cameras drawn both ways from the same state
  (`__labG2.ab`): the same pixels at 1080p (every pixel) and 4K, with a non-plain layer in the middle and with a
  colour background in the middle; the pass counts; no GPU validation error (`__labG2.gpuError`); GPU time off unless
  asked. "The same pixels": 0 to 4 pixels of 2 million are one level of 255 apart from one draw to the next where
  additive rings cross the lit knot, the old way drawn twice included; the check lets exactly that through.
- `scenesv2` (now also: the six layers share one pass, nothing refused, no fall-back; it asks for the GPU time),
  `scenesv2-comp`, `scenesv2-many`, `scenesv2-lists`, `scenesv2-rate`, `labpace` (an old scene): pass.
- `scenesv2-render` fails about one run in two, on the unchanged page too (1 pass in 3 there): "the same time twice"
  and "two times differ" swing. Not from this round; not fixed here.

## Open
- The copy to the screen is 2 passes of three.js (its own buffer, then the canvas, MSAA again).
- A non-plain layer still costs its own picture and a merge pass.
- The hook leans on three.js r186 internals (`backend.beginRender` / `finishRender`, `_nodes`, `_getBindGroup`,
  `_callDepth`): another three.js version without them draws a pass per layer, as before.
