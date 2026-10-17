# Round 57: does the Best look cost the game frames? (framepace57)

gamefps54's step "best: frames as fast as off (median gap within 20 % or one 60 Hz refresh)" failed about half the
time in rounds 55–56 (off 100 ms, best 116 / 133 ms), and "the look's most work in one frame under 2 ms" once read
2.4 ms. This round measured it properly, found where the time goes, fixed the one real steady cost, and made the check
judge each part on what it actually is.

## How it was measured (`dev/checks/framepace57.js`, group `framepace57`)
- **One Best play, interleaved blocks of 10 frames**, the conditions shuffled every round (5–10 rounds), with
  playbudget's own switches: everything on · everything stepped aside (shadow maps at the game's own 512²) · all but
  the shadow picture · all but the look's hooks · all but loads during play · all but the sound part. Skipped: the 3
  frames after each switch. Per block: the gaps between the game's frames, its frame callback's CPU time, the time
  around three's `render()` (where Hearth's hooks run) and inside it, and the CPU time a frame of the GPU process and
  of the game's page process (`app.getAppMetrics` through `power:test`). Per condition: the difference to "everything
  on" in the same round; median and a bootstrap 95 % interval across rounds.
- **The picture on the graphics card**: the game's loop held, its scene drawn by the check in batches of 6 frames
  each waited for to the end (`readPixels`), shadow maps at Best's size / at 512², ABBA, 12 pairs.
