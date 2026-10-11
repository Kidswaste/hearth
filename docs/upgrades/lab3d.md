# 3D models in the Lab (round 15, lab3d): a model library, materials, clips, lights, skies and camera moves, all from chat

A 3D model from Meshy, Sketchfab, Mixamo, Poly Haven, a Spline / Blender export or any file is now a first-class
🧊 layer in the Three.js Lab: it arrives with a loading bar, fitted to the frame and standing on a shadow, and every knob
(material, clip, camera, light, ground, sky, fog, bloom…) is one of its sliders, so Save, Shuffle, looks and keyframes
work on it. Nothing new on screen: everything is in **right-click the preview → 🧊 3D model**, a small floating **model
library**, `/model <verb>` (or `/3d`) and `three_do model` for Claude and Astra.

## The model library
1. **🧊 Model library** (`/model library`, `/3d`, right-click the preview → 🧊 3D model → Model library…, Ctrl+K "Lab: 3D model library"): a small floating panel of every model and sky you used, downloaded or generated.
2. **Pictures of each model alone**: the Lab takes a little picture of the model the first time it draws (no other layers in it); Meshy's own pictures are used for Meshy models.
3. **Everything in one place**: your models, Meshy's library, and the open sketch's model / sky references, newest first.
4. **Click a card** to add it to the Lab.
5. **Drag a card onto the preview** to add it there.
6. **Shift+drag onto the preview replaces the model** of the selected model layer.
7. **Right-click a card**: Add, ⇄ Replace the model, 🕺 Use its animations on the model, Show the file, Rename…, Remove from the library (the file stays).
8. **Filter box** (type a name, "sky", "Meshy"…).
9. **＋** adds model files (GLB, glTF, FBX, OBJ, STL, PLY) or skies (HDR, EXR), several at once.
10. **⋯** leads to free Poly Haven skies, Meshy, Sketchfab, Mixamo and Spline.
11. **Numbers**: `/model add #2` adds the second card; `last` is the newest model.
12. **Esc** or × closes it.

## Adding and replacing
13. `/model add <file | #n | name | last>`: a new 🧊 layer.
14. **Drop a .glb / .gltf / .fbx / .obj / .stl / .ply on the preview**: a model layer (Shift: replace the model).
15. **Drop a .hdr / .exr on the preview**: it lights the model (and shows behind it).
16. **Alt+drop an FBX** while a model is there: it joins the model's animation clips (Mixamo).
17. **FBX, OBJ, STL and PLY become model layers too** (before, only GLB did; the others were references only).
18. **Meshy, Tripo, Sketchfab, Spline and other app downloads** arrive as these new model layers.
19. `/model replace <file | #n>`: **swap the model in place**: same layer, sliders, keyframes, sky and placement.
20. **Clip names read from the file** before it loads (GLB / glTF), so the Clip slider is a list of names.
21. **Big files**: a note while they are copied into the Lab; a **loading bar on the preview** while they load.
22. **Clear errors for bad files**: "it is a web page, not a model (download the .glb file itself)", "this .gltf points to .bin / texture files", "it is a .zip: unzip it", "Draco-compressed and the decoder could not load", "not a 3D model the Lab reads (Spline / Blender: export as GLB)"; shown on the preview, as a note, and in the Lab's errors so the director sees it.
23. **Files are recognised by their bytes**, not their name (a renamed FBX or a GLB without extension still loads).
24. **Draco, Meshopt and KTX2 compressed GLBs** load.
25. **One parse per file**: re-running the layer (a slider saved, an edit) doesn't read the model again.

