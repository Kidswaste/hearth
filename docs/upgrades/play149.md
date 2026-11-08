# What still made heavy scenes lag while they play (round 149, play149)

The owner (RTX 4080, 240 Hz), after round 142: playback is "smoother(ish, still laggy overall on heavy scenes)". This
round profiled heavy fixtures playing, in the preview page (iframe) and in the Lab window (parent), and cut the
biggest measured costs. **All numbers are from this box's software GL (SwiftShader, 4 CPUs, often loaded): compare
rows with each other, never with an RTX 4080.**

## How it was measured

Probes through the checks' CDP bridge (`dev/smoke.js`), with the heavy scene playing its song:
- CDP `Profiler` (250 µs sampling) on the preview target and on the window: self / inclusive JS per function;
- CDP `HeapProfiler.startSampling` (objects collected by minor / major GC included): allocations per function;
- CDP `Performance.getMetrics` on both targets: main-thread ms a second (TaskDuration, Script, Style, Layout);
- a light trace (`toplevel`, `v8.gc`, `devtools.timeline`) of every process: busy ms per thread, GC;
- `invalidationTracking` trace of the window: what restyles / lays out / repaints while it plays and why;
- the preview's hitch map (`__labHitch`): frame gaps.

Fixtures: smooth142's heavy layers (2× pixels, 6,000 instances, three 512 px shadow lights) plus a song with a ⚡ kick
trigger, then play149's fixture (below), and realscene-lib's demo scene (on SwiftShader at 480×270 with 30k particles it
hung the page past Safe open's 15 s, so it could not be profiled usefully here).

## The cost breakdown (before this round)

smooth142 fixture + song, 480×270, 8 s of play (probe):

| Where | Force high | Smooth (step 7) |
|---|---|---|
| preview fps / p50 / p95 / p99 | 4.7 / 200 / 367 / 400 ms | 9.5 / 67 / 183 / 200 ms |
| GPU process main thread (trace) | 953 ms/s (saturated) | — |
| preview page main thread | 26 ms/s (≈ 5 ms a drawn frame) | ≈ 3.7 ms a drawn frame |
| · of which JS in layer frames (three.js render) | 50 ms / 8.6 s | 66 ms / 8.5 s |
| · of which shadow map passes (`WebGLShadowMap.render`) | 11 ms (≈ 20 %) | 30 ms (≈ 45 % of render) |
| · Lab's own per-frame JS (compositor tick, pacing, song clock, triggers, stats) | ≈ 0.25 ms a frame | ≈ 0.25 ms a frame |
| · GC (V8, the page) | ≈ 3 ms/s | ≈ 2 ms/s |
| preview allocations | ≈ 260 KB/s, mostly three.js math temporaries (sampled; each a few bytes a call: no boxing bug, checked with 100k-call loops) | ≈ 200 KB/s |
| Lab window main thread | 26 ms/s wall, JS ≈ 3 ms/s | similar |
| postMessage traffic | stats 1 / s while playing (round 142); no per-frame messages | |

What it says:
1. **The GPU work is the bottleneck**, and the preview's JS is small: the Lab's own overhead is ≈ 0.25 ms a frame, the
   layers' three.js work ≈ 1 ms, the rest of the page's main thread is GL submission. GC and allocations are minor.
   (The candidates "shadow maps only when they move", "frame gate on fast screens", "per-frame allocations",
   "stats ≤ 1/s", "occlusion" were already done by rounds 50, 60, 74, 107, 142.)
2. **A layer's own EffectComposer never followed Smooth.** Smooth lowers a renderer's pixel ratio; three's
   EffectComposer keeps the ratio it took when it was made, so its scene pass and every UnrealBloomPass mip stayed at
   full size. play149's fixture: with Smooth held at step 7 (50 %), the canvas was 480×270 but the composer's targets
   960×540, and **Smooth at its lightest was no faster than Force high** (1.9–2.1 fps both). Glow via EffectComposer
   is what the Bloom template, the node editor's post effects and most AI-written scenes use. Reverse case too: a
   composer made while Smooth was low stayed soft after Smooth climbed back.
3. **Moving shadows are drawn every frame even at Smooth's last steps**: maps shrink to 25 % there, but the casters
   are drawn once per light per frame whatever the map size (vertex / draw-call bound on a real GPU).
4. **The Lab window while playing**: the round-143/148 decorations really are paused (`html.lab-playing`; checked with
   `getAnimations()`: ih-pulse, ih-sweep, lk-glint, lk-breathe all `paused`). Two things still ran per frame:
   - the beat light (`mb-beat` / `mb-down`, 160 ms per beat) animated `color` + `text-shadow`: a restyle, a layout
     ("Style changed" on its text) and a repaint every frame of every flash (≈ 13 layout invalidations / s);
   - the timeline's `tick` ran on every screen refresh (240 / s on the owner's screen), placing playheads 120 / s for
     a preview capped at 60.
   The playheads' Web Animations (transform) and the dot grid / scanlines are composited and static: no repaint.
   No `backdrop-filter`, `filter` or blend layer sits over the preview.
