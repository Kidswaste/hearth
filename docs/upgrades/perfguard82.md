# perfguard82: a performance guard you can trust on a busy box (round 82)

Round 77's guard (`dev/perfguard.js`, see perfguard77.md) compared wall times with a stored baseline. In rounds 79–81
it flagged about ten "regressions" on the UNCHANGED tree whenever other agents kept this shared 4-CPU box at a load of
about 3. Nobody could tell a real slowdown from a busy minute, so it was ignored. This stream makes it trustworthy.

## What was wrong (measured, not guessed)
- **The baseline itself was stale.** A paired A/B run of the round-76 tree (6a8482d, the baseline's commit) against
  today's tree, launched in turn in the same minutes, found no difference in startup: 1075 ms vs 1060 ms (p = 0.64).
  But the stored baseline said 564 ms. The round-76 code itself now takes ≈ 1070 ms here. The box changed (it has
  been rebuilt since: the kernel went from …-v180 to …-v185). The code didn't. Most of the "regressions" were that.
- **Wall times alone mix up work and waiting.** A project switch's single samples ranged from 278 ms to 2647 ms in one
  run, while its window CPU time stayed within ±4 %. Software GL (SwiftShader), other agents' disks and the load
  decide most of a wall time on this box.
- **The spread came from 3 numbers.** A median absolute deviation (MAD) of three launch medians is often tiny
  (±1–3 ms), so "3 × spread" gave no room for the swings between sessions.

## What changed
1. **CPU time beside every wall time** (a "CPU twin"). A busy box makes things wait; it barely makes them cost more CPU.
   - Startup: the main process's and the window's CPU time up to the first screen and up to settled. These come from
     the browser's own process list (`SystemInfo.getProcessInfo`) in `dev/coldstart-report.js`. The GPU process is
     left out: here it is SwiftShader, whose worker threads spin while they wait, so its CPU grows with the load.
   - App: the window main thread's CPU per project open / warm open / switch, per long-chat open, in the 700 ms after
     a list click, and per typed key (CDP `Performance.getMetrics` ThreadTime). Also the main process's + the window's
     CPU per Lab tool call (`power.test` process metrics).
   - Sync: each pass's CPU time (`process.cpuUsage`, the main thread + the store thread) in `dev/sync72-perf.js`.
2. **A calibration probe** (`dev/perfguard-calib.js`, new). It times a fixed micro-benchmark: CPU-bound integer mixing,
   a burst of short-lived objects for the GC, and layout. In Node a JSON round-trip and sort stand in for layout; in
   the app's window it re-lays out 300 off-screen words for real. It runs before and after every step, inside the
   run lock, so it sees the same minutes as the step. It runs in one thread, in 3 threads at once (Hearth is 3–4 busy
   processes), and in the window at the start and end of each app launch. Each part's **calibration factor** is
   how much slower the benchmark ran than when the baseline was recorded. For the app it is the slower of the window's
   benchmark and the 3-thread one. For startup and sync it is the geometric mean of the 1-thread and 3-thread ones.
   It is never below 1: a busier box excuses, but a quieter one doesn't tighten the lines, because the benchmark itself
   moves about ±10 % from minute to minute. Times are judged **÷ that factor**, and that includes CPU times. On this
   box the benchmark almost never waits for a CPU (its wall time stays ≈ its CPU time even at load 4). So the factor mostly measures how much work a CPU gets through right now: a shared core's
   caches and its sibling thread slow Hearth's CPU time by about the same amount. Without that, one unchanged-tree
   run at load 4 flagged the window CPU of a long-chat open (+24 %) and of a project switch (+19 %), while the window's
   benchmark was +17 % that minute.
3. **Noise is told apart from change** (compare mode). The baseline now keeps every sample, grouped by launch. A metric
   over its line (max(15 %, 3 × spread, floor), as before) must also pass a one-sided Mann–Whitney test of all its
   samples against the baseline's (p ≤ 0.05).
   - A CPU time or a level that is over the line but not significant is "unsure" (inconclusive).
   - A wall time over the line whose CPU twin is fine is **waiting, not work**:
     - if it is not significant, it is ok (this box's waits swing ±30 % between sessions);
     - if it is significant on a box slower than at the baseline (factor > 1.25), it is "load?" (inconclusive);
     - if it is significant on a box no slower, it is a regression. A new timer or a lost cache still fails.
   - Anything in doubt is measured again once (that part only, pooled) before it counts, as before.
4. **The box goes into the report.** `report.json` in the out folder has the mode, the verdict, the load averages, each
   part's calibration (1 thread, 3 threads, the window's, how long it waited for a CPU), the factor, and every row.
   The printed table gets a "now ÷ calib." column and a "the box" block.
5. **It refuses to judge when the box is too loaded to tell.** That is when the calibration runs > 1.8× slower than at
   the baseline, waits for a CPU (wall > 1.6× its CPU time), the 1-minute load is over 1.75 per CPU (7 on this box),
   or the box changed speed > 2.2× during the part. A row over the line in such a part is "too loaded", not
   "REGRESSED". **Exit codes:** 0 no regression · 1 regressed · **3 inconclusive** · 2 the guard failed. The run-checks
   check (`dev/checks/perfguard.js`) turns 3 into a pass with a `skipped` note pointing at `report.json`, so an
   overloaded box doesn't fail a release.
6. **Paired A/B mode: `--ab <base ref>`, the recommended mode for release checks.**
   - It makes a throwaway `git worktree` of the base (detached; removed afterwards, `--keep-base` keeps it). Then it
     launches base and new **in turn**: base, new · new, base · … Both sides use this checkout's measuring code
     (`dev/`) and the same fixture; only the app differs. `smoke.js --app <dir>` and `coldstart-report.js --app`
     launch the base's app; `sync72-perf.js --root` runs the base's sync engine.
   - Each metric is judged on every sample of each side:
     - **regressed** = Mann–Whitney p ≤ 0.05, **and** a 95 % bootstrap interval of the median difference above 0
       (launches resampled, since a launch's samples move together), **and** the difference over max(10 %, floor);
     - **unsure** = over the line but not settled (then the run is inconclusive: run again, or with more
       `--runs` / `--rounds`);
     - **better** = the mirror image of regressed.
   - No stored baseline is involved, so a rebuilt box, a new kernel or a busy hour affect both sides alike.
   - Default size: startup 3 blocks per side (each a warm-up launch + 3 starts), app 3 launches per side, sync 3 runs
     per side. That is about 20–30 minutes in all with `--lock` on a busy box. `--only startup` takes about 5–7 minutes.
7. **Idle is counted over the quieter of two 10 s windows.** In about half of the launches, the main process was
   busy through the first one (see Notes).
8. **Rebaselined** on today's tree and box (with calibration, CPU twins and every sample):
   `dev/perf-baseline.json`.

## How to run it
- **Release check (recommended):** `node dev/perfguard.js --ab origin/main --lock`. Don't wrap it in an outer
  `flock` on the run lock: `--lock` takes the lock per launch, so other agents get turns in between. Through
  run-checks: `PERFGUARD=1 PERFGUARD_AB=origin/main node dev/run-checks.js perfguard`.
- Quick look against the stored baseline: `node dev/perfguard.js --lock` (≈ 13–24 min). `--from <out dir>` judges a
  saved run again (no launches).
- Rebaselining is as in perfguard77.md. `--baseline --from <out dir>` writes a baseline from a saved run.

## Proof
All runs were on this box while other agents worked (1-minute load 1.2–4.7 on 4 CPUs), with the run lock taken per
launch (`--lock`).

**Before: the round-77 guard on the unchanged tree** (main 6d38298, load ≈ 3): ✖ 11 regressed. Start → first usable
chat was 564 → 981 ms (+74 %), project switch 227 → 641 ms (+182 %), Lab tool call 13 → 24 ms, and idle (every
process) 1.5 → 4 %. As described above, the round-76 code gives the same numbers today.

**The unchanged tree, 3 times in compare mode with the final code (f6eaa92): no regression.**

| run | load at start (1 / 5 / 15 min) | calibration factor (startup · app · sync) | verdict |
|---|---|---|---|
| 9 | 2.07 / 2.37 / 2.79 | 1.01 · 1.07 · 1.08 | ✓ no regression, 1 better (14.5 min; one startup CPU row measured again to confirm, then ok) |
| 10 | 3.54 / 2.91 / 2.91 | 1.00 · 1.13 · 1.16 | ✓ no regression, 3 better (12.7 min) |
| 11 | 2.17 / 2.54 / 2.81 | 1.00 · 1.13 · 1.02 | ✓ no regression, 3 better (23.7 min; long-chat window CPU and sync wall measured again, then ok) |

The 8 runs made while the rules were being finished, judged again from their saved measurements with the final rules
(`--from`): 7 ✓ no regression, 1 ? inconclusive. The inconclusive one (run 5, load ≈ 4.5) was idle over a single 10 s
window, in 2 of its 6 launches busy. That run was before the probe counted the quieter of two windows. Under the
rules as they stood when they ran, 5 of those 8 had failed (runs 1, 4, 5, 6, 7). Each failure led to one of the fixes in
"What changed":
- a +24 % project cold open (wall), with its CPU fine and not significant;
- window CPU +19–24 % at a window benchmark +17 % → CPU times scaled too;
- chat clicks +18–26 % with the window benchmark +3 % but the 3-thread one +17 % → the app's factor is the slower of
  the two;
- startup CPU +17 % "after scaling" on a box the benchmark called 8 % faster → the factor is never below 1.

**The unchanged tree in A/B mode** (`--ab HEAD`, everything, 27.7 min, load 2–4.7): ✓ no regression. All 28 rows ok,
none unsure. The biggest moves were project cold open +35 % (p 0.2) and Lab tool call +36 % (p 0.18): noise that the
test rightly didn't call.

**The round-77 demo, in A/B mode: still caught.** In a scratch worktree (never committed), `storework.js` `rowsLoad`
returned at once, so the chat-list cache was off and every start read all 1,500 chat files again. Then the scratch
copy's own guard ran `node dev/perfguard.js --ab 636570c --lock --only startup` against the same tree with the cache on
(load 3.9; 6.9 min; 9 starts a side in 3 alternating blocks). Exit 1:

```
metric                                       base      new           change     p      95 % interval  allowed
Start → first usable chat                 1060 ms  1324 ms  +264 ms (+25 %)     0     54 ms … 456 ms  +106 ms  REGRESSED
Start → settled (last long task)          1811 ms  1900 ms    +89 ms (+5 %)   0.5  -1185 ms … 452 ms  +181 ms         ok
Start → first screen: CPU, main + window  5300 ms  5460 ms   +160 ms (+3 %)  0.17   -290 ms … 630 ms  +530 ms         ok
Likely culprits (… what grew most vs the base):
       374 ms  start phase: shell → chats  (+271 ms vs base)
       360 ms  ipc answered: chats:list ×1  (+272 ms vs base)
      3001 ms  CPU to the first screen: browser process  (+304 ms vs base)
✖ 1 regressed · 0 better
```

It named the right place: the chats list answered in 360 ms instead of 88. The main process (where the store thread
reads the files) spent +304 ms of CPU. The same measurements judged in compare mode against the stored baseline fail
too: +24 %, p 0.01, on a box no slower than at the baseline.

A control on code drift: `--ab 6a8482d --only startup` (the old baseline's commit vs today) found no startup change:
1075 vs 1060 ms, p 0.64.

Checks: `lazy` ✓, `unit:boot-test` ✓ (`node dev/run-checks.js --exact lazy unit:boot-test`, under the run lock).

## Notes and limits
- CPU twins are not perfectly flat under load either: SMT siblings and cache sharing add a few %. Animation work also
  scales with how long something takes. Their lines (15 % / floors) cover that.
- The compare mode still depends on the box staying the same. After a rebuild of the test machine, rebaseline, or
  use A/B. The calibration catches a slower CPU. It does not catch slower disks or GL.
- A/B launches from `dev/` of the checkout you run it from, so the measuring code is the same on both sides. A change
  that is only in `dev/` measures nothing.
- Idle was bimodal on this box. In about half of the launches the main process used ≈ 17 % of a CPU (and the window
  ≈ 1.2 %) through the 10 s count, against ≈ 1 % in the others. The probe now counts two 10 s windows back to back and
  keeps the quieter one; both are kept in the notes (`idleWindows`). It's worth a look in a later round: something
  in the main process (a background job?) runs for 10 s or more soon after the window settles. The baseline still
  has one such launch among its samples.
- The rules were tuned on the unchanged-tree runs below (CPU times scaled too; the app's factor; factor ≥ 1; idle over
  two windows). Each change was checked against the same saved runs AND against the demo, so the guard didn't just get
  more lenient. The compare mode remains the coarse screen; A/B is the one to trust for a release.
- Files: `dev/perfguard.js`, `dev/perfguard-probe.js`, `dev/perf-baseline.json`, `dev/checks/perfguard.js`,
  `dev/perfguard-calib.js` (new). Small additive options in `dev/smoke.js` (`--app`), `dev/coldstart-report.js`
  (per-process CPU), `dev/sync72-perf.js` (CPU per pass), `dev/run-checks.js` (the group's comment). No app code
  changed.

## For the patch notes
- Behind the scenes: the performance guard that watches Hearth's speed no longer cries wolf when the test computer is
  busy. It now measures how much work Hearth does, not only how long things take. It checks how busy the computer is
  before judging, and says "can't tell right now" instead of raising a false alarm. For releases it races the new
  version against the previous one, side by side in the same minutes. It still caught a real slowdown on purpose (a
  start that re-reads every chat), so real slowdowns are still found before they reach you.
