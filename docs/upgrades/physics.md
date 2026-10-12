# Light physics (round 25, physics): physics scenes as a Lab layer

You asked for "5 more"; this stream is light physics. A **⚛ physics layer** is a normal Lab layer whose code is a
`tweak({…})` block and one call, `physics(P, opts)`: falling letters, bouncing balls on the beat, dominoes, Newton's
cradle, a flag in the wind, jelly, ragdolls, water… It stacks, blends, fades, keyframes, sits in the sequence and in
precomps, shows in the time machine and renders / exports like any other layer, and **a render is the same every
time** (the simulation steps on the scene's own clock, seeded).

Where: `/physics` (the preset picker; alias `/phys`), `/physics <preset>`, `/physics text <word>`, `/physics add ball`,
right-click a ⚛ layer › ⚛ Physics ›, right-click the preview › ⚛ Physics ›, the FX picker's "Physics" category,
Ctrl/⌘+K "Lab: ⚛ …". Directors: `three_do { cmd: "physics", op }` (one 3-token entry in three_do's description: the
lean tool list is 1,690 of its 1,700 tokens) and `three_add_layer { template: "physics-dominoes" }`, explained on
demand by `three_do help physics` (also `cloth`, `rope`, `ragdoll`, `rigid`, `softbody`, `fluid`, `domino`…).

Files: `tools/three-physics.js` (hub: code, commands, picker, menus, director tool), `tools/three-physics-data.js`
(sliders and the 27 presets), the "light physics" block in `tools/three-sandbox.html` (the solver, the scene
builders, the drawing, the Worker), both hub files in the lazy `lab` group. Small hooks: `tools/three.js` (4 lines:
layer menu, preview menu, the info message, the layer's kind for the director), `mcp/hearth-map.js` (help topic +
aliases), `mcp/three-mcp.js` (" · physics {op}"), `lazy-data.js`, `dev/run-checks.js` (lab group + unit list).

## The engine: why written here, not a library
The candidates were cannon-es (~150 KB min, rigid only: no cloth / soft / water), Rapier (WASM, ~1.5 MB, rigid +
some joints), Oimo (rigid only) and Ammo (Bullet, ~2 MB WASM, soft bodies but heavy). None covers rigid + cloth +
ropes + soft + water in one, and every one needs a CDN download with an offline copy. So the solver is a compact
**position-based one (XPBD with substeps) written for this** — the solver is ~64 KB of plain JS inside the preview page (the whole block with the scenes, the drawing and the Worker ≈ 110 KB), nothing
downloaded, works offline, and the same code runs in the page, its Worker and Node (`dev/physics-test.js`):
- one particle system for everything: **rigid bodies** are clusters of particles held by shape matching (Müller's
  rotation extraction, warm-started) with oriented-box contacts (boxes, letters, dominoes, model hulls); **balls** are
  single particles; **jelly** is shape matching with a give; **cloth / ropes / ragdolls** are distance constraints
  (ragdolls: knees / elbows can't fold flat); **water** is position-based fluids (one-sided density, a little XSPH
  viscosity);
- position-based friction (static / kinetic), restitution on approaching contacts, sleeping bodies woken by touch,
  kicks or drops (a body woken mid-substep moves at once, so a Newton's cradle passes the swing along);
- a spatial hash and per-step candidate lists (pairs, water neighbours) + cached box frames, sweep-and-prune for
  balls and boxes;
- Float64 state, a fixed order and hashed randomness: **the same steps give bit-identical numbers**; a snapshot
  restores exactly.

## Measured
Headless here (1–2 shared CPUs; SwiftShader, so the GPU is the CPU too): absolute numbers are far below a real Mac.

| | number |
|---|---|
| Solver cost per 60 Hz step (Node, the scene builders at 12 bodies, 8 substeps, kicked every half second) | balls 0.2 ms · dominoes 1 ms · pyramid 0.7–1.2 ms · cloth 1–2.4 ms · jelly 0.7–1.5 ms · ropes 0.3–1.8 ms · ragdolls 1–2.2 ms · tower (30 planks, kicked awake) 5–7 ms · water (450 drops, 4 substeps) 4 ms |
| A box stack / tower at rest | asleep after ≈ 1 s: no work at all until something touches it |
| The page's own time per frame, water scene (dam break), solver on the page → in the Worker | **9.4 → 3.0 ms** (the page only draws) |
| The Lab preview's frame rate in the check's health probe, before → after the Worker | 36 → 60 Hz |
| Same exported frame twice (export page, 320×180) | mean pixel difference **0**; another time is another picture |
| Scrub 3 s → 1.2 s → 3 s → 4.5 s → 3 s (dominoes) | back to step 72 from the cached state at 60, the same state at 3 s every time (bit-identical) |
| A cached state | 14 KB for 36 bodies; every half second, at most ≈ 48 MB (then every other one goes) |
| Pendulum period vs 2π√(L/g) | 2.461 s vs 2.457 s (0.2 %) |
| Newton's cradle | the last ball leaves at 2.47 m/s while the first stops (0.04 m/s), then it swings back |

## Upgrades

### The layer and the solver (in the preview page)
1. **⚛ Physics layers**: `physics(P, opts)` in a layer's code makes it a physics scene (its own renderer, soft shadows, a floor).
2. **A solver written for Hearth** (position-based, substepped): rigid, soft, cloth, ropes and water in one, ~64 KB, nothing to download, works offline.
3. **Rigid boxes** that stack, slide with friction and topple (shape-matched corners, oriented-box contacts).
4. **Balls** that bounce (Bounce slider) and turn as they roll.
5. **Letters as rigid blocks** with their glyph on both faces, in any font (`/physics text <words>`, several lines with `\n`).
6. **Model hulls**: copies of a 🧊 model layer's model tumbling in, its box as the hull (`/physics model`); built again when the model arrives or is replaced.
7. **Ragdolls-lite**: 15 joints, a rigid torso, knees and elbows that bend but don't fold flat.
8. **Cloth**: flags, curtains, sheets, trampolines; pinned points; wind pushes each triangle along its normal; gusts.
9. **Ropes and chains** with weights, strings for pendulums and the cradle, bead strings.
10. **Jelly blobs** (soft shape matching, the Stiffness slider), drawn as a smooth subdivided surface.
11. **Water** (position-based fluids) in a tank: dam breaks, sloshing.
12. Static colliders: the floor, an arena's walls, a ceiling, fixed boxes and balls (stairs, pegs, poles, rails).
13. Joints: fixed pivots and strings between any two bodies' points.
14. **Pins that let go on the drop** (a curtain falls off its rail).
15. Bodies that **appear on time** (ball rain, cube rain) or on the n-th kick.
16. **Your own bodies** in any scene (`opts.bodies`: box, ball, blob, cloth, rope, ragdoll, water, with place, size, color, fixed, pin…).
17. **Deterministic fixed steps** (60 a second of the scene's clock, seeded): the same frame renders the same pixels (checked).
18. **Scrubbing back re-simulates** from the nearest cached state (every half second) to exactly the same state (checked).
19. A motion slider changed: the cached states after now are dropped (no stale replays).
20. Nothing loaded (the free clock): the scene starts when the layer runs and slows down rather than stutter when a frame can't keep up.
21. **Smooth at any refresh rate**: drawn between the last two steps (120 / 240 Hz screens don't judder).
22. **Sleeping bodies**: at rest they cost nothing; touched, kicked or blasted, they wake.
23. **The solver runs in a Worker** for the preview: the page only draws (water: 9.4 → 3.0 ms of the page's time per frame).
24. Renders, exports and screenshots step on the page, exactly, with the same runner as the Worker (same numbers).
25. **Instanced drawing**: boxes, balls, rope pieces, ragdoll joints and bones, beads and water drops are one draw each.
26. Detail adapts to the count (hundreds of Plinko pegs: lower-poly balls; many beads: lower-poly beads).
27. Per-step candidate lists and cached box frames: steps 2–3× faster than the first version.
28. **Floor**: shadows only (the layers below show through), solid, or none; its color.
29. Three palette colors (live), metal and roughness.
30. Camera sliders: distance, height, angle, orbit, look-at height.

### Music (all sliders: Save, Shuffle, keyframes, ♪ react-to, MIDI work on them)
31. **Kick impulse**: a push on every kick (your kick markers, a sequence scene's own hits, the song's beats, the live input's kick, a 120 BPM grid with nothing loaded).
32. Kick does **jump** (up).
33. Kick does **push** (sideways: pendulums, chains, water).
34. Kick does **blast** (out from the middle).
35. Kick does **spin**.
36. Kick does **gust** (a gust of wind for cloth, ropes, balloons).
37. Only the first / last body takes the kick (Newton's cradle, the wrecking ball: `opts.kickOnly`).
38. **Bass lightens gravity**.
39. **Bass blows wind**.
40. **Explode on the drop**: a blast at the song's detected drops (or the scene's `dropAt` seconds without a song); pinned cloth lets go.
41. Kicks and drops land on their exact step (from their time, not the frame's), so a render matches the preview.
42. `/physics react`: kick + bass + drop in one go (cloth: gusts and bass wind); the music presets have it already.

### Chat, menus, directors
43. `/physics` (alias `/phys`): the preset picker (one searchable list; Enter adds, Shift+Enter replaces the selected physics layer).
44. `/physics <preset>`.
45. `/physics list [word]`.
46. `/physics text <words>` (falling letters).
47. `/physics model [layer]` (copies of the 🧊 model).
48. `/physics set <slider | option> <value>`: written into the code (undoable, the time machine sees it); a missing slider is added; options too (build, text, dropAt, kickOnly, seed, walls…).
49. `/physics add <box | ball | blob | cloth | rope | ragdoll | water>`: a body of your own in the scene.
50. `/physics kick`: a kick now.
51. `/physics drop`: the drop now (the blast, pins let go).
52. `/physics reset`: the scene from its start.
53. `/physics react`.
54. `/physics info`: bodies, what's drawn, sim time, awake / asleep, cached states, catching up.
55. `/physics help`.
56. Right-click a ⚛ layer › ⚛ Physics ›: Kick now, Drop now, Start again, Add a body ›, Kick does ›, ♪ React to the music, Replace with a preset…
57. Right-click the preview › ⚛ Physics ›: New physics layer…, Falling letters…, Bouncing balls on beat, Cloth in the wind, Model rain.
58. Ctrl/⌘+K "Lab: ⚛ Light physics (presets)…".
59. Ctrl/⌘+K "Lab: ⚛ Falling letters…".
60. The FX picker's "Physics" category and `/template physics-<id>` (27 templates; `three_add_layer { template }` too).
61. `three_do physics { op }` for Claude and Astra: list, add, set, body, poke (kick / drop / reset), react, info, help (per-chat scenes like the other Lab tools).
62. `three_do help physics` (also cloth, rope, ragdoll, rigid, softbody, fluid, domino, gravity, jelly…): the whole API in one on-demand topic.
63. The scene's layer list marks ⚛ layers as `physics (three_do physics)`.
64. `window.__labPhysics` in the preview (info, probe, bodies, poke, drive the music, hold the clock, builds) for three_eval and checks.

### Presets (27; `/physics <id>`)
65. Bouncing balls on beat (`bounce`): balls in a box that jump on every kick.
66. Letters jumping on the beat (`jumpletters`): a word of blocks hopping on the kicks.
67. Tower that topples on the drop (`tower`): a crossed plank tower blown apart at the drop.
68. Box pyramid that blows up on the drop (`pyramid`).
69. Zero gravity (`zerog`): boxes and balls floating in a room, pushed out on each kick.
70. Water tank sloshing on kicks (`slosh`).
71. Trampoline (`trampoline`): balls bouncing on a stretched cloth, launched on kicks.
72. Falling letters (`letters`): a word dropping block by block and piling up.
73. Domino run (`dominoes`): a snaking line, the first one tipped.
74. Newton's cradle (`cradle`): five steel balls on V strings.
75. Wrecking ball (`wrecking`): a heavy ball swinging into a wall of boxes.
76. Cube rain (`cuberain`).
77. Model rain (`models`): your 🧊 model, copied and tumbling in.
78. Jelly blobs (`blobs`): wobbly blobs dropping into a pile.
79. Jelly pyramid (`jellystack`).
80. Balloons on strings (`balloons`): tied to the floor, swaying in gusts.
81. Flag in the wind (`flag`).
82. Curtain that falls on the drop (`curtain`).
83. Cloth over a ball (`drape`).
84. Pendulum wave (`pendulums`): periods 60 / (20 + k) s, falling in and out of step.
85. Hanging chains (`chains`).
86. Bead curtain (`beads`).
87. Ball rain (`rain`): a box filling up.
88. Plinko (`plinko`): balls bouncing down through pegs into bins.
89. Ragdolls down the stairs (`ragdolls`).
90. Dam break (`dambreak`): water let go in a tank.
91. Empty (`sandbox`): a floor and two bodies, for `/physics add`.

Only the "Music" presets react to the music when added (the owner's rule: not every scene is reactive at first);
`/physics react` adds it to the others.

## How it was tested
- `node dev/physics-test.js` (new, in the unit group; 20 checks): a ball falls and bounces (and with bounce 0 stays
  down); a 6-box stack stands at 2.745 m (2.75 exact) and sleeps; 16 dominoes all topple; a kick makes resting balls
  jump (and "push" pushes sideways); a flag hangs in calm air and flies out in the wind; a pendulum keeps its period
  (0.2 %); Newton's cradle passes the swing and comes back; a dam breaks and nothing leaks; the same steps twice are
  bit-identical; a snapshot restores exactly; bodies appear on time; curtain pins let go on the drop; all 27 scene
  builders run 2 s without blowing up (cost per step printed); kicks land on their markers / the grid, drops on time;
  going back restores the cached state before and re-steps to the same numbers; a world handed to the worker as data
  steps identically; `three_do help physics` and its aliases.
- `dev/checks/physics.js` (new, in the lab group; 13 steps): all 27 presets run as ⚛ layers (step, draw, no
  errors); balls fall and pile without passing through each other; with the clock held, a kick wakes 16 sleeping
  balls (max speed 0 → 4 m/s); a flag moves with the wind; scrubbing 3 → 1.2 → 3 → 4.5 → 3 s gives the same state;
  the Worker on vs off (page time); three_do physics list / add / body / info / poke; `/physics list`; the same
  exported frame twice is the same picture, another time another.
- `sh dev/run-checks.sh physics labgpu smooth-lab qa-commands`: 4/4 pass. `node dev/director-mcp-test.js`: all
  pass (lean list 1,690 ≤ 1,700). `node --check` on every touched JS file; the sandbox's module scripts syntax-checked
  as modules; `node dev/lazy-manifest.js` regenerated (its compare is clean).

## Not done / risks
- Measured only headless on a slow shared CPU and SwiftShader; real-Mac speeds aren't measured. Heavy scenes (the
  30-plank tower while it falls, water) cost 4–10 ms a step here: in the preview they're in the Worker, but a long
  render of them takes that per frame.
- Contacts between boxes are corner-against-box (no edge-to-edge test): two boxes crossing edge on edge can sink a
  little. Model hulls are boxes, not convex hulls.
- Water is drawn as overlapping drops, not a smooth surface (fluids-lite).
- Kicks on a timeline come from markers / beats; "live" kicks and pokes (kick / drop now) are live only: they aren't
  on the timeline, so a render doesn't repeat them. Bass is read per frame (exact in renders of the same frame, not
  re-read when re-simulating).
- Keyframed motion sliders re-simulate with the slider's value now (cached states before the change stay).
- The free clock (nothing loaded) can't be scrubbed (there's no timeline to scrub); it restarts when the layer runs.

Count: 91 upgrades.