5. **Process / GPU priority**: the preview is its own renderer process (separate pid in every trace); window work does
   not block its frames. OffscreenCanvas / worker rendering: not feasible this round without breaking the scene API
   (layers create `WebGLRenderer`s on DOM canvases, read `innerWidth`, the DOM, `tweak()`, the song); not attempted.

## What changed

- **`tools/three-sandbox.html` · the composer follows the preview's resolution** (`CPX`, loaded only when a layer's
  code names `EffectComposer`): before each `composer.render()` its ratio is set to its own share of the renderer's
  ratio now (the share it had at its first render, or the one its code set with `setPixelRatio`, against the scene's
  own ratio). At full quality that is exactly the ratio it had: Force high quality and full-quality frames draw as
  before. Lighter steps resize its targets once per step. Never on the export page (renders unchanged), in ▶ Play, or for
  a composer on its own render target (lab3d's sizes itself).
- **`tools/three-sandbox.html` · moving shadows at half rate at Smooth's deepest steps** (`shHalf`): only in Smooth, while
  adapting, at a step that already shrank the maps (steps 6–9), for a scene "moving all the time" (round 50's gate):
  maps every other drawn frame. Never in Force high / Balanced, at full quality, in renders or ▶ Play A/B frames.
- **`tools/three-media.js` · the timeline tick ≤ 60 a second on a fast screen while playing** (`TK`): the screen's frame
  is averaged from the tick's own gaps; under 10 ms the tick's work is skipped until 1/60 s since the last worked tick
  (120 Hz → 60, 144 → 72, 240 → 60); playheads placed on each worked tick (they glide on the compositor between). Not
  with the click track, while dragging or recording. `LabPlay.tickInfo()` / `tickOff()` for checks.
- **`tools/three-lab.css` · the beat light flashes with `filter`** (brightness + drop-shadow, compositor-animated) instead of
  `color` + `text-shadow`.
- `window.__labPlay149.set({ off | composer | shadows })` / `.info()`: the checks' A/B switch and counters.

## Before / after (play149's fixture)

`dev/checks/play149.js`: **Glow** (EffectComposer + RenderPass + UnrealBloomPass + OutputPass, 2× pixels, 12 tori) and
**Particles** (smooth142's, the 6,000 instances and three cubes casting shadows from three spot lights, all moving), a
124 BPM song with a kick trigger, 480×270. Each row is 6 s of play; "before" = the round's savings switched off in the
same run (the composer back at its full-quality ratio, shadows every frame), interleaved off / on / off / on, medians.
Smooth is **held at step 7** (50 % resolution, shadows 25 %) in both, so the rows compare the cost of the same picture.

Run 3 (`c3`, load average 3.9–4.4 on 4 CPUs):

| Row | fps | p50 ms | p95 ms | p99 ms | dropped / s | GPU ms / frame | preview main ms/s | window main ms/s | preview alloc KB/s (KB/frame) |
|---|---|---|---|---|---|---|---|---|---|
| Force high | 2.0 | 500 | 550 | 550 | 58.0 | 460 | 7.2 | 12.7 | 92 (47) |
| Smooth step 7 · **before** | 1.9 | 483 | 783 | 783 | 57.8 | 422 | 10.8 | 10.3 | 116 (55) |
| Smooth step 7 · composer only | 2.1 | 450 | 850 | 850 | 57.9 | 484 | 9.5 | 12.1 | 106 (54) |
| Smooth step 7 · **after** | **3.1** | **250** | **567** | **567** | 56.9 | **319** | 9.0 | 13.7 | 106 (38) |

Run 2 (`c2`, before the crowd cast shadows, so the composer was the main GPU cost): before 2.1 fps, p50 467 ms,
466 GPU ms / frame → after **3.2 fps, p50 217 ms, 302 GPU ms / frame (0.65×)**.

- Same Smooth step: **+50–60 % frames**, typical frame **≈ 2× shorter** (p50), GPU work per frame **0.65–0.76×**.
- Before, Smooth's step 7 was no faster than Force high on this scene (1.9 vs 2.0 fps); now it is 1.6× faster.
- Which saving matters depends on the scene: with a cheap shadow setup (run 2) the composer alone made the gain; with
  6,000 shadow-casting instances × 3 lights (run 3) the shadow passes dominate and the composer alone did not show.
- "dropped / s" barely moves: software GL is far from a 60 fps budget at any step. On a real GPU this headroom is what
  lets Smooth stay at a sharper step.
- Composer targets (Smooth step 7): before 960×540 under a 480×270 canvas → after 480×270. Force high: 960×540 on and
  off (identical). Shadows at step 7: 7 of 14 frames drew maps (0.5); Force high: 10 of 10.

The Lab window (Performance metrics, 5 s each, 60 Hz Xvfb so the tick saving can't show here):

| | main ms/s | style ms/s | layout ms/s | layouts / s |
|---|---|---|---|---|
| old beat-light keyframes + tick every frame | 14.1 | 2.9 | 1.2 | 3.6 |
| this round | 16.2 | 5.5 | 1.3 | 2.6 |

Within noise at 60 Hz (the beat flash's layouts went 3.6 → 2.6 / s; the window is already light here, well under the
150 ms/s bound). On a fake 240 Hz frame clock the tick worked **61 times a screen second (was 217)**.

## The check

`dev/checks/play149.js` (group `play149`): composer (Smooth step 7: targets follow the canvas, were full size with the
switch off; Force high: full size, same on and off) · shadows (step 7: ≤ 60 % of frames draw maps; Force high: all) ·
measure (same step A/B: GPU ms / frame ≤ 0.85× and fps not lower; load-aware "can't tell") · window (no running
animation needing the main thread while playing, the beat light a filter, ≤ 150 ms/s main thread, load-aware) · tick
(fake 240 Hz clock: ≤ 65 worked ticks a screen second, ≥ 180 with `tickOff`).

## Not done / notes

- Composers that size their own render targets (`new EffectComposer(renderer, rt)`) and hand-rolled post chains with
  `WebGLRenderTarget(innerWidth * devicePixelRatio …)` keep their size; lab3d sizes its own composer already.
- Half-rate shadows can show a one-frame trail on fast-moving shadow casters, only at Smooth's last steps.
- The 60 fps tick limit uses the tick's own frame gaps; a window dragged between a 60 Hz and a 240 Hz monitor adapts
  within ~20 frames.
- Worker / OffscreenCanvas rendering: see point 5 above.

## For Codex

Nothing. No Codex-owned file touched.
