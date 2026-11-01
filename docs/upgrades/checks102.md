# checks102 (round 102): the checks that failed only under load, and a fresh perf baseline

Three things this round, all checks and tooling. No app file was changed (round 48's bug was put back in
`tools/three.js` for one proof run, then restored).

1. labstartfast's "coldOpen: the window's CPU until the Lab's scenes were read" step: why round 101's 182.7 ms failed,
   and a judging that measures the open at the open's own moment.
2. The perfguard baseline (`dev/perf-baseline.json`) measured again on this tree, every part.
3. The other checks that failed only under load in rounds 94–101: synchard74's `many` (event loop and steady pass) and
   chatwindow86's long tasks.

Files: `dev/checks/labstartfast.js`, `dev/loadwait.js` (`stallWatch`, `judgeStall`), `dev/synchard74-test.js`,
`dev/trace-stats.js`, `dev/perf-baseline.json`, and a `checks102` group in `dev/run-checks.js`.

All app runs were under `flock /tmp/hearth-run.lock`, at most 5 checks per run, SwiftShader under Xvfb, 4 CPUs.
"Under a burn" here means `/tmp/ck102/burn.js 6 mix` (worker threads: half spin and allocate, half read and write at
random over 64 MB each). It ran **in its own session at nice −8**: this box schedules by session (autogroup is on),
and Hearth's main and GPU processes run at nice −8. A burner started at nice 0 from the same shell as the check barely
touched the app (labflake95 saw the same), so that kind of burn proves little. One run used perfguard's own `many`
step (50,000 files, Node only) looping beside the check instead, as in round 101.

**A correction to my own runs.** At 12:08 I started a short experiment with a memory-bandwidth burner (`bw.js`: 4
threads copying 64 MB buffers back and forth, in its own session). My command to stop it failed, and it ran until
14:58. Every app run between those times shared the box with it: the labstartfast runs b2–c4 and the round-48 proof,
the chatwindow86 runs, and the first perfguard baseline (thrown away, see §2). The tables below say which runs had it.
It turned out to be the load that reproduces round 101's failure.

## 1. labstartfast: the window's CPU until the Lab's scenes were read

### What failed in round 101
- `coldOpen … 182.7 ms (budget 150)`, once, while chatsave101's perf run was on the same 4 CPUs. The rerun passed
  with 161.6 ms, judged "can't tell" at 1.2×. That log is gone (the box was restarted), so the failure was reproduced
  here instead.
- **Reproduced 4 times** with the old judging or a step of this round's:
  - coldOpen 184.7 and 183.0 ms with the bandwidth burner on the box;
  - songOpen 169.9 ms with the burner and the CPU burn;
  - coldOpen **193.9 ms on a quiet box** (load 2.3, no burner).

  The first 3 runs (no bandwidth burner, round 101's code) never went over: 88–142 ms.

### Cause: the same work cost ~1.4× the CPU right then, and the probe looked at another moment
- The 184.7 ms open's trace against a 127.3 ms one (same code, from the first input to `hearth:lab-ready`):

  | Piece of the open | Passing (127.3 ms) | Failing (184.7 ms) |
  |---|---:|---:|
  | the click's task (the Lab's open, sync part) | 59.5 | 82.7 |
  | the Lab's first run (`three-doctor-hook` timer) | 26.2 | 36.2 |
  | the pointer's restyle at the press (337 elements) | 11.8 | 17.2 |
  | the a11y flush, the first rAF, … | 2.9 / 4.1 | 4.4 / 6.4 |

  Every piece grew together. It is not extra work (the same four reads, the same 46 of 217 objects laid out); it is
  the same work costing more CPU. That is labflake95's finding, reproduced.
- **This box's speed changes from one second to the next, even when it looks quiet.** On a quiet box (load 2) the
  probe's three runs, back to back, took 11.3 and 15.1 ms of CPU, never waiting for one. The host shares the CPUs
  under this machine, and the guest can't see that. A cold open is 0.2–0.3 s, so a slow second can catch it whole.
