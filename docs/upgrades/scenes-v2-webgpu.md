# Scenes v2: the WebGPU scene format (design, Nov 9)

Quentin's call: new scenes use a new format built for speed; existing scenes are not ported, they stay as they are and
are grouped under **"Old version"** in the project's scene list. The goal: "all of this kinda goes away and we don't worry
about old stuff being slow".

## Why (measured, Nov 4–9, RTX 4080)
- Every Lab layer today is its own WebGL context and its own full-window canvas, blended by Chromium every frame.
  Visualizer2: 6 layers, 21 fps, 30 ms of GPU per frame; antialias off + 1× pixels: 64 fps. 17 layers: past Chromium's
  context limit, black / frozen.
- ▶ Play's one-context merge (`__gmTake`) can't fix old scenes: 26 of 39 multi-layer scenes use their own GPU passes
  (bloom, render targets), which the merge excludes. Only 4–5 scenes would merge.
- A heavy scene in Hearth's graphics process makes the whole interface wait (166 → 84 fps). The experimental separate
  Lab player (round of Nov 9, `labplayer/`) fixes the interface (238 fps) but scenes render black / partly there: kept
  opt-in (PLAYER › IN-APP by default), not developed further for now.
- WebGPU is available here: `navigator.gpu` on Hearth's `file://` pages, adapter nvidia / lovelace, device OK.

