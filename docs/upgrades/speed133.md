# ⚡ "Why is this slow?": a speed fix-it card for heavy scenes (round 133, speed133)

The owner's scene "vizualizer2" ran at about 21 fps on an RTX 4080 with a 240 Hz screen, and once crashed. His local
Claude found the cause by hand: antialias plus a high pixel ratio. With antialias off and 1× pixels the preview went to
64 fps, and 32f499f made exports force antialias, so a scene can drop it for the preview without hurting renders. This
round turns that hunt into one card: it measures on this computer, names the top causes in plain words and fixes each
one with a click.

## What existed (and what each does)

- **The Lab's stats line** (`tools/three.js` `paintStats`): fps, "worst N ms", render ms, draw calls, triangles, points,
  geometries / textures / shaders, and the Quality chip. The fps and the frame budget bar stay on screen; the rest shows
  when you point at the preview.
- **▮ Frame budget bar** (framebar64, `tools/framebar*.js` and the page's "frame budget bar"): the frame's time against
  the screen's rate. Pointing at it lists each layer's code / draw ms, calls, triangles, texture MB and shaders, while
  the line shows. **Why?** looks at one layer for 3 s (draw calls by material, shadow casters and maps, overdraw,
  offscreen passes, lights, textures) and suggests changes, which you can only send to the director as a draft. It times
  the CPU side of each `render()`; it has no GPU time per layer and no one-click fixes.
- **Hitch map** (hitchmap63) and **game performance** (gameperf: the F stats chip, the performance doctor, `/game-perf`):
  for ▶ Play, the game window. Where and why the game stutters, with fixes for a Lab game.
- **playbudget** (round 55): keeps Hearth's own helpers in the ▶ Play window under 2 % of a frame, and switches the most
  expensive one off by itself.
- **Adaptive quality, "Quality: auto"** (labadapt, labfps72): while frames drop, the preview draws lighter (resolution
  first, then filters, shadows, particles). Renders stay full. The chip in the stats line switches Auto / Full.
- **🪶 Light mode**: 1 device pixel per CSS pixel, half-size filters, at most 30 fps.
- **🩺 Fix my scene** (scenedoctor): a free check for errors, a blank or dark frame, the subject off screen, and "very
  slow" (under 20 fps), with one fix for that ("Halve the count slider" or Light mode). It has no measurement per layer.
- **labhealth** (`tools/three-health.js`, laberrors80): a scene's errors flow back to the chat that works on it.
- **`three_do perf`** (the AI's tool): it measures the running game and lists fixes for the director.
- **lab240gpu** (round 50): removed GPU work you can't see (layers under an opaque top, shadow maps redrawn only when they
  can change). Its per-layer GPU call counter is **dev only** (`dev/checks/lab240gpu.js`) and never shipped.
- **Shadows and pixel ratio**: these are the scene's own code (`renderer.setPixelRatio`, `castShadow`, `mapSize`). The Lab
  had no per-scene setting for either, except adaptive quality and Light mode.
- **glrecover** (round 43): when the graphics card drops the preview, the Lab rebuilds the layers in place, or on a new
  page after 4 s, with one calm note. It had no lighter way back for a scene that keeps crashing it.

So the counters (framebar's per-layer sums and its scene walk), the pixel-ratio share (Light mode's), the half-size
filters, the scene doctor's undo pattern and glrecover's events were there. This round **extends them** and adds what
was missing: GPU time per layer, the preview-only settings, the fixes, and safe mode.

## What's new, and where the owner clicks

- **The slow chip.** When the preview stays under 50 fps, or under half the screen's rate (120 at 240 Hz), for 5 s while
  it plays, a small chip shows just above the stats line: **"Slow: 21 fps · Why? · ✕"**. It doesn't show when the
  frame cap you chose (or Light mode's 30) is what holds the fps, or while the preview is parked, frozen or still. ✕
  hides it for that scene. `store three.speedChip = false` turns it off.
- **⚡ Speed check** is a row in the toolbar's **⋯ › This Lab** (beside 🩺 Fix my scene) and in **✦ More** (the preview's
  right-click). There is also `/speed-check [safe | undo | status]` and Ctrl/⌘+K. No new toolbar row.
- **The card** (over the top right of the preview) measures for 3 s on this computer, with no AI:
  - with every layer, then with each of the heaviest layers left out for a moment, which gives **each layer's GPU time a
    frame**;
  - framebar's counters for each layer: draw calls, triangles, shaders and the longest fragment shader, texture MB and
    the biggest texture, offscreen passes (render targets) a frame;
  - the preview's antialias, pixel ratio, shadow lights and filters.

  It shows the **top 3 causes** in plain words, each with a one-click fix and the gain to expect, for example:
  - "Preview at 2× pixels → **Preview at 1× pixels** (+40 fps, renders unaffected)";
  - "Antialias in the preview → **Turn off antialias for the preview only**";
  - "'Particles' draws 400k triangles: cut to 100k → **Cut to 100k**" (its count slider, or "✦ Ask the AI to optimise" if
    it has none);
  - "'Bloom' at full size → **Half size in the preview**";
  - "Shadows on 3 lights → **Keep 1 (preview)**".

  **▸ Each layer** unfolds the table (GPU ms · calls · tris · shaders · textures · passes).
- **Each fix is one undo step**: ↶ on its row, **↶ Undo** at the bottom of the card, or the toast's Undo. After each fix
  and each undo, the card measures again and shows "✓ Preview at 1× pixels · now 58 fps (was 21)".
- **Preview-only fixes never change renders.** They are the scene's preview settings (`sketch.speed`: `px1`, `noAA`,
  `sh`, `fxHalf`), kept with the scene and sent only to the Lab's preview page. Export pages (`?xp=1`) force antialias
  and the full pixel ratio (as in 32f499f), and ▶ Play forces its own maximum. A still, a screenshot and a recording
  still draw at full size (`fullRes()`).
