# Round 133 · campath133: ✎ camera paths, drawn on the preview

The Lab could already move a scene's camera with one-click presets and a "from this view to that view" move. It could
not follow a route you choose through several views. This round adds **✎ Draw a camera path**. You look around the
picture, click to drop points, and Hearth draws a smooth curve through them over the preview. The points are keyframes
on the song: over the whole song, the loop or one section, snapped to bars or one per section. The result is one
ordinary 🎥 camera move, so renders, exports, the sequence and ◉ Perform play it with no extra code.

## What existed (and is reused, not duplicated)
- **🎥 Camera moves** (round 40, labcamera: `tools/three-camera-core.js`, `tools/three-camera.js`): moves stored on the
  layer (`layer.camMoves`) and computed from the clock's time alone in the preview (`cmRender` / `cmApply` in
  `tools/three-sandbox.html`). Exports, the Lab sequence (`CamCore.shift`), the backstage and the Stage window read them.
  Presets cover push, pull, orbit, dolly zoom, crane, shake, whip, drift and punch-in on the kick, beat or bar. The
  `views` move goes from one looked-around view to another. Moves show as cyan bars under the waveform, and each change
  is one undo step (`LabCamera.commit`, a token in the timeline's own Ctrl/⌘+Z). Chats use `/camera-moves`.
- **Look around the picture** (round 34, labgestures): right-drag / two fingers / the wheel move a "view": an offset
  `{ yaw, pitch, s, px, py, pz }` around a pivot in front of the scene's own camera. The camera moves already use
  this offset.
- **✥ Work on the picture** (round 46, labdirect): click, drag, scale and rotate a layer's 2D placement on the preview.
  It moves layers, not the camera.
- **Keyframes and animate presets** (labkeys, `three_keyframes`, `three_animate`): keys on sliders (`L.keys`), eased
  by `ThreeLayers.evalKeys`. A scene's camera isn't a slider unless its code makes one.
- **The timeline** (`tools/three-media.js`): the grid (BPM, downbeat, bars), cues, the loop, and the `addHooks` that
  labcamera draws its bars with.
- **✦ Map to the song** (round 130, songmap130): names the song's sections ("Drop 2") on downbeats and can turn them
  into cues (`SongMapCore.sectionsOf`).
- **Beat links** (round 38, beatlink): the preview's kick and snare hits (`cmSince` reads them for the punch-in).

So a path is **one more kind of 🎥 camera move** (`kind: 'path'`). Its points are keyframes `{ t, v: view }` in the
same view space the gestures and the `views` move use. Nothing else in the render chain had to learn about it.

## What's new, and where the owner clicks
**Right-click the preview › 🎥 Camera moves › ✎ Draw a camera path** (one row in the existing menu), or
`/camera-moves draw`. There is no new toolbar button.

**Path mode** puts a light overlay on the preview and one small bar at its top left: `✎ Path · 3 points · 0:16.9–1:01.9
＋ Point ⌫ ▶ ⋯ Done`.
- **Drag** on the picture to look around (the wheel goes closer or further). **Click** to add a point: it records where
  the camera stands and what it looks at (the subject in the middle). **＋ Point** does the same. **⌫** removes the
  last point.
- **The overlay** shows the subject as a small circle in the middle, with a dashed ring for the scene camera's
  distance. A numbered dot marks where the camera stands at each point, seen from above and in front, and the cyan
  curve (Catmull-Rom) is the route the camera will take. A yellow ring marks where the camera is now.
- **Drag a dot** to move that point around the subject, at the same height. The preview looks from that point while
  you drag. Its time stays the same. **Each drag is one undo step.**
- **⋯ (timing)** folds out one row:
  - **over what**: the whole song, the loop, or a section (§ Intro, § Drop, § Drop 2…). Sections come from the
    timeline's cues (from ✦ Map or Sections ▾), else from the song's analysis, named as songmap130 names them;
  - **Snap to bars** (the default when there's a beat grid), **A point per section** (each point on a section start),
    or **No snap**;
  - **Smooth** (a curve through the points), **Linear**, or **Hold, then move on the beat** (each point holds, then
    the camera moves over the last beat before the next point);
  - **≋ Shake on the kick**: a small slider (0 = off) for a short shake on each kick. It uses beatlink's hits, the same
    source as the punch-in.
- **▶ Preview** plays the path's range with the move as it renders (the look-around view is cleared), then returns to
  editing. A yellow dot rides along the curve.
- **Esc** (or **Done**) leaves path mode. The overlay goes and the moves play again.

**Undo.** Each change is one step of the camera's undo: adding a point (from the 2nd), a dot drag, a timing change and a
shake change. That covers Ctrl/⌘+Z in the Lab, the 🎥 card's ↶ and `/camera-moves undo`. ◧ Before / after names it
"✎ Camera path: …".

**On the timeline** the path is a cyan bar like any camera move, with a small ◆ at each point's time. Dragging an end of
the bar stretches the points with it.

**Renders, the sequence, ◉ Perform.** The path is saved on the layer with its keyframes, so everything that reads
`camMoves` plays it: export frames, the Lab sequence (point times shifted with the clip), the backstage, the Stage
window that Perform uses, 📐 templates, packs and the time machine. While you draw, only the Lab's own preview holds
the layer's moves. Export pages and the Stage window never hold them.

**The AI can draw one too**, through the existing command (no new tool, no prompt cost). A director sends
`three_do run {command: "/camera-moves …"}`:
- `/camera-moves path 0 0 1, 0 -5 0.7, 120 -20 0.5 over the drop`: each point is yaw° pitch° distance (1 = the scene's
  camera), with `[snap bars | per section | no snap] [smooth | linear | hold] [shake 40%]`;
- any preset over a named section: `/camera-moves orbit right half on the drop`. So "a slow push-in that orbits on the
  drop" is `/camera-moves push in whole cine` then `/camera-moves orbit right half on the drop`.

The how-to is in `three_do help camera` (on demand, counted in no prompt). No `three_do camera` op was needed. The
prompt budgets are unchanged (promptdiet, director-mcp and directorfrugal tests pass).

## Files
- `tools/three-campath-core.js` (new, pure, loads in Node, `CamPathCore`): ranges (whole, loop, sections), key times
  (even, bars, per section), the overlay's mapping (`plan` / `unplan`), the curve's samples, and words → a path.
- `tools/three-campath.js` + `tools/three-campath.css` (new, `CamPath`): path mode, the overlay and the bar, pointer
  input (look around, add, drag a dot), timing, ▶ Preview, Esc, and `/camera-moves path …` / `… on the drop`.
  This is the lazy group **campath** (tier `use`, after `lab`), loaded by the menu row or the command. `lazy-data.js`
  has the group and the regenerated manifest, `lazy-meta.js` was regenerated too, `index.html`'s lazy-at tag has
  `campath`, and `docs/lazy-groups.md` has its line.
- `tools/three-camera-core.js` (marked): the `path` kind (`make`, `pathView` with Catmull-Rom / linear / hold, the
  kick shake in `addMove`), `PATH_HOW`, and `shift` / `moveEdge` move a path's points with it.
- `tools/three-camera.js` (marked): the ✎ menu row, `/camera-moves path|draw|… on <section>` handed to CamPath, a
  path's point ticks on its bar, `pts` in the redraw key, and `hooks` / `commit` / `liveSet` exported.
- `tools/three-sandbox.html` (marked): `cmCommand` takes `hold` (a layer's moves wait while drawing) and `set` (put the
  look-around view at a point). `cmRender` skips a held layer, and a path with a kick shake waits for beatlink like a
  punch-in.
- `mcp/three-guide.js`: the on-demand CAMERA topic names paths and section ranges.
- `dev/checks/campath133.js` (new) and the `campath133` group in `dev/run-checks.js`.

## Tests
One app check, **`dev/checks/campath133.js`** (group `campath133`). It uses real CDP mouse and key input on the check's
own temp data, with the fixture song `/tmp/hearth-autoedit-song.wav` (128 BPM, intro / build / drop / break / drop /
outro) and a cube 6 m in front of a plain perspective camera:
1. **Path mode from the menu row**: the overlay and one small bar. ⋯ › over what = the first **Drop**. **3 points**: a
   click, a drag to look around plus a click, then a drag, the wheel and ＋ Point. That makes one path move with 3
   points, and the 2nd and 3rd points are one undo step each.
2. **The curve overlay**: 3 dots, and the curve passes through every dot (from the first to the last).
3. **The keys** are spread over the Drop section (the first on its start), each on a bar line of the grid.
4. **Drag dot 2**: that point's view changes and the key times stay. It is **one undo step**, and one timeline Ctrl/⌘+Z
   puts the path back exactly (the same JSON).
5. **Esc** (a real key) leaves: the overlay and the bar go, and the path stays.
6. **The camera at time t**: at point 2's time it stands where point 2 was looked from (within 2 mm). It holds point 3
   after the end. Halfway between points 1 and 2 it is where `CamCore.pathView` puts it.
7. **Renders read the keys**: stills from the hidden export page at one time twice are identical, and at another point
   they differ. The path is saved on disk with its 3 keyframes. `/camera-moves path … over the drop per section shake
   30%` (what a director sends) re-makes it as one undo step.

Run (with `HEARTH_THREE_DIR` set, through `dev/run-checks.js --exact`): `campath133` ✓ (48 s), `labcamera` ✓, `songmap130` ✓,
`labchat92` ✓, `unit:labcamera-test` ✓ (16/16), `unit:boot-test` ✓; `node dev/boot-test.js` ✓ (2986; first screen 62
scripts, 1581 KB of 1586 KB, unchanged); also `promptdiet-test`, `director-mcp-test`, `directorfrugal-test`,
`slim116-test` and `selfmap118-test` ✓. No prompt budget moved (full and lean are as before; `three_do` unchanged).

## Risks / not done
- The overlay is a map of the camera around the subject (seen from above and in front), not a 3D drawing of the route
  inside the scene. Dragging a dot keeps that point's height. To raise or lower a point, look around to a new spot
  and add it again.
- Points are relative to the scene's own camera and its subject (the pivot is measured when the path starts). A scene
  whose camera flies around by itself gets the path on top of its own motion.
- While drawing, the layer's other camera moves are paused in the Lab's preview, so a point is measured against the
  scene's camera. ▶ Preview plays them all together.
- Key times are re-spread over the range when points are added or the timing changes. A point's own time isn't
  dragged on its own: drag the bar's ends on the timeline, or pick another range or snap.
- Linux / SwiftShader only; not tried on the owner's Mac or PC.

## For the patch notes
- **Draw a camera path.** In the Lab, right-click the picture › 🎥 Camera moves › **✎ Draw a camera path**. Drag on
  the picture to look around, then click to drop a point. Do it again, and Hearth draws a smooth curve through your
  points right over the preview.
- **Drag a dot** to move a point. The preview shows the view from there while you drag.
- **Put it on the song**: the small **⋯** sets where the path plays (the whole song, the loop, or a part like the
  Drop), whether the points land on bars or one per part, and how it moves: smooth, straight, or hold and then move on
  the beat. **≋ Shake on the kick** adds a little camera shake on every kick.
- **▶ Preview** plays it. **Esc** finishes.
- Every change is one Undo. The path is saved with the scene, and renders, exports and Perform play it exactly.
- Ask the director: "make a slow push-in that orbits on the drop", or "draw a camera path over the drop".

## For Codex
No Codex-owned file was edited. `astra*`, `codex-*`, `projects*`, `project-workspace*`, `sync-engine.js`,
`cloud-files.js`, `workbench-*` and `engine-watch.js` are unchanged. A path is a field on a layer's existing `camMoves`
(saved in kv `three-sketches`), so sync carries it with the scene as before. Astra's directors get the same
`/camera-moves path …` through `three_do run`, exactly as Claude's do.
