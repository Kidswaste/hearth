# Round 60: Hearth's own garbage per frame, in ▶ Play and the Lab preview (gcchurn60)

At 240 Hz a frame is 4.2 ms, and a minor garbage collection (a "scavenge") of a few ms is a visible hitch. The game's
own allocation sets how often one comes; everything Hearth allocates per frame on top brings the next one sooner. This
round measured what Hearth's own code allocates per frame while a game plays, in both places the owner plays Clink
(the ▶ Play window and the Lab preview), and removed nearly all of it without changing what anything does.

Nothing looks or behaves differently. No new setting, nothing added to any prompt (0 tokens), the same code on Mac and
Windows.

## How it was measured
- **V8's sampling heap profiler over CDP** (`HeapProfiler.startSampling` with `includeObjectsCollectedByMinorGC` and
  `…ByMajorGC`: every allocation, including what dies young, not only what survives), in the game's own page (▶ Play,
  through dev/smoke.js `pageCdp`) and in the Lab preview's page (its own process). Each sampled allocation goes to the
  deepest JavaScript frame that has a script: Hearth's (`/__playbudget-page.js`, `/__gamestream-page.js`,
  `/__gameaudio-page.js`, `/__gameready-page.js`, the look and the chip's code put in the game's world by
  `gamelook-preload.js` / `game-preload.js`, and `tools/three-sandbox.html` in the Lab) or the game's (its page, its
  layer code, three.js). Divided by the game's own frames in the window.
- **Minor GCs and their pauses** from `--js-flags=--trace-gc` (line-buffered), per renderer process, between two forced
  full collections that frame each measuring window; 20 s windows for the table below.
