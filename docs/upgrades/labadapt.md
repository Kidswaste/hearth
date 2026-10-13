# labadapt (round 31): the Lab preview stays smooth on any machine

The Lab preview used to have one trick when frames dropped: draw at a lower resolution, down to half. Now it lightens
itself in steps, least visible first, skips drawing what can't be seen, says so in its corner, and climbs back when
there's room. Renders, exports, stills, freezes and recordings are always full quality.

Where it lives: `tools/three-sandbox.html` ("Adaptive quality", `<adapt-core>`, "covered layers"), small hooks in
`tools/three.js` (the note, the right-click switch, `/lab perf` numbers) and `tools/three-lab.css` (the note).

## Measured (dev/checks/labadapt.js, SwiftShader on a shared 4-CPU machine, 640×360 frame, relative numbers)
A deliberately heavy scene: 1500 instanced shapes under an opaque layer with 60 shadow-casting spheres (1024 shadow
map), bloom + grade + vignette over it. Each setting measured twice, interleaved, 5 s each (frame gaps in the preview).

| Preview setting | fps | frame p50 | p95 | p50 vs full |
|---|---|---|---|---|
| Full quality (adapting off, the "before") | 5.3 | 183 ms | 300 ms | 1.00 |
| Only the covered layer skipped | 7.3 | 117 ms | 300 ms | 0.64 |
| Half resolution only (round 5's floor) | 8.5 | 117 ms | 183 ms | 0.64 |
| Lightest step (+ covered layer skipped) | 12.2 | 17 ms | 83 ms | 0.09 |
| On its own (settled at step 5 of 9) | 12.2 | 67 ms | 183 ms | 0.36 |

- GPU particles (16,384 asked): all 16,384 at full quality, 5,734 at the lightest step.
- Renders unchanged: an exported still (the hidden export page) with the preview held at its lightest vs adapting off:
  mean pixel difference **0** (and 0 between two renders with it off). A still taken from the preview while it's
  lighter vs adapting off: **0**; a freeze while lighter vs adapting off: **0**. The lighter preview itself differs by
  1.9 / 255 on average, so the test does see a difference when there is one.
- Climbing back from the lightest step to full quality with headroom: 39 s (one step at a time, passing over steps
  the scene doesn't use).
- The step logic itself costs ~65 ns per frame (Node).

## Upgrades

### It lightens itself in steps
1. **Adaptive quality ladder**: when frames drop for a sustained moment (two slow windows in a row, or one badly slow
   one), the preview steps down one step at a time: resolution 1 → 0.85 → 0.7 → 0.5, then filters, then shadows,
   then particle counts. Nothing to set.
2. **Filters cheaper, never skipped**: bloom, grade, blur, vignette… draw at half their pixels, then at a third. The
   look stays (no filter is turned off).
3. **Shadow maps smaller**: half, then a quarter of the size the scene asked for (never under 128 px); the scene's
   own size comes back at full quality, and a size its code changes later is taken as its own.
4. **Fewer particles**: GPU particle layers draw 60 %, then 35 % of their particles in the preview (they used to
   follow the resolution; now they're the last thing to go).
5. **Steps the scene can't use are passed over**: no filters, no shadows or no particles on screen → those steps are
   skipped, both ways, so the preview never wastes seconds on a step that changes nothing.
6. **Climbs back with headroom**: one step every ≥ 4 s of smooth frames, counted from the last dropped frame.
7. **No flicker (hysteresis)**: a climb that has to come straight back down makes the next climb wait twice as long
   (4 → 8 → 16 → 32 → 64 s); after a climb holds for a minute, climbs are quick again.
8. **Fast screens**: at half resolution a 120 / 240 Hz screen still settles on a steady 60 fps first (Auto fps), before
   the filters, shadows and particles get lighter.
9. Hitches (a reload, the window hidden) never count as slow frames.

### It doesn't draw what can't be seen
10. **Covered layers skip drawing**: a layer fully under an opaque one (whole, normal blend, not moved, its canvas
    covering the frame, a solid background, every sampled pixel opaque, twice in a row) draws nothing; its code still
    runs every frame, so clocks, simulations and camera rigs stay right.
11. **It draws again the frame its cover stops covering** (fades, moves, blends, hides, goes), checked every frame
    without reading pixels.
12. A filter under an opaque layer skips its merge and its pass too.
13. Layers that other layers read always draw: the source of particles, a shader's `layer:` input, physics on a model.
14. Hidden layers, layers at 0 opacity and layers outside their in / out time already skipped their frames; that stays.

### Honest about it
15. **A small note in the preview's corner** while it's lighter: "lighter to stay smooth · full quality in renders".
    Quiet, bottom left; the fps line takes its place on hover; never in Present or full screen.
16. **The off switch**: right-click the preview › View › **Lighten to stay smooth** (on by default, remembered). Off =
    full quality always, nothing skipped, no note. 🪶 Light mode stays the manual option for slower machines.
17. The fps line's "preview NN %" tooltip and the perf HUD (`/lab perf`) say how light it is ("lighter 6/9 ·
    1 hidden skipped"); `/lab perf` reports the step, the knobs and the skipped layers.

### Full quality where it counts
18. **Stills while lighter are full quality**: a still / the director's screenshot of a multi-layer scene used to merge
    the lighter canvases; now every layer draws two frames at full quality first (up to 3 frames' time on a slow
    preview), then the merge. Measured: identical to adapting off.
19. **Freeze lands on a full-quality frame**: freezing while lighter draws one full-quality frame first, so what you
    freeze (and snap) is what a render gives. Measured: identical.
20. Exports, renders, sequence renders and recordings never adapt (the export page, offline steps and recordings
    always draw at full quality). Measured: an exported frame is pixel-identical with the preview at its lightest.

## Tests
- `node dev/labadapt-test.js` (unit group): 26 checks on the step logic run in Node on simulated frame gaps: the
  ladder's order, smooth frames never step, sustained only, settle after a step, unused steps passed over both ways,
  climbing after ≥ 4 s of calm, hysteresis doubling to 64 s and resetting after a held climb, a just-too-slow machine
  making ≤ 14 changes in 3 minutes, the fps-cap floor, hitches ignored, hold / reset, cost per frame.
- `dev/checks/labadapt.js` (lab group, `--fake-engines`, ~170 s): the measurements above, steps down on its own, the
  note, covered-layer detection and uncovering, climbing back (a fast machine played with a test target), particles,
  stills / freeze / export pixel compares, the right-click switch. `sh dev/run-checks.sh labadapt` runs both.

## Edits outside the new files
- `tools/three-sandbox.html` (fx stream's file): the adaptive-resolution block replaced by the ladder (same place,
  same `quality` variable for everything that read it), a 2-line hook in the render wrapper (covered skip, shadow
  size), filter resolution through `fxLow`, the particle share, `requestShot` / freeze through `adFullFrame`, three
  one-line "read by another layer" marks, the stats message, the `adapt` message.
- `tools/three.js` (lab stream): the note, the View menu row, the `adapt` message, `perf().adapt`, `cmd().adapt()`.
- `tools/three-lab.css`: the note's style. `dev/run-checks.js`: the unit test, the check in the lab group, a
  `labadapt` group.

## Caveats
- Only the preview's own knobs are lowered (resolution, filter pixels, shadow maps, GPU particle counts). A sketch's own
  "count" / "detail" sliders are not touched: they're saved with the scene, and changing them would change the scene.
- Covered-layer detection reads 9 pixels of the candidate cover twice a second (one small GPU sync); a cover with
  transparent holes smaller than that grid could hide a layer that should show through a hole (it shows its last frame
  there until the next check).
- A frozen preview's still while lighter uses the frozen frame, which is full quality only if the freeze happened
  after this round (freeze lands on a full frame now).
- Measured on SwiftShader under load; real GPUs will show smaller absolute numbers and the same order.

## For the patch notes
- The Lab preview now stays smooth on any machine: when frames drop, it gets lighter in small steps (resolution
  first, then filters, shadows and particle counts) and climbs back when there's room, without flickering.
- While it's lighter, a small note in the preview's corner says so: "lighter to stay smooth · full quality in renders".
- Renders, exports, stills, freezes and recordings are always full quality: we checked pixel by pixel.
- A layer hidden under an opaque one no longer spends any time drawing; it starts again the moment it can be seen.
- Don't want it? Right-click the preview › View › Lighten to stay smooth. 🪶 Light mode is still there for slower machines.
- In our heavy test scene the preview went from about 5 fps to about 12 fps on a software GPU.
- Caveat: your own sketch sliders (counts, detail) are never changed; only the preview's own drawing gets lighter.
