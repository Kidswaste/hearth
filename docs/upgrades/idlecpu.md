# Idle CPU (round 44, idlecpu): Hearth on screen, nobody using it, next to nothing running

The goal: Hearth in front, on screen, and you're doing nothing (reading, away from the desk, thinking). It should use
almost no CPU or GPU then: quiet fans, a battery that lasts. Powerwise (round 39) did this for Hearth in the
background, and labpace (round 33) stopped a still Lab scene from drawing. This round measures what is still awake
when Hearth sits on screen untouched, in six everyday setups, and puts the wasted work to sleep. Nothing looks or works
differently, except that it's quieter. Nothing is added to any prompt (0 tokens).

## How it was measured
- **New check: `dev/checks/idlecpu.js`** (`sh dev/run-checks.sh idlecpu`; also in the `smooth` group). For each setup it
  lets the last step finish (6 s, plus a garbage collection so the last step's leftovers don't count), then counts
  **10 s of idle**:
  - **CPU time per process**, from `app.getAppMetrics()` (cumulative CPU seconds): the main process, the window, the GPU
    process, the utility processes, the Lab preview's page and the warm Lab page (told apart by the frames each
    process hosts).
  - **The store threads' busy time** (event loop utilization), and on Linux each process's **context switches** over
    all its threads (the kernel's count of wakeups).
  - **The window's own wakeups**: every timer, interval, animation frame, idle callback and observer callback that ran,
    and where it was asked for (counters installed before the app's scripts).
  - **The main process's timers** (powerwise's counter), the CSS animations still running and whether they can be
    seen, and a short timeline trace after the count (frames and paints).
  - **The Lab preview's own page**: frames it woke for, pictures drawn, whether it dozes and what woke it last.
- **Setups**:
  - a chat open (a reply done, nothing streaming);
  - the Lab with a still scene;
  - the Lab with an animated, looping scene, paused;
  - the board with pictures, a GIF and two clips;
  - the grid view with every chat;
  - ◉ Activity open.

  All in the owner's look (Forgeheart).
- **Before** is this round's starting commit (a3341cf) in a copy, with the same check and the same test hook. It was
  run on the same machine in between the "after" runs.
- **This machine**: 4 shared CPUs with load 20–45 (other streams' checks), software GL (SwiftShader: the "GPU" is the
  CPU) and a 60 Hz Xvfb screen. The **counts are the reliable numbers** (wakeups, frames, context switches). The GPU
  process's CPU % swings a lot from run to run here. On a real graphics card all the absolute numbers are smaller, and
  the ratios hold.

## Before → after (10 s idle, per second; after = three runs)

| Setup | The window: CPU · wakeups · ctx switches | The Lab preview's page: CPU · frames · ctx switches | GPU process (software GL): CPU · ctx switches |
|---|---|---|---|
| **A chat open** | 0.1 % · 0.4 · 10 → **0–0.1 % · 0–0.3 · 2–8** | — | 3.4 % · 287 → 0–4.9 % · 0–272 |
| **The Lab, a still scene** | 0.6 % · **15.4** · 48 → **0.1 % · 1.1–1.4 · 7–9** | 3.3 % · **47.8 frames** · 354 → **0.7–0.8 % · 3.8–4 frames · 67–78** | 12.6 % · 676 → **1.9–3.0 % · 126–228** |
| **The Lab, an animated scene paused** | 0.5 % · **15.3** · 46 → **0–0.1 % · 1–1.3 · 8–9** | 3.4 % · **45.2 frames** · 323 → **0.5–0.7 % · 3.8–4 frames · 56–62** | 10.6 % · 760 → **2.0–3.2 % · 136–295** |
| **The board** | 2.1 % (a garbage collection) · 0.7 · 25 → 0.1–0.2 % · 0.5–0.8 · 5–7 | (parked) 0 | 0 % |
| **The grid view** | 0.7 % · 3.7 · 41 → **0.1–0.3 % · 0.9–1.5 · 9–11** | (on screen, not drawn) 0 | 42 % · 2,540 → 0–11 % · 4–660 |
| **◉ Activity open** | 0.1 % · 0.9 · 9 → 0.1–0.3 % · 0.6–0.9 · 5–9 | (parked) 0 | 0.1 % → 0–1.6 % |
| **The main process** (every setup) | 0.2–0.3 % · 12 timers / min → the same (the config safety net, round 39) | | |

What the window's wakeups were, before:

| The Lab on screen, nothing moving | Before | After |
|---|---:|---:|
| The knobs' keyframe follow timer | **10 / s** (even with nothing keyframed, even paused) | 0 (it runs while something can move) |
| The preview's stats (a message, then a frame, then a timer to paint them) | 2 / s × 3 | 0.25 / s × 3 (every 4 s while it dozes) |
| The stall safety check (a timer, then an idle callback) | 0.5 / s × 2 | 0.25 / s × 2 |
| The song / timeline position memory | every 5 s | every 30 s while paused (noted at once when you pause) |
| **The preview's page itself** | **every screen frame** (60 / s here, 120–240 on a fast screen), the scene's code run each time to find the same picture | **4 / s** after 10 s still, **2 / s** after 30 s |
| The safety redraw of a still picture (a full GPU draw) | every second | every second at first, every 4 s once still for 10 s |

Where a still Lab's cost was (the starting commit, one run): the preview page waking every frame was ≈ 3.6 % of a CPU on
its own, even with the scene's loop stopped. On software GL the GPU process's 16 % was mostly the once-a-second safety
redraw (1.4 % without it).

Found quiet already, left as they are:
- **A chat**, **Activity**: no animation runs at rest. What wakes is one-off (the usage memory's debounce, a long-frame
  report).
- **The board**: clips play only while hovered or selected, GIFs show a still picture until hovered (round 7). The
  "2 %" before was one big garbage collection after the board read its clips' vibes, taken after that work.
- **Store threads**: 0 ms busy at rest.
- **The main process**: the config / theme safety net (10 s, round 39) is its only timer. No stat polling, no sync timer
  when sync is off. File watching runs on system events, no polling (round 42).
- **No CSS animation runs at rest** in these setups (the counts were 0), apart from the look's ambient loops: those are
  paused by the hush (below).
- **The caret blinking in a focused text box** is the system's (Linux stops it after 10 s). It wasn't changed.

## Upgrades

### The Lab on screen, nothing moving
1. **A still Lab preview dozes.** When the picture hasn't changed for 5 s (every layer that ran a frame had it skipped by
   labpace's still check), the preview stops waking on every screen frame. Its loops and the layers' frame callbacks run
   together in one real frame every 100 ms. Before, that was 60–240 times a second for an identical picture. Nothing
   dozes while a song or the timeline plays, during live sound, a sequence, a recording, an export, the scene editor or
   a drag. Layers it can't check (2D canvas, raw WebGL) never doze.
2. **It dozes deeper the longer it stays still**: every 250 ms after 10 s, every 500 ms after 30 s.
3. **The safety redraw comes every 4 s** once the picture has been still for 10 s (it was every second, a full GPU draw
   each time).
4. **It wakes at once** to a slider, a message from the Lab, a pointer, a key, a resize or any real change, back to full
   rate in the same frame. A change the scene makes by itself (a timer in its code) shows on the next doze frame,
   within ¼ s in the check, then it runs at full rate again.
5. **The preview's stats line is sent every 4 s while it dozes** (or when the window isn't drawing it at all, like a Lab
   cell in the grid view). It was twice a second, and each one woke the window three times. The "preview stopped
   responding" check still waits 8 s, as before.
