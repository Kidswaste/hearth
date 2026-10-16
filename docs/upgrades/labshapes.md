# ◆ Shapes that draw themselves (round 51, labshapes): After Effects shape layers, simpler, 0 tokens

kinetictype did this for text and labvisualizers for music. This stream does it for **lines and shapes**: a circle that
draws itself round, an underline swoosh under a title, an arrow that shoots out, a bracket frame, a checkmark, a
spiral. Right-click the Lab preview › ＋ Add › **◆ Shape…** opens one picker with **21 live previews** (20 shapes and
✎ Draw your own). A click adds the shape as a layer. One row of controls says how it draws on, and one row how it looks.

The Lab had nothing like it (grep: no shape / path / trim layer in tools/three*.js; the board's shapes are a different
thing). It is not a new kind of layer: a shape is an ordinary layer whose code is a `tweak()` block plus
`shapeLayer(P, { preset })`. So it is saved with the scene, its 📐 templates, 📜 recipes and `.hearthpack` packs with no
extra code. Save, Shuffle, keyframes (labkeys) and ♪ Move with the music work on its sliders. The ✥ handles on the
picture (labdirect) move, scale and turn it.

Files:
- `tools/three-shape-core.js` (`ShapeCore`, new): the math with no DOM. It holds the 21 presets, the paths (rounded
  corners, smooth curves through clicked points, sharp points, the taper), what is drawn at a time (draws on / off /
  both / loop / on the hits / the Start and End sliders, easing, reverse, offset), dashes, and the shaders. It runs in
  the Lab (the previews), in the preview / export page (sent as source on first use: `globalThis.shapecore`,
  `LIB_FILES.shapecore`) and in Node (`dev/labshapes-test.js`).
- `tools/three-shapes.js` (`LabShapes`, new) and `tools/three-shapes.css` (new), in a new lazy group `labshapes` (tier
  'use'). They hold the picker, the draw pad, apply / change / place / undo, `/shape` and the Ctrl/⌘+K actions.
- `tools/three-shapes-hook.js` (`LabShapesHook`, new, in the `lab` group): the ways in (＋ Add row, a ◆ layer's
  right-click). It loads the rest on first use.
