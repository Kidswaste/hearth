# Smooth playback first, with a "Force high quality" switch (round 142, smooth142)

The owner asked: "Focus on making scene playback smooth even if it deteriorates the quality, and let me force the
quality in case i need it to be high." This round makes the Lab preview **smooth-first by default** and adds a
**Force high quality** choice in the existing quality chip. Renders are never touched.

## Before / after

Measured by `dev/checks/smooth142.js` on its own heavy fixture scene (a full-frame shader at 2× pixels, 6,000
instanced particles at 2× pixels with antialias and three 512 px shadow-casting spot lights, and an antialiased edge
layer), playing its own timeline at 480×270. Each mode played 8 s, twice, interleaved (full, light, full, light), and the
table gives the median run. Frame gaps come from the preview's hitch map. "Dropped" counts frames missed against the
preview's 60 fps budget. "Before" is the code before this round (`d6450404`, the same check in its baseline mode).

This box draws with **software GL** and was busy (load average 2.4 to 3.5 on its CPUs, so `dev/loadwait.js` marked the
runs as "busy"). The absolute numbers mean nothing for an RTX 4080. **Compare the rows with each other.**

| Mode | fps | p50 ms | p95 ms | p99 ms | dropped / s | what the preview drew |
|---|---|---|---|---|---|---|
| Before · Quality: full | 4.7 | 183.3 | 366.7 | 549.9 | 54.7 | full |
| Before · Quality: auto (the old default) | 6.1 | 166.6 | 300.0 | 433.2 | 53.8 | the old slow rules: hardly lighter within 20 s |
| After · **Force high quality** | 5.7 | 166.7 | 316.6 | 333.4 | 54.3 | full: 2× pixels, antialias, 512 px shadow maps (checked) |
| After · **Smooth (auto)** (the new default) | **11.9** | **33.4** | **150.1** | **166.7** | 48.1 | level 7 of 9: 50 % resolution, shadow maps at 25 % (the scene has no filters to halve) |

Against the old default, playing with Smooth gives **about 2× the frame rate**, a typical frame **5× shorter** (p50), and
the slowest frames **2× shorter** (p95) and **2.6× shorter** (p99). Against Force high in the same run, the ratios were
p95 0.47, p99 0.50 and dropped frames 0.89. Dropped frames fall only a little here because software GL cannot reach a
60 fps budget even at the lightest step. On a real GPU that same headroom is what keeps 240, 120 or 60 steady.

The UI work during 8 s of play (Smooth run, counted by `LabPlay.count`):

| | before | after |
|---|---|---|
| timeline picture redrawn | 10 / s | 27 to 28 in 8 s (about 3.4 / s, at most 5 / s) |
| playheads placed | every frame | 47 of 95 frames (every other frame) |
| stats line painted | each stats message (2 / s) | 6 to 7 in 8 s (at most 1 / s) |
| stats messages from the preview | 16 in 8 s | 8 in 8 s |
| keyed sliders' readouts | 10 / s | about 3 / s |
| Layers panel rebuilt | 0 | 0 (now counted, and the `LabPlay` hook is there for panel142) |
| shader compiles during play | not measured | 0 in all four runs (the warm pass ran on 3 scenes at play start) |

Recovery: with the load gone, Smooth climbed back from level 5 to full quality in **10 s, one step at a time**
(5 → 3 → 2 → 1 → 0; levels 4 and 5 are the filter steps, and this scene has no filters, so they are skipped), and it never stepped down again on the way.

## What changed

**Smooth (auto), the new default** (`tools/three-sandbox.html`, "smooth playback"):
- It uses the same quality ladder as before (round 31): pixel ratio in steps, then filters at half and then a third of
  their size, smaller shadow maps, fewer particles. It now judges every **20 frames or 0.7 s** (was 45 frames or 1.5 s),
  **before frames drop**. A frame over 1.1× the budget counts as "near" (half a slow one). Render work over 85 % of the
  budget is a tight window even when no frame was missed yet. One tight window steps down, and when frames take over
  2.5× the budget it steps two levels at once.
- **The budget is the screen's rate** (or the frame-rate cap). When frames take more than 1.7× the budget, or the lowest
  resolution is still not enough, it holds **a steady lower rate** (240 → 120 → 60, 144 → 72, never under 50) instead of
  jittering at 170. After a calm stretch, when the work would fit, it tries the faster rate again (the wait doubles
  after each try).
- If it is at the last step and frames are still tight, **the heaviest layer draws every other frame**. This is only for
  a layer that costs at least 30 % of the frame, draws straight to the screen, and that no filter reads. It goes away
  with the first calm window.
- **Antialias off** for the preview: once Smooth has had to go past the resolution steps, it asks for "no antialias" from
  the scene's **next run** (a WebGL context's antialias is fixed when it is made, so it is never switched mid-play).
- **No popping:** a lighter step happens at once (frames are already late). A sharper step waits for a frame that is on
  time and at least 0.6 s since the last change. Climbing back goes **one level at a time**, only after calm windows
  with work under 60 % of the budget (2.5 s at first, longer after a climb that came straight back down).
- **Shaders are pre-compiled at play start.** Every program the layers' scenes need, hidden things included, is compiled
  (`compileAsync` where the GPU can do it in parallel), and their textures are uploaded before the first frame of play.
