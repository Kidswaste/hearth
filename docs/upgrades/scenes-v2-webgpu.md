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
