# Round 176: everything that makes a scene knows the WebGPU format; the 🔊 volume button is back

Branch `claude/smooth176`. Two parts: `gpuaware176` (Scenes v2 awareness) and the playback volume.

## For the owner
1. **A layer you add to a new (WebGPU) scene is a WebGPU layer.** ＋ Layer in a v2 scene leads with "⚡ Fast layers"
   (Backdrop, Glow knot, Particle field, Cube); the old templates sit below, marked heavier. Before, every added layer
   was old-format code with its own canvas, even in a v2 scene.
2. **The AIs are told the format every time.** A v2 scene's results say `format: "v2"` (they only said it once, on a
   new scene). The directors' standing instructions now lead with the v2 way of writing a layer; the old way is kept
   for old scenes. Crew helpers working on a v2 scene are told too.
3. **A v2 scene stays v2** through: delete → restore, History, "restore as a new scene" (jams), packs, My templates,
   "start a new scene from this", crew variations you keep, a group turned into its own scene.
4. **A new project's scene has the format of what's in it.** A project started from Visualizer / Particles / Shader /
   a template got a scene flagged v2 but filled with old layers (the AI was told "v2" about code that wasn't).
5. **🔊 is back on the left rail**, above ⚙: one volume for everything Hearth plays on this computer (75 % to start,
   slider, Mute). Scenes follow it; recordings and renders don't.
6. `/sketch new v2` (or `v2 music`) makes a v2 scene by name.
7. **Tests on this PC are silent** (`silent176`). A check's throwaway copy of Hearth keeps its windows far off the
   screen, out of the taskbar, muted, and never takes the keyboard; it still draws at full speed there.
   `SMOKE_SHOW=1` shows them, to watch a run.

## Why scenes get heavy and Clink doesn't (measured from the owner's data, read only)
- 48 of the 51 scenes are still the old format: every layer is its own full-window WebGL canvas, most with
  antialias at up to 2× pixels (Visualizer2: 17 of them, always on).
- Clink (the scene "Clinky", 58 layers) is light by how it is written: 19 layers have no canvas at all (logic only),
  the cards make theirs only while shown (≈ 13 live), and each drawing layer is one flat picture at 1× pixels without
  antialias. ▶ Play then runs it in its own window and process, with Hearth kept quiet.
- Not done here (next): fewer passes per v2 layer (each plain layer still stores and resolves a 4× MSAA target), a
  kit of fast v2 pieces (visualizers, particles, camera tracking readers), the separate Lab player (retired on Nov 9:
  scenes drew black, never diagnosed).

## For the lead (technical)
- `tools/three-data.js`: `V2_EMPTY_CODE`, `v2Layer(id)` ("v2-knot" or "knot"), `formatOf(layers, was)` (was `'gpu'`, or
  any v2 layer → `'gpu'`).
- `tools/three.js`: `addLayer` (v2 scene: v2 layer by id; none / `empty` / unknown → the cube; a named old template is
  added as asked), the empty layer, `capture()` + `restore()` carry `format`, the trash and `undelete`, cmd `newSketch`
  / `templates`, `getCode()` / `layers()` say `format: 'v2'`; the layers panel gets `v2()`.
- `tools/three-layers.js` ＋ menu; `tools/three-lab-dialogs.js` trash / History restore; `tools/three-director.js`
  `compact()` keeps `format`; `tools/three-backstage.js` report, `addLayer`, empty layer.
- Format kept: `tools/three-packs.js`, `three-templates.js`, `three-groups.js`, `three-crew.js` (base, helper sketch,
  keep, the brief line), `mywork.js` (`startScene`, `into`), `projcreate.js` (`prepare`, `fromProjTemplate`).
- `mcp/three-guide.js`: CORE's SKETCH line leads with v2 (the separate V2 line is merged into it); the v2 topic names
  the v2 templates and has a SMOOTH paragraph. `engines.js`: the crew prompt's v2 sentence.
- Volume: `volumemain.js`, `volume-preload.js` back from before round 116 (unchanged), their lines in `main.js`,
  `preload.js`, `renderer.js`, `tools/three-sandbox.html`, `deploymain.js`, `voicemain.js`; `dev/slim116-test.js` no
  longer lists them as removed. The Sound desk's part (VST gain) is not back.
- Silent tests (Windows only, where there is no xvfb): `dev/smoke.js` starts the copy with `-r dev/smoke-silent.js`
  (windows parked at −30000, `show` → `showInactive`, `focus` / `moveTop` / fullscreen / maximize held back) and with
  `--mute-audio` plus the flags that stop Chromium saving work on a window nobody sees. A child Electron app (the Lab
  player) is not covered.
- Not changed: the first scene of an empty Hearth is still the old "Basic scene" (many checks start from it);
  Describe it, Blocks, Nodes, motion / particles / type generators still write old-format layers.

## Checks
- New: `dev/checks/gpuaware176.js` (13 steps, with `SMOKE_GPU_FLAGS="--ignore-gpu-blocklist"`), `dev/checks/playback-volume.js`
  (back, with Windows paths), `dev/checks/silent176.js` (window off screen, 482 frames in 2 s, timers not slowed).
  All three pass on Windows.
- Pass: scenesv2, scenesv2-lists, scenesv2-newchat, layerdelete116, starters134, crew; unit: slim116, boot-test,
  tokens-test, astraparity116, selfmap118, labtemplates, packs.
- Fail the same on main (Windows, not this round): `scenes` ("The director hasn't changed any code yet"),
  `projcreate128` (`/tmp/hearth-board-fixtures` path), promptdiet's "Three Director (full)" (8630 on main; 8798 here
  with the SMOOTH paragraph; budget 7940).
