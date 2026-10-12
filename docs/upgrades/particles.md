# GPU particles (round 24, particles): particles as a first-class Lab layer

You asked for "5 more"; this stream is GPU particles. A **✦ particle layer** is a normal Lab layer whose code is a
`tweak({…})` block and one call, `particles(P, opts)`: it stacks, blends, fades, keyframes, sits in the sequence and
in precomps, shows in the time machine and renders / exports like any other layer. The particles live on the GPU
(float textures, ping-ponged), so 100k–2M of them run on a real graphics card; the preview draws fewer by itself when
frames drop, renders draw them all.

Where: `/particles` (the preset picker), `/particles <preset>`, `/particles text <word>`, `/particles model`,
right-click a layer › ✦ Particles ›, right-click the preview › ✦ Particles ›, the FX picker's "Particles" category,
Ctrl/⌘+K "Lab: ✦ …". Directors: `three_do { cmd: "particles", op }` and `three_add_layer { template: "particles-galaxy" }`,
explained on demand by `three_do help particles` (nothing added to the per-message prompt or the tool descriptions).

Files: `tools/three-particles.js` (hub: code, commands, picker, menus, director tool), `tools/three-particles-data.js`
(sliders and the 30 presets), the "GPU particles" block in `tools/three-sandbox.html` (the runtime), both hub files in
the lazy `lab` group. Small hooks: `tools/three.js` (4 lines: layer menu, preview menu, the info message, the layer's
kind for the director), `mcp/hearth-map.js` (help topic + aliases), `lazy-data.js`, `dev/run-checks.js` (lab group).

## How it works and stays fast
- State: two float RGBA textures per buffer (position + age, velocity), ping-ponged; one full-screen pass for the
  velocities (forces), one for the positions (move, die, be born). Birth / death / bursts are decided by an integer
  hash of (particle, step, seed) in both passes, so nothing is read back.
- Time: 60 fixed steps a second of the **scene's clock** (its song, its own timeline, a sequence clip's or a precomp's
  time). A paused song holds the particles; a seek restarts them a few seconds before the frame and steps up to it.
  An export page (fresh, seeded) does the same, so **the same frame renders the same pixels every time**.
- Per frame: sliders written into shared uniform objects (colors converted only when their text changes), no arrays
  or objects made; the shader texts never change between runs, so a re-run borrows the linked programs from the
  round-21 context pool / program cache.
- Measured headless (SwiftShader, the CPU is the GPU; capped at 16k particles there): 27 presets ran, 9–110 ms per
  frame of the layer's own work (curl-noise presets are the dearest); 3 particle layers in one scene: 4–14 fps in
  this software renderer. Not measured on a real GPU here.

## Upgrades

