# Round 179, part 2 (v2filter179): filter layers in a v2 scene

Branch `claude/v2only179`. Part 1 (`v2only179.md`) mapped what still writes old-format layers; the first thing the v2
engine lacked was a layer that restyles the picture under it. This is it.

## For the owner
1. **Filters work in a new-format scene, on its one renderer.** ＋ Layer › Filters, the FX picker, a look, Blocks,
   `/fx` and the AIs' `three_add_layer { template: 'film' }` add a v2 filter layer there: same name, same sliders,
   same music reactions. No extra canvas, no extra graphics context.
2. **121 of the 124 filter types run this way.** Not yet: Crystal, Oil paint (their shaders do not translate) and
   ◐ Grade's own filter (it brings LUT textures of its own). Those three are still added as old-format layers.
3. **They look the same.** The same filter over the same still picture in an old scene and in a v2 scene: 7 of 7
   compared within 6 of 255 a channel (duotone 0.07, mirror 0, posterize 0, halftone 0.29, sepia 0.12, pixelate 0.14,
   kaleido 5.3). An inverted picture is its exact negative (0.03 of 255).
4. **Opacity mixes the filter with the original**, in / out and blend work as on any layer, and a filter whose
   strength is 0 (bloom, blur, grain, vignette, sharpen…) is not drawn at all.
5. **The AIs can write their own**: `below()` in a v2 layer is the picture so far.

## How it works (`tools/three-sandbox.html`, "filter layers in a v2 scene")
- `below(uv?)` (a v2 layer's argument): a TSL texture node of the picture so far (`C.A`), linear, `screenUV`. A layer
  that asked for it is never "plain": it is drawn into the layer picture (`C.Ly`) while its nodes point at
  `C.A.texture`, then merged by `g2Merge` like any layer with opacity. No ping-pong of its own.
- `filter(type, P)` (also an argument): the OLD shaders. `g2FxBuild` takes `FILTER_HEAD` + the type's GLSL, runs it
  through three.js's transpiler (`three/addons/transpiler`: GLSLDecoder → TSLEncoder, fetched with the library like any
  addon, once), rewrites the result into a module `make(U)` and imports it; `g2Filter` gives it its uniforms and a
  full-frame quad. Cached per type.
- What is adjusted around the translator (`g2FxGlsl` before, the rewrite after):
  - `float a = 1.0, b = 2.0;` → a statement each (it keeps only the first name);
  - `(-0.1 + x)` → `((0.0 - 0.1) + x)` (it writes `-0.1.add(x)`);
  - `musicOf()` as one expression (early `return` inside `if` does not translate);
  - every local becomes a variable (`.toVar()`: it leaves them constant, GLSL assigns to them);
  - `gl_FragColor` is a variable of `main`, returned.
- Colours: the old filters worked on display values; the v2 picture is linear. `uSrc` / `uPrev` hand over sRGB-encoded
  values and the result is decoded again. `vUv` keeps its old sense (0,0 bottom left): flipped where sampled.
- Feedback types (13: trails, echo, datamosh, melt…): their last output is kept in a picture of their own
  (`g2FxKeep`, a copy of `C.Ly` after the draw).
- Sliders, choices, colours and music go in through the old `setFxParams` / `setFilterMusic` (a uniform node has
  `.value` like an old uniform).
- `tools/three-layers.js` `v2Filter(code)`: a plain filter layer's code (`tweak({…}); filter('type', P);`) wrapped as
  `export default async ({ tweak, filter }) => { … await filter('type', P); }`; not for `cgrade`, `crystal`,
  `oilpaint`. `tools/three.js` `addLayer` and `tools/three-backstage.js` `addLayer` pass a v2 scene's new layers
  through it (template or code), and a FILTER's id wins over a v2 layer's short id there ("glow" is the glow filter;
  the glow lights layer is `v2-glow`).

## Costs and limits (honest)
- A v2 filter layer costs its own full-frame pass plus the merge pass (two passes), into the scene's MSAA targets. The
  old "fuse" (pointwise filters stacked on each other drawn as one shader) is not there: three filters are six passes.
- A scene with a filter layer is never "all still": the filter is drawn every frame (still178 keeps the layers under
  it).
- First use of a type: the translator's three files are fetched (once, kept with the library) and the shader built;
  the layer joins the frame when its pipeline is made (well under a second each here).
- Not there: vhs's REC overlay (a 2D canvas on top), ⚡ Lite's stepping aside, the adaptive low-resolution filters
  (`fxLow`), filters as track mattes. A filter under an old-format layer in a v2 scene: the old layer is its own canvas
  above the v2 picture, as before.
- An old-format filter already in a v2 scene (made before this round) stays as it is; "re-add it" makes it v2.
- Looks alike was compared on 7 types. The other 114 were only run: each mounted, the graphics card accepted its
  shader and no shader-builder error was printed; 103 changed a still test picture, 18 left it as it was (strength 0
  or subtle by default, music-driven with no music, or feedback over a picture that does not move). Their looks need
  eyes.

## Checks (silent, `SMOKE_GPU_FLAGS="--ignore-gpu-blocklist"`)
- New `dev/checks/v2filter179.js` (11 steps, passes): a filter from the template list is v2 code and restyles the
  picture with 0 WebGL contexts; "glow" is the filter; invert = the exact negative; opacity mixes; a filter at 0 leaves
  one layer in the frame; `below()` by hand; trails leaves a trail behind a moving dot; old against v2 on 7 types.
- New survey `dev/surveys/v2filter179-all.js` (every type, ≈ 4 min, not in the suite):
  `node dev/smoke.js --check-timeout 900000 --script dev/surveys/v2filter179-all.js` → 121 of 124 run.
- Pass: gpuaware176, fastkit, scenesv2, scenesv2-still, scenesv2-onepass, scenesv2-comp, v2only179; unit: boot-test,
  slim116, tokens-test, director-mcp.
- promptdiet "Three Director (full)": 9019 (8870 on main; the v2 help topic's filter lines; budget 7940, already over).

## Next (from part 1's order)
◐ Grade's filter (its LUT textures as v2 textures); the GLSL shader layers (`shader()`, 38 + 38 + 22) through the same
translator; then the helpers (type, visualizer looks, shapes, particles presets, physics, models) and the gallery
starts, Describe it and Blocks that are built from them.