- **The probe was taken at another moment.** The step judged the box's speed with a probe taken *after* the stretch:
  after the first frame, 1.5 s of quiet and the trace's stop. That is **3.3–10.7 s after the press** (measured in every
  run). In the 184.7 ms run that probe read 11.3 ms, the box at its usual speed 6.6 s later, so the open got no
  allowance.
- **Before the press it couldn't be used either, and that is why labflake95 took it after.** It read 16–39 ms there
  against 11–15 after. Its parts show why: before, its integer loop took 11 ms against 5.8, while its random memory
  reads took the same 0.9 ms. A slower box slows the memory part too. This was the probe's code not yet optimized in a
  page just reloaded (one warm-up run), and sometimes other work sharing its task (it ran as a timer's continuation).
- **Right before the press isn't the open's moment either.** With the probe fixed (below) and taken 16 ms before the
  press, the 193.9 ms cold open had a probe of 11.9 ms there, the run's usual. At the press the preview page starts
  and its scene with it. The moment the scenes are read is busier for every open, cold, song or warm. Measured as the
  scenes are read, the probe reads **12–23 ms**, against 11–16 before the press and after the stretch, in 6 runs.

### Fix (check)
- **The probe at the open.** As soon as `hearth:lab-ready` fires, three probe runs go in one task of their own
  between two marks (`at:pa`, `at:pb`). Their CPU is read from the stretch's own trace (`speedReady`). Everything
  counted until the scenes were read is already counted; the probe's ≈ 35 ms come after that. They land in the cold
  open's whole-window CPU (budget 900, ≈ 400 used).
- **Judged against the same moment of the run's other opens.** `slowBy(k)` is that open's probe at the open against
  the fastest of the three opens' probes at the open, between 1 and 2. That moment costs every open's probe more, and
  comparing like with like cancels it. What's left is how much slower the box ran at this open than at the others.
  Over budget but within budget × slowBy is "can't tell" (listed, not failed). Over that, it fails. The budget stays
  150. A run slow at every open still gets no allowance. Without the three probes at the open (no trace), the probe
  right before the press is judged against every probe of the run, as round 95 did.
- **The probe itself**: each run in a task of its own (a message to itself), warmed up 5 times first. Before the press
  it now reads what it reads after (11–17 ms).
- **The pointer over the button first.** The check pressed through CDP with no move before it, so the pointer arrived
  and pressed in one go. The rail's hover restyle then ran inside the measured window, on the rail `RAIL.button` had
  just redrawn after the reload: 17.2 ms of the 184.7. A hand moves to the button before it presses. Now
  `hoverLab` moves the pointer over the button and lets two frames through before the stretch starts. The press's
  own restyle stays in the window (11.8 ms in the passing run), because that is part of pressing.

### Is the allowance computed wrong? Its reference: what was tried
- **Against the run's fastest probe, any moment (round 95, and this round's first step).** At-the-open probes judged
  this way read up to 2× (warmOpen 98 ms with its probe at 22.7 against 11.4 elsewhere). That would be allowances for
  nothing.
- **Against a calm, fixed figure** (about 11 ms on this box, the way perfguard keeps its calibration): tried and
  dropped. Under the CPU burn and the bandwidth burner for a whole run, the probe read 1.3–1.4× its calm value on both
  sides of every open. The opens' window CPU stayed in its calm range: 104–120 and 110–129 ms in two such runs. Every
  open would have had 30–40 % it didn't need.
- **The smaller of before and after**: tried and dropped. Neither is the open's moment (above).
- **Kept: at the open, against the other opens at the open.** Same kind of moment on both sides, from the same run.