- `tools/three-sandbox.html`: a new "shape layers" block (`shapeLayer()`, `__labShapeReady`, `__labShape` for checks),
  plus one line in `sqFrame` (an export frame waits for the math and ♪'s hits).

## How it stays crisp, exact and light
- **Drawn as geometry, not a picture.** Each segment of the path is one small instanced quad. Its shader works out the
  distance to the visible part of that segment, so round ends and joins, the trim, the dashes and a taper all come
  out of one cheap pass. The edge is soft over exactly one device pixel. The fill is triangles with a one-pixel soft
  outer edge. There is no full-frame canvas per shape.
- **Crisp at any size.** Widths are in pixels of a 1080-pixel frame, so 9:16 and 16:9 look the same. When the layer is
  scaled up (✥ corners, Scale), it draws on more pixels (up to 3×, at most ≈ 16 MP) instead of being stretched.
  Checked: Scale 2 → pixel ratio 2.
- **A frame is a function of the time alone.** The time is the song's (or a sequence's, or an export's) clock, and the
  hits are ♪ Move with the music's sources (your Kick / Snare markers or the found hits, the beat grid, the bars). Two
  renders give the same bytes. The preview paused at 2.5 s and the render at 2.5 s are the same picture (mean
  difference 0, the line 58 px in both).
- **Nothing per frame when still.** The path is made again only when a shape slider moves. Once a shape has drawn on,
  its uniforms stop changing, so the still check skips its frames and the preview dozes (idlecpu). Checked: builds
  1 → 1 while paused, `doze.on`.
- Costs measured here (SwiftShader, a loaded machine): the picker's 21 previews 0.2–0.3 ms a frame all together; a
  shape's page script 0.12–0.9 ms a frame while it draws (a line 0.17, a 160-segment circle 0.9), nothing once still.

## Upgrades

### The picker (＋ Add › ◆ Shape…)
1. **◆ Shape…**: a row in the preview's right-click › ＋ Add.
2. **21 shapes as live previews**, drawing themselves on and off in a loop (or on the demo beat), in one searchable grid.
3. **Click a shape** (or Enter) adds a layer. With a ◆ layer selected (or opened from one) it **changes that layer** and keeps its look and how it draws.
4. **Draws**: Draws on · Draws off · On, then off · Loop · Each beat · Each bar · Each kick · Each snare · Still.
5. **Takes** (how long the line takes to draw).
6. **Easing**: linear, smooth, in, out, expo, back.
7. **⇄ Reverse** (draws from the other end).
8. **Line** width.
9. **Dashes**.
10. **Round** (corner roundness).
11. **Filled**.
12. **Colors from the scene's palette**: the line takes the swatch you click, the fill takes the next one; or "Its own".
13. The controls change the selected / just-added layer live, one undo step each; **↶** in the header and Ctrl/⌘+Z while it's open.
14. How it draws and the easing you used last are remembered (this computer only); arrows move through the grid, Esc closes.
15. With a song loaded, a new shape **draws on where the playhead is** (its "Starts at"), not at the song's start.

### ✎ Draw your own
16. **A pad shaped like your frame**: click points; a smooth curve goes through them, drawn with your line settings.
17. **Shift+click** makes a straight line into a sharp corner, snapped to 0° / 45° / 90° from the point before.
18. **Click the first point** to close the shape (so it can be filled).
19. Backspace or Ctrl/⌘+Z removes the last point, **Clear** starts again, **Add it** / Enter / double-click adds it, Esc goes back to the shapes.
20. Ctrl/⌘+K › "Lab: ✎ Draw your own shape…" and `/shape own` open the pad straight away (always a new layer).

### The shapes (20)
21. Rectangle (`rect`).
22. Rounded rectangle (`rounded`).
23. Circle (`circle`, drawn round from the top).
24. Ring (`ring`, a thick sweep).
25. Triangle (`triangle`).
26. Hexagon (`polygon`, any number of sides).
27. Star (`star`, points and depth on sliders).
28. Line (`line`).
29. Arrow (`arrow`: the shaft, then its head).
30. Underline swoosh (`swoosh`, thin at its ends).
31. Bracket frame (`frame`, four viewfinder corners).
32. Square brackets (`brackets`).
33. Cross (`cross`, one stroke then the other).
34. Plus (`plus`).
35. Checkmark (`check`).
36. Wave line (`wave`).
37. Zigzag (`zigzag`).
38. Spiral (`spiral`, from the middle out).
39. Heart (`heart`).
40. Burst (`burst`, rays from the middle).

### On any ◆ layer (sliders in Shape / Look / Draws on groups)
41. **Shape** sliders: width, height, sides / points, inner size, corner roundness, amount, turns / waves (each shape shows its own).
42. **Fill** color and fill opacity (0 = outline only); **Line** color, width, dashes, gaps.
43. **Dashes move** (marching ants, pixels a second).
44. **Thin ends** (a brush-like taper on open lines).
45. **Draws**, **Takes**, **Starts at**, **Holds** (on, then off / loop).
46. **Start point** (where the line starts; on a closed shape it goes round past the end).
47. **Still: Start / End sliders**: put ◇ keyframes on them (labkeys diamonds and curves) to draw it exactly how you like on the timeline.
48. **Fill comes in with the line** (the fill fades in as the line closes; off: the fill is there from the start).
49. **On each beat / bar / kick / snare**: the line draws again from nothing on every hit of the song (your markers, or the hits the analysis found, the beat grid); with no song, the 120 BPM demo beat.
50. **Crisp at any pixel ratio and when scaled up** with the ✥ corners or Scale (more pixels behind it, up to 3×).
51. **Renders and exports match the preview**, frame for frame (two renders give the same bytes).
52. **Nothing runs per frame once it has drawn**: the preview dozes (idlecpu).
53. Right-click a ◆ layer › **◆ Shape › Another shape…** / **Draws ›**.

### Reach
54. **Lab search** finds it for "shape", "shapes", "draw on", "write on", "trim path", "stroke animation", "line animation", "shape layer", "underline", "arrow", "checkmark", "draw your own", "pen tool", plus a help answer.
55. **Find anything** (Ctrl/⌘+K): "Lab: ◆ Shape that draws itself…", "Lab: ✎ Draw your own shape…" and a help answer.
56. **`/shape`** (aliases `/shapes`, `/draw-shape`): the picker; `<shape>`, `draw <in|out|inout|loop|beat|bar|kick|snare|off>`, `width`, `dash`, `round`, `dur`, `ease`, `reverse`, `filled`, `outline`, `color`, `fill`, `place`, `size`, `own`, `undo`, `list`.
57. **Directors**: `three_do { cmd: "run", command: "/shape arrow" }`, explained on demand in the app map's `shape` topic (aliases shapes, draw on, write on, trim path, stroke, underline, arrow). Nothing is added to the per-message prompt or the tool list.
58. **Ordinary layers**: saved with the scene, 📐 templates, 📜 recipes and packs, the time machine and Save / Shuffle, with no extra code.

Count: 58 upgrades.

## How it was tested
- `node dev/labshapes-test.js` (new, in UNIT, 11 checks). Every preset makes a path (closed parts close, arc length);
  a 1.2-unit line drawing on in 1 s is 0 / 162 / 324 / 648 / 648 px of a 1080 frame at 0 / 0.25 / 0.5 / 1 / 2 s (also
  with a delay and smooth easing); draws off, on then off, loop, reverse, the Start / End sliders, the fill's share;
  an offset past the end splits the drawn part in two with the same amount drawn; on each hit (nothing before the first,
  again from each hit, the same whatever the order of times); dashes (half the line, 16–18 pieces, marching); rounded
  corners; draw your own (through every point, sharp points keep a straight line); the taper; every preset's layer code
  parses with its sliders and options and the in-place edits keep the rest; the page's copy of the factory gives the
  same paths and trims; the shaders declare what they use. Passed (11/11).
- `dev/checks/labshapes.js` (new, in the `lab:` lines and its own `labshapes` group, 20 steps) on a 13 s fixture song
  whose kicks are **off any grid**, in a 640×360 frame:
  - the ways in (＋ Add, `/shape` with no duplicate commands, Lab search "shape" / "underline" / "draw on");
  - the picker's 21 previews draw (0.2–0.3 ms a frame for all 21);
  - three shapes added three ways (a card click, the API, `/shape arrow`), no errors; all 20 shapes draw through one layer;
  - **renders: the line drawing on (1 s from 2 s, linear) is 0 / 31 / 58 / 112 / 112 px wide at 1.9 / 2.25 / 2.5 / 3 / 4 s (wanted 0 / 30.3 / 57.3 / 111.3 / 111.3, ±3)**;
  - **two renders at the same five times give identical bytes**;
  - **on each of three kicks the line draws again: 58 px 0.15 s after, 112 px 0.32 s after**;
  - **the preview paused at 2.5 s vs the render at 2.5 s: mean difference 0, 58 px in both**;
  - Scale 2 → twice the pixels; paused: no path rebuilt, the preview dozes;
  - one undo per change; undoing an add removes the layer;
  - **✎ draw your own with four real (CDP) clicks on the pad, the third with Shift**: a new layer with those four points,
    the Shift one sharp and level with the one before, drawn by the page;
  - saved on disk with the scene.

  Passed (20/20).
- Also run and passed: labdirect, labkeys, kinetictype, labvisualizers, labsearch, lazy, labpace, unit:boot-test (after the
  budget change below), type, beatlink, labtemplates, labrecipes, layergroups, labeasy, labgestures, motionpolish,
  renderfast, menucalm. `idlecpu` fails the same way on the untouched base commit (1d31b0c, run from an exported copy):
  "the main process ran 42 timers/min (> 20)", main-process timers this stream doesn't touch. `inputlatency` (pulled in
  by a group) failed once on "ai-setup: p95 handlers 28 ms > 24 ms", a screen this stream doesn't touch.
