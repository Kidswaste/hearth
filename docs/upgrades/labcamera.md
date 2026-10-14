# 🎥 Camera moves (round 40, labcamera): one-click cinematic camera moves on the Lab timeline, 0 tokens

Goal: the owner makes music-driven Lab scenes and videos. A push in over the build, an orbit on the drop, a punch-in
on every kick, a whip pan into the chorus: one click each, on the scene's timeline, the same in every render.

How to get there, no commands needed: **right-click the preview › 🎥 Camera moves** (the presets, from / to this view,
your moves), **the timeline's own right-click** (on the waveform: 🎥 Camera move from here…, 🎥 Your camera moves…),
**🔎 Lab search** ("dolly zoom", "camera move", "punch in", "whip pan") and **⌘/Ctrl+K / Find anything** ("Lab: 🎥 Camera
moves…", plus a help answer). Chats: `/camera-moves` (alias `/lab-camera`).

## How it works
- **A move is a keyframed offset on the layer's own 3D camera** over a range of the scene's clock (its song, else its
  own timeline): `layer.camMoves = [{ id, kind, t0, t1, ease, amt, d, dir?, turns?, band?, from?, to?, seed? }]`. The
  offset is the one the look-around gestures already use (turn around a pivot in front of the camera, the distance,
  the pivot shifted), plus a turn in place (pan, tilt, roll: whip pan, shake) and the lens (the dolly zoom's fov). The
  preview applies it right before each of that camera's renders and puts the camera back after (like the gestures'
  view, which goes on top), so the scene's own camera animation goes on underneath and the sketch's code never sees it.
- **Which scenes**: a layer that draws with an orbit-able camera (the same detection as the gestures: perspective, or
  orthographic that isn't a full-screen pass). A 2D scene, a shader pass or the scene editor gets "This scene has no 3D
  camera to move" and nothing is added. Scenes that own their camera (OrbitControls, their own animation) keep it: the
  move is an offset on top, for the render only.
- **Deterministic**: the offset is a function of the clock's time alone (`tools/three-camera-core.js`, pure; the shake
  is sums of sines with seeded phases; a punch-in reads beatlink's song hits: your Kick markers, else the song's
  analysis). Exports and the Lab sequence get each layer's moves in the plan (times shifted with the clip and its
  speed, `tools/three-seq.js`); an export frame waits for the math before its first frame (`cmWait`, like beatlink).
- **Smooth at 240 Hz**: nothing per frame in the hub; the preview evaluates the moves once per render from the time,
  so 60, 120 or 240 Hz land on the same curve (unit-tested at 60 / 240 Hz sample times; the largest step between two
  240 Hz frames of push + orbit + drift + shake is < 0.01). A move that changes the picture pokes labpace so the frame
  draws at once; a paused, still scene stays still. Layers without moves cost nothing.
- **Moves add up**: travel moves (push, pull, orbit, dolly zoom, crane, drift, views) hold their end after their range;
  transient ones (shake, whip, punch) are felt only inside it. A push in then a pull out lands back on the scene's camera.