6. **The knobs' keyframe follow timer sleeps when nothing can move.** It stops when nothing on the selected layer is
   keyframed, or the player is paused with its playhead where it was for a second. It used to wake the window 10 times a
   second whenever the Lab was on screen. It starts again on play, a seek, a picked layer, a key edit, a click or key in
   the Lab, or showing the Lab.
7. **The preview's stall check runs every 4 s on screen** (was 2 s). A preview that really stops is still told within
   about 12 s (was 10 s).
8. **The song / timeline position is noted the moment you pause.** While paused, the timer behind it looks every 30 s
   (it was every 5 s, to find the playhead where it was). While playing it's every 5 s, as before.

### The window
9. **The hush**: after a minute without a key, a click, a wheel turn or a pointer move in the window, the look's ambient
   loops pause where they are. These are Forgeheart's star dust, floating empty-chat icon, header glints and twinkles,
   and the swirl look's turning rings. An endless animation, even one the compositor runs alone, makes the GPU redraw
   the window every screen frame. The first input plays them on in the same frame. Indicators of something running (a
   streaming reply, a render, sync) never pause. An unread chat's dot stays lit; it only stops pulsing.
10. **Never hushed while Hearth records itself** (a capture), so a recording shows the look as it is.
11. **Tips wait quietly.** When a tip fits where you are but has to wait for the gap between two tips (3 min) or the
    start's calm, the tips queue looks again when it can show (checking at least every 5 s), not every 0.7 s until
    then. Moving to another place, a reply ending or typing stopping look again at once, as before. (A first version
    also slowed the "nothing fits here" look further. The filewatch check caught a Lab line that then waited too long,
    so that part stays at 5 s.)

**11 upgrades.**

## For the next measurer (not counted)
- `dev/checks/idlecpu.js` budgets (over 10 s idle, per setup). `window.IDLE_REPORT = 1` reports without failing;
  `window.IDLE_BUDGET` overrides the numbers:
  - the window ≤ 1.5 % CPU and ≤ 1.5 wakeups / s (2 with the Lab on screen: its stall check and the preview's stats,
    every 4 s each, are a timer plus a frame or idle callback);
  - the main process ≤ 1 % and ≤ 20 timers / min;
  - on the Lab with a still or paused scene, its preview ≤ 2.5 % and ≤ 15 frames / s;
  - plus steps: the preview dozes, its own change shows within a doze step, a pointer wakes it, the knob timer sleeps
    while paused, the hush comes and goes (and never during a recording).

  The starting commit fails 7 budget lines and the knob step. The 7 are, for both Lab setups, the window's wakeups,
  the preview's CPU and its frames, plus the grid's wakeups. An eighth line, the board's CPU, came from a garbage
  collection, before the check collected garbage first.
