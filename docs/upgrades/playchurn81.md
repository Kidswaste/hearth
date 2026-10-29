# playchurn81: ▶ Play and the Lab preview make less garbage per frame again; AI setup's Connections line stays true (round 81)

gcchurn60 had gone red on main again after round 76 (labframe76) brought it under budget. This stream bisected what
came back, fixed it in the app, pinned the pieces in a unit test, and made the AI setup's Connections line follow
changes while it's open.

Nothing is added to any prompt (0 tokens). No new button, setting or menu. Mac and Windows run the same code.
First-screen code is unchanged: every file touched is the Lab preview page, ▶ Play's game-window scripts,
`connections.js` (lazy group) and one listener in `options.js`.

## 1. What came back, and from where
gcchurn60 counts the bytes Hearth's own code allocates per frame while a game plays (V8's sampling heap profiler,
collected objects kept). The Lab preview is measured on a Clink-like game layer plus a HUD layer; ▶ Play on a light
game with the Best look, loads during play and the sound part on.

**Bisect, Lab preview** (only `tools/three-sandbox.html` holds the Lab's measured code; each version swapped in, same
machine, same load, one run each, the check as it was):

| Version of the preview page | B a frame | fps |
|---|---|---|
| round 76 merge (0955a6d) | 1108 | 18.0 |
| + labaudio77 (5d54f92) | 1085 | 17.9 |
| checkfix80 alone (77a6bd4) | 1145 | 17.8 |
| laberrors80 (2633c5a) | 1180 | 17.9 |
| HEAD (b45249d) | 1148 | 18.6 |

The function-by-function split names one new item: **laberrors80's camera health check (`hlCameras`)**, ≈ 55 B a
frame (a `for…of` iterator per layer and per renderer, a `.some` closure per matrix, 32 numbers read out one by one, in
code run twice a second, so never optimised). labaudio77's audio clock (`songNow`), checkfix80's frame-lateness field,
labdraw74's culling, labload75's cache, gpuplay76 and winstart79 add nothing measurable per frame (the fixture has no
song; their per-frame lines are unchanged within noise).

**But the bigger cause is the machine's frame rate.** Round 76 measured the Lab at 23 fps; today's runs get 16–19 fps
(four agents on four CPUs). Two things grow per frame when frames are fewer: each second's fixed costs (the stats line
twice a second) are shared by fewer frames, and V8 optimises a function after a number of *calls*, not seconds. With
the check's 8-second warm-up, 18 fps is ≈ 150 frames: the per-frame code was still running unoptimised, where every
number is a new boxed value. The same HEAD code measured 40 s later reads **663 B** instead of 1148 (`tickFrames` 182 →
17 B, the frame bar's `fbRender` / `fbQ` 75 → 0). The round-76 page itself reads 1108 B at 18 fps: it would fail today
too.

**▶ Play** (whole app trees, round 76 vs HEAD, two runs each): 241 · 246 B vs 267 · 305 B at the same 38–40 fps. ▶ Play's
scripts are unchanged since round 76 except one pointer listener (chatjump76); the difference is in how the optimiser
treats the same hooks (the Best look's `cost()` read 0.3 B in one run and 35 B in another). Both sit at the 256 B budget,
so either can fail.

## 2. The fixes (app)
### Lab preview (`tools/three-sandbox.html`)
1. **The camera health check allocates nothing when optimised and a sixth as much per second when not.** Kept
   callbacks (no iterators, no closures), one sum of the 7 matrix entries that carry every part (a NaN anywhere makes
   the sum NaN: rotation x / y / z on the diagonal, w in [1], position in [12–14]; a lens's fov / zoom / aspect / near /
   far in [0], [5], [10], [14]), and it looks every 2 s (every 4th stats tick) instead of twice a second. It still finds
   each kind (position, rotation / parent, aspect, lens) once per run of the layer.
2. **A game that asks for its next frame with a new function every frame** (`requestAnimationFrame(() => tick())`, the
   "frame wrapper" note in labframe76) no longer gets a new entry, a new frame callback and a WeakMap slot each frame:
   a kept entry of its layer carries the function (one per frame asked at once, reused frame after frame). ≈ 110 B a
   frame gone in the fixture's HUD layer. Bonus: such a layer's `f60` is now its real frame length (it was always 1).
3. **An eval no longer leaves its 4-second time-out behind.** Every Lab tool call that looks into the scene, and every
   check's read, set a timer that fired 4 s later into a race long over and made an Error with its stack for nothing,
   in the middle of whatever was playing (seen at 190–260 B a frame while something polled).

### ▶ Play (game window)
4. **The Best look reads the clock twice a frame instead of four to six times** (`gamelook-preload.js`): its look takes
   the render wrapper's start time, and its last read ends the wrapper's own time too. Each clock read is a new boxed
   number (16 B).
5. **Loads during play** (`tools/gamestream-page.js`): the frame's look at what the game added uses the render
   wrapper's clock read instead of its own.
6. **The budget watch** (`tools/playbudget-page.js`) times itself only around its once-a-second look; the other frames
   only count one and ask for the next (well under a µs, and two clock reads to time nothing).

## 3. The check (`dev/checks/gcchurn60.js`)
- **The measure now starts once the game has shown 600 frames** (on top of the old waits, at most 60 s more): 10 s at
  60 Hz, 2.5 s at the owner's 240 Hz. On a loaded machine the old warm-up measured the optimiser's warm-up, not the
  steady state the budget is about. The budgets (256 / 1024 B) and the self-tests are unchanged; `GC60_FRAMES = 0`
  gives the old fixed-time warm-up for comparison.
- Report options for the next investigation: `GC60_TOP` (longer top lists), `GC60_WARM` (more warm-up), `GC60_EVALS`
  (the evals the page ran while measured, with a page that logs them).

## 4. Numbers (alone under the run lock, 4 shared CPUs, other agents' checks running)
| | HEAD b45249d | After |
|---|---|---|
| ▶ Play, Hearth's B a frame (budget 256), 600-frame warm-up | 267 · 300 · 305 · 306 | **181 · 189** |
| ▶ Play, the old 8 s warm-up | 309 | 224 |
| Lab preview, B a frame (budget 1024), 600-frame warm-up | 833 · 877 | **543 · 574** |
| Lab preview, the old 8 s warm-up | 1148 · 1170 · 1210 · 1307 | 1008 |
| `hlCameras` (Node, cold, per second in the preview) | ≈ 10 KB | ≈ 1.5 KB (optimised: 0) |

With the old warm-up at 18 fps the Lab still sits near its budget: that is the unoptimised code of every frame, which
the 240 Hz screen optimises in its first second or two.

## 5. Pinned (`dev/playchurn81-test.js`, `unit:playchurn81-test`)
V8's sampling heap profiler in Node, as gcchurn60 uses it: the camera check still finds every kind of NaN camera (said
once, again after a re-run, a stale renderer ignored); cold, its bytes a second are at most a sixth of round 80's (the
old code is measured too: the test has teeth); optimised it allocates nothing; it looks every 4th tick. The frame
wrapper keeps its kept-entry path. An eval answers as before (a value, a throw, a promise, a 4 s time-out) and leaves no
timer behind.