### The runs
| Run | load | window CPU until ready: cold / song / warm (ms) | probe (ms) | result |
|---|---|---|---|---|
| c1 | none (round 101's code) | 134.5 / 99.2 / 125.3 | after 11.4–15.8 | ✓ |
| b1 | 8-thread CPU burn, nice 0, same session | 126.5 / 97.6 / 88.8 | after 10.8–11.4 | ✓ |
| m1 | perfguard's `many` (50,000 files) beside it | 142.0 / 93.2 / 117.6 | after 11.1–12.6 | ✓ |
| b2 | CPU burn (nice −8) + bandwidth burner | 120.1 / 104.4 / 118.8 | 15.1–17.2 before and after | ✓ |
| c2 | bandwidth burner | **184.7** / 109.8 / 127.5 | after 11.3 (+6.6 s) | ✖ cold |
| b3 | CPU burn + bandwidth (own-task probe, no hover yet) | 126.1 / **169.9** / 134.7 | song: before 11.4, after 17 | ✖ song |
| c3 | bandwidth (hover, warmed probe, smaller of before / after) | **183.0** / 99.2 / 97.0 | before 14.5, after 13.5 | ✖ cold |
| b4 | CPU burn + bandwidth (same) | 129.3 / 110.2 / 114.3 | 11.0–16.8 | ✓ |
| c4 | bandwidth (same) | 127.3 / 118.5 / 115.1 | 11.6–13.8 | ✓ |
| f1 | quiet (probe right before the press, judged) | **193.9** / 110.6 / 126.4 | before 11.9 | ✖ cold |
| f2 | CPU burn (same) | 140.6 / 94.8 / 111.3 | before 11.2–15.5 | ✓ |
| r1 | quiet (**final judging**) | 112.2 / 93.7 / 93.0 | at the open 14.4 / 18.8 / 12.4 | ✓ |
| r2 | quiet (final) | **159.6** / 139.9 / 98.0 | at the open 16.8 / 12.6 / 22.7 | ✓ can't tell: cold 1.33× (allowance 200) |
| r3 | quiet (final) | **161.5** / 143.1 / 108.8 | at the open 15.6 / 23.3 / 13.5 | ✓ can't tell: cold 1.16× (allowance 173) |
| g1 | quiet (final) | 142.0 / 124.5 / 91.4 | at the open 18.5 / 16.5 / 18.9 | ✓ |
| g2 | CPU burn (final) | 117.1 / 100.5 / 92.1 | at the open 12.2 / 13.7 / 20.8 | ✓ |

- r2 and r3 are the runs this change is for. Their cold opens' probes at the open read 1.33× and 1.16× the other opens'
  at that same moment, and the opens stayed inside that allowance. Under the old judging both would have failed
  (probes after: 11.4 and 11.6, the run's fastest).
- The cold open sits close to its budget on this box today: 112–142 ms in most runs, against 68–126 in round 95's
  runs. The box itself runs slower today: perfguard's calibration is 8–18 % above round 82's (§2). A slow second is
  enough to tip it. If it goes over at a moment the other opens didn't see, it still fails.

### Proof: it still catches round 48's bug
- `tools/three.js`: the Lab's first reads with `three-history` and `three-thumbs` put back (not committed, restored
  after each run; `git status` clean after).
- With the final judging (g3): ✖ in all three opens: "coldOpen: the Lab read three-history and three-thumbs before its
  scenes were up (round 48: after the first frame)", and the same for warmOpen and songOpen. Every open's first reads
  were the six stores. The same with an earlier step of this round's judging (all three opens, ✖).
- The window CPU of those opens was 148.2 / 107.1 / 106.8 ms (and 133.2 / 121.0 / 121.7 in the earlier run), under
  150. The CPU budget alone never caught this bug (labflake95: 98.8 ms). The read-order check does, and it doesn't
  depend on the box or on any allowance.

## 2. perfguard baseline
### How it was taken
- The documented way (`docs/upgrades/perfguard77.md`, "Rebaselining"; the parts from `perf93.md` and `perf100.md`):
  `flock /tmp/hearth-run.lock node dev/perfguard.js --baseline --only startup,app,sync,fresh,labcold,many`. This is
  every part, `fresh`, `labcold` and `many` included, with the default counts: 5 cold starts, 3 app launches, 3 fresh
  launches, 3 sync runs, 4 labcold launches, 2 `many` runs. It took 46 min, from tree 934ba80 (this branch: the app
  is round 101's, only checks changed).
- **A first baseline was thrown away.** It ran with my leftover bandwidth burner on the box: load 5–7, the
  calibration's 3-thread run 91–122 ms against 66–72 at round 82, and the start 1.4× slower. A baseline taken on a
  loaded box is a looser baseline. The one kept ran on a quiet box: load ≤ 2.7, waited 0.95–0.98×, and calibration
  single / 3 threads 55–65 / 64–76 ms against round 82's 52–55 / 66–72.
- The old baseline was round 82's (6d38298, 29 Oct), 20 rounds old. It had none of the measures added since: round
  93's first picture, usable, CPU at 30 s, key → paint and the whole `fresh` part; round 100's send-and-save, `labcold`
  and `many`; round 101's mark measures. Round 101's `chat.saveIpc` move (now after the 5 sends, no longer between
  them) changed what that row measures.

### Old → new
| Measure | Old (round 82, 6d38298) | New | Change |
|---|---:|---:|---:|
| Start → first usable chat (`start.ready`) | 1072 ms (±63) | 1079 ms (±11) | +1 % |
| Start → settled (last long task) (`start.settled`) | 2967 ms (±108) | 2071 ms (±156) | -30 % |
| Start → first screen: CPU, main + window (`start.cpuReady`) | 5240 ms (±70) | 4860 ms (±180) | -7 % |
| Start → settled: CPU, main + window (`start.cpuSettled`) | 5330 ms (±60) | 4950 ms (±200) | -7 % |
| Start → first picture (splash on screen) (`start.firstPicture`) | — | 1778 ms (±87) | new |
| Start → usable (every early feature in) (`start.usable`) | — | 8175 ms (±650) | new |
| First 30 s: CPU, main + window (`start.cpu30`) | — | 5090 ms (±200) | new |
| Project cold open (Hearth's part) (`project.coldOpen`) | 358 ms (±11) | 340 ms (±37) | -5 % |
| Project warm open (Hearth's part) (`project.warmOpen`) | 1682 ms (±68) | 1513 ms (±54) | -10 % |
| Project switch (Hearth's part) (`project.switch`) | 870 ms (±54) | 1112 ms (±33) | +28 % |
| Project cold open: window CPU (`project.coldOpenCpu`) | 578 ms (±71) | 562 ms (±14) | -3 % |
| Project warm open: window CPU (`project.warmOpenCpu`) | 1037 ms (±64) | 1302 ms (±86) | +26 % |
| Project switch: window CPU (`project.switchCpu`) | 735 ms (±27) | 976 ms (±41) | +33 % |
| Long chat opened from its list row (`chat.switch`) | 202 ms (±2) | 261 ms (±13) | +29 % |
| Long chat opened: window CPU (`chat.switchCpu`) | 102 ms (±1) | 140 ms (±5) | +37 % |
| Chat list click: window handlers (`chat.clickHandler`) | 11.6 ms (±0.05) | 14.6 ms (±0.55) | +26 % |
| Chat list click: window busy in 600 ms (`chat.clickCpu`) | 71.4 ms (±2.5) | 80.9 ms (±1.75) | +13 % |
| Chat list click: window CPU in 700 ms (`chat.clickThreadCpu`) | 166 ms (±2) | 194 ms (±3) | +17 % |
| Typing: window handlers per key (`chat.keyHandler`) | 0.4 ms (±0) | 0.7 ms (±0.1) | +75 % |
| Typing: key → paint (`chat.keyPaint`) | — | 13.5 ms (±1.8) | new |
| Typing: window CPU per key (`chat.keyCpu`) | 6.7 ms (±0.1) | 8.8 ms (±0.2) | +31 % |
| Send in a long chat → on disk (`chat.sendSaved`) | — | 60.7 ms (±1.1) | new |
| A long chat saved whole: call → written (`chat.saveIpc`) | — | 28 ms (±2.9) | new |
| Send turn: CPU, main + window (`chat.sendCpu`) | — | 440 ms (±0) | new |
| A mark in a long chat → on disk (`chat.markSaved`) | — | 8.3 ms (±0.8) | new |
| A mark in a long chat: CPU, main + window (`chat.markCpu`) | — | 31 ms (±9) | new |
| Lab tool call (no picture), end to end (`lab.toolCall`) | 23 ms (±1) | 26 ms (±3) | +13 % |
| Lab tool call: CPU, main + window (`lab.toolCallCpu`) | 280 ms (±45) | 326 ms (±21) | +16 % |
| Still Lab scene: draws a second (`lab.stillDraws`) | 0.2 /s (±0) | 0.2 /s (±0) | +0 % |
| Idle on a chat: the window (`idle.windowCpu`) | 0.1 % CPU (±0) | 0.3 % CPU (±0.1) | +200 % |
| Idle on a chat: every process (`idle.allCpu`) | 4.3 % CPU (±0.6) | 12.3 % CPU (±0.5) | +186 % |
| Window JS heap after GC (end of run) (`mem.windowHeap`) | 31.2 MB (±0) | 32.6 MB (±0) | +4 % |
| After start (30 s): window JS heap (`fresh.memWindow`) | — | 13.5 MB (±0) | new |
| After start: main process JS heap (`fresh.memMain`) | — | 11.4 MB (±0) | new |
| After start: store thread JS heap (`fresh.memStore`) | — | 5 MB (±0) | new |
| Idle at 1 min: every process (`fresh.idle1All`) | — | 15.1 % CPU (±0.4) | new |
| Idle at 1 min: main process (`fresh.idle1Main`) | — | 14.3 % CPU (±0.5) | new |
| Idle at 1 min: the window (`fresh.idle1Window`) | — | 0.6 % CPU (±0) | new |
| Idle at 5 min: every process (`fresh.idle5All`) | — | 0.6 % CPU (±0) | new |
| Idle at 5 min: main process (`fresh.idle5Main`) | — | 0.5 % CPU (±0) | new |
| Idle at 5 min: the window (`fresh.idle5Window`) | — | 0.1 % CPU (±0.1) | new |
| Settings: first open (`fresh.settings`) | — | 183 ms (±54) | new |
| Settings first open: window CPU (`fresh.settingsCpu`) | — | 81.3 ms (±0.6) | new |
| Settings: opened again (`fresh.settingsAgain`) | — | 50.7 ms (±1.7) | new |
| Settings again: window CPU (`fresh.settingsAgainCpu`) | — | 52.9 ms (±1.5) | new |
| Lab first start: press → first frame (`fresh.labFirst`) | — | 2843 ms (±115) | new |
| Lab first start: press → preview on screen (`fresh.labShown`) | — | 284 ms (±4) | new |
| Lab first start: window CPU (`fresh.labFirstCpu`) | — | 572 ms (±83) | new |
| Giant chat (6,000 messages) opened (`fresh.bigChat`) | — | 939 ms (±116) | new |
| Giant chat opened: window CPU (`fresh.bigChatCpu`) | — | 240 ms (±4) | new |
| Typing in the giant chat: key → paint (`fresh.keyPaint`) | — | 5.5 ms (±0.2) | new |
| Typing in the giant chat: window CPU per key (`fresh.keyCpu`) | — | 9.4 ms (±0.2) | new |
| Send in the giant chat → on disk (`fresh.bigSendSaved`) | — | 479 ms (±151) | new |
| Lab cold start: press → first frame (`labcold.first`) | — | 5895 ms (±236) | new |
| Lab cold start: press → preview on screen (`labcold.shown`) | — | 251 ms (±30) | new |
| Lab cold start: window CPU (`labcold.cpu`) | — | 583 ms (±24) | new |
| Sync, 50,000 files, nothing changed: pass (`many.steady`) | — | 12459 ms (±113) | new |
| Sync, 50,000 files, nothing changed: longest stall (`many.steadyStall`) | — | 95.5 ms (±27.5) | new |
| Sync, 50,000 files: first pass (all up) (`many.first`) | — | 99150 ms (±8843) | new |
| Sync steady pass: main-process stall (`sync.steadyStall`) | 20.49 ms (±0.47) | 19.79 ms (±1) | -3 % |
| Sync small-change pass: main-process stall (`sync.changeStall`) | 22.28 ms (±0.04) | 19.51 ms (±0.49) | -12 % |
| Sync steady pass: wall time (`sync.steadyWall`) | 541 ms (±1) | 604 ms (±4) | +12 % |
| Sync steady pass: CPU (`sync.steadyCpu`) | 798 ms (±10) | 811 ms (±5) | +2 % |
| Sync small-change pass: CPU (`sync.changeCpu`) | 779 ms (±12) | 829 ms (±19) | +6 % |

### The jumps, explained
- **Is any of it round 101's?** To tell this tree's changes from the box's day, the same day's A/B against round 100's
  tip (d76ad28, `--ab d76ad28 --only app --runs 3`, 23 min, load ≤ 2.9, then `--only labcold,sync`, load ≤ 3.6):
  **✓ no regression** in any row. 3 rows came out better: project warm open window CPU −14 %, Lab tool call CPU −40 %,
  Lab cold start window CPU −16 %. So nothing below comes from round 101.
- **Projects (warm open CPU +26 %, switch +28 %, switch CPU +33 %) and opening a long chat (+29 % / CPU +37 %)**:
  the same round-100 code read the same in today's A/B. Its warm open window CPU was 1,387 ms against 964 ms in
  perf100's own A/B. These rows move with the day's box. Today's calibration ran 8–18 % slower than round 82's (app
  part: 58.8 against 52.3 ms; the window's own benchmark 38.8 against 32.7). The rest is 20 rounds of features
  (Codex's spaces and projects bar, the Desk, labload94's Lab-first loading), each A/B'd against the round before
  (perf93, perf100) without a regression. They were never checked against this baseline, which perfguard's compare
  mode then judged against.
- **Start → settled −30 %, start CPU −7 %**: the first screen got lighter: firstscreen96's lazy modules, labload94's
  Lab code after the first frame. perf100 measured start CPU −23 % against round 93.
- **Typing per key: handlers 0.4 → 0.7 ms, CPU 6.7 → 8.8 ms**: within the box's day plus round 93+'s typing work. In
  today's A/B, round 100 → this tree was 8.4 → 7.8 ms CPU and key → paint 10.3 → 7.4 ms.
- **Idle on a chat: every process 4.3 → 12.3 %, window 0.1 → 0.3 %**: round 100's code read 10.3 % today (A/B), so
  this is older than round 101. perf100 found the same busy time in `fresh` (idle at 1 min 14–15 %): the recall index
  built on the store thread in the first minutes after a start. The app part measures its idle about 2 minutes after
  the start, inside that minute. At 5 minutes it is 0.6 % (`fresh.idle5All`).
- **Long-chat saves: `chat.sendSaved` 60.7 ms, `chat.saveIpc` 28 ms** (perf100's A/B: 101 and 68 ms): the step down
  chatsave101 announced. `saveIpc` now runs after the sends, not between them, and a send no longer waits behind it.
- **`labcold.first` 5,895 ms, `labcold.cpu` 583 ms** (perf100's A/B: 3,791 / 409): a first frame on a software GPU
  swings by seconds between days. Today's A/B against round 100 read 4,729 → 4,192 ms and CPU 574 → 480 ms (better).
- **`many.steady` 12.5 s** (perf100: 9.9 s): the day's box, plus the stall watcher added to synchard74 this round.
  It costs 95 µs every 5 ms of free loop, about 2 % of a CPU. That ~2 % is in this baseline too.
- **Sync steady wall +12 %, change stall −12 %**: within the box's day. Today's A/B against round 100 was −7 % / −2 %.
- **Window heap +1.4 MB (+4 %)**: 20 rounds of features. The A/B against round 100 read +0 MB.
- **`many` FAILs in the problems list**: both 50,000-file runs held the loop longer than synchard74's 150 ms (see §3:
  the engine's own holds at that size, not load). That is perf100's note, now with each hold's breakdown. It doesn't
  make the baseline wrong: its `many` rows are the pass times and the steady pass's longest stall (68–123 ms).

## 3. Other checks that failed only under load

### synchard74 `many`: the event loop's budget (and the steady pass's)
- **Reproduced**: `node dev/synchard74-test.js --only many` (5,000 files) beside a 12-thread burn: ✖ "the event loop
  is never held long (worst 254 ms; budget 150)" and ✖ "steady pass under 600 ms per 1,000 files (1,232 ms)". Calm:
  stalls 19–56 ms, steady 331 ms per 1,000, ✓.
- **Cause**: both are wall times. `monitorEventLoopDelay` gives the longest hold in wall time. On a busy box most of a
  hold is the thread waiting for a CPU.
- **Fix (check, `dev/loadwait.js stallWatch`)**: a 5 ms ticker reads the main thread's schedstat on every tick, so
  each hold of the loop is split into:
  - `wait`: the main thread's wait for a CPU inside it, plus the longest such wait of one of the process's other
    threads (libuv's pool, V8's helpers). That is how `loadwait.waited()` already counts it;
  - `own`: the rest, and never less than the thread's own CPU time in it;
  - `cpu`: how much of it the thread ran on a CPU.

  A hold over the budget is "can't tell" when its `own` part is under the budget. Over it, it fails. The steady pass
  is judged like synclatency77's: over by no more than the process's wait for a CPU and a saturated disk is "can't
  tell" (`loadwait.judge`). Budgets unchanged. perfguard's line ("longest event-loop stall per phase") is unchanged.
- **Why the other threads count**: without them, one hold measured 333 ms with 1 ms on a CPU and 0 ms of the main
  thread's own wait. The loop waited on a pool thread that was itself waiting for a CPU. With them, the same kind of
  run gave "join 284 ms = 0 own + 284 waiting for a CPU".
- **What still fails, and should**: in one run under the burn a hold was 186 ms "own" with 1 ms on a CPU. In another
  run under the same burn, the thread's state sampled every 10 ms was `D` (waiting on the disk) 39 times, with
  `submit_bio_wait` as the wait: a synchronous disk wait on the event loop. That is the code's
  (a sync call on the loop), so it is not taken out. The disk's time isn't excused here the way `judge()` excuses a
  saturated disk: a sync read on the loop is never the box's.
- **Runs after the fix**: calm ✓ (stalls 21–56 ms); under the 12-thread burn: "CAN'T TELL many: the event loop held
  275 ms … its longest hold of its own was 56 ms" and "CAN'T TELL … steady pass 8,620 ms … the process waited
  7,025 ms for a CPU". One burn run still failed on the 186 ms sync disk wait above.
- **Found on the way: at 50,000 files the long holds are real.** In the baseline's two `many` runs (quiet box, load
  ≤ 2.2), every hold over 150 ms had 0–5 ms waiting for a CPU. perf100 put them down to the box's load (3–5), but they
  are the code's own, of two kinds:
  - the folder rename: **307–362 ms on a CPU** (312 and 360 ms holds): computation;
  - the first pass and the second computer's join: **287–604 ms holds with 3–4 ms on a CPU**. The thread was blocked,
    not waiting for a CPU: synchronous file calls on the loop, like the `submit_bio_wait` above.

  The steady pass, the one perfguard judges, held the loop 63–118 ms. See "For Codex".

### chatwindow86's long tasks (round 101's 77 ms in "top")
- **Since round 88 the step judges a long task by its own CPU time, not its wall time** (`trace-stats longTasks`):
  over on CPU or blocked off the CPU fails, over only by waiting for a CPU is "can't tell". One path still judged wall
  time: a task the window's observer saw but the trace couldn't place inside its ±1 ms window came back "unknown", and
  the step then failed it on its wall time. **Fix (`dev/trace-stats.js`)**: such a task is matched by overlap, with all
  the CPU of every trace event overlapping it (never less than its own), when they cover 80 % of it. Otherwise it stays
  unknown, judged on wall time as before.
- Round 101's 77 ms task left no log, so whether it took that path can't be shown. No "unknown" came back in 5 runs
  here.
- **Under the CPU burn and the bandwidth burner (3 runs)**: each run had one failure, and each on the task's **own
  CPU**:
  - "sync": 178 ms with 72.6 ms of CPU (a calm run on 30 Oct: 56 ms, 29.5 ms CPU);
  - "jump": 120 ms with 112.3 ms of CPU (calm: no long task);
  - "edit": 152 ms with 66.2 ms of CPU.

  Every other over-budget task was "can't tell" (for example top: 72 ms, 40.6 ms CPU, 139 ms waited for a CPU).
- So under this heavy a burn the same window work costs more CPU, as in labstartfast. labstartfast's probe was tried in
  chatwindow86, right before each step. It read the box as calm: 10.2–14.5 ms, the same as a run with the bandwidth
  burner only (10.5–20 ms). So it gave no reason to excuse those tasks, and it wasn't kept. The failures stand. The
  budgets are unchanged.
- With the bandwidth burner only: ✓ (one can't-tell: "open: a 97 ms task … 34.2 ms CPU; the other 62.8 ms ≤ the
  343 ms the thread waited for a CPU").
- Still on wall time: the **main process's** blocks (mainlag-probe's sampled busy stretches, budget 100 ms). Making
  them load-aware needs the main thread's run delay inside mainlag-probe.js (an app-root, test-only file). It was left
  for a stream that may change it. It didn't fail in any run here.

## Final runs (this branch, under the lock)
- `labstartfast` quiet: ✓ (g1, cold / song / warm 142.0 / 124.5 / 91.4 ms). Under the CPU burn: ✓ (g2,
  117.1 / 100.5 / 92.1 ms). The three quiet runs before them with the same code (r1–r3): ✓, two of them "can't tell"
  on the cold open (above).
- `chatwindow86` (CHATWINDOW86=1) twice: ✓ 121 s and ✓ 117 s, one can't-tell line each ("open: a 66 ms task …
  40.4 ms CPU"; "send: a 71 ms task … 56.4 ms CPU; the other 14.6 ms ≤ the 187.3 ms the thread waited for a CPU").
- `lazy` ✓ 112 s, `labboot` ✓ 101 s.
- `unit:synchard74-test` ✓ (166 passed; `many` at 5,000 files: holds 19–63 ms).
- `unit:datasafe-scan unit:winmac-test unit:errorcalm-scan unit:storeack-scan unit:chatsafe-scan unit:chatwin-scan
  unit:boot-test unit:lazymanifest-test`: ✓ 8 / 8 (boot-test: 3,110 checks; first screen 64 scripts, 1,686 / 1,696 KB,
  unchanged).
- perfguard: the baseline above, plus A/B against round 100's tip: `app` ✓ no regression (2 better), `labcold,sync` ✓
  no regression (1 better).

## For Codex
No Codex-owned file was changed. One finding for `sync-engine.js` (or the simulator under it, `dev/sync-sim.js`: not
told apart here). With 50,000 files (perfguard's `many`, `synchard74 --only many --many 50000`), the loop is held:
- **287–604 ms** in the first pass and the second computer's join, with 3–4 ms of it on a CPU and 0–5 ms waiting for
  one. That is blocking file calls on the loop;
- **307–362 ms** in a folder rename, on a CPU: computation.

Round 100 thought these were the box's load; they are the code's own. In the app that is the main process. The steady
pass holds it 63–118 ms.

## For the patch notes
- **Behind the scenes**: the Lab's start-up check now judges the computer's speed at the moment the Lab opens, not
  seconds later, and no longer counts the pointer arriving on the button as the Lab's work. It still fails at once if
  the Lab reads its big history and picture files before showing its scenes.
- **Behind the scenes**: the sync check with many small files now tells "the code held things up" from "the computer
  was busy", hold by hold. Behind that, it found that a first sync of 50,000 files holds Hearth for up to half a second
  at a time. That is now on the list to fix.
- **Behind the scenes**: the performance guard has a fresh baseline taken on this version, with the measures added in
  rounds 93–101.
