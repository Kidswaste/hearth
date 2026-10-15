# ✥ Work on the picture itself (round 46, labdirect)

Until now, moving a title or a picture in the Lab meant finding its layer, unfolding "Position, size, rotation" and
dragging Move X / Move Y / Scale / Rotate sliders while watching the preview. Now you just grab it in the preview, like
in Photoshop or After Effects. No new buttons; nothing changes until you click the picture. Nothing goes in any prompt
(0 tokens).

## What it does
1. **Click something in the preview** → its layer is picked: the Lab selects it (it lights up in the Layers list, its
   code and sliders show) and a thin orange outline with four corner handles and a small turn circle frames what it
   draws. The outline hugs what's drawn (read from the layer's own picture), not the whole frame.
2. **Click on nothing** (an empty spot) lets go; **Esc** lets go too.
3. **Drag** it to move it. Works for every kind of layer: 🅰 type, pictures, video, shapes, particles, 2D canvases,
   three.js scenes and 🧊 models (the whole layer moves).
4. **Shift-drag snaps** its edges or middle to the frame's centre, thirds and edges, and to the other layers' edges and
   middles, with a thin pink guide while it snaps (about 7 px on screen).
5. **Corner handles scale** it about its own middle (Shift: 5 % steps); **the circle above turns** it about its own
   middle (Shift: 15° steps). The layer's Move X / Y make up for it, so it doesn't drift across the frame.
6. **Alt/Option + scroll** over the picture scales the picked layer (or picks what's under the pointer first).
7. **Arrow keys nudge** it 1 px of the frame; **Shift+arrows** 10 px. While something is picked the arrows and Esc
   belong to it (the timeline's arrows work again once you let go).
8. **Double-click** opens that layer's sliders (on a 3D scene a double-click also still frames the subject, as before).
9. **One undo per drag**: Ctrl/⌘+Z on the picture or in the Lab puts it back (a run of arrow presses or wheel turns is
   one step too). With a song or a scene timeline loaded, the moves take their turn in the timeline's own Ctrl/⌘+Z.
10. **Ordinary values**: what moves is the layer's own Move X / Move Y / Scale / Rotate, so renders, stills, the
    sequence, 📐 templates, 📜 recipes, packs, the time machine and the directors all follow. When one of them is
    animated, the drag sets a keyframe at the playhead (as the slider does).
11. **✥ 3D** on a 3D layer's outline: the scene editor's gizmo on the object you clicked (a 🧊 model gets its own
    model gizmo, tools/three-models.js), for real 3D moves; nothing duplicated.
12. **Scenes with their own controls** (orbit controls, their own drags) keep their drags: a click picks them, the
    corners, the turn circle, Alt+scroll and the arrows still work.
13. **The director's synthetic clicks never move anything** (only real mouse / trackpad input does).
14. **Handles keep their size on screen** at any frame size (an exact 1080×1920 preview is shown scaled to fit).
15. **Off where it would get in the way**: Present, the scene editor, a playing sequence, recordings, export pages.
16. **Discoverable**: a one-time tip the first time you pick something on the picture ("drag to move · Shift snaps ·
    corners scale…", with How), the keys sheet (bottom left) lists "Click · Drag on the picture" and
    "Alt/Option+scroll on the picture", and a "Working on the picture" help card.

## Smooth and light
- The picture is read only on pointer events: a 7×7 look under the pointer to pick (top layer first), the picked
  layer's outline at 128 px once per pick / drag end, the other layers' outlines once per Shift-drag.
- Nothing runs per frame: the outline is one overlay that copies the layer's own CSS transform (written only when it
  changes); the drag is shown in the preview at once and the Lab's late answers can't pull it back.
- The dozing preview (idlecpu) is awake while you drag (checked: `why: dragging`) and dozes again once still.

## Tests
- `node dev/labdirect-test.js` (UNIT, 20 checks): the transform and its inverse, the box on screen, pin (scale / turn
  about the thing's middle), snapping (centre, thirds, nearest of edge / middle / edge, no snap when far), the drawn
  box from alpha, the sliders' ranges, arrows in %.
- `dev/checks/labdirect.js` (in `lab:` and its own `labdirect` group): a red WebGL square and a blue 2D-canvas square;
  real CDP clicks, drags, keys and wheel on the preview: click picks (Lab selection + outline), click on nothing lets
  go, drag → Move X ≈ 10 and the merged picture shows it moved, one undo step, a real Ctrl+Z puts it back (values and
  pixels), Shift-drag snaps to the centre with a guide, awake while dragging, arrows (1 / 10 px) as one step, a corner
  scales about the middle, Alt+wheel scales, Esc, double-click opens the sliders, ✥ 3D only on the WebGL layer, no
  picture reads while idle, the preview dozes again.

## Files
`tools/three-direct.js` (new, lab lazy group), `tools/three-sandbox.html` ("Direct" block + CSS + 4 one-line hooks:
styleLayer, setLayerProps, removeLayer, the layer-props message), `tools/three.js` (attach + one message line),
`lazy-data.js` (+ regenerated META), `dev/run-checks.js`, `dev/labdirect-test.js`, `dev/checks/labdirect.js`.

## For the patch notes
- ✥ In the Lab you can now work on the picture itself: click something in the preview to pick its layer (the Layers
  list follows), then drag it where you want it.
- Hold Shift while dragging to snap it to the centre, the thirds, the edges or the other layers (a thin guide shows).
- Drag a corner to scale it, the little circle above to turn it, or Alt/Option+scroll over it; the arrow keys nudge it
  (Shift: 10×). Esc or a click on an empty spot lets go.
- Double-click something to open its sliders.
- Each drag is one Ctrl/⌘+Z. What moves is the layer's own Move / Scale / Rotate, so renders, the sequence, templates
  and recipes match what you see; an animated value gets a keyframe at the playhead.
- 3D layers show ✥ 3D on their outline: the 3D gizmo on the object you clicked (a model gets its own).
- Caveat: a scene with its own mouse controls (orbit controls) keeps its drags; pick it with a click and use the
  corners, the arrows or Alt/Option+scroll.