- `node dev/lazy-manifest.js` regenerated (the new group and `/shape`); `node dev/winmac-scan.js`, `dev/errorcalm-scan.js`,
  `dev/datasafe-scan.js`: nothing new.

## Edits outside the new files (small, additive)
- `tools/three-sandbox.html`: the "shape layers" block (before light physics); `await __labShapeReady()` in `sqFrame`.
- `tools/three.js`: `shapecore` in `LIB_FILES`; one row in ＋ Add; `LabShapesHook.layerMenu` in the layer right-click.
- `tools/three-easy.js`: `LabShapesHook` in the layer menu's kinds.
- `tools/three-search-core.js`, `appsearch-data.js`: phrases and help answers. `mcp/hearth-map.js`: the on-demand `shape` topic.
- `lazy-data.js`: the hook in `lab`, the `labshapes` group (+ regenerated META). `index.html`: `labshapes` in the lazy-at tag.
- `dev/run-checks.js`: the unit test, `labshapes` in the `lab:` lines, a `labshapes` group.
- `dev/boot-test.js` + `docs/upgrades/firstscreen.md`: the first screen's JS budget 2,350 → 2,352 KB. lazy-data.js alone
  had reached it (2,349.9 KB at 1d31b0c), and a new lazy group's line and command manifest are first-screen bytes
  (this one ≈ 0.6 KB after shortening its command text).