- **The browser's own start of frame.** On a WebGL page the browser allocates ≈ 400 B at the start of every frame, and
  the profiler books it to whichever JavaScript runs first in that frame: the budget watch's frame callback in ▶ Play
  (it reads 400–2500 B a frame), the frame wrapper in the Lab. Proof: an empty function that runs before every frame
  callback (a CSS animation's `animationiteration` listener) took the 400 B and the watch fell to ≈ 20 B; on a plain
  2D page the watch reads 22 B. The check puts that empty function in both pages and counts what lands on it apart.
- **Games**: in ▶ Play the throwaway game of `dev/fixtures/gamefps54-game.html` ("heavy": shadows from three lights,
  6 projectiles a frame with cloned materials, sparks, decals, live textures, 2000 particles: ≈ 8 frames a second
  here, so every frame is a "long animation frame") and a light game doing the same kind of steady work with short
  frames (≈ 55 fps here, like the owner's 240 Hz: projectiles with cloned materials, a spark group every 3rd frame, a
  decal on a fresh geometry every 4th, a data texture rewritten every frame); Best look + loads during play + the sound
  part, and round 53's ▶ Play ("off": the game ≈ alone). In the Lab: labplay55's Clink-like game layer and its HUD
  layer (≈ 28 fps here).
- Before = this round's base (8c44c9c) run from a copy of its tree with the same check; this machine: 4 shared CPUs,
  software GL.

## Before → after (bytes a frame of Hearth's own code; the game's own beside it)
| Window | Before | After | The game's own | Hearth's share |
|---|---:|---:|---:|---|
| ▶ Play, light game, Best (look + loads during play + sound) | 2,846 | **171** | ≈ 116,000 | 2.4 % → 0.15 % |
| ▶ Play, light game, off (round 53's) | 159 | 47 | ≈ 117,000 | |
| ▶ Play, gamefps54 game, Best | 7,395 | **1,240** ¹ | ≈ 210,000 | 3.4 % → 0.6 % |
| ▶ Play, gamefps54 game, off | 499 | 456 | ≈ 212,000 | |
| Lab preview, labplay55 game + HUD | 18,126 | **774** | ≈ 170,000 | 9.8 % → 0.44 % |

¹ 691 B of it is the sound part's Long Animation Frames watch receiving an entry every frame: here every frame of
that game is ≥ 50 ms; at 240 Hz a frame is a long one only when it's a hitch, and with short frames the same watch
reads 0.8 B.

At the owner's 240 Hz, before: the Lab preview's own garbage alone was ≈ 4.3 MB a second (18 KB × 240), a scavenge
every few seconds caused by Hearth alone; after: ≈ 0.19 MB a second, and less once the page's code is optimised (most of
what's left is code this slow machine still runs unoptimised: a number read from an object is boxed there).

**Minor GCs per 10 s** (count / total pause, 20 s windows; the same before and after within this machine's noise,
because the game's own 116–210 KB a frame sets the pace): ▶ Play light Best 6.9 / 52 ms → 6.2 / 54 ms; light off 6.2 /
58 ms → 6.9 / 60 ms; heavy Best 5.5 / 20 ms → 6.4 / 22 ms; heavy off 6.7 / 28 ms → 6.6 / 23 ms; Lab 7.1 / 58 ms → 7.1 /
53 ms. Hearth's part of them, by its share of the bytes: Lab ≈ 0.70 → 0.03 minor GCs per 10 s; ▶ Play Best ≈ 0.17 →
0.01 (light game), ≈ 0.19 → 0.04 (heavy). A game that allocates little (a pooled, careful one) is where Hearth's part
mattered most: its GCs were then mostly Hearth's.

## What was allocating, and the fix (nothing behaves differently)
### ▶ Play (the game window)
| Where | Before | Fix |
|---|---|---|
| Loads during play, objects the game adds (`take`, `add`) | a `Map` of added objects grown / shrunk / rehashed every frame, an `[o, at]` pair per entry, `Set.clear()` (a new table each time) for each object's materials and pictures, a new `Map` per fresh geometry, the material "kind" built as text (≈ 0.5 KB) for each decal: ≈ 2.3 KB a frame | kept lists emptied by count (`FO` / `FT`), small kept sets (`kset`: a list searched by hand, a real `Set` past 32), one small record per geometry, the kind as two 26-bit hashes of the same parts (one number); three's property entries not made early (`has()` first) |
| Loads during play, uploads (`texImage2D` / `texSubImage2D`) | `...a` made an array on every upload (a canvas / data texture rewritten every frame) | strict pass-through: only `apply` touches `arguments`; copied only for an upload Hearth may change |
| The sound part's Long Animation Frames watch | a `[start, duration]` pair per long frame, a copy, a `map`, a `sort` per entry | typed rings, the median sorted by hand into a kept array |
| Getting ready's retired upload counter (stays under loads during play's wrapper) | `...a` per upload, for good | strict pass-through |
| The look (`gamelook-preload.js`) | an `arguments` object per `render()`, a new arrow per added group (`traverse((ob) => …)`), the adds list let go and made again every frame (`length = 0`) | `render(scene, camera)` passed on as they are; one kept visitor; the list kept and emptied by count; `add` / `attach` strict pass-through |
| Every helper's running total (`SP`, the watch's own time) | a fractional number stored into a closure variable: a new heap number per hook per frame | a `Float64Array` slot written in place |

### The Lab preview (`tools/three-sandbox.html`)
| Where | Before | Fix |
|---|---|---|
| The still check's signature (`paceCore`) | its two hashes in closure variables (an int32 outside the small-integer range is a new heap number: ≈ 2 per number hashed), each number handed to `v()` (boxed when not inlined), a property added to every new material / geometry (its property storage copied): ≈ 15 KB a frame | the hashes in an `Int32Array`, numbers through a `Float64Array` (`SB`, `vb(n)`), the pass marks in a `WeakMap` (the game's objects keep their shape) |
| Per render | a new closure for the signature (`sigOf`), for the shadow gate (`sig`), for the adaptive cap (`capInstead`); `toFixed()` for the pixel ratio every render | kept functions (`paceSig`, `shSig`, `adCapInstead`); the rounding made again only when its inputs change |
| Per frame | `for … of layers.values()` iterators (compositor, occlusion plan, filter plan); the frame timings (`frameMs`, `frameWork`, `worstGap`, `lastFrameAt`) as module variables; the work ring pushed and shifted; layer frame ids as negative halves (a heap number each); the layer / merged-layer frame queues emptied with `length = 0` / `splice(0)` (made again by the next push) | `forEach` with kept callbacks; one `Float64Array` (`FT60`); a typed ring; ids as small negative integers (≤ −2^29; cancel tells them apart); queues by count |
| The upload counter, OrbitControls' `update` wrapper | `...a` per call | strict pass-through |
| Twice a second (stats, the pace meter) | `Array.from` + comparator sorts | sorted by hand into kept typed arrays |