- **✦ Ask the AI to optimise 'Particles'** shows the message with the measured numbers and its cost first ("About 31k
  tokens in … · Claude"). Only **Send** gives it to the Three Director. Its change is one undo step, as every director
  reply is.
- **Safe mode.** When the graphics card drops the preview (glrecover's lost or remaking), the chip says "The graphics
  card dropped the preview · **Reopen in safe mode**", and the card shows the same row. It runs the scene again on a fresh
  page at 1× pixels, without antialias and without shadows, as one undo step. Renders keep full quality.

## How it's built

- `tools/three-sandbox.html` ("speed check", all marked `(round 133, speed133)`):
  - `SPD` holds the preview settings (`speed` message);
  - `prQ` takes `px1` the way it takes Light mode;
  - `fxHalf` takes `fxHalf`;
  - `spdShadows` keeps shadows on the first n lights (the biggest maps first) and puts the others back;
  - `__labSpdP` in the `three` shim drops antialias for renderers made on a preview page. The export and ▶ Play branches
    never call it.
  - `speed-measure` reads the frames with every layer, then for each of the 3 heaviest layers a short stretch with
    everything followed by one with that layer's draw skipped (`SPD.skip` in the render wrapper; about 0.36 s each, at
    least 6 frames), so each layer is judged against the frames just before it. The card keeps the median of the
    scene's last 3 measures per layer, because one measure on a busy computer jitters. It adds framebar's per-layer counters (FB turned on for the
    measure), render targets per frame, each renderer's context attributes, samples, pixel ratio and size, programs and
    the longest fragment shader, and framebar's scene walk (`fbScan`).
- `tools/three.js`: `ThreeLab.speed` (get / set / measure / reopen; `set` saves `sketch.speed`, sends it, and runs the
  scene again on a fresh page when antialias changes). `run()` sends the settings before the layers make their
  renderers. The stats message goes to the chip's watch, `speed-result` is routed, and the ⋯ menu lists the row beside
  Fix my scene.
- `tools/three-speed-hook.js` (in the **lab** group, small): the chip's watch (a few compares per stats message, nothing
  per frame), the glrecover listener, the menu rows, and `/speed-check`.
- `tools/three-speed-core.js` (pure, loads in Node, `SpeedCore`): the per-layer table, the causes, their gains and words,
  the AI's message, and its cost.
- `tools/three-speed.js` (`LabSpeed`) and `tools/three-speed.css`: the card, the fixes and their undo stack, the
  re-measure, the AI help, and safe mode. They are the new lazy group **speedcheck** (tier `use`, after `lab`).
- `tools/three-easy.js`: the ⚡ rows in the ⋯ and ✦ More menus. `tools/three-lab.css`: the chip.
- `lazy-data.js` / `lazy-meta.js` (`node dev/lazy-manifest.js`), the `index.html` lazy-at tag, `docs/lazy-groups.md`.
- `dev/smoke.js`: `smoke({ loadwait })` gives a check `dev/loadwait.js`'s snapshot and verdict, so the check can judge a
  timing load-aware.

No prompt, MCP tool or guide changed (0 tokens). The first screen: 62 scripts, 1581 KB (budget 1586 KB).

## The gains are estimates

The card's "+N fps" is a rough estimate from the measured frame:
- pixels: the frame is taken as 60 % pixel-bound;
- antialias: about 22 % of it;
- a layer: its measured GPU time × the share cut;
- shadows: the casters' share of that layer.