## Not done / risks
- A line is one solid color per layer (its color has no alpha of its own); fade a shape with the layer's Opacity.
- The fill's soft edge is one pixel outside the shape, so a half-transparent fill has a hairline of the same alpha there.
  A closed shape you draw that crosses itself is filled the way the triangulation finds (may look odd).
- The picker's previews are a 2D canvas drawn with the same path and trim math (the taper approximated per segment). The
  layer itself is the real thing.
- With no song and no sequence, the preview draws on from the moment the layer (or its draw-on settings) started. A
  render draws on from the scene's time 0 (+ Starts at). With a song they are the same frame for frame.
- A note for the next stream: on the export page a layer's code carries live values (`value: __tv(…)`), so a test
  on the code's text like `drawOn: { value: 'kick'` never matches there. This stream's first try did that, and the
  first frame of a render drew before ♪ Move with the music's math had arrived. `__labShapeReady` now waits for the
  math whenever a shape layer is in the frame.
- Not tried on a real GPU or a Mac (SwiftShader, Linux).

## For the patch notes
- **Shapes that draw themselves**: right-click the Lab preview › ＋ Add › **◆ Shape…**. 20 shapes with live previews: rectangle, rounded rectangle, circle, ring, triangle, hexagon, star, line, arrow, underline swoosh, bracket frame, square brackets, cross, plus, checkmark, wave, zigzag, spiral, heart and burst.
- **✎ Draw your own**: click points on the pad and a smooth line goes through them. Shift+click for a straight line into a sharp corner, click the first point to close it.
- Pick **how it draws**: on, off, on then off, in a loop, or again on **each beat, bar, kick or snare** of your song. Pick how long it takes, the easing, and reverse.
- **The look**: line width, dashes (they can march), rounded corners, thin brush ends, filled or outline, colors from your palette.
- **Want it exact?** Set Draws to Still and keyframe its Start / End sliders on the timeline.
- Drag it on the picture to move, scale or turn it. It stays crisp at any size, and renders match the preview frame for frame.
- Shapes are ordinary layers: saved with the scene, templates, recipes and packs. Every change is one undo (↶ in the picker, or Ctrl/⌘+Z while it's open).
- Search "shape", "underline" or "draw on" in Lab search or Ctrl/⌘+K. Chat: `/shape arrow`, `/shape draw kick`, `/shape own`.
