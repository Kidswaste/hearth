# Lab GPU (round 21, labgpu): the Lab preview, faster and steadier

You said: "optimize the three.js part since it's what I use most". This stream did the preview page itself
(tools/three-sandbox.html): the frame loop, the layers, filters, shaders, the sequence's playback and the 3D models.
Nothing was removed and layer code doesn't change: sketches the director wrote run as they did.

## Measured before → after

Headless (Xvfb + SwiftShader: the GPU is the CPU). The old page and the new one were run back to back on the same
machine once the other agents' load dropped (load ≈ 3.7 on 4 CPUs); the counts are exact, times move ±20 % between runs.
`dev/checks/labperf.js` (extended this round), `smooth-lab`, `sequence-smooth`, the new `dev/checks/labgpu.js`, and an
interleaved A/B (old, new, old, new) of 12 scene switches + 8 re-runs.

| | before | after |
|---|---|---|
| Scene switch → first frame of the new scene (A/B, hub side, medians) | 762–770 ms | **402–495 ms** |
| Layer re-run (a code edit) → its first frame (A/B, medians) | 517–616 ms | **419–430 ms** |
| labperf: switch → first frame p50 / re-run → first frame p50 | 565 / 432 ms | 494 / **316 ms** |
| New WebGL contexts made per switch / per re-run | 1 / 1 (174–570 ms each in `getContext` here) | **0 / 0** (42 taken from the pool per labperf run) |
| Shader programs linked by a re-run of the same code (labgpu: 8 re-runs) | 1 per program | **0** (8 reused) |
| Preview runtime's own JS allocations per frame (song playing, rings + bloom + grain + vignette) | 19.7 KB (158–182 KB when the machine was loaded) | **3.7 KB** (4–7 KB loaded) |
| Same scene: frame gap p50 / p95 while playing | 100 / 183 ms | **83 / 133 ms** |
| Same scene: preview frames per second playing / paused / Light mode | 9 / 9 / 12 | **11 / 13 / 15** |
| Same scene: preview's own work per frame (JS, all layers) p50 / p95 | 1.2 / 4.0 ms | **0.5 / 2.3 ms** |
| Same scene: draw calls / texture uploads per frame | 9 / 3 | **7 / 1** |
| Same scene: filter pictures merged on a 2D canvas (one labperf run) | 718 | **1** (bloom takes the scene's canvas as it is; grain and vignette draw inside bloom's pass) |
| smooth-lab, song playing: worst preview gap | 317 ms | **167 ms** |
| sequence-smooth, sequence playing: preview frames in 3 s / worst gap | 55 / 200 ms | 59 / **150 ms** |
| GL contexts / renderers / window listeners after 8 re-runs (labgpu) | – | unchanged (5 / 5 / 4) |
| GPU MB estimate after 20 switches | – | 3 |

On the loaded machine earlier in the night (load 9–16) the same changes measured: page gets the switch → first GL
draw 1 188 → 644–870 ms, preview frames in 3 s 7–9 → 14–17, runtime allocations 158–182 → 7 KB per frame.

Picture checks (labgpu, a still scene: pixelate + duotone + vignette + thermal): merged passes vs separate, direct
source vs 2D merge, after 8 re-runs on pooled contexts with borrowed programs, and after switching away and back:
mean channel difference 0–0.74 of 255, the same as two looks at the same picture (0.59: the adaptive resolution moves
edges by a pixel).

## Upgrades