- **Balanced** keeps round 31's rules exactly as they were. **Force high quality** adapts nothing and sets the scene's ⚡
  preview fixes aside while it is on.
- Renders never see any of it. The export page (`?xp=1`) has adapting off, and stills, screenshots and recordings draw at
  full size (`fullRes`). The check renders a still with Smooth held at its lightest level: full 480×270 with antialiased
  edges.

**Less UI work while it plays:**
- `tools/three-media.js`: the timeline picture redraws 5× a second at most (was 10×), and the playheads are placed every
  other frame.
- `tools/three.js`: the stats line paints once a second at most, and the keyed sliders' readouts update about 3× a
  second.
- `tools/three-sandbox.html`: the preview sends its stats once a second while playing (a ⚡ measure keeps its two).
- **A global "playing" signal**, `LabPlay` (`tools/three-media.js`):
  - `LabPlay.playing`;
  - the `hearth:lab-playing` event (`{ playing }`);
  - the `html.lab-playing` class;
  - `LabPlay.later(key, fn)`: runs `fn` now when paused, otherwise once when play stops (the last `fn` per key).

  **Hook for panel142:** the Layers / Sliders panels (`three-layers.js`, `three-tweaks.js`, not touched here) can wrap a
  full re-render in `LabPlay.later('layers', render)` and skip it while `LabPlay.playing`.

**The choice** (`tools/three.js`):
- `sketch.speed.q` holds the scene's own pick, and `three.quality` holds the global default. An old `three.adapt = false`
  reads as Force high.
- `ThreeLab.quality.get / set / global / why / menu / chip` are there for checks and other modules.
- The ⚡ Speed check card (`tools/three-speed.js`) adds a line with the mode, Smooth's level and why.
- The scene's quality pick is not one of the ⚡ fixes: `ThreeLab.speed.get()` reads exactly as in round 133.

## Where he clicks

- The stats line under the preview shows the quality chip: **Quality: auto** (Smooth), **Quality: auto · 70 %** while it
  draws lighter, **Quality: balanced**, or **Quality: high**. Click it (or right-click it) for the menu:
  **Smooth (auto) · Balanced · Force high quality**. The last line of the menu says whether the pick is this scene's own
  and what the default is.
- The pick is kept **for this scene** and becomes **the default** for scenes that have no pick of their own.
- Pointing at the chip says what Smooth lowered and why (for example "70 % resolution, filters at half size (frames
  dropping)").
- **⚡ Speed check** (⋯ › This Lab, or ✦ More) shows one more line at the top: "Quality: Smooth (auto) · level 4 of 9 ·
  50 % resolution, filters at half size (frames dropping)".
- The right-click › View › **Quality: auto** row still switches between Smooth and Force high quality (as the default).
- ◉ Perform plays at the screen's own rate (as before) and uses the scene's choice: Smooth unless he forced high quality.
  ▣ Present still holds full quality (round 52), as before.

## Tests

One check, **`dev/checks/smooth142.js`**, run with the group `smooth142` (`node dev/run-checks.js smooth142`). Its steps
are measure (the table above, load-aware), warm, render, recover, high and remember. It also runs in a baseline mode on
older code, which is how the "before" rows were made.

The group also runs: speed133, beat108, labchat92, labboot, perform131, seekfix135, `unit:labadapt-test` (the adaptive
core's old rules must still hold: Balanced) and `unit:boot-test` (first screen 1539 KB of 1547 KB).

Last run, all passed. Two batches, plus boot-test on its own:

| Test | Result | Time |
|---|---|---|
| smooth142 | ✓ (12 steps) | 135 s |
| speed133 | ✓ | 355 s |
| beat108 | ✓, but marked "can't tell under load" (its everyBeats p95 timing; the box was busy) | 166 s |
| labboot | ✓ | 88 s |
| labchat92 | ✓ | 109 s |
| perform131 | ✓ | 57 s |
| seekfix135 | ✓ | 236 s |
| unit:labadapt-test | ✓ | 0 s |
| `node dev/boot-test.js` | ✓ 3200 checks, first screen 1539 KB of the 1547 KB budget | |

## For the patch notes

- **Lab: smoother playback by default.** While a scene plays, the preview now lightens itself *before* frames start to
  drop. It lowers the resolution, then halves the filters, then shrinks the shadows. When your screen's full rate is out
  of reach it holds a steady 120 or 60 instead of stuttering, and it climbs back slowly, one step at a time, so you
  don't see the picture jump.
- **Force high quality.** Click the **Quality** chip under the preview and pick **Smooth (auto)**, **Balanced** or
  **Force high quality**. Your pick is kept for this scene and becomes the default for scenes that don't have their
  own. Renders are always full quality, whatever you pick.
- ◉ Perform uses the scene's pick too: smooth unless you forced high quality.
- The ⚡ Speed check shows what Smooth lowered right now and why (for example "50 % resolution, filters at half size
  (frames dropping)").
- Playing is lighter on the rest of the Lab: the timeline and the stats line update less often while the music plays,
  and shaders are prepared when you press play, so a drop doesn't hitch the first time.

## For Codex

Nothing. No Codex-owned file was touched (no astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-* or engine-watch).