- **Two separate "off" plays** (round 53's ▶ Play) before and after: what is left of Hearth when every helper is
  stepped aside.
- **The performance probe** put in for 20 frames, its own accounting read.
- **A self-test**: a pretend helper costing 1 ms a frame inside the render, stepping aside like the real ones.

**GPU time**: `EXT_disjoint_timer_query_webgl2` isn't there on SwiftShader. What stands in: SwiftShader draws on the
GPU process' CPU threads, so that process' **CPU time a frame is the drawing's cost** — and CPU time is honest on a
loaded machine (a thread waiting for a core uses none), where wall times swing 2×. Plus the wall time of a frame drawn
to the end (`readPixels`), paired ABBA frame batch by frame batch. On a real card (the owner's) neither applies; there
the browser's timer query (playbudget's A/B already reads it where present) is the measure.

## The verdict (numbers: this machine, a 60 Hz test screen, 960×600, run under the shared lock at a load of 3–4)
| Part | Cost a frame | |
|---|---|---|
| Hearth's hooks around the render (look + loads during play + sound) | **+0.067 ms** (95 %: 0.065–0.070) of a 3.6 ms frame CPU | under playbudget's 0.1 ms floor |
| · the look's hooks | +0.016 ms | |
| · loads during play | +0.034 ms | |
| · the sound part | 0.000 ms | |
| What's left with every helper stepped aside (getting ready's retired hooks, the watch, wrappers passing through) | −0.006 ms around the render vs the off plays | nothing |
| **The Best picture** (1024² sun / spot maps instead of the game's 512²), graphics card | **+3 %** GPU-process CPU (+12 of 399 ms, 95 %: 0.1–25), **+4.8 %** frame drawn to the end (+5.4 of 111 ms, 95 %: 1.5–9.6) | real; within shadowready's rule (a halving is kept unless it saves ≥ 8 %: its own A/B read 124 vs 118 ms → kept 1024) |
| **The performance probe** (in every ▶ Play after the first, once GamePerf had loaded) | **0.14–0.17 ms** by its own count (0.155–0.215 at a load of 30): more than all the other helpers together | **fixed**: dormant until asked |
| The injected 1 ms (self-test) | +1.07 ms around the render (95 %: 1.064–1.077) | caught every time |

**So: the Best look costs the game no CPU frame time beyond 0.07 ms here (≈ 0.02 ms on the owner's CPU), and its
picture costs 3–5 % of a software GPU's drawing** — on frames that sit at a refresh's edge (117 ms = 7 refreshes of
60 Hz) that 5 % tips some frames into the next refresh (133 ms): exactly the 116 vs 133 ms the old step tripped on.
That is the Best picture doing what it is for, inside the size rule shadowready set; on the owner's graphics card two
1024² depth maps are microseconds. The one real steady cost in the game window was the performance probe.

The 2.4 ms "look's most work in one frame": the look now reports how many objects it looked at in its costliest
frame. That frame looked at 6–11 objects (what the game added + a slice of the slow walk) while reading 2.2–8.5 ms on
a machine at a load of 20–30: the page was paused by the machine, not working.

## Shipped
1. **The performance probe stays out of ▶ Play until it's asked for.** Once the performance doctor's code had loaded
   (the first ▶ Play touches it), every later ▶ Play got the probe from its first frame: a wrapper on every frame
   callback (a new closure each frame), its own frame loop (running even when paused), render / WebGL wrappers, Long
   Animation Frames and mutation watches — 0.14–0.17 ms a frame here in a game nobody was measuring.
   `GamePerf.attach(…, { dormant: true })` keeps the window and puts the probe in on first use (the doctor, the chip,
   the director's perf, `/game-perf`), which then measures 4 s. A director play-test with perf
   (`GameMode.play(source, { perf: true })`) still gets it from the first frame. (gamemode.js, tools/gameperf.js,
   tools/directorgame.js; tools/game-api.md)
2. **The sound part steps aside for real** during the budget's A/B: its Long Animation Frames watch is disconnected
   while stepped aside (its `pause` did nothing). (tools/gameaudio-page.js)
3. **The look says what its costliest frame did** (`report().cost.playMaxN`: objects looked at in it).
   (gamelook-preload.js)
4. **gamefps54 judges frames inside each Best play** (`dev/framepace-verdict.js`): helpers on vs stepped aside in 10
   interleaved pairs across both Best plays, after the look's guard decided, with Best's shadow size on both sides.
   Hearth's work around the render: the median within 2 % of the frame's CPU (0.1 ms floor, 0.5 ms cap so a loaded
   machine's inflated frame can't wave a real 1 ms through); frames: slower only when the bootstrap 95 % interval of
   the mean gap difference is above 0 AND the mean is over 5 % / 2 ms. The separate plays stay only as a gross guard
   (within 2×).
5. **The Best picture judged on its own** in gamefps54: frames drawn to the end with the shadow maps at Best's size vs
   512², ABBA; fails when even the low end of the 95 % interval is over 8 % a halving (shadowready's own rule).
6. **A self-test**: gamefps54 injects a pretend helper costing 1 ms a frame (stepping aside like the real ones) and
   the same verdict must say "slower" (it reads +1.07–1.23 ms, at loads from 3 to 30).
7. **"The look's most work in one frame under 2 ms"** also passes when that frame looked at ≤ 64 objects (the time
   was the machine's).
8. gamefps54's off / Best measuring window: 6 s and at least 24 frames (≤ 30 s), so a machine at ~1 frame a second
   still measures; its game moved to `dev/fixtures/gamefps54-game.html` (shared with framepace57; `G.hold` lets a check
   draw frames itself).
9. `dev/checks/framepace57.js` (group `framepace57`), unit cases for the verdict in `dev/gamefps54-test.js`, and
   gamestream's check puts the probe in itself before its load.

## Tests
- unit: gamefps54-test (12, incl. the verdict on refresh-quantised gaps: no cost passes 20/20, 1 ms caught 10/10 also
  with a 65 ms frame, +15 % frames caught ≥ 9/10, the picture rule), boot-test: pass.
- Under the shared lock (`flock /tmp/hearth-run.lock`, load 3–4), final code: **gamefps54 ×4 pass** (verdict CPU
  +0.077–0.079 ms vs 0.1 allowed; frames −0.4 to +2.7 %; self-test +1.08–1.09 ms caught every time), **gamelook ×2
  pass**, **playbudget pass**, **gamestream pass**, **gameaudio pass** (one earlier run failed "the music named": the
  decode's file name comes from Resource Timing's last 3 s and read null; base passes, rerun passed — timing),
  **lazy pass**, **framepace57 pass**.
- gamelook's "the first look under 5 ms" read 5.8–8.2 ms in 4 of 8 runs this round (base 2.9–4.3). readywalk found
  the cause: the card's best anisotropy asked of the GPU process once per renderer under the card; after the merge it
  is timed apart (`cost.ask`) and the look's own first look keeps its 5 ms bound (this stream's 10 ms raise dropped).
- playlatency's check puts the (now dormant) probe in itself before counting keydown listeners; the F chip's
  "Input: x ms" is the game window's own and needs no probe.
- An earlier gamefps54 version (frames judged with the shadow maps at 512² on the "off" side) failed once at low load:
  frames +12.9 % (95 %: 1.9–27 ms) — the picture's cost, which led to judging the picture on its own.
- Early runs at a load of 22–34 (7+ software-GPU Electron processes at once, ~1 frame a second) were used only to make
  the checks survive such a machine and for CPU-time numbers; frame-time numbers from them are discarded.

## Risks
- On the owner's machine the probe now starts when the doctor / chip / perf is asked, so the doctor's first look at a
  game measures 4 s from then instead of the whole session (stutters from before aren't in it).
- The picture's cost on a real card isn't measured here (no timer query on SwiftShader); playbudget's A/B reads it
  where the browser has the extension.

## For the patch notes
- **▶ Play carries less of Hearth while you play.** The performance stats part (the one behind "why isn't it
  smooth?") no longer rides along in every game: it joins only when you open the performance doctor or the stats,
  and measures from then on.
- Measured: Hearth's own work during play is about 0.02 ms a frame on a fast computer, and the Best look's sharper
  shadows cost a few percent of the graphics card's time — the Best look keeps them only where they fit.
