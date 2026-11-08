# Performance pass (round 151, perf151): what Hearth really costs, two bugs, and the safe wins

The owner: "with a lot of apps in the background it is un-runnable again … is there a technical limitation or bloat
that is making the app lag a lot?" (right after round 150's hide-on-idle stage; a hotfix had already turned the
reactive stage's colour reading off by default).

This round measured the whole app as he uses it, ranked what costs, fixed the safe parts, and found two real bugs.

## How it was measured
- **`dev/perf151-measure.js`** (a smoke.js script, not a check): `node dev/smoke.js --fake-engines --script
  dev/perf151-measure.js [--burn 3] [--app <copy>]`. Every process from `app.getAppMetrics()` (CPU ms per second,
  memory, count), the window's and the preview page's CDP `Performance.getMetrics` (task / script / style / layout),
  the window's wakeups by where they were asked for (timers, frames, idle callbacks, observers: counters installed
  before the app's scripts), the main process' timers, a 3 s timeline trace (frames, paints, layerize), the CSS / Web
  animations running (seen or not), and the compositing suspects on screen (backdrop-filter, blur / drop-shadow
  filters, will-change: count and area).
- **Setups, the owner's look (Forgeheart)**: a project chat open, idle · the Lab with realscene-lib's "real scene"
  (the Beat burst demo, a glTF model, a raw rAF rig, bloom, a 124 BPM song) playing at 960 × 540 · the same stopped,
  nobody using Hearth (the scene still moves) · the same at 256 × 144 playing (closer to the frame rate a real card
  gives) · Hearth hidden in the tray after the Lab.
- **Busy PC**: the same with `--burn 3` (three CPU-burning processes on this 4-CPU box, normal priority: harsher
  than "low-priority" background apps). GPU contention can't be simulated here.
- **Before** = round 150 + hotfix (0262635) as a copy (`--app`), run in between the "after" runs on the same box.
- **This box**: 4 shared CPUs, software GL (SwiftShader: the "GPU process" is CPU drawing the scene), 60 Hz Xvfb.
  So the GPU process' huge numbers are the scene's drawing; on the owner's RTX 4080 that work is on the graphics card.

## The ranked cost table (ms of CPU per second; 1000 = one full CPU core)

Calm box (`--burn 0`), before → after:

| # | What | Before | After | Notes |
|---|---|---:|---:|---|
| 1 | **The Lab's scene being drawn** (GPU process, software GL) — playing / stopped | 3,321 / 3,395 | 3,329 / 3,525 | Inherent: it is the scene. Stopped, a moving scene drew exactly as much as playing. After: it rests at 30 fps when nobody uses Hearth (see fix 3); this software GPU only reaches ~10–15 fps here, so the cap can't show in ms on this box — on a real card it halves the work (60 → 30 frames) |
| 2 | **The Lab window's main thread, playing** | 67 | 62 | Timeline tick (≤ 60 / s on a fast screen since round 149), beat tick 2 / s, three page-wide observers ~2 / s each, the usage pass 0.7 / s (gone) · style 12 → 9.5 ms/s |
| 3 | **The scene's own JavaScript** (the preview page) | 46 | 43 | The scene's code; not Hearth's |
| 4 | **The Lab window, stopped, nobody using it** | 31 | **17** | Six endless ambient loops of the Lab look kept running through the hush (each makes the compositor draw the window on every screen frame: 240 / s on his screen) → paused; the usage pass gone |
| 5 | **Hearth hidden after the Lab** (all processes) | 18 | 14 | The stage's label writer kept ticking while hidden (0.7 / s, throttled; 4 / s while seen) → stopped. Left: the audio service 4–7 (an open sound output while stopped), the preview page 4 |
| 6 | **A project chat open, idle** (all processes) | 3 | 5 | Next to nothing (noise: 2–5 across runs). 0 window wakeups, main process 6 timers / min |

Busy box (`--burn 3`), before → after:

| What | Before | After |
|---|---:|---:|
| Scene drawing (GPU process), playing / stopped | 1,823 / 1,786 | 1,772 / 1,743 (fair share of 4 CPUs) |
| Lab window, playing | 45 | 31 |
| Lab window, stopped and idle | 21 | **12** |
| Hearth hidden (all) | 14 | 14 |
| Chat idle (all) | 4 | 3 |
| Preview frames / s (heavy scene, software GL) | 6.2 | 6.2 |

Wakeups and the rest (calm, before → after): Lab stopped & idle: endless animations running **6 → 0** · usage
decorate passes **0.7–0.8 / s → 0** · hidden: hudstage label interval **0.7 / s → 0**, window wakeups 1.3 → 0.8 / s.

Memory and processes (unchanged): chat idle **4 processes, ~630 MB** (main 195, window 180, GPU 180, network 75) ·
with the Lab **7 processes, ~1.13 GB** (+ GPU 320, the preview's own renderer 165–175, audio 70, tracing 55).

Startup (unchanged): the first screen ready ~0.25 s after the page loads · first screen **1,539 KB** of code
(boot-test budget 1,547) · the Lab open 0.2–0.45 s · its preview's first frame 2.8–3.5 s (calm) / 4.2–5.2 s (busy),
software GL compiling shaders.

Throttling: Hearth's window has `backgroundThrottling` on (it rests when hidden); the hidden preview is parked (0
frames); unfocused, Auto fps already holds the preview at 30; a modal dialog 30; a render rests it. Windows that turn
throttling off on purpose: ▶ Play, the Stage window (until minimized), offscreen helpers (board snapshots, deploy
check) — each only while used.