- `hub.power.test({ metrics: true })` (powerwisemain.js, test copies only): every process's CPU seconds, Chromium's idle
  wakeups, Linux context switches, which page / frame runs in which process, the store threads' busy time
  (`store._threads()`).
- `__labPace.state().doze` in the preview: `{ on, ms, why (what keeps it awake), by / log (what woke it), dozes, wakes,
  flushes }`.
- `IdleCpu.state()`: `{ hushed, idleMs, hushes, wakes, hushMs }`. `localStorage 'idlecpu.hushMs'` shortens the minute
  for checks.
- On a loaded machine a GC or the GPU process's own housekeeping can land in a 10 s window. The check collects garbage
  before counting. Read the GPU % as a trend, the counts as the result.

## Tested
- `node --check` on every touched JS file; the sandbox page's three scripts extracted and checked; the check's two parts
  compiled.
- Unit: `node dev/labpace-test.js` 59/59, `node dev/hintcalm-test.js` 59/59, `node dev/powerwise-test.js` 83/83,
  `node dev/boot-test.js` 1,215 checks (first screen still 72 scripts / 29 sheets).
  - labpace-test failed once on its timing line "a 2000-object signature costs …" at load 30. That code isn't touched
    here, and it passed on the re-runs.
- `idlecpu` passes (3 runs; one earlier run caught the hush step's pointer outside the page, which the check fixed).
  The starting commit fails it as listed above.
- Passed: powerwise, smooth41, motionpolish (×2), hintcalm (×2), filewatch (+ its unit tests), lazy, unit:boot-test,
  a11y (audit `pass: true`), options, settingscalm, missions, labeasy, labsearch, qa-keys.
- **filewatch caught a regression in a first version of the hints change.** A Lab line ("logo.png updated from disk")
  waited too long when nothing fitted the place at first. That part was reverted (see 11), and filewatch passes.
- Failed, and the same on the starting commit under the same load:
  - **labpace**: its frame-time lines ("pacing off draws every frame it can", "the frame rates really differ", "the
    sketch changes itself … within a frame or two", lag 167 ms = one frame at 6 fps). The machine drew 5–8 fps at
    load 15–30. The starting commit failed the same lines back to back (lag 167). The doze can't take part in those
    steps: it starts after 5 s still, and they last ≤ 4.5 s.
  - **appsearch**: "Enter on an AI setup row in a closed fold". The starting commit fails it the same way.
  - **a11y** once: WebGL context loss under load ("Web page caused context loss and was blocked"). It passed on the
    re-run.
  - **smooth41** once: "a long paste: a 144 ms task" at load 30. It passed on the re-run.

## Edits outside this lane (small)
- `tools/three-sandbox.html` (lab / fx): the dozing (next to labpace's pacing), `paceCore.still`'s optional refresh, the
  stats' pace, `__labPace.state().doze`.
- `tools/three.js` (lab): the knob timer, the stall check's pace, the media memory's pace.
- `hints.js`: two schedule lines.
- `powerwisemain.js`: the `metrics` test hook. `store.js`: `_threads()` (tests).
- `lazy-data.js`: the `idlecpu` group and its (empty) manifest entry. `index.html`: `idlecpu` in the lazy-at tag after
  offline.js.
- `dev/run-checks.js`: the check in `smooth`, an `idlecpu` group.

## Caveats
- Measured on software GL under heavy load. A real graphics card makes the GPU process's numbers far smaller to begin
  with. The window and preview counts are what to expect.
- A scene that changes itself after a long still stretch (a timer that fires every few seconds) shows that change up to
  ¼ s (½ s after 30 s still) late, once, then runs at full rate. Anything you do wakes it at once.
- Something a still picture's signature can't see shows within 4 s (was 1 s) once the scene has been still for 10 s.
- The hush only pauses the look's ambient loops; a minute of reading without touching anything pauses the header glint.
  It plays on with the first input.

## For the patch notes
- Hearth is much quieter when you leave it on screen and aren't using it: fans stay down, the laptop battery lasts
  longer.
- A still or paused Lab scene no longer keeps the preview waking up every screen frame. It "dozes" after a few seconds
  (about 4 frames a second instead of 60–240), and wakes the instant you touch a slider, move the mouse over it, press
  play or the scene changes. In our test that's about a fifth of the preview's CPU, and the window's wake-ups fell from
  15 a second to about 1.
- The Lab's knobs stop checking the timeline 10 times a second when nothing is playing.
- After a minute without input, Forgeheart's little ambient touches (star dust, header glints, twinkles) pause where they
  are; they carry on the moment you move the mouse or press a key. Never while Hearth records itself.
- Waiting tips no longer make Hearth look around several times a second; they show when they can.
- Nothing looks or works differently. A new check keeps it that way (`idlecpu`).
- Caveat: a scene that changes by itself after sitting still a while may show that change up to half a second late,
  once.
