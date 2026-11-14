# Round 179 (v2only179): the ways into a scene that still made old-format layers, part 1

Branch `claude/v2only179`. The owner's call: old scenes are done and posted, the gap in speed there doesn't matter;
nothing NEW should be the old format. This round maps everything that still writes old-format layers and moves the
entry points that had a v2 way ready. The large families need engine work first (below).

## For the owner
1. **Code from a chat.** A v2 layer in a reply now gets "▶ Apply to scene" (only old-format code did). "Open in the
   Lab" with v2 code makes a v2 scene (it made an old one, where v2 code draws nothing). Applying a v2 layer to an
   old-format scene is refused with the reason, not tried.
2. **A picture or clip dropped on a v2 scene** (the preview or the timeline) is a v2 layer: one quad on the scene's
   one renderer, same Fit / Zoom / Slow drift / Starts at sliders. A video dropped as footage adds the fast footage
   layer.
3. **New projects.** Audio visualizer, Particles and Footage + effects start as fast v2 layers (backdrop + glow lights
   + spectrum; backdrop + 150,000-particle swarm; the footage backdrop). Shader art, Kinetic type and the 3D model
   showcase still start as old-format scenes: they have no v2 counterpart yet.
4. **The AIs.** The layers help topic and the crew's standing line lead with the v2 way; the old way is kept for old
   scenes only.

## The map: what still writes old-format layers (Nov 14, by a read of the code)
| family | where | how many | what v2 lacks for it |
|---|---|---|---|
| Filter layers, ◐ Grade, lens | `tools/three-fx-filters.js`, `three-grade*.js`, sandbox `filter()` | 169 + 2 | **a layer that reads the picture below it** (none in v2), feedback targets; the shaders are GLSL |
| FX layer templates | `tools/three-fx-templates.js` | 85 (38 GLSL shaders, 23 3D, 24 2D canvas) | GLSL, 2D-canvas layers |
| Shader starters, shader nodes | `three-shader-lib.js`, `nodes-shader.js` | 38 + 22 | GLSL, multipass buffers, reading another layer |
| Motion design kit | `tools/three-motion.js`, `sandbox-motion.js` | 122 presets, 8 kinds | 2D canvas, the camera kind moves the picture below |
| Particles / Physics / Type / Kinetic / Lyrics | `three-particles.js`, `three-physics.js`, `three-type.js` … | 30 / 27 / 32 | each helper makes its own renderer (particles: `v2-particles`, `v2-swarm` exist; type and physics: nothing) |
| Visualizer looks, Shapes, Camera in | `three-vis.js`, `three-shapes.js`, `three-motion-in.js` | 17 / 21 | own renderers (`v2-spectrum`, `v2-tracking`, `v2-footage` cover part) |
| Footage templates | `tools/three-frames-templates.js` | 21 | frame-history targets, GLSL (`v2-footage`: fill / fit / grade only) |
| Gallery starting points, Describe it, Blocks | `three-gallery-data.js`, `three-instant.js`, `three-blocks*.js` | 26 starts, 12 blocks | built from the families above; every start has a filter |
| Lab Nodes | `tools/three-nodes.js` | 36 presets | EffectComposer passes, `filter()` |
| 3D models, HDRI | `three-models.js`, `sandbox-lab3d.js`, `apps-lab.js` | 1 builder + 2 | composer bloom / DOF, own renderer |
| Code sketches, snippets | `ThreeData.TEMPLATES` (12), `SNIPPETS` (18), `ThreeLayers.TEMPLATES` (3), shape generator | | listed as "Old version" / below the fast layers |
| Assets library pictures / text | `assets.js` | 2 | 2D canvas |

Nearly all of them are a `tweak()` block plus one helper call (`filter()`, `particles()`, `textLayer()`, `shader()`,
`visualizer()`, `shapeLayer()`, `physics()`, `motion.*()`, `lab3d.model()`, `webcam.layer()`); the helper, in
`tools/three-sandbox.html`, is what makes the renderer. So the rework is in the helpers and the v2 runtime, not in the
~600 presets.

## What it needs, in order (not built)
1. **A v2 filter layer**: a layer that gets the picture so far as a texture and writes the next one (the runtime keeps
   it private today, `C.A`). Everything "on top" depends on it: filters, grade, lens, the motion camera, every gallery
   start, 10 of the 12 Blocks. Read from the code, not run: an old filter put in a v2 scene most likely does not see
   the v2 layers at all.
2. **GLSL in a v2 scene**: 169 filter shaders and ~100 shader layers are GLSL; the WebGPU renderer takes TSL. Either a
   translation, or one shared WebGL canvas for all GLSL layers of a scene drawn into the v2 picture as a texture.
3. **The helpers on the one renderer**, family by family: type, visualizer looks, shapes, particles presets, physics,
   models, 2D-canvas layers (one shared canvas texture).
4. Then the menus stop offering old-format pieces in a v2 scene, and the first scene of an empty Hearth becomes v2 (it
   is still "Basic scene", old format: 16 checks build on its code or name; the owner's Hearth is not empty).

Also found: `tools/three.js` gives the layers panel two `v2:` entries (rounds 176 and fastkit, same value; harmless).
Reported by the game-projects session, not reproduced here: ▶ Play on a v2 scene opens its window but the layer never
starts.

## For the lead (technical)
- `tools/three-chatlink-core.js`: `v2Layer(code)` (a default-exported function that names `scene`, no renderer / loop),
  `wholeLayer` accepts it. `tools/three-chatlink.js` `apply`: refused for an old-format scene. `native.js`
  `decorateCode`: the Apply button for v2 blocks. `tools/three.js` `api.openCode`: format from `ThreeData.isV2Code`.
- `dragdrop-core.js` `pictureLayer(key, { v2 })`, `tools/three-dropmedia-core.js` `footageCode(key, from, { v2 })`: the
  quad is placed by `material.vertexNode` (clip space, no camera), colour and alpha from `texture(refTexture(key))`.
  Callers (`dragdrop.js`, `tools/three-dropmedia.js`) pass `director.layers().format === 'v2'`; dropped footage uses
  template `v2-footage` there.
- `projcreate-core.js` STARTS: `v2: [ids]` on visualizer, particles, footage; `projcreate.js` `prepare` takes them
  through `ThreeData.v2Layers` (not for a model showcase given a model); palette tuning skips v2 code.
- `mcp/three-guide.js` layers topic, `engines.js` crew line.

## Checks (silent, `SMOKE_GPU_FLAGS="--ignore-gpu-blocklist"`)
- New `dev/checks/v2only179.js`, 12 steps, passes: a v2 block is a whole layer; open-in-Lab makes a v2 scene and it
  draws (2304 of 2304 sample pixels lit); old code still opens old; the refusal's words; a dropped picture's v2 layer
  is drawn by the one renderer (centre pixel 255, 32, 32 from a red picture, 0 WebGL contexts); the clip layer runs
  without error (a picture stands in for the clip: its play / seek is not exercised); the three starts.
- Pass: gpuaware176, fastkit, scenesv2-newchat; unit: boot-test, slim116, tokens-test, labchat92, director-mcp.
- Fail the same on main: dragdrop-test's 2 Windows file-URL cases; promptdiet's "Three Director (full)" (8870 on main,
  8916 here with the layers topic's two additions; budget 7940).
- Not run: a real drop with the mouse, a real video clip in the v2 clip layer, a new project made through its dialog
  (`projcreate128` cannot pass on Windows: `/tmp` fixtures).