The number after a fix ("now N fps") is measured, not estimated.

## Tests

One check, **dev/checks/speed133.js** (group `speed133`), on a deliberately heavy fixture scene in the check's own temp
data:
- Backdrop: a full-frame shader at 2× pixels;
- **Particles**: the planted heavy layer, 400k triangles with a Count slider, 2× pixels, antialias, and 3 spot lights
  casting shadows;
- Edge: a white wedge on black, antialiased, which probes the still's edges.

It covers:
1. **The chip** appears after 5 s of slow playing, beside the stats line, with ✕.
2. **Why?** opens the card. It ranks **Particles first** (by its GPU time with it left out), and lists "'Particles' draws
   400k triangles: cut to 100k", 2× pixels and antialias.
3. **Preview at 1× pixels**: the card's own re-measure shows the fps rising. This is judged relatively, and load-aware
   through `dev/loadwait.js`: a miss while the box waited for a CPU is "can't tell", not a failure.
4. **Turn off antialias for the preview only**: the preview's renderers draw without antialias, and a **still render is
   480×270 with antialiased edges** in the probe corner.
5. **Each fix is one Undo**: antialias, then pixels, one click each; Count 400k → 100k → 400k; shadows 3 → 1 → 3.
6. **✦ Ask the AI** shows the cost first and sends nothing without Send.
7. **Safe mode** after a simulated context loss (`__glRecover.lose`): the chip and the card offer it, the page draws again
   at 1× pixels with no antialias and no shadows, and one Undo puts the settings back.

Runs used `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package` and `flock /tmp/hearth-run.lock timeout 2400 node
dev/run-checks.js --exact …`.

## Results

- `speed133` ✓ (16/16 steps, 6 min). On this box (software GL), the fixture ran at about 2 fps. Particles ranked first
  at ≈ 410 ms of a ≈ 450 ms frame, with Backdrop and Edge near 0. 1× pixels went from 2.2 to 2.5 fps (×1.14), and the
  slider cut from 2.3 to 6 fps. The still was 480×270 with 98 grey edge pixels in the probe corner, while the preview's
  Edge renderer drew without antialias.
- Earlier runs, while it was being tuned, gave ×1.1 to ×1.8 for 1× pixels. One run was below ×1.1 on a box at load
  3.6 of 4 CPUs, and was reported as "can't tell" (the load-aware rule).
- `labload94` ✓, `beat108` ✓ (one timing "can't tell under load", as before) and `labboot` ✓. They ran together with
  the build just before the last one; the changes after it were only inside the speed check's measure and card.
- `node dev/boot-test.js` ✓: 2989 checks passed. First screen: 62 scripts, 1581 KB (budget 1586 KB).
- `node dev/lazy-manifest.js --check` ✓.

## Risks / not done

- The GPU time per layer comes from leaving the layer out for a moment. On a screen that caps the frame rate (vsync),
  a layer can't show more gain than the cap allows. On this box, with software GL, the absolute numbers are low; the
  check judges only relative gains.
- "No antialias" applies to renderers made after it is set, so the Lab runs the scene again on a fresh page (about a
  second). A recording made inside the preview (not an export) draws at full size but keeps the preview's antialias
  setting.
- Shadows "keep 1" keeps the lights with the biggest shadow maps. A scene that sets `castShadow` every frame fights it.
- A filter's half size is all filters (as Light mode's), not one filter.
- Post-processing inside a layer's own code (an EffectComposer bloom) has no preview-only fix here. The card names it
  and offers the AI.

## For the patch notes

- **Lab: "Why is this slow?"** When a scene plays under 50 fps (or under half your screen's rate) for 5 seconds, a small
  "Slow: 21 fps · Why?" chip shows above the stats line. Click Why?, or pick ⚡ Speed check in the toolbar's ⋯.
- The card measures your scene for 3 seconds on your computer, with no AI and no tokens. It shows the top 3 reasons in
  plain words, each with a one-click fix and how much faster it should get. For example: "Preview at 1× pixels (+40 fps,
  renders unaffected)", "Turn off antialias for the preview only", "'Particles' draws 400k triangles: cut to 100k" and
  "Shadows on 3 lights: keep 1".
- The preview-only fixes never touch your renders: exports still draw at full size with smooth edges. Every fix is one
  Undo, and the card measures again after each one to show the new fps.
- ✦ Ask the AI to optimise a layer sends the measured numbers to the Three Director, only when you click, with the cost
  shown first.
- If the graphics card drops the preview, the Lab offers **Reopen in safe mode**: 1× pixels, no antialias and no
  shadows, one Undo to go back.

## For Codex

Nothing. No Codex-owned file was touched (no astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-* or engine-watch).
