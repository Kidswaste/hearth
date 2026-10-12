# Shader workbench (round 23, labshader): fragment shaders as Lab layers

You asked for "at least 5 major changes"; this stream is the Lab's shader workbench. A **◇ shader layer** is a normal
Lab layer whose code calls `shader(glsl, P, opts)`: it stacks, blends, fades, keyframes, sits in the sequence and in
precomps, renders and exports like any other layer. Write Shadertoy-style GLSL, paste a Shadertoy or ISF shader, or
pick one of 38 starters; uniforms with a short hint become sliders by themselves, and a typo shows on its line while
the last version that compiled keeps drawing.

Where: `/shader` (the workbench card), `/shader new <starter>`, `/shadertoy` (paste), right-click a layer › ◇ Shader ›,
right-click the preview › ◇ Shaders ›, the FX picker's "Shaders" category (＋ Layer / X), Ctrl/⌘+K "Lab: ◇ …".
Directors: `three_do { cmd: "shader", op }` and `three_add_layer { template: "shader-tunnel" }`, explained on demand by
`three_do help shader` (nothing added to the per-message prompt or tool descriptions).

Files: `tools/three-shader.js` (hub: workbench, commands, director tool, inline errors), `tools/three-shader-lib.js`
(text side: hints → sliders, imports, code), `tools/three-shader-data.js` (starters), `tools/three-shader.css`, the
"shader layers" block in `tools/three-sandbox.html` (the runtime), all in the lazy `lab` group.

## How it stays fast (measured headless, SwiftShader)
- Each new GLSL text is compile-checked once on the layer's own context (a 96-entry cache by text): exact error lines,
  nothing linked twice; three.js then borrows the linked program from the context pool's cache (round 21), so a re-run
  of the same shader links nothing.