### Scene switches and re-runs
1. **WebGL context pool**: a layer that re-runs (a code edit, a slider that rebuilds, Shuffle) or a scene you switch away from hands its GPU context to a small pool; the next layer renderer of the same kind takes it instead of making a new one (≈ 250–570 ms per context on this machine, a GPU-process round trip on a Mac).
2. Everything the old code made on a pooled context (buffers, textures, programs, framebuffers…) is deleted and its state reset, so the next scene starts clean.
3. Listeners the old code put on its canvas (OrbitControls and the like) go with it; the canvas comes back like a new one.
4. A pooled canvas keeps its size, so the next scene doesn't wait for a new drawing buffer either (each resize is a GPU round trip, ≈ 200 ms here); its picture is cleared.
5. At most 3 contexts wait (1 in Light mode), none longer than 20 s; all are let go when the Lab goes off screen.
6. A renderer the old code still holds draws nothing (no stray frame from a scene you left).
7. A renderer made by a module that was replaced while loading no longer counts back into the preview's renderers (it grew by one per such run).
8. **Compiled shader programs are kept per context** (up to 48): a re-run of the same code, or a scene coming back on a pooled context, borrows the linked program instead of compiling again (labgpu: 8 re-runs, 0 programs linked); only a program nothing else uses is borrowed, and each renderer sets its own uniforms.
9. A shader's compile now waits until its program links, so a borrowed program costs no compile at all.
10. **Shaders compile in the background** while the old picture stays (a re-run's cross-fade, a switch's cover), where the GPU can (KHR_parallel_shader_compile through three.js' compileAsync); a sketch that draws only once still gets its frame.
11. three.js starts downloading while the preview page is still being read (module preload), so a fresh page (a reload, the Stage window, a three.js version switch) waits less; in-page runs reuse the loaded modules.

### Filters (adjustment layers)
12. **Merged filter passes**: filters that only change each pixel by itself (grain, vignette, duotone, color looks…) stacked right on another filter are drawn inside that filter's pass: one shader, one full-screen draw, one picture to take in for the whole run.
13. A merged filter steps aside like a filter at 0, and its canvas shrinks to 1 × 1 (its GPU memory goes).
14. **Direct source**: a filter over one plain WebGL layer (a scene, or a filter under it) takes that canvas as it is; no merge onto a 2D canvas first (718 merges → 1 in one labperf run).
15. A filter at 0 also shrinks its canvas while it steps aside.
16. A filter's input texture is made again when the picture's size changes (after the adaptive resolution moved, it kept its first size).
17. Filter settings reach their uniforms without building a name per setting per frame; a color is converted only when it changes.

### Per frame
18. A layer's frame loop is told apart from the others once, not by reading a stack trace at every frame.
19. The sound's level comes from the 8-bit waveform with whole numbers; the float waveform (`audio.waveform`) is copied only when a sketch reads it. Together with 18: the preview runtime allocates 4–7 KB a frame instead of 20–180 KB.
20. The demo spectrum / waveform (no song loaded) are filled only when a sketch reads them.
21. The layer order is sorted once per change instead of several times a frame; filter merges reuse their lists and compare numbers instead of building a text key per filter per frame.
22. A layer's transform, opacity and z-index text is built only when one of its numbers moved (the sequence shows and hides layers every frame without new style text).
23. 3D model layers read their clock without building the `layer` object, reuse their sky and fog colors, and rebuild the camera's projection only when its range changed.

### Video, sequence, memory
24. `media.texture()` (the loaded footage as a texture) uploads only when the decoder presented a new frame, on every three.js version (older ones uploaded it at every drawn frame).
25. Sequence footage clips are drawn again only on a new decoded frame (or when their framing moves); pictures and color clips once.
26. The sequence no longer turns every running scene's whole code into text at every frame to see whether it changed.
27. GPU memory: merged and stepped-aside filter canvases shrink to 1 × 1, waiting contexts are capped (3, 20 s, none while the Lab is off screen) and their linked programs capped (48 each); `__labHealth()` reports pooled contexts and the GPU MB estimate.

### Seeing it
28. `/lab perf` adds what was saved: GPU contexts reused, filter passes merged, merges skipped, and a layer's run → first frame (median ms).

## How it was tested
- `dev/checks/labgpu.js` (new): the picture with merged passes / direct source on and off, re-runs on pooled contexts
  (pool hits, programs reused and none linked, nothing grows, same picture), switching away and back. Passed.
- `dev/checks/labperf.js` (extended: switch / re-run → first frame, contexts and shader links per switch, draws and
  texture uploads per frame, the preview's allocations per frame through the heap sampler), `lab3d-models`,
  `smooth-lab`, `sequence-smooth`, `qa-commands`, `labframes`, `scenes`: passed (on the loaded machine earlier,
  `labframes`' frame steps and one `scenes` cross-fade step failed the same way before and after; `lab3d-models` can
  time out a director eval while a new model's shaders compile, before and after).
- `dev/smoke.js`: `smoke({ cdp, params, target: 'three-sandbox' })` sends a CDP call to the preview's own target (it
  runs in its own process); used for the heap sampling.

## Not done (next)
- One WebGL context for several sketch layers: each layer's code makes its own renderer and canvas (the API the
  director writes to); the pool removes the cost of making them instead.
- A new model or a new variant still compiles its shaders on the page's thread here (no KHR_parallel_shader_compile in
  SwiftShader): a PBR model with shadows holds the preview for seconds headless, much less on a real GPU.
- The hub's share of a scene switch (labhub's files) is now the larger part of the wait.

Count: 28 upgrades.