## Per model
26. **Auto-fit**: centred, the biggest side fitted, standing on the ground, the camera framing it in any frame size.
27. `/model fit` (right-click → ⌖ Fit to the frame): size, place, turn and camera back to the framed view.
28. **Transform gizmo**: `/model gizmo [move|rotate|scale]` (right-click → ✥ Move / rotate / scale) opens the scene editor on the model: W move, E rotate, R scale, Q world / local, F focus; the placement is kept outside the code.
29. **Model sliders**: Size, Height, Left / right, Near / far, Turn, Tilt.
30. **Turntable** slider (turns per 10 s; a slow turn by default): `/model turntable [speed | off]`, `/model still`.
31. **Explode view** (each part slides out from the middle): `/model explode [amount | off]`.
32. **Float** slider (a gentle bob).
33. **Faces the camera** switch.
34. **Look-at camera** ("Looks at the model", on by default; off: the camera looks straight ahead): `/model look-at off`, plus "Aim higher / lower".
35. **Detail** slider: lower simplifies the static meshes (a few at a time, never the animated ones); `/model lite [0.4]`.
36. **Heavy models** (over ~1.5 M triangles): shadows off and the preview at 1× by themselves, with a note; right-click → 🪶 Make it lighter.

## Materials
37. **Material** choice: original, chrome, gold, glass, toon, clay, matte black, wireframe, holographic, x-ray, normals, palette (the scene's palette, one color per part): `/model material <name> [#hex]`.
38. **Tint** color (chrome, glass, wireframe, holographic, x-ray take it).
39. **Glow** slider (the parts light up in the tint).
40. **Toon keeps the model's texture**; switching back to original restores every original material.

## Animation clips
41. **Clip** choice (by name), **Play**, **Loop**, **Speed** (backwards too), **Blend** (seconds of cross-fade between clips).
42. `/model clip <name | number | next> [speed 1.5] [once | loop] [blend 1]`, `/model clip stop`.
43. **Mixamo clips**: `/model mixamo <file>` (or the library's "Use its animations on the model") adds the animations of an FBX "without skin" or a GLB to the model's Clip list.
44. **Clips are frame-exact on the scene's clock** (renders and the Lab sequence show the same frame every time).
45. Right-click → 🧊 3D model → **Animation**: every clip, pause, half / normal speed.

## Lighting and world
46. **Light** presets: studio, three-point, rim, neon (slowly orbiting colored lights), golden hour, sunset, moody, flat: `/model light <name>`.
47. **Lights**, **Exposure**, **Reflections** and **Turn the lights** sliders.
48. **HDRI skies from Poly Haven**: `/model sky <words>` (sunset, studio, night…) fetches the best free match and lights the model with it; `/model sky <file>`; `/model sky off`; "light only" keeps the backdrop clear.
49. **The Poly Haven sky picker** (`/polyhaven`, the library's ⋯) now lights the model when there is one (a sky layer of its own otherwise).
50. **Backdrop** choice: clear (the layers below show), the HDRI, or a color; **Sky blur**.
51. **Ground**: none, shadow catcher, mirror (real reflections), floor, gloss floor, grid: `/model ground <name>`.
52. **Fog** and **Fog color**: `/model fog [amount | off]`.
53. **Bloom** and **Depth of field** (focused on the model by itself): `/model bloom`, `/model dof`; the effects only run while one is on.
54. **Studio looks** (several sliders at once): product shot, showroom, neon night, golden hour, noir, hologram, clay render, cinematic: `/model look <name>`.

## Camera moves on the timeline
55. **Camera sliders**: Orbit, Crane, Distance, Lens, Orbit by itself.
56. **Camera moves as keyframes** on those sliders from the playhead, on the scene's own clock: they show as lanes under the layer's track, play in renders and the Lab sequence, and you can drag them like any keyframe.
57. **A 🎥 cue** marks where each move starts on the timeline.
58. Moves: orbit, half orbit, dolly in, dolly out, slow push, crane up, crane down, **hero reveal** (from dark and close, swings round, pulls back), arc in, fly-by, top down, low angle, vertigo (dolly zoom), spin reveal, zoom punch: `/model move <name> [at 2] [for 5 s]`.
59. `/model moves` (right-click → Camera move → Remove the camera moves) clears them.

## Music
60. **Pulse on kick** and **Glow on kick** sliders, at 0 until you want them: `/model react` (`off`, `pulse 1`, `glow 1.5`), right-click → Motion → Pulse and glow on the kick / Calm.

## Smoothness
61. **Everything is let go** when a model layer re-runs or is removed: geometries, textures, materials, the mixer, skies, effects (no GPU memory creeping up while you edit).
62. **The last three models and two skies stay parsed** in the preview, so hot re-runs are instant.
63. **Hidden, frozen or off-time model layers draw nothing** (the Lab's own frame gating), and the effects composer exists only while bloom / depth of field are on.

## Chat and directors
64. `/model <verb>` shares its name with the chat's own `/model` (the engine model): a 3D verb (library, add, material, move…) runs this one, anything else the old one.
65. `/3d <verb>`: the same, its own name.
66. `/model help`, `/model info` (clips, triangles, meshes, size, "heavy").
67. Completions for every verb and its values (materials, lights, grounds, moves, looks, the loaded clips…).
68. Ctrl+K: Lab: 3D model library · Add a 3D model file… · hero reveal · orbit · fit · gizmo · turntable · what is loaded.
69. **Right-click the preview → 🧊 3D model**: Model library, Add a file, Material, Look, Camera move, Animation, Light (+ HDRI, no sky), Ground, Motion (turntable, explode, float, kick), Effects, Move / rotate / scale, Fit, Replace, Make it lighter.
70. **`three_do model { op }`** for Claude and Astra (one line in `three_do`, the details on demand with `help model`): list, add, replace, set, material, look, light, sky, ground, clip, clipfile (Mixamo), move, clearmoves, turntable, explode, fx, react, fit, lite, aim, info; `three_model` in full tool mode.
71. **Calls land in the asking chat's scene** (like every three_ tool); adding files needs that scene on screen and says so.
72. **The app map knows it** (`help model`, also "models", "glb", "mixamo", "turntable"): the layer's call, every slider, the moves, the ops.

## How it was tested
- `sh dev/run-checks.sh lab3d-models` (dev/checks/lab3d-models.js): a tiny animated GLB (two clips) and a sky made in the
  check; `/model add` (loaded in the preview, clips read, one lab3d.model call), material chrome, clip Spin at speed 2,
  neon light + mirror ground, the hologram look (bloom on), `/model sky <file>` (HDRI environment, in the code),
  `/model move hero at 1` (keyframes on orbit / distance / exposure, a 🎥 cue), `three_do model` turntable / explode /
  list / help, the gizmo, the library (the model's own picture, the panel), the preview menu, `/model replace` (same
  layer, keys and sliders kept, no renderer left behind) and a web page saved as .glb (a clear error in the Lab's
  errors, the other model still drawing). Passed.
- `sh dev/run-checks.sh smooth-lab qa-commands`: passed. `node dev/director-mcp-test.js`: passed (full mode: 37 tools).
- Not run here: real Meshy / Sketchfab / Mixamo downloads, Draco / KTX2 decoders (fetched from their CDNs), huge models.

## For the next stream
- Sandbox (tools/three-sandbox.html, block "3D models"): `lab3d.model(url, P, { name, hdri, clips })` → `{ renderer, scene, camera, state, setHdri }`; `lab3d.list()`; posts `{ type: 'lab3d', ev: progress | loaded | error | thumb }`. The model's top group is named `Model` (scene editor path `#Model`).
- `tools/three-models.js` (`ThreeModels`): `add(file, { replace })`, `sky`, `addClip`, `move`, `op(args, ctx)` (the `three_model` handler), `code(refKey, name, opts)`, `KNOBS`, `MOVES`, `LOOKS`, `library()`, `openLibrary()`, `previewItem()`, `attach()`; kv `lab3d-library`. Commands in `tools/three-models-cmds.js`, CSS in `tools/three-models.css`.
- Small edits elsewhere: `tools/three.js` (two hook lines: attach + the preview menu item), `apps-lab.js` (addModel / addHdri hand over to ThreeModels; `legacy: true` keeps the old sky layer), `mcp/three-mcp.js` (`model` in three_do, `three_model` in full mode), `mcp/hearth-map.js` (topic `model` + aliases), `dev/director-mcp-test.js` (full-mode count 37), `index.html` (two scripts, one stylesheet).