Left (documented, small): a game that asks for each frame with a new function (`requestAnimationFrame(() => f())`, the
labplay55 HUD) still gets a small wrapper per frame from the layer runtime (≈ 100 B; the game makes its own closure each
frame anyway); the stats message twice a second; numbers boxed by code this machine hasn't optimised yet.

## The check: `dev/checks/gcchurn60.js` (group `gcchurn60`)
- ▶ Play (the light game, Best: look + loads during play + sound) and the Lab preview (labplay55's game + HUD): Hearth's
  own bytes a frame **≤ 256 B in ▶ Play, ≤ 1,024 B in the Lab** (after: 165–175 B and 670–775 B here; before: 2.8–3.6
  KB and 18–22 KB). The Lab's budget is wider because the HUD layer's new-function-per-frame pattern and code this
  machine runs unoptimised at 28 fps (a look at the scene every 32 frames) are in it. The browser's start-of-frame allocation is caught by an empty first-in-frame function and counted
  apart.
- **Self-test** in both windows: a pretend Hearth hook around `render()` that allocates ≈ 800 B a frame (a copy of the
  arguments, a scratch list, a label, a closure kept: the kind of thing this round removed) must be seen (≥ 400 B on its
  own) and push Hearth over the budget.
- `GC60_HEAVY = 1` also plays the gamefps54 game off / Best, `GC60_OFF = 1` the light game off, `GC60_REPORT = 1` reports
  without failing, `GC60_SEC` the window (8 s).

## Tests
- `node --check` on every changed script (the preview page's three scripts extracted), the check body compiled.
- Unit: labpace-test, gamefps54-test, gamehooks55-test, playbudget-test, readyspeed-test, shadowready-test: pass.
- Under the shared lock (`flock /tmp/hearth-run.lock`, ≤ 5 a hold): **gcchurn60 pass** (▶ Play 165 B, Lab 670 B; both
  self-tests caught at ≈ 810 B), **gamefps54 pass**, **playbudget pass**, **framepace57 pass**, **labplay55 pass** (×2),
  **labcanvas56 pass** (×2), **lazy pass**, **unit:boot-test pass**, unit:labpace-test pass.
- **playlatency** fails one step, "HTML game: /game latency → the next frame", in both runs (the HTML game drew at 20 fps
  under the machine's load: verdict "late, the game's frame is the limit"); **the base (8c44c9c) fails the same step the
  same way** (15 fps). Every other step passes (the Lab scene's one canvas, real input in the next frame, no keydown
  listener of Hearth's, the chip). A timing failure under load: noted, not a regression.
- An earlier gcchurn60 run read the Lab at 1,136 B: the pace meter's twice-a-second sort of 240 fractional gaps, run
  unoptimised, boxed every value it read; it keeps whole microseconds now (the run after: 670 B).

## Edits outside the lane
`dev/run-checks.js` (the `gcchurn60` group; the name in the list that gets `HEARTH_THREE_DIR`). The page scripts changed
belong to earlier streams (gamestream, gamelook, gameaudio, gameready, playbudget, the Lab preview): each change is local
and keeps the same behaviour.

## Risks
- Loads during play: a game's material kind is now two hashes instead of text; two different kinds colliding (≈ 1 in
  2^52) would let the game's own first draw compile that one (as without Hearth). The same object added twice in a frame
  is looked at twice (the second finds it known).
- The Lab's layer frame ids changed from negative halves to whole numbers ≤ −2^29 (`cancelAnimationFrame` routes both).
- The still check's hash values changed (same inputs, grouped differently): it only ever compares a scene with itself.

## For the patch notes
- Playing your game is lighter on memory: Hearth's own helpers in ▶ Play used to leave 3–7 KB of garbage every frame
  for the browser to clean up; now it's about 0.2 KB.
- Playing a game in the Lab preview leaves about 25× less garbage per frame (18 KB → under 1 KB), so the browser's
  memory clean-ups — the short pauses that show as a hitch at 240 Hz — come from your game, not from Hearth.
- Nothing looks or works differently: the same frames, the same checks, the same helpers.
- Hearth also stopped tagging your game's materials with a marker of its own while it watches whether the picture
  changed, so your game's own code keeps running at full speed.
- A new check keeps it this way: it fails if Hearth ever starts allocating per frame again.