- Per frame: uniforms are shared objects written in place (time, music, sliders: colors converted only when their text
  changes), channel textures are reused, the audio texture is filled once per frame for every shader layer, the layers
  below are merged only when something under them drew (the filters' own path). No arrays or objects made per frame.
- Feedback buffers are half-float render targets, ping-ponged; a layer-wide resolution scale goes through the preview's
  own adaptive-quality hook (renders and exports stay at full pixels).
- `dev/checks/labshader.js`: a 2-pass Shadertoy feedback layer 2.5 ms per frame, a one-pass starter 2.6 ms, on the
  CPU renderer. `labgpu`, `labhub`, `smooth-lab`, `qa-commands` pass unchanged.

## Upgrades

### Shader layers (the runtime in the preview)
1. **◇ Shader layers**: `shader(glsl, P, opts)` in a layer's code makes it a full-frame fragment-shader layer (its own renderer from the context pool, stacked like any layer).
2. Shadertoy's form built in: `mainImage(out vec4, in vec2)` with iTime, iTimeDelta, iFrame, iFrameRate, iResolution, iMouse, iDate, iChannel0–3, iChannelResolution.
3. A plain `main()` works too: `gl_FragColor`, `texture2D`, `varying vec2 vUv` from older GLSL are translated; `#version` / `#extension` lines and re-declared built-ins in a paste are ignored (line numbers kept).
4. ISF dialect (opts.isf): RENDERSIZE, TIME, TIMEDELTA, FRAMEINDEX, DATE, PASSINDEX, isf_FragNormCoord / vv_FragNormCoord, IMG_PIXEL / IMG_NORM_PIXEL / IMG_THIS_PIXEL / IMG_SIZE.
5. **iTime is the scene's clock**: the song or the scene's own timeline, the Lab sequence's time in a clip, a precomp's remapped time; scrubbing and exports land on the exact frame.
6. Music uniforms in every shader: uKick, uSnare, uHats, uHit, uBeat, uBass, uMid, uTreble, uLevel, uDrop, uEnergy, uBeatPhase, uBarPhase, and uBands (bass, mid, treble, level); kick / snare come from your markers when the song has them, like the filters.
7. **Audio texture** (`'audio'` channel or `uAudio`): Shadertoy's 512 × 2 layout, spectrum at y 0.25 and waveform at y 0.75, filled once a frame for all shader layers (live sound and the demo beat too).
8. **Feedback**: `'self'` (or `uPrev`) reads the pass's own previous frame (half-float, so long trails don't band).
9. **Multi-pass**: `buffers: { A: { code, iChannel0: 'A' }, B: … }` are drawn in order before the image, with Shadertoy's rules (a buffer reading itself sees its last frame, a later pass sees this frame's).
10. Per-buffer resolution: `buffers.A.scale` (0.05–1) draws a simulation or blur pass smaller.
11. **Layer resolution scale**: `opts.scale` 0.25–1 draws the whole layer at a fraction of the preview's pixels (stacked on the adaptive quality); renders, stills and exports stay full size.
12. **Layers below as a texture** (`'below'` / `uBelow`): any shader becomes a filter over what's under it (only re-merged when something under it drew).
13. **Other layers as textures**: `'layer:<name>'` reads another layer's live picture.
14. References as textures: `'ref:<key>'` (pictures, videos) from the sketch's references.
15. A built-in 256² noise texture channel (`'noise'`), and `'none'` (black).
16. `common` GLSL shared by every pass (Shadertoy's Common tab).
17. Opaque by default (pasted shaders often leave alpha at 0); `alpha: true` keeps the shader's alpha, premultiplied, for see-through overlays.
18. iMouse follows the pointer over the preview (Shadertoy's click / drag sign conventions; the ripple and reaction-diffusion starters use it).
19. **Live compile with exact lines**: each pass is compile-checked once per text; errors are posted with the line in the layer's code (common, buffers and image each mapped back to where their GLSL sits).
20. **The last good shader keeps drawing** while the new one is broken (per layer, the last 32 layers remembered), with its own channels and passes.
21. Each new GLSL text is checked once (cache of 96) and linked programs come from the round-21 program cache: re-running the same shader costs no compile or link.
22. No per-frame allocations: shared uniform objects, colors converted only when they change, reused textures and render targets, the audio texture filled once a frame, the layer lookup for `layer:` channels cached (a missing name retried once a second).
23. `shader.check(glsl | { image, buffers, common, isf })` compiles in the preview without making a layer (the workbench, the director, the checks).
24. `window.__labShader.info()`: each shader layer's passes, channels, slider uniforms, frames and ms per frame (checks, three_eval).

### Uniforms → sliders
25. **Sliders from uniforms**: `uniform float uGlow; // [Look] 0..2, 1 Glow amount` becomes a slider (range, default, label, group) in the layer's sliders panel; Save, Shuffle, looks, keyframes, MIDI and ♪ music links all work on it.
26. Color uniforms (`vec3` / `vec4` with `// #ff8c42`) become color pickers.
27. `bool` uniforms (`// on`) become toggles; `int` ones are whole-number sliders.
28. `int` with `// options: rings, bars, dots` becomes a choice (the shader gets its index).
29. `vec2` uniforms (`// 0..1 = 0.5 0.7 Center`) become two sliders (x / y) and an XY pad in the workbench.
30. The ◇ sliders line is written again on every run from the uniforms (add, rename or delete a uniform and the slider follows), keeping the values you saved; your cursor, selection and scroll stay where they were.
31. A shader with no hint still gets a slider (0..1 for floats, 0..10 for ints) and a label made from its name (uGlowAmount → "Glow amount").

### In the code editor
32. **Inline errors**: a wavy red line under the faulty line and the message at its end, for every layer's errors (GLSL or JavaScript), following scroll on the compositor; cleared when the layer runs clean.

### The workbench card (`/shader`, right-click › ◇ Shader › Workbench…)
33. Compile state of the selected layer: passes and slider uniforms, or the first error with its line and "the last good version is drawing".
34. Each pass (Buffer A–D, Image) with a dropdown per iChannel it reads: audio, self, buffers, below, noise, none, or any other layer.
35. Resolution dropdown (100 / 75 / 50 / 33 / 25 %).
36. Alpha toggle (see-through or opaque).
37. ＋ Buffer: adds a feedback pass (a starting shader that reads its own last frame) to the layer.
38. XY pads for vec2 uniforms (drag; unsaved like any slider, Save keeps it).
39. Copy for Shadertoy: the layer as Shadertoy text (tabs with headers and channel notes; slider uniforms as consts at their current values).
40. The card follows the selected layer and repaints only when its passes / channels / pads change (status text compared before it's written).

### Library and imports
41. **Starter library**: one searchable list (name, category, description), arrow keys, Enter adds a layer, Shift+Enter (or Shift+click) replaces the selected layer.
42. The 38 starters are also Lab templates: the FX picker's "Shaders" category, `/template shader-…`, `three_add_layer { template }`.
43. **Import dialog**: paste, see what was found as you paste (Shadertoy or ISF, passes, channel mapping, notes), add as a layer or replace the selected one.
44. Shadertoy import: a single Image tab.
45. Shadertoy import: several tabs pasted under `// Buffer A`, `// Image`, `// Common` lines.
46. Shadertoy import: the JSON export (renderpass list: buffer ids, music / mic, textures, webcam / video → the layers below; sound and cubemap passes are reported and skipped).
47. Channel mapping from comments (`// iChannel0: Buffer A`, `iChannel1 = audio`…), else sensible defaults (image: buffers in order, then below / audio / noise / self; buffers: themselves first) shown in the notes.
48. ISF import: INPUTS → hinted uniforms: float (range, default, label), long (choices from LABELS), bool / event (toggles), color, point2D (XY pad), image (the layers below), audio / audioFFT (the audio texture).
49. ISF multi-pass: PASSES with TARGET become buffers with their PASSINDEX (and "$WIDTH/2"-style sizes as a buffer scale).
50. Imported layers are named after the shader (◇ name) and compile-checked right away (the answer says whether it compiled).

### Menus, commands, palette
51. Right-click a ◇ layer › ◇ Shader ›: Workbench, Resolution, + Buffer pass, Copy for Shadertoy, Replace with a starter.
52. Right-click the preview › ◇ Shaders ›: New shader layer…, Import Shadertoy / ISF…, Shader workbench.
53. `/shader` with completions: `new <starter>`, `list [word]`, `import`, `channel <0-3> <source> [pass]`, `scale <25-100%>`, `alpha on|off`, `buffer`, `copy`, `check`, `help` (and a bare starter name: `/shader tunnel`).
54. `/shader glsl <image|A|common>` jumps the code editor to that pass's GLSL.
55. `/shadertoy [pasted shader]`: import in one line, or the paste dialog.
56. Ctrl/⌘+K "Lab: ◇ Shader workbench".
57. Ctrl/⌘+K "Lab: ◇ New shader layer (library)…".
58. Ctrl/⌘+K "Lab: ◇ Import a Shadertoy / ISF shader…".
59. `/shader help` (and the workbench's ?): built-ins, hint syntax, channel names, passes on one page.

### The directors (lean: nothing added to the prompt or tool descriptions)
60. `three_do { cmd: "shader", op }`: list, add, import, glsl, channel, scale, alpha, buffer, info, check, copy (Claude and Astra; per-chat scenes like the other Lab tools).
61. `op: "add"` takes a starter or any text: plain GLSL, a Shadertoy paste or ISF, detected; the answer says whether it compiled and gives the errors with lines.
62. `op: "glsl"` replaces one pass's GLSL (image, a buffer or common) without resending the layer's code; a new buffer name adds the pass.
63. `op: "check"` compiles GLSL without making a layer.
64. The scene's layer list marks ◇ layers as `shader (GLSL: three_do shader)`.
65. `three_do help shader` (also glsl / shadertoy / isf / raymarch / feedback): the whole workbench in one on-demand topic; the filters help topic points to it.

### Starter shaders (38; `/shader new <id>`)
66. Plasma (`plasma`): sine plasma, tinted, kick punch.
67. Liquid marble (`marble`): domain-warped ink.
68. Clouds (`clouds`): drifting fbm over a sky gradient.
69. Voronoi cells (`voronoi`): moving cells, glowing borders.
70. Aurora (`aurora`): northern-light curtains and stars.
71. Lava lamp (`lava`): metaballs that swell with the bass.
72. Caustics (`caustics`): underwater light.
73. Kaleidoscope (`kaleido`): mirrored turning pattern.
74. Tunnel (`tunnel`): endless striped tunnel.
75. Hex pulse (`hexgrid`): honeycomb lighting in waves.
76. Truchet tiles (`truchet`): maze tiles flipping on the beat.
77. Moiré rings (`moire`): interference rings.
78. Warp stars (`starfield`): stars at warp speed.
79. Sun rays (`sunrays`): god rays from a movable sun (XY pad).
80. Synthwave grid (`synthgrid`): neon grid to a striped sun.
81. Neon rings (`rings`): rings rippling on kicks.
82. Flowing gradient (`gradient`): calm cosine-palette background.
83. Raymarched blobs (`blobs`): glossy melting spheres.
84. Infinite columns (`columns`): flying through repeated boxes.
85. Gyroid caves (`gyroid`): inside a gyroid surface.
86. Julia fractal (`julia`): a Julia set breathing with the bass.
87. Spectrum bars (`spectrum`): the spectrum as bars (audio channel).
88. Oscilloscope (`scope`): the waveform as a scope line.
89. Kick shockwave (`kickring`): a ring on every kick.
90. Bass blob (`bassblob`): an organic blob swelling with the bass.
91. Feedback trails (`trails`): orbiting dots with long trails (Buffer A).
92. Zoom feedback (`zoomfeedback`): the last frame zooms and turns into the next.
93. Reaction-diffusion (`reaction`): Gray-Scott coral at half resolution (click to seed).
94. Paint smear (`smear`): the layers below smeared like wet paint.
95. Motion echo (`echo`): colored echoes of everything below.
96. Kaleido (layers below) (`kaleidobelow`): your scene folded.
97. Chromatic split (`chroma`): RGB pulled apart, harder on kicks.
98. Ripple (`ripple`): water ripples through the picture (click to drop).
99. Hex mosaic (`hexpixel`): the picture as hexagons.
100. Neon edges (`neonedges`): edges glowing in neon.
101. 1-bit dither (`dither`): two-color ordered dithering.
102. Glitch slices (`glitchshift`): slices jumping on hits.
103. Beat vignette (`vignettepulse`): edges breathing on the beat.

## How it was tested
- `dev/checks/labshader.js` (new, passed): all 38 starters compile; a starter draws with its uniforms as sliders; a
  Shadertoy paste with Buffer A feeding itself (iChannel0) maps both channels and its trails draw and move; an ISF filter
  compiles and its inputs are sliders; a GLSL typo is reported on its exact code line, shown inline in the editor, while
  the last good shader keeps drawing and moving, then clears when fixed; a new `uniform vec2` line becomes two sliders;
  the picture follows uBass (held at 0 → 0, at 1 → 255); the workbench opens; `/shader list`; `three_do shader info /
  scale`.
- `sh dev/run-checks.sh labgpu labhub smooth-lab qa-commands`: passed. `node --check` on every touched file; the
  sandbox's module scripts syntax-checked as modules.

## Not done / risks
- TSL / node materials: not built (three.js' TSL needs the WebGPU build and its own renderer here); Shader nodes
  (`/shader-nodes`) still compile node graphs to GLSL filters.
- ISF shaders with their own vertex shader (.vs) run with the default one (the import says so).
- A shader layer's compile check runs on the page's thread once per new text (a few ms on a real GPU); the program link
  itself is the round-21 path.
- Feedback buffers start from black on every re-run (a code edit resets trails).

Count: 103 upgrades.
