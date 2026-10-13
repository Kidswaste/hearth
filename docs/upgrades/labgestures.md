# labgestures (round 34): moving around the Lab preview with a trackpad or a mouse

Goal: looking around a Lab scene should feel like a 3D app on the owner's two machines (a Mac trackpad, a Windows
mouse / precision touchpad), smooth at the screen's rate, with nothing new on screen.

Where it lives: `tools/three-sandbox.html` ("Lab gestures": the pure `<gest-core>`, the view applied in the
WebGLRenderer wrapper, the input listeners, frame / reset / keep, plus one line each in the listener guard, the message
handler and the import map), `tools/three-gestures.js` (new, lab lazy group: Z / Shift+Z, the menu rows, the hint, the
help, keys sheet lines, `/lab-view`), small hooks in `tools/three.js`.

## The scheme (one, consistent: Blender's trackpad / mouse conventions, Figma's zoom toward the pointer)
| | Mac trackpad · Windows precision touchpad | Mouse (Mac or Windows) |
|---|---|---|
| Turn around the subject | two-finger scroll (the picture follows the fingers) | right-drag |
| Pan | Shift + two-finger scroll | middle-drag · Shift+right-drag · Shift+wheel |
| Zoom (toward the pointer) | pinch · ⌘/Ctrl + scroll | wheel · ⌘/Ctrl + wheel |
| Frame the subject | double-click (double-tap) · Z | double-click · Z |
| Back to the scene's camera | Shift+Z | Shift+Z |

Left-drag and plain clicks stay the scene's. A right-click that doesn't move still opens the Lab's menu (the menu
already opened on button-up with a 6 px tolerance; a drag starts past those 6 px).

## How it works
- **Which scenes**: a layer that draws with an orbit-able camera (perspective, or orthographic that isn't a
  full-screen pass) and whose code listens to no wheel / pointer-down / touch itself. Scenes with their own controls
  (OrbitControls in the starter templates, custom drags) keep them untouched; while any visible layer has controls of
  its own, the gestures stay off. Off in the scene editor (it has its own view), while a sequence plays, on export
  pages, for precomp layers. Synthetic events (the director's `three_input`, a sketch's own) never move the view.
- **The view is an offset on the scene's camera** (turn around a pivot, distance, pivot shift), applied right before
  each of that camera's renders and put back after, like multiformat's reframe. The scene's own camera animation goes
  on underneath; the sketch's code always sees its own camera. A re-run or a slider that rebuilds the scene keeps the
  view; another scene starts fresh.
- **Undo**: the scene saves no camera state from navigation today, so moving the view makes no undo steps and isn't
  saved. "Keep this view" writes it as the scene editor's existing camera override, which is saved and undoable as before.
- **Feel**: drags apply at once and coast after a flick (exponential decay, exact distance per step, so 4 × 1/240 s
  lands where 1 × 1/60 s does); no coast when the pointer rested before letting go. Wheel notches ease (70 ms), and a
  zoom eases the distance and the pan together so the point under the pointer stays put. Frame / reset ease (110 ms).
  Time is the real elapsed time through labpace's f60 (a hitch counts at most ¼ s). Trackpad scrolls and pinches are
  applied directly (the OS already adds momentum).
- **Wheel normalisation**: deltaMode lines × 16 px, pages × 800 px; mouse vs trackpad told by Chromium's own trackpad
  mark (wheelDelta = −3 × delta on a Mac), sideways movement, a Windows / Linux notch (wheelDelta 120, ≥ 50 px), a Mac
  notch (4.000244… px multiples), display-scaled notches (100 / 120 / 125 / 150 px); a wheel stream keeps its kind for
  400 ms so a trackpad flick's big momentum deltas don't turn into a mouse. A pinch (ctrl+wheel with a trackpad
  delta) zooms 1 % per px; Ctrl / ⌘ + a mouse notch zooms like a notch (no 37 % jump).