## The format
- A sketch with `format: 'gpu'`. Sketches without it are the old format ("Old version"), unchanged in every way.
- The preview page (tools/three-sandbox.html) loaded with `?gpu=1` maps `three` to `three.webgpu.js` and `three/tsl`
  to `three.tsl.js` (served by offline-library.js like today's builds; fetched once, then kept).
- **One renderer, one canvas.** The page makes ONE `WebGPURenderer` for the whole scene. Layer code never makes a
  renderer: each layer gets its own `THREE.Scene` and a default camera and fills them. Each frame the runtime draws the
  visible layers bottom first into the one canvas (one clear, depth cleared between layers). Opacity and blend modes:
  each such layer drawn into a render target and composited with TSL (phase 2).
- **Layer code** (a module, as today):
  ```js
  export default ({ THREE, tsl, scene, camera, tweak, audio, time, size, onFrame }) => {
    const P = tweak({ speed: 1, color: '#7c5cff' });          // sliders, as today
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, .3, 200, 32), new THREE.MeshStandardNodeMaterial({ color: P.color }));
    scene.add(mesh, new THREE.HemisphereLight());
    onFrame((t, dt) => { mesh.rotation.y += dt * P.speed * (1 + audio.bass); });
  };
  ```
  Shaders: TSL node materials (`tsl.*`), not GLSL `ShaderMaterial` (that is WebGL-only).
- **Quality presets** (the dock's QUALITY): pixel ratio and post-processing size on the one renderer; antialias is the
  one canvas's MSAA (one context, so it costs once, not per layer).

## The Lab
- New sketch → "New scene" makes a v2 scene from v2 templates; the old templates stay for old scenes.
- Scene lists (project player, the Lab's sketch picker, Your sketches): v2 scenes first; old ones folded under
  **"Old version"**, still openable, editable and renderable exactly as today.
- Renders: the export page runs the same v2 runtime (`?gpu=1&xp=1`); frames read from the one canvas.
- Directors (Claude / Astra): the three guide (mcp/three-guide.js) gets a v2 section; a v2 scene's chat tells the
  director which format it is, so new code is written for it.

## Phases
1. Runtime slice: `?gpu=1` page mode, one renderer, layers as scenes, `tweak`, `audio`, `onFrame`, the dock's stats.
   A v2 template. Measure against Visualizer2-like content.
2. Layer opacity / blend modes / timing via render targets + TSL; the Lab's layer controls on v2 scenes.
3. "Old version" grouping in every scene list; New scene = v2.
4. Renders (export page) and stills for v2.
5. The directors' guide and templates; Astra / Claude jams on v2.

## Ground rules for building it
- On its own branch, in its own copy (git worktree): Hearth runs from `C:\Users\quent\agent-hub`, so half-built
  work there reaches Quentin's running app at its next restart (it happened on Nov 9 with the Lab player).
- Old scenes must behave exactly as before at every step (the Lab's existing checks: fastboot, labpace, smooth142…).
- Merge to main per phase, each phase tested in a throwaway copy on the real GPU (SMOKE_GPU_FLAGS="--ignore-gpu-blocklist").

## Built (Nov 9, branch claude/scenes-v2)
All in the existing preview page (tools/three-sandbox.html, block "Scenes v2"): the old runtime, audio, tweak, the song,
messages, pacing and stats are shared; v2 layers only change how a layer runs and draws. Old scenes never reach it.
- **Which layers are v2.** A layer spec with `gpu: true` (the Lab sends it for a scene with `format: 'gpu'`: tools/three.js
  `spec`, the backstage page, the gallery's preview page, sequence / export plans in tools/three-seq.js), or every layer
  of a `?gpu=1` page unless it says `gpu: false`; and only code with a default export (an old layer in a mixed sequence
  runs the old way). `three` imports in v2 code are rewritten to `three/webgpu` (same line count). The import map
  always names `three/webgpu` / `three/tsl` (r176+; nothing is fetched until a v2 layer imports them); `?gpu=1`
  preloads them. offline-library.js serves them unchanged (fetched once, kept).
- **Phase 1, runtime.** ONE `WebGPURenderer` (antialias, `#gpu-stage` canvas under the layer boxes, hidden while no v2
  layer runs). Each layer: its own `THREE.Scene` + a default `PerspectiveCamera(50, aspect, 0.1, 1000)` at z 5; the
  default export gets `{ THREE, tsl, scene, camera, tweak, audio, time, size, onFrame }` and may return a dispose
  function. Pipelines compile with `compileAsync` before a layer joins the frame (150–220 ms a layer here; a first
  draw compiling them stalled the page for seconds on D3D12). One frame callback (`g2Tick`, through the page's own
  scheduler: park, freeze, fps cap, dozing, offline renders apply as to any layer) runs every visible layer's onFrame
  on its clock (sequence clip, precomp, loop, else the frame's time), then draws them bottom first. Errors are said
  once and a layer that throws every frame is paused like any layer. Stats: fps / frame ms / draw calls / triangles,
  plus `gpuMs` (timestamp queries; Chromium quantises them, so tiny scenes read ≈ 0) in the dock line. A WebGPU canvas
  loses its picture once shown, so `glFresh` redraws it when read between frames (stills, covers, merges).
- **Phase 2, compositing.** One plain layer draws straight to the screen. Otherwise every layer goes onto the scene's
  picture (a half-float linear target, as three.js's own screen buffer) and the picture is copied out once (three.js
  r186 otherwise copies the whole screen once per `render()`). Plain layers render straight onto the picture (a colour
  `scene.background` clears it, as an opaque layer covers what's under it); a layer with opacity < 1 (incl. keyframes,
  in / out fades: `layerMix`), a blend mode, a move / scale / turn or a polygon mask is drawn into its own target and
  merged by a TSL pass: the 17 blend modes of the Layers panel (W3C formulas, in linear colour: differs slightly from the
  old CSS blending in sRGB), the box transform undone per pixel, the mask as a 512² picture. 8-bit sRGB targets were
  tried: slower at 1080p here (6 vs 3 ms a frame), not faster at 4K.
- **Phase 3, lists.** New scene = v2: the gallery's first group "⚡ New scene (v2)" (Music visual: backdrop + 30k
  particles + glow knot; Empty: a cube), the New menu and the fallback dialog; old templates stay under "Old version".
  The Lab's sketch picker: v2 scenes first, the old ones in "Old version" optgroups (per project); Your sketches: v2
  cards, then a folded "Old version · N scenes"; a project's page › Project files › Scenes: same (the closest thing to
  a "project player" found: projects-home.js). Old scenes open, edit and render exactly as before.
- **Phase 4, renders.** Sequence / export plans carry `gpu` for a v2 scene's layers; the export merge (`xpMerge`) draws
  the one canvas at each step; a v2 scene's export page loads with `&gpu=1`. Stills, MP4s, the same time twice = the
  same pixels.
- **Phase 5, directors.** mcp/three-guide.js: a `v2` topic (`three_do help v2` / tsl / webgpu) with the layer API and TSL,
  one CORE line pointing at it; the Lab's report says `format: "v2"` for a v2 scene. Templates: ThreeData.V2_LAYERS /
  V2_TEMPLATES / v2Layers.

### Measured (RTX 4080, Nov 9; Quentin's own Hearth and the Lab player were running on the same GPU, so runs vary 2–3×)
- 6 Visualizer2-like layers (backdrop, 30k particles, 64 bars, rings, lit knot, glow), Lab fps at Max fps / Force high:
  fit 203 v2 vs 181 old · 1080p 178 (min 155) vs 133 (min 69) · 4K 66 vs 106 (another run: 1080p 77 vs 134 — noise).
  WebGL contexts: 0 vs 6. Throughput probe (`__labG2.bench`, frames back to back until the GPU is done): 3–8 ms a
  frame at 1080p, 8–18 ms at 4K for the 6 layers (each layer's pass stores and resolves a 4× MSAA target: the
  per-layer cost that remains).
- 20 v2 layers (past Chromium's 16 contexts, where an old scene goes black): all drawn, 0 contexts, 38 fps at Auto.
- Renders: a 640×360 45-frame MP4 of the v2 template at ≈ 2× real time.

### Open
- Per-layer passes cost at 4K (MSAA store + resolve each). Next: draw consecutive plain layers in fewer passes, or MSAA
  only on the final picture.
- Not v2-aware yet: the scene editor (✥), Direct manipulation outlines, look-around views, ▶ Play's merge, the Lab
  player window, filter-layer templates / three_nodes (old-format code), precomps of v2 scenes.
- Checks: dev/checks/scenesv2.js (runtime + A/B), scenesv2-comp.js (merging), scenesv2-lists.js, scenesv2-render.js,
  scenesv2-many.js, scenesv2-bench.js, scenesv2-rate.js (all with SMOKE_GPU_FLAGS="--ignore-gpu-blocklist").