## The two bugs found
1. **Round 150's hide-on-idle: the controls stayed hidden after a quick flick into the corner.** The preview page
   sends the pointer ≤ 8 times a second; a move that ended inside one 120 ms step was dropped, so the Lab kept the old
   zone ("mid") and the view controls never came back (3 of 3 flicks in the check, before). Now the last position is
   always sent at the end of the step (`tools/three-sandbox.html`, "stage150").
2. **The timeline could stay frozen for a whole song.** If play began while the timeline's canvas had no size yet (a
   song loading as the bar opens), the tick parked itself as "off screen", and its watcher only restarted it when the
   canvas' visibility *changed* — it never did, so the playheads and timeline stood still while the song played
   (reproduced every time in one timing; the race is older than this round). Now it restarts whenever the timeline can
   be seen, and when its size arrives (`tools/three-media.js`).

Also in hudstage's logic: the label writer (4 a second while the controls show) now stops when the preview is out of
view or Hearth is hidden; leaving the view puts the stage to sleep.

## What was fixed (all features kept)
1. Stage labels stop when unseen (`tools/three-hudstage.js`).
2. The pointer's last position always reaches the Lab (`tools/three-sandbox.html`).
3. **Idle rest**: nobody has used Hearth for a minute (idlecpu's hush) and nothing plays: Auto fps eases the preview to
   30, as when another window is in front. Never while the song plays, with live sound, recording, rendering or on the
   Stage window; the first input brings full rate (`tools/three.js`, `idleRest`).
4. The Lab look's ambient loops pause with the hush (`idlecpu.css`: rules only, the look files untouched).
5. The usage pass ignores the Lab's live readouts (`usage.js` NOISY).
6. The timeline tick can't stay parked (`tools/three-media.js`).

## For the Lab look redesign (costly things in the look files — reported, not changed)
- `tools/three-hudstage.css` `.st-glow`: `will-change: opacity` on a layer the size of the whole picture (≈ 580 k px
  here, ~2 M px full screen) carrying inset box-shadows of 60 px and 160 px blur. A permanent big layer; a static
  gradient border, or will-change only while the song plays, would be cheaper.
- `.st-flash`, `.st-rflash`: permanent `will-change: opacity, transform` (only needed while pulsing).
- `.st-br` / `.st-x` / the flash brackets: double `drop-shadow()` filters (5 filtered layers), re-rastered on each pulse.
- `tools/three-lab.css` `@keyframes mb-beat`: a `filter: brightness() drop-shadow()` animation on every beat (2 / s);
  the trace shows it repainting with an unbounded clip (~8 M px recorded per paint). An opacity / transform flash on a
  pseudo-element is cheaper.
- `tools/three-regroup.css`: four endless loops (`ih-pulse`, `ih-sweep`, `lk-glint` × 2, `lk-breathe`) run whenever
  the Lab is on screen and Hearth is in use; now paused by the hush, but they still make the compositor draw every
  screen frame (240 / s) while you work. Consider running them only on hover, or a few times then stopping.
- No backdrop-filter is on screen in either setup any more (earlier rounds removed them).

## For Codex
Nothing: no Codex-owned file was touched.

## Is there a technical limitation or bloat?
**Mostly a limitation, plus a little bloat that's now trimmed.**

- **What's inherent:** Hearth is built on Electron, which is a copy of Chrome. Every Hearth window (the main one, the
  Lab's preview, the graphics part) is its own Chrome process, so Hearth starts at about 600 MB and about 1.1 GB with
  the Lab open. Your 3D scenes are drawn by your graphics card, which is shared with every other app you have open
  (games, browsers playing video, the DAW). When those apps also use the card, a heavy scene gets fewer frames — no
  app setting can make the card do more than it can. Hearth already lowers its own load when it isn't in front (30
  frames a second) and stops drawing when hidden.
- **What was bloat:** small things piled up over many rounds: decorative animations that kept running while you
  weren't using Hearth, labels that kept updating while hidden, a background pass reacting to the Lab's live numbers.
  Each was small; together they kept the computer busier than needed. These are fixed. With a chat open and nothing
  happening, Hearth now uses about half a percent of one CPU core.
- **Two real bugs** made it feel broken after round 150: the Lab's buttons sometimes didn't come back when you moved
  quickly to the corner, and the timeline could freeze while a song played. Both fixed.
- **What to do next, if it still lags:** (1) a stricter **Lite mode** switch: 30 fps preview always, no decorative
  effects or glow, half-resolution preview — one click for busy days; (2) **remove features you don't use** (we can list
  them from your own usage numbers); (3) move **the Lab into its own lighter window**, so the chat side and the 3D side
  don't share one busy window. The biggest single lever is still the scene itself: fewer particles / lights / glow, or
  the Smooth quality setting, frees your graphics card more than anything in Hearth's own code.
