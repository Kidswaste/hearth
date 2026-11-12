# fastkit: ready fast layers for v2 scenes (Nov 10)

Quentin's ask: premade, really optimised code for custom visualizers, tracking and the other expensive things, so
scenes stay smooth. Until now a v2 scene (docs/upgrades/scenes-v2-webgpu.md) had four starter layers; every other
prebuilt piece (`visualizer()`, `particles()`, the FX filters, `webcam.layer()`) is old-format and makes its own
`WebGLRenderer`. This adds five v2 layers written the cheap way, where the owner and the AIs find them, and the rules
they follow as an on-demand guide topic. Old scenes are untouched.

## The kit (tools/three-data.js, `V2_LAYERS` with `fast: true`)

Each is ONE draw call on the scene's one renderer however high its count goes, has 11–12 plain sliders in groups, and
makes nothing inside `onFrame` (typed arrays, vectors and colours are made once and refilled).

| id | what | how it stays cheap |
| --- | --- | --- |
| `v2-spectrum` | the song as bars, a ring or a waveform (slider Style), 8–512 pieces | one instanced quad; the levels (`audio.spectrum` / `audio.waveform`, note-spaced, smoothed) go up once a frame as a 512 × 1 data texture; the three styles are one shader, the slider only mixes them, so nothing is rebuilt |
| `v2-swarm` | 150,000 particles (10 k – 1 M) that swirl, burst on the kick | the simulation is a TSL compute shader (`instancedArray` + `Fn().compute(N)`): position + life and velocity live on the graphics card; drawn as one instanced quad that faces the camera |
| `v2-glow` | glowing orbs, rings or stars (1–2,000) | the bloom look is in each shape's own shader (a bright core + a soft halo, added): no bloom pass, no composer, no render target |
| `v2-tracking` | markers with trails that follow hands, body, face or movement from Camera in | the points are read from `webcam.feat` once a frame into one uniform array (8 points × 32 trail steps, made once); only the picked set is read, so only that tracker runs; it moves by itself while the camera is off |
| `v2-footage` | a picture or clip from References, the song's video or the camera behind everything | the picture is the scene's background (`scene.backgroundNode`): one texture read per pixel, fill / fit and the grade (brightness, contrast, colour, tint, edges) in the same shader; a video uploads only its new frames |

Also a whole scene: **Fast visualizer (v2)** in the New menu and the gallery (backdrop + swarm + glow + spectrum).

## Where they are

- **＋ Layer** in a v2 scene: the effects picker lists them first (category "Fast (v2)"), and the plain list
  (Alt+click) opens with "⚡ Fast layers", the old-format ones under "Old-format layers (a canvas each: heavier)". An old
  scene's lists are as before (tools/three-layers.js `panel({ v2 })`, tools/three-fx.js `items`).
- **The AIs**: `three_add_layer { template: "v2-spectrum" }` (tools/three.js `addLayer`, tools/three-backstage.js; by id
  through `ThreeData.v2Layer`). In an old-format scene it is refused with the reason (a v2 layer does nothing there).
