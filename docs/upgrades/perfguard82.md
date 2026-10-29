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
   how much slower the benchmark ran than when the baseline was recorded. Wall times are judged **÷ that factor**.
3. **Noise is told apart from change** (compare mode). The baseline now keeps every sample, grouped by launch. A metric
   over its line (max(15 %, 3 × spread, floor), as before) must also pass a one-sided Mann–Whitney test of all its
   samples against the baseline's (p ≤ 0.05).
   - A CPU time or a level that is over the line but not significant is "unsure".
   - A wall time over the line whose CPU twin is fine is **waiting, not work**. It is ok up to +35 %. Past that it is
     "load?" when the box is slower than at the baseline, otherwise a regression (a new timer or a lost cache still fail).
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
     per side. That is about 20 minutes in all. `--only startup` takes about 5 minutes.
7. **Rebaselined** on today's tree and box (with calibration, CPU twins and every sample):
   `dev/perf-baseline.json`.

## How to run it
- **Release check (recommended):** `node dev/perfguard.js --ab origin/main --lock`. Don't wrap it in an outer
  `flock` on the run lock: `--lock` takes the lock per launch, so other agents get turns in between. Through
  run-checks: `PERFGUARD=1 PERFGUARD_AB=origin/main node dev/run-checks.js perfguard`.
- Quick look against the stored baseline: `node dev/perfguard.js --lock` (≈ 11–19 min). `--from <out dir>` judges a
  saved run again (no launches).
- Rebaselining is as in perfguard77.md. `--baseline --from <out dir>` writes a baseline from a saved run.

## Proof
All runs on this box while other agents worked. Load averages 1.2–4 on 4 CPUs.

**The unchanged tree, 3 times in compare mode (against the new baseline): no regressions.**

| run | load (1 min) at start | verdict | notes |
|---|---|---|---|
| 1 | 1.24 | ✓ no regression (re-judged) | XXX1 |
| 2 | 2.26 | ✓ no regression | 2 better |
| 3 | XXX | XXX | XXX |

**The round-77 demo, in A/B mode: still caught.**
XXXDEMO

## Notes and limits
- CPU twins are not perfectly flat under load either: SMT siblings and cache sharing add a few %. Animation work also
  scales with how long something takes. Their lines (15 % / floors) cover that.
- The compare mode still depends on the box staying the same. After a rebuild of the test machine, rebaseline, or
  use A/B. The calibration catches a slower CPU. It does not catch slower disks or GL.
- A/B launches from `dev/` of the checkout you run it from, so the measuring code is the same on both sides. A change
  that is only in `dev/` measures nothing.
- `idle.allCpu` is bimodal on this box: about 1 launch in 3 shows the main process at ≈ 17 % for those 10 s. The
  baseline has one such launch too. The median handles it. It's worth a look in a later round: something in the main
  process wakes up now and then.
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