## 6. AI setup's Connections line (`connections.js`, `options.js`)
checkfix80 noticed it: the folded "Connections" line under What it can use said "None on" after you added a connection
or switched one on while AI setup was open; it was right only the next time AI setup opened. Now the connections box
tells AI setup each time it redraws (an add, a switch, Remove, `/connections on|off` while the panel is open), and the
line is written again from the AI's settings ("1 of yours", "Gmail (read only), 2 of yours"…). The claude.ai connected
apps' Off / Read only / Full picker updates it too. The `connections` check now verifies the line after the add and
after Read only → Full (it only reported it before).

## Checked
- Pass: gcchurn60 (×4: ▶ Play 180–189 B, Lab 543–574 B), gamemode, labaudio77, laberrors80, labdraw74, connections,
  lazy; unit: boot-test, playchurn81-test, playbudget-test, gamefps54-test, gamehooks55-test, connections-test,
  datasafe-scan, winmac-test, errorcalm-scan, storeack-scan.
- playbudget: failed once, passed on the rerun; its failing steps (the A/B under Getting ready's card finds on ≈ off)
  fail the same way on the round-76 tree under this load: not this stream.
- unit:labpace-test: its two wall-clock signature budgets (500 / 2000 objects) fail on this loaded machine on the
  round-76 tree too (320 / 1350 µs): not this stream.
- perfguard (PERFGUARD=1, load ≈ 3 on 4 CPUs): 10 metrics over the line, all outside what this stream touches
  (start, projects, chat list, sync's Node-only pass). The unchanged b45249d tree, run right after on the same machine,
  has the same 10 plus the Lab tool call (23 ms there vs 19 ms here). Every metric is within noise of the unchanged
  tree or better: no regression from this stream; the baseline (6a8482d) was recorded on a quieter machine.

## For the patch notes
- Games and Lab scenes make less memory garbage per frame again, so the small clean-up pauses that show as hitches at
  240 Hz come less often. In ▶ Play Hearth's own share is down by about a third, in the Lab preview by about a third too.
- A Lab scene whose code asks for each frame in a new way no longer costs a little extra memory every frame.
- Lab tools that peek into the running scene no longer leave a small leftover task behind that fired four seconds later.
- AI setup: the Connections line now changes as soon as you add a connection or switch one on, instead of saying
  "None on" until you reopen it.