- **The guide** (mcp/three-guide.js): `three_do help fast` (also: kit, visualizer, spectrum, compute, bloom, swarm,
  performance) lists the five and the rules: one draw per effect, data once a frame, nothing made in onFrame, motion
  on the GPU (compute stepped from the layer's own draw, since a layer gets no renderer), glow without a pass, which
  counts are read live, pictures / video / camera as textures. On demand only (not in the full guide, as "help
  camera"). The core's v2 line now ends "…read three_do help v2 first; ready fast layers: help fast." and the v2 topic
  points at it: lean prompt 2096 → 2098 tokens (budget 2100), tokens-test 2181 → 2183 (budget 2190).

## Two things found in the runtime on the way (tools/three-sandbox.html, "Scenes v2")

1. **A scene switch could silently drop a layer.** three.js gives every `THREE.Sprite` the same geometry; letting go
   of a v2 layer disposed it, which destroyed the buffers the next scene's sprites were already drawing with. WebGPU
   then refuses that layer's whole pass ("Buffer used in submit while destroyed"), its clear included: the layer is
   missing, or the layers above it smear, until the next re-run, and nothing is said. The existing Particle field
   layer is a sprite too, so it was open to the same thing (switching between two scenes that have one). `g2Unmount` no longer disposes a sprite's geometry.
2. **Refused draws are now counted and said.** The one renderer listens for the graphics card's `uncapturederror`:
   `__labG2.state().gpuErrors` / `gpuError` for the checks, one console line for the owner / the AI.

Also: a layer's compute passes are timed in their own pool, now read with the render one (it would fill up otherwise)
and counted in the frame's GPU time.

## Check

`dev/checks/fastkit.js` (real GPU: `SMOKE_GPU_FLAGS="--ignore-gpu-blocklist"`), 38 steps, all pass: each piece alone
in a v2 scene at 1920 × 1080, Max fps, Force high: on the one renderer (0 WebGL contexts), no error, no refused draw, a
picture, one draw of its own, the same after its count slider goes up; nothing made inside `onFrame` (read from the
code); the footage backdrop shows a camera picture handed to the page and the tracking marker sits where the tracker
says; the five together; switching between the v2 templates; the ＋ Layer list, the picker and `three_add_layer` in a
v2 scene, and the refusal in an old one. `dev/promptdiet-test.js` holds the topic and the kit together (every fast
layer named by id, 6–12 sliders, in no prompt).

### Frame times (`__labG2.bench`, 1920 × 1080, RTX 4080, median of 5 × 120 frames back to back)

Quentin's own Hearth and two other test runs shared the GPU, so runs differ up to 3× (earlier runs the same day read 0.5–1 ms a piece); two runs of the final code:

| piece | draws of its own | ms a frame | count up | ms a frame |
| --- | --- | --- | --- | --- |
| spectrum, 96 bars | 1 | 1.24 / 2.22 | 512 bars | 1.51 / 1.86 |
| swarm, 150,000 (simulation included) | 1 | 2.24 / 2.42 | 600,000 | 3.28 / 3.63 |
| glow, 60 lights | 1 | 1.21 / 1.31 | 2,000 lights | 3.73 / 4.33 |
| tracking, 8 points × 32 | 1 | 1.33 / 1.64 | trail 32 | 1.38 / 1.76 |
| footage backdrop | 1 | 1.23 / 1.64 | | |
| all five | 5 (+ the frame's merge and copy) | 2.97 / 6.96 | | |

The bench frame of one layer is two draws: the layer's and three.js's copy of its screen buffer to the canvas. The
only count that costs is glow's at 2,000: 2,000 large see-through quads over each other (pixels, not draw calls); its
default is 60.

## Open

- `three_add_layer`'s `template` lists the old templates only (mcp/three-mcp.js `TEMPLATES`, an enum): the five ids are
  accepted by the Lab and named by `help fast`, but not in the tool's own list (≈ 20 tokens a message; lean has 2 left).
- The swarm is a simulation: it runs forward from where it is, so the same time twice is not the same picture
  (renders play it in order; seeking does not rewind it). The other four are pure functions of time and the song.
- A still asked for between frames draws the scene again, which steps the swarm once more (invisible at one step).
- The tracking layer was checked with a camera picture and the tracker's resting values, not with MediaPipe running
  (dev/checks/motion-in.js covers the tracker itself).
- `dev/checks/scenesv2-render.js` is unsteady on this machine, before this work too: on a clean copy of HEAD it failed 2
  runs of 3 ("the same time twice gives (nearly) the same pixels", mad 4–5.5 against a limit under 1), here 3 of 3 on
  one of its two still steps. Not looked into.
- Not touched: `dev/promptdiet-test.js`'s "Three Director (full)" case was already over its budget before this work
  (8630 > 7940, since the v2 topic); it reads 8640 now (the v2 topic's pointer to help fast).
