# ◉ Looks for 3D things (round 50, labmaterials)

Click a 3D thing in the Lab preview and give it a look in one click: chrome, glass, gold, velvet, neon… It works on a
whole three.js layer, on one object of it, and on 🧊 models. Nothing new sits on screen until you pick something.
Nothing goes in any prompt (0 tokens) and nothing is downloaded.

## What it does
1. **◉ Look ›** on the outline of a picked 3D thing (next to ✥ 3D): opens the picker on the object you clicked.
2. **◉ Look ›** in the scene editor's selection (the 3D gizmo), for the selected object.
3. **Right-click the preview › ✨ Look & motion › ◉ Material**: "◉ Pick a look…" (the picker on the selected layer), then
   each look by name in one click, and Original.
4. **The picker**: 16 balls, drawn once by the preview and kept: Chrome, Brushed metal, Gold, Mirror, Glass, Frosted
   glass, Glossy plastic, Ceramic, Matte clay, Rubber, Velvet, Holographic (iridescent), Neon (glows), Toon, Wireframe, X-ray.
5. **Point at a ball to try it** on the thing itself (live in the preview, not saved); point away and it's back.
6. **Click a ball to use it.**
7. **This part / Whole layer** switch when you opened it on one object.
8. **Color** row: the scene's palette, "its own color", and any color.
9. **Shine** slider (roughness; neon: how much it glows; wireframe / x-ray: how see-through). Dragging tries, letting go uses.
10. **Original** takes the look off.
11. **One Ctrl/⌘+Z per change**, in the same undo as the picture's moves (a toast's Undo from the menu rows too).
12. **Models**: the whole model (not its ground or shadow), or one part of it.
13. **Metal and glass get light to reflect**: a small built-in studio light is added when the scene has none (made in
    the preview, no file); taken away again when no look needs it.
14. **Kept with the scene**: saved with the layer (like the 3D gizmo's placements), so switching scenes, 📐 templates,
    packs, the time machine and renders keep it. The Lab sequence and its renders now also get the 3D gizmo's
    placements (they were missing there).
15. **📜 Recipes** record a look as a step and replay it.
16. **Lab search**: "material", "chrome", "glass", "gold"… find the ◉ Material rows; a help answer "How do I make a 3D
    thing chrome, glass, gold or plastic?".
17. **Ctrl/⌘+K**: "Lab: ◉ Material look for 3D…".
18. **Chats**: `/material chrome`, `/material frosted glass #88ccff shine 40`, `/material off`, `/material list`,
    `/material undo`; `/material` alone opens the picker.
19. **Directors (Claude and Astra)**: `three_do material` (list · set {layer, preset, color, shine, part} · off · info);
    the scene outline shows each layer's "materials". The lean tool list didn't grow: the words come with
    `help material` (app map topic `material`).
20. **Full-frame 3D layers** now show ✥ 3D and ◉ Look › inside the bottom of the outline (they were cut off above the frame).

## Light and smooth
- Nothing runs for layers without a look. With one, the preview hands the material back each frame only if the code
  put its own back, and looks for new meshes every 30 frames.
- Each look's material is made once per layer and freed when nothing uses it.
- The balls are drawn one at a time on the preview's one shared small renderer (shaders compiled off the frame where
  the GPU allows), the preview drawing in between; one picture per color, kept for the session. The picker runs
  nothing while closed.

## Tests
- `node dev/labmaterials-test.js` (UNIT): presets, words, clean specs, what each preset makes, reflections, plain words,
  the recipe step, the preview's lib.
- `sh dev/run-checks.sh labmaterials` (dev/checks/labmaterials.js, also in `lab:`): real clicks pick the ball and open
  the picker from the outline; balls drawn and different; pointing tries without saving; click uses (pixels: chrome
  grey, gold yellow); one undo each, a real Ctrl+Z; one part vs whole layer; /material with color and shine; the
  render (export page) matches the preview; saved after switching scenes; a model's whole glows and undoes;
  three_do material; the directors' outline; Lab search; nothing tried and no per-frame work with the picker closed.
- Here the GPU is SwiftShader (CPU): the 16 balls take ≈ 24 s the first time and a new look's first frame takes seconds;
  on a real GPU both are short.

## Files
New: `tools/three-materials-core.js` (MatCore / the preview's matcore), `tools/three-materials.js` + `.css` (lazy group
`labmaterials`), `tools/three-materials-hook.js` (lab group), `dev/labmaterials-test.js`, `dev/checks/labmaterials.js`.
Small hooks: `tools/three-sandbox.html` ("Looks" block, render hook line, layer-props refresh, export wait, ◉ Look ›
chip), `tools/three.js` (attach, message line, menu row, scene editor button, outline, lib file), `tools/three-direct.js`
(`push` for other undo steps, `look` op), `tools/three-seq.js` (overrides in the sequence), `tools/three-recipes*.js`
(`mat` step), `tools/three-search-core.js` (help answer), `mcp/three-mcp.js` (`material` cmd + help line),
`mcp/hearth-map.js` (topic), `deploymain.js` (lib inlined), `lazy-data.js`, `index.html` (lazy-at tag), `dev/run-checks.js`.

## For the patch notes
- ◉ 3D things get a look in one click: pick something 3D on the Lab preview, then ◉ Look › on its outline.
- 16 looks as little balls: chrome, brushed metal, gold, mirror, glass, frosted glass, plastic, ceramic, clay, rubber,
  velvet, holographic, neon, toon, wireframe, x-ray. Point at one to try it on your scene, click to keep it.
- Pick a color from your scene's palette and set the Shine; Original takes it off; each change is one Ctrl/⌘+Z.
- Works on one part, a whole 3D layer, or a whole 🧊 model.
- Metal and glass get a soft studio light to reflect when the scene has none (built in, nothing downloaded).
- Looks are saved with the scene; renders, templates and recipes keep them.
- Also in right-click › ✨ Look & motion › ◉ Material, Lab search ("chrome", "glass"), Ctrl/⌘+K and `/material`; the
  directors can do it too.
- Caveat: the first time the picker opens it draws its balls (a moment on a fast computer).