- **Saved**: the moves live on the layer, so the scene, 📐 My templates, `.hearthpack` packs and the time machine carry
  them with no extra code. A 📜 recipe records them as one step (`cam`: times as fractions of the scene's length) and
  replays them on another scene (its camera's pivot measured there).

## Measured / tested
| | |
|---|---|
| Unit (`node dev/labcamera-test.js`, 16 tests) | easing presets; push / pull eased and held; moves in sequence add up and cancel exactly; orbit ¼ ½ full left / right; dolly zoom keeps s × tan = 1; crane, drift; shake subtle (< 1.5°), repeatable, at rest at its ends; whip out and back; punch-in on kicks (30 ms rise, back in ~0.2 s), only inside its range, bars only on bars, same values in any order; 60 vs 240 Hz identical, no jumps; views from / to; dragging ends; default ranges; sequence shift + cleaning; typed words; the preview page's copy gives the same offsets |
| In the app (`dev/checks/labcamera.js`, 22 steps) | the ways in (preview menu rows, Lab search, Find anything, the timeline's right-click); `/camera-moves push in 2s to 6s` → the camera is as the scene has it at 1 s, closer at 4 s, held pushed in (3.462 = 6·e^−0.55) at 8 s; **two renders from the hidden export page at 4 / 1 / 4 / 7.5 s give the same JPEG bytes, frame for frame**, and the pushed-in frame differs; **a punch-in on each kick: 30 ms after each of 4 kicks the camera is at 5.216 (= 6·e^−0.14), 0.4 s later back at 5.93**; the push in's end dragged on the timeline with real (CDP) mouse input from 6 s to 8 s lands on the beat (7.996), one undo step; the card's undo and the timeline's own undo; intensity drag + easing in the card = two undo steps; saved on disk; back after a scene switch; a recipe records it as one step and replays it on another scene; a 2D scene isn't offered it; no duplicate commands |

Also run (`sh dev/run-checks.sh labcamera unit:labcamera-test labgestures beatlink labrecipes labpace abcompare lazy unit:boot-test unit:director-mcp-test` + unit tests of labgestures / beatlink / labrecipes / labpace / labsearch / appsearch / abcompare, `dev/cache-test.js`): **pass**: labcamera (22 / 22 alone, after making it wait for the lab group under load), beatlink, labrecipes, abcompare, lazy (manifest regenerated), unit:boot-test, unit:director-mcp-test (the director's lean budget unchanged: no new tool), every unit test above, cache-test (prompts byte-stable). **Failed under machine load (≈ 38 Electrons from parallel streams; rAF at ~5 fps)**: labgestures (the scene's camera not drawn yet after 3 s, then the eased-wheel timing) and labpace (frame-rate steps) fail **the same way on the base commit a31bfd9** run at the same time; unit:labpace-test failed once on its "signature costs < 1 ms" timing and passed in the group run. None of their code paths run for a layer without camera moves.

## Upgrades

### The moves (right-click the preview › 🎥 Camera moves)
1. **⇥ Push in**: toward the subject.
2. **⇤ Pull out**: away, revealing more.
3. **↻ Orbit right** ¼, ½ or a full turn around the subject.
4. **↺ Orbit left** ¼, ½ or a full turn.
5. **⧖ Dolly zoom: pull back, zoom in** (the vertigo shot: the subject stays, the world stretches away).
6. **⧖ Dolly zoom: push in, zoom out** (the world closes in).
7. **⇡ Crane up**: rises over the subject.
8. **⇣ Crane down**: comes down to it.
9. **≋ Handheld shake**: subtle (under 1.5°), fades in and out, the same wobble on every render.
10. **⟿ Whip pan** right or left: a fast swing away and back.
11. **〜 Slow drift**: a slow, almost still float.
12. **✸ Punch-in on each kick** (your Kick markers, else the song's kicks).
13. **✸ Punch-in on each beat** (the beat grid).
14. **✸ Punch-in on each bar** (the 1 of each bar).
15. **⇢ From this view… → …to this view**: look around the picture (right-drag or two fingers, the wheel zooms) to the start view, set it, look around to the end view, set it: the camera travels between the two (the look-around view is the same one "Keep this view" uses).
16. **⇢ …to this view** alone: from the scene's own camera to the view you looked around to.

### On the timeline
17. **Each move is a cyan bar under the waveform**, named ("⇥ Push in", "✸ Punch-in on each kick"); moves that overlap stack in rows.
18. **Drag a bar's end** to set where it starts or ends; it lands on a beat when one is within 6 px.
19. **Drag the bar itself** to move it in time (its length stays).
20. **Right-click the waveform › 🎥 Camera move from here…**: any preset, 4 bars from that spot.
21. **A sensible range by itself**: the loop when there is one; else the whole scene for the first move and right after the last one for the next (moves in sequence).
22. **Several moves add up**: a push in under an orbit, a push in then a pull out back to the start, a shake on top of anything.

### The card (🎥 Your moves…)
23. **Your moves in one card**: each with its name and time range.
24. **6 easing presets** per move: Smooth, Cinematic, Slow start, Slow end, Steady, Snappy.
25. **An intensity slider** per move (0–200 %), live in the preview while you drag.
26. **✕ Remove a move**, ＋ Add a move ▾, and **Remove every camera move** in the menu.

### Safe and saved
27. **One undo per change**: adding, a whole drag of an end, an intensity drag, an easing, a removal. Undo from the toast, the card's ↶, the menu's "↶ Undo …", the timeline's own Ctrl/⌘+Z, or `/camera-moves undo`. ◧ Before / after names it "🎥 …".
28. **Saved with the scene**, its 📐 templates and `.hearthpack` packs (the moves live on the layer).
29. **Renders, exports and the Lab sequence move exactly like the preview**, the same frames every time.
30. **Respects scenes that own their camera**: offered only where an orbit-able 3D camera exists; the move is an offset for the render only, under the look-around view.
31. **📜 Recipes record your camera moves as one step** and replay them on any scene (fitted to its length).

### Find it, ask for it
32. **Right-click the preview › 🎥 Camera moves** (a submenu, nothing new on screen).
33. **🔎 Lab search** finds every move ("dolly zoom", "whip pan", "punch in", "camera move") plus a help answer.
34. **⌘/Ctrl+K › Lab: 🎥 Camera moves…** and a **Find anything** help answer.
35. **`/camera-moves <words>`** for chats and the directors (`push in`, `orbit left half`, `punch in on each bar`, `dolly zoom`, `from` / `to`, `[whole|loop|here|after]`, `[2s to 8s]`, `[cine|smooth|…]`, `[60%]`, `list`, `undo`, `clear`); one line in the app map's commands topic (read on demand, no prompt tokens).

**35 upgrades.**

## How it's built
- `tools/three-camera-core.js` (`CamCore`, no DOM; also `globalThis.camcore` in the preview, sent as source on first use through `LIB_FILES`; Node: `dev/labcamera-test.js`): kinds, easings, `make` / `clean`, `at(moves, t, { since })`, `sinceOf`, `shift`, `moveEdge`, `rangeFor`, `name` / `describe`, `parse`.
- `tools/three-camera.js` (`LabCamera`, lab lazy group) + `tools/three-camera.css`: the menus, the card, the timeline bars and drags (through the player's new `addHooks`), the undo stack (a token in the timeline's undo, so its Ctrl/⌘+Z undoes camera changes too), recipes, `/camera-moves`, the ⌘K action.
- `tools/three-sandbox.html` ("🎥 Camera moves" after the gestures): `cmRender` / `cmApply` in the render wrapper (before the gestures' view, restored after it), `cmCommand` (which layer, its pivot, the look-around view now), `cmWait` in export frames, `window.__labCam.state()` for checks.

## Edits outside the new files (small, additive)
- `tools/three-sandbox.html` (labgpu's): the section above, one line in the render wrapper + its two restores, one line in the message handler, one in `sqFrame`.
- `tools/three.js` (labhub's): `camcore` in `LIB_FILES`, `camMoves` in `layerProps`, the attach call, the `cam-info` route, the preview menu row.
- `tools/three-media.js`: `addHooks()` (more modules drawing on / dragging on the waveform beside the footage side): six one-line calls next to the existing `hooks.*` calls.
- `tools/three-seq.js`: `camMoves` in a clip's layer props (shifted with the clip).
- `tools/three-recipes-core.js` / `tools/three-recipes.js`: the `cam` step kind (describe, icon, clean, compress, record, replay).
- `tools/three-abcompare-core.js`: a `cam` kind (◧ names a camera change).
- `tools/three-search-core.js` (phrases + a help answer), `appsearch-data.js` (a help answer), `mcp/hearth-map.js` (one phrase in the commands topic; prompts byte-stable), `lazy-data.js` (lab group + regenerated manifest), `dev/run-checks.js` (UNIT, `lab:`, a `labcamera` group).

## Caveats / not done
- **The pivot** (what an orbit turns around) is measured once, when the layer's first move is added (the subject's distance in front of the camera). A subject that travels far away later isn't followed.
- **"From this view" captures the look-around view relative to the scene's camera.** Setting a view while other moves are active on that layer measures it against the un-moved camera, so the result can differ from what was on screen; set views on a layer without other moves (or before adding them).
- **A punch-in needs hits**: with a song, your Kick markers or the song's analysis; on a scene's own timeline (no song) there are no beats, so it does nothing until you load a song.
- **Precomp layers and deployed web pages** (deploy) don't carry camera moves yet.
- Tested on Linux under Xvfb with software WebGL; a headless paused scene draws only a few frames a second (the check waits for one after each seek); not on a real Mac / PC GPU at 240 Hz (the 240 Hz claims come from the unit test's frame-rate independence and the per-render evaluation).

## For the patch notes
- New in the Lab: **🎥 Camera moves**. Right-click the preview › 🎥 Camera moves: push in, pull out, orbit (left or right, a quarter, half or full turn), dolly zoom, crane up or down, a subtle handheld shake, a whip pan, a slow drift, or a **punch-in on each kick, beat or bar**. No tokens.
- **From this view to that view**: look around the picture to a start view, set it, look around to the end view, set it, and the camera travels between them.
- Each move is a **cyan bar under the waveform**: drag its ends (they land on the beat) or the bar itself. Right-click the waveform › 🎥 Camera move from here… adds one at that spot.
- **🎥 Your moves…** sets each move's easing (Smooth, Cinematic, Slow start, Slow end, Steady, Snappy) and its intensity, or removes it. Moves add up, so you can chain them.
- Every change is one **undo** (the toast, the card, Ctrl/⌘+Z on the timeline).
- **Renders and exports move exactly like the preview**, the same frames every time; moves are saved with the scene, its templates and packs, and 📜 recipes record them.
- Only offered for scenes with a 3D camera; scenes with their own camera animation keep it (the move goes on top).
- Good to know: a punch-in needs a song (its kicks or your Kick markers). Chats can do it too: `/camera-moves orbit left half`.