### The layer (runtime in the preview)
1. **✦ Particle layers**: `particles(P, opts)` in a layer's code makes it a GPU particle layer (its own renderer from the context pool).
2. GPGPU simulation in float textures (half-float where a GPU can't draw into 32-bit floats).
3. Up to 2M particles (`count` in thousands); the count slider rebuilds the layer, every other slider is live.
4. **Fixed 60 steps a second on the scene's clock**: pause holds them, scrubbing restarts a few seconds early and steps up to the frame.
5. **Deterministic renders**: the same exported frame is the same picture twice (checked), another time is another picture.
6. **Adaptive count**: the preview draws the share the adaptive quality allows (half in Light mode); renders and exports draw all of them.
7. Software GPUs (SwiftShader, llvmpipe, VMs) keep the count at 16k by themselves (`/particles info` says so).
8. A slow preview frame catches up in at most 8 bigger steps instead of stalling.
9. No per-frame allocations; shader programs reused across re-runs (context pool + program cache).
10. A shader the GPU rejects shows in the Lab's errors for that layer.

### Where they are born (emitters, `opts.emitter`)
11. Point.
12. Sphere (surface).
13. Ball (inside).
14. Disc.
15. Ring.
16. Box.
17. Plane (a sheet: sky for snow and rain).
18. Line.
19. Torus.
20. Spiral galaxy arms (arms, twist).
21. **Text**: the letters of a word (several lines, any font), `/particles text <word>`.
22. **Image**: a reference picture's bright pixels, with its colors (`/particles picture <reference>`).
23. **Model**: the surface of a 🧊 model layer (triangles picked by area, with their material colors), `/particles model`.
24. The model emitter follows the model as it turns and floats (its root group's matrix every frame).
25. …and draws through the model layer's own camera, so the dust sits on the model.
26. A replaced or newly loaded model is sampled again by itself.
27. **Another layer's bright pixels**, refreshed as it plays (`/particles from <layer>`).
28. Emitter place, size and turn sliders (it circles when placed off the middle).
29. Birth jitter.

### Forces
30. **Curl-noise flow field** (two octaves, evolving: strength, scale, change).
31. Turbulence.
32. Gravity (negative: they rise).
33. Wind.
34. Drag.
35. Vortex.
36. Pull to the middle (stable orbits with swirl).
37. Attractors: the code's own `[[x, y, z, strength]]` or two that circle the middle (negative: push).
38. Boids-lite flocking (neighbours' speed, place and separation).
39. **Hold the shape** (`form`): pulled back to where they were born.
40. **Dissolve**: lets go of the shape (keyframe it 0 → 1).
41. Dissolve sweep: lets go from left to right.
42. Floor with bounce.
43. Speed limit.
44. Recycling: those that fly too far (or fall into a sink) are born again.

### Launch, life, color, size
45. Launch speed, spread and direction (up / down, toward / away).
46. Outward launch.
47. Swirl launch (orbits).
48. Lifetimes with variety (60 = forever).
49. Emission rate (0: bursts only).
50. **Color over life** (three colors).
51. Color by speed, by source (the picture / model / text colors), by height, or random from the three.
52. Hue shift and saturation.
53. **Size over life** and size variety.
54. Fade in / fade out.

### Look
55. Points with 5 sprites: soft, dot, ring, star (sparks), square.
56. **Streaks** stretched along their speed (rain, sparks, warp).
57. **Instanced meshes**: tetra, octa, box (confetti), shard, oriented along their flight and tumbling.
58. **Trails** (feedback: the last frames fade under this one; a frozen frame keeps them).
59. **Additive or alpha blending**.
60. An opaque background color option (`bg`).
61. Camera orbit, distance and tilt sliders.

### Music (all sliders: Save, Shuffle, keyframes, MIDI work on them)
62. **Burst on kick**: a share of the waiting particles is born on each kick.
63. **Explode on kick**: a push outward on each kick.
64. **Forces follow the bass**.
65. **Color follows brightness** (the spectral centroid from the labaudio features).
66. Kicks come from your kick markers, the labaudio kick hits (song or live) or the beat.
67. `/particles react`: the preset's ♪ react-to links on its sliders (e.g. Galaxy: size on kicks, opacity with loudness), only when asked.
68. Any particle slider can follow any sound through `/react-to` and its curve editor.

### Chat, menus, directors
69. `/particles` (alias `/gpu-particles`): the preset picker (one searchable list; Enter adds, Shift+Enter replaces the selected particle layer).
70. `/particles <preset>`.
71. `/particles list [word]`.
72. `/particles text <word>` (text that dissolves).
73. `/particles model [layer]` (the model into dust).
74. `/particles picture <reference>`.
75. `/particles from <layer>` (light rising off a layer).
76. `/particles set <slider> <value>`: written into the code (undoable, the time machine sees it); a slider the layer lacks is added.
77. `/particles emitter <kind> [text | layer | reference]`.
78. `/particles look <points | streak | mesh | sprite | mesh shape | add | alpha>`.
79. `/particles info` (count, emitter, source, ms per frame).
80. `/particles help`.
81. Right-click a ✦ layer › ✦ Particles ›: Drawn as, Sprite, Emitter, ♪ React to the music, Replace with a preset.
82. Right-click the preview › ✦ Particles ›: New particle layer, Particle word, Model into dust, Light off this scene.
83. Ctrl/⌘+K "Lab: ✦ GPU particles (presets)…".
84. Ctrl/⌘+K "Lab: ✦ Particle word (text that dissolves)…".
85. The FX picker's "Particles" category and `/template particles-<id>` (29 templates).
86. `three_do particles { op }` for Claude and Astra: list, add, set, emitter, look, react, info, help (per-chat scenes like the other Lab tools).
87. The scene's layer list marks ✦ layers as `particles (GPU: three_do particles)`.
88. `three_do help particles` (also particle, emitter, gpgpu, sparks): the whole API in one on-demand topic.
89. `window.__labParticles` in the preview: info, a read-back probe (alive, mean, spread), and the music held at a value (three_eval, checks).

### Presets (30; `/particles <id>`)
90. Galaxy (`galaxy`): spiral arms turning around a bright core.
91. Nebula (`nebula`): slow colored gas in a flow.
92. Warp stars (`starfield`): stars streaking toward the camera.
93. Black hole (`blackhole`): matter spiralling into the middle.
94. Comet (`comet`): a head circling with a long tail.
95. Smoke (`smoke`): soft gray smoke rising and curling.
96. Fire (`fire`): flames licking upward.
97. Embers (`embers`): sparks floating up and fading.
98. Fireflies (`fireflies`): lights wandering and blinking.
99. Snow (`snow`): flakes falling softly, swaying.
100. Rain (`rain`): streaks driving down at an angle.
101. Bubbles (`bubbles`): rings rising and wobbling.
102. Dust motes (`dust`): specks floating in a light beam.
103. Aurora (`aurora`): curtains of light with trails.
104. Flow ribbons (`ribbons`): glowing ribbons following a flow field.
105. Tornado (`tornado`): a funnel spinning upward.
106. Swarm (`swarm`): shards flocking around two moving points.
107. Orbit attractors (`attractors`): threads orbiting two pulling points.
108. Fountain (`fountain`): a jet arcing up and splashing on the floor.
109. Sparks on kick (`sparks`): a shower bursting on every kick.
110. Kick sphere (`kicksphere`): a sphere blowing apart on the kick and pulling itself back.
111. Shockwave rings (`shockwave`): a ring rushing out on every kick.
112. Confetti (`confetti`): paper bursting on kicks, fluttering down.
113. Spectrum fountain (`spectrum`): height on the bass, color on the brightness.
114. Text that dissolves (`dissolve`): a word blowing away like dust, left to right.
115. Model into dust (`modeldust`): the 🧊 model turning to dust (bursts on kicks).
116. Light rising off a layer (`glowrise`): the layer below gives off rising light.
117. Particle word (`logo`): a word that bursts on kicks and comes back.
118. Torus flow (`torus`): a donut streaming around itself.
119. Picture in particles (`picture`): a reference picture rebuilt from shimmering particles.

## How it was tested
- `dev/checks/particles.js` (new, in the lab group): 27 presets run one after another on one layer (draw, every
  program linked, no errors, homes filled); the galaxy's state and picture move with the clock; with the kick held at 0
  "Sparks on kick" has none alive, at 1 a share is born, and they're gone after their life; a model layer (a group
  named Model at x = 1.2) gives particles on its surface (mean x 1.2); "HI" gives particles on its letters and Dissolve
  1 lets them go; three_do particles list / add / info / set and `/particles list`; three exports through the hidden
  export page: the same frame twice identical, another time different.
- `sh dev/run-checks.sh labgpu smooth-lab qa-commands`; `node --check` on every touched file; the sandbox's module
  scripts syntax-checked as modules; `node dev/lazy-manifest.js` regenerated (its compare reports an actions
  difference in the meter's /context and /tokens labels that isn't from this stream).

## Not done / risks
- Not run on a real GPU here (only SwiftShader at 16k particles): 2M at 60 fps is the design target, not a measurement.
- Picture and model emitters fill in when their file / model has loaded: an export's very first frames can start
  before that (it's the same each time once loaded).
- The model emitter uses the model's rest pose (skinned animation isn't followed, the root's motion is).
- The layer-pixel emitter reads a small (160 px wide) picture of the other layer every 4 frames in the preview.
- A GLB export of a scene with a particle layer contains the particle object's texel indices, not positions.

Count: 119 upgrades.