- **Framing**: the subject is the world sphere around the visible meshes / points / lines, leaving out what the
  camera stands inside (a ground plane, a sky dome) and anything 20× bigger than the rest. The view keeps its turn,
  moves its pivot to the subject's centre and stands at the distance that fits it (the narrow side of the frame
  decides, 20 % margin). On an OrbitControls scene, Z moves its target to the subject and its camera along its view
  (eased), and Shift+Z returns both to where the scene started them (its pose at its first update; the import map
  hands sketches an OrbitControls subclass that reports itself, the same class otherwise).
- **No work when still**: the gesture loop runs only while something moves (a drag, a coast, an ease) and stops,
  then labpace's still check stops drawing again (measured below). Each moving step pokes labpace so the frame draws
  at once. A scene that draws only once, or a frozen one, is drawn by the loop from its last frame while you move (a
  frozen moment can be looked around); not for renderers that draw passes.

## Measured (dev/checks/labgestures.js, SwiftShader under Xvfb, 640×360)
| What | Result |
|---|---|
| Two mouse notches (deltaY 100) | distance × 1.35, eased (× 1.25 at 60 ms, then settles) |
| Six ctrl+wheel pinch events (−4.5 px) | distance 1.35 → 1.03 (finer than a notch) |
| Eight two-finger sideways scrolls (−12 px) | turned −1.68 rad (fingers right → camera left) |
| Right-drag 140 px | turns, still coasting right after the release, then stops; no menu |
| A still right-click | the Lab's menu opens (Freeze, Make it look finished…) |
| A moved view, settled, 2.5 s | 0 gesture steps, the loop off, **2 frames drawn / s** (labpace's refresh: still detection kicks in) |
| Z on a knot beside a 200 m ground | the pivot moves to the knot (within 0.5) |
| OrbitControls scene | the wheel stays OrbitControls' (its camera dollies, no Lab view); Z moves its target to the cube at (4, 0, −3); Shift+Z back to (0, 0, 0) |
In Node (dev/labgestures-test.js): a flick coasts the same distance at 60 / 120 / 144 / 240 Hz and with 30 % frame
jitter (to 1e-12); easing is at the same point after 100 ms at 60 and 240 Hz; frame / reset settle exactly on the
target in ≈ 1.3 s at any rate; the release velocity of the same drag sampled at 60 or 240 Hz is identical.

## Upgrades

### Trackpad (Mac, Windows precision touchpad)
1. **Two-finger scroll turns around the scene** (the picture follows your fingers), on scenes with a 3D camera and no controls of their own.
2. **Shift + two-finger scroll pans.**
3. **Pinch zooms toward the pointer** (Chromium's ctrl+wheel), finer than a wheel notch.
4. **Double-click (double-tap with tap to click) frames the subject**; again: back to the view before, like the Mac's smart zoom.

### Mouse
5. **The wheel zooms toward the pointer**, eased per notch (Shift+wheel pans).
6. **Right-drag turns** (Shift+right-drag pans); a right-click without moving still opens the Lab's menu.
7. **Middle-drag pans** (no autoscroll icon on Windows).
8. **⌘ / Ctrl + scroll zooms** on any device (⌘ counts as Ctrl on a Mac), at the right rate for a mouse or a trackpad.

### Feel
9. **Flicks coast to a stop**; a view you placed and held stays placed.
10. **The same speed and path at 60, 120 and 240 Hz** (real elapsed time, labpace's f60), no jitter from the rate.
11. **Wheel deltas normalised** across lines / pages / pixels, Mac and Windows notches, display scaling, touchpads.
12. **Nothing runs when the view is still**: the loop stops and the preview stops drawing again (labpace).
13. **Look around a frozen moment, or a scene that drew once** (bullet time while ❚❚ Freeze holds).
14. **The view survives a re-run** (a slider that rebuilds the scene, a code edit); another scene starts fresh.

### Keys, menus, help
15. **Z frames the subject** (the selected layer's; ignores the ground and the sky). F stays Freeze (your most used key).
16. **Shift+Z back to the scene's own camera** (Home stays the timeline's start).
17. **Z / Shift+Z work on OrbitControls scenes too** (the starter templates): target and camera eased to the subject, and back to where the scene started.
18. **Right-click the picture › View**: ◎ Frame the subject, ⌂ Reset the view, Keep this view, Moving around….
19. **Keep this view**: the view becomes the scene's camera (the scene editor's camera override: saved, ↶ undoable, Reset camera there).
20. **⋯ › Moving around the picture** and a one-screen help (Mac or Windows wording).
21. **A one-time hint** the first time you point at a scene you can look around ("Look around: two fingers or right-drag turn · pinch or the wheel zooms · Z frames · Shift+Z resets", with How).
22. **The keys sheet and the ? Lab keys dialog** list Z, Shift+Z and the gestures.
23. **`/lab-view frame | reset | keep | help`** for chats (and one phrase in the app map's commands topic, on demand only).

## Tests
- `node dev/labgestures-test.js` (UNIT, 39 checks): wheel kinds and units, what each wheel does, coasting / easing /
  settling at 60–240 Hz and with jitter, release velocity, turn / pan / zoom toward the pointer / fit distance / pitch limit.
- `dev/checks/labgestures.js` (lab group, `--fake-engines`): trusted CDP input as listed above, untrusted events
  ignored, still after the moves (no steps, ≈ 2 frames / s), Z / Shift+Z / double-click / Keep / menus / keys sheet /
  `/lab-view`, an OrbitControls scene.
- Ran: `sh dev/run-checks.sh labgestures labpace qa-keys lazy unit:boot-test` plus `dev/cache-test.js`. All pass except
  qa-keys' known "Lab · Shift+1 · Frame size: Fit" (failed on both runs, also on the base commit per simplify3.md);
  Z and Shift+Z pressed for real there worked, with no new conflicts or app-wide side effects.
- `sh dev/run-checks.sh labgestures` runs the check, the unit test and labpace.

## Edits outside the lane
- `tools/three-sandbox.html` (labgpu's): the "Lab gestures" section, one line in the render wrapper (+ the restore in
  its two exits), one line in the listener guard, one message line, the OrbitControls entry in the import map.
- `tools/three.js` (labhub's): the attach call, one message line, the View rows, the ⋯ row, two `?` sheet rows, `view`
  in `cmd().state` (a counter, for checks).
- `lazy-data.js` (the new file in the lab group, then `node dev/lazy-manifest.js`), `mcp/hearth-map.js` (one phrase,
  on-demand topic; prompts byte-stable: cache-test passes), `dev/run-checks.js` (UNIT, the `lab:` line, a `labgestures` group).

## Caveats
- The Mac's own smart-zoom gesture (a two-finger double-tap) isn't passed to web pages by Chromium; a double-click
  (a one-finger double-tap with tap to click) does the framing. Headless, `Input.synthesizePinchGesture` didn't reach
  the page, so pinch is tested as the ctrl+wheel Chromium turns it into.
- A free-spinning or hi-res mouse wheel that sends tiny deltas can read as a trackpad (turns instead of zooming):
  ⌘ / Ctrl + wheel always zooms.
- OrbitControls scenes keep OrbitControls' own mapping (two-finger scroll zooms there): only Z / Shift+Z are added.
  Ask the director to remove the controls from a scene to get the Lab's gestures.
- The view is how you look at the preview, not part of the scene: recordings of the preview show it, offline renders
  and exports use the scene's camera unless you Keep this view.
- With several layers, the gestures move the top layer with a camera (Z uses the selected layer); each layer's camera
  moves on its own.

## For the patch notes
- Look around Lab scenes like in a 3D app: on a trackpad, two fingers turn around the scene, Shift + two fingers
  pans, pinch zooms toward the pointer.
- With a mouse: the wheel zooms toward the pointer, right-drag turns, middle-drag (or Shift) pans. A right-click that
  doesn't move still opens the menu.
- Double-click the picture (or press Z) to frame the subject; double-click again to go back. Shift+Z returns to the
  scene's own camera. F is still Freeze.
- Moves coast to a stop and feel the same on a 60, 120 or 240 Hz screen; once still, the preview stops drawing again.
- Right-click › View › Keep this view makes the view the scene's camera (undoable in the scene editor); otherwise
  looking around never changes your scene or adds undo steps.
- Scenes with their own orbit controls (the starter templates) keep them; Z and Shift+Z work there too.
- New: ⋯ › Moving around the picture explains it all; a one-time hint shows the first time.
