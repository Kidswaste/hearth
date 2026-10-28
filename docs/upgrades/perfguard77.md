# perfguard77: a performance guard for the gains of rounds 65–76 (round 77)

Rounds 65–76 made Hearth much faster on a heavy, owner-like profile: the start, opening and switching projects, chat
clicks, Lab tool calls, sync passes, idle CPU, the still Lab scene and memory. Each gain had its own opt-in check
(bigprofile70, projects72, chatsteady73, labcalls74, labdraw74, longrun72, syncstate75's perf run, idlecpu,
labload75), but nothing measured them together. A later change could make one of them slower and nobody would see it.
This stream adds one short guard that measures the key numbers together and fails when one gets worse.

## What it is
- **`dev/perfguard.js`** (new). It measures a curated set in about 10–12 minutes on the heavy profile
  (`dev/bigprofile.js --projects 40`: 1,500 chats, 120 long ones, 50 Lab scenes, 40 projects…). It has three parts:
  - **startup**: `dev/coldstart-report.js` runs a warm-up launch, then 5 cold starts of the same copy, so its caches are
    warm as on the owner's computer. One more start is profiled (both processes) for the culprit list only.
  - **app**: `dev/perfguard-probe.js` (new) runs through `dev/smoke.js`, 3 launches. Each launch has a session before
    (Clink opened once), a restart, then: a project cold open, 2 warm opens and 6 switches (Hearth's part, as projects72
    / coldopen73 measure it), 8 long chats opened by a real click on their list rows (time to drawn, the window's
    handlers, its CPU in the 600 ms after), 31 keys typed, 18 Lab tool calls through the fake engine's real MCP path
    (labcalls74's end-to-end time), a still Lab scene's draws over 10 s, 10 s of idle CPU on a chat, and the window's
    JS heap after a forced GC at the end.
  - **sync**: `dev/sync72-perf.js` (Node only, a Windows-slow disk), 3 runs. It measures the main-process stall of
    steady passes and small-change passes, and a steady pass's wall time.
- **Statistics.** Each launch or run gives one value per metric: the median of its own repeats. The metric is the
  median of those values. Its **spread** is their median absolute deviation (MAD). Both are saved, with the raw values.
- **`dev/perf-baseline.json`** (new, committed): per metric its label, unit, median, spread (also in %), n and values.
  It also has the top functions of each part's CPU profile and machine notes: CPUs and model, memory, OS, Node and
  Electron versions, software GL, the commit, the load average at the start and end, the minutes taken, the settings.
- **Compare mode** (the default). A metric **regresses** when it is worse than the baseline by more than
  **max(15 %, 3 × its recorded spread, its floor)**. The floor is the measurement's own grain: 10 ms for the
  event-loop histogram, 0.4 draws a second, 0.5 % CPU, and so on (in `METRICS` in perfguard.js). A regression is
  measured again once, for that part only, with its values pooled with the first ones, before it fails. One bad
  minute on the shared box isn't a regression (`--no-confirm` skips this). It prints a plain table (metric,
  baseline, now, change, allowed, verdict). For each regressed part it then lists the likely culprits: the top
  functions by self time in that part's CPU profile now, each marked "+N ms vs baseline" or "new in the top". A part
  that measured nothing also fails, since it guards nothing.
- **run-checks group `perfguard`** (opt-in): `PERFGUARD=1 node dev/run-checks.js perfguard` runs the guard
  (`dev/checks/perfguard.js`, a `driver: node` check) plus lazy and unit:boot-test. Without `PERFGUARD=1` it says
  "skipped (opt-in)".

## How to run it
- Compare (under the run lock, like every app check): `flock /tmp/hearth-run.lock node dev/perfguard.js`. Its exit
  code is 1 on a regression. Logs, profiles and `measured.json` go to `--out` (default `/tmp/hearth-perfguard`).
- On a busy box, prefer `node dev/perfguard.js --lock`. Each app-launching step (the cold-start series, each app
  launch) then takes the lock on its own, so other agents get turns in between. Don't combine `--lock` with an outer
  `flock` on the same file: it would wait for itself.
- `--only startup,app,sync` runs some parts. `--runs / --starts / --sync N` change the repeats.
  `--from <out dir>` judges a saved run again without launching anything. `--file` uses another baseline file.

## Rebaselining (after an intended change)
1. Make sure the change is meant to move a number: a feature that costs some time on purpose, a new machine, or a
   faster path you want to hold.
2. Run `flock /tmp/hearth-run.lock node dev/perfguard.js --baseline` on a quiet box. Check the load in its first
   line, and that every spread is small.
3. For one part only, run `--baseline --only app` (or `startup`, `sync`). The other parts' rows and culprits are kept.
4. Commit `dev/perf-baseline.json` with a message that says why the numbers moved.
5. A new machine needs a new baseline: the numbers are this box's (software GL, Xvfb, 4 shared CPUs), not the
   owner's Mac.

## The baseline (main 6a8482d, this box)
Medians of per-launch values. Spread is the median absolute deviation. "Allowed" is how much worse a metric may get
before it fails. The control column is a full compare run of the same tree an hour later, on a busier box (load ≈ 3).
It found no regression; two metrics came out better.

| metric | baseline | spread | allowed | control run |
|---|---:|---:|---:|---:|
| Start → first usable chat | 564 ms | ±17 | +85 ms | 557 ms |
| Start → settled (last long task) | 893 ms | ±98 | +294 ms | 580 ms |
| Project cold open (Hearth's part) | 143 ms | ±13 | +40 ms | 131 ms |
| Project warm open (Hearth's part) | 486 ms | ±3 | +73 ms | 394 ms |
| Project switch (Hearth's part) | 227 ms | ±1 | +40 ms | 238 ms |
| Long chat opened from its list row | 121 ms | ±8 | +24 ms | 114 ms |
| Chat list click: window handlers | 6.7 ms | ±0.4 | +3 ms | 6.5 ms |
| Chat list click: window CPU in the 600 ms after | 37 ms | ±0.4 | +8 ms | 39.5 ms |
| Typing: window handlers per key | 0.2 ms | ±0 | +1 ms | 0.3 ms |
| Lab tool call (no picture), end to end | 13 ms | ±2 | +8 ms | 9 ms |
| Still Lab scene: draws a second | 0.4/s | ±0 | +0.4/s | 0.4/s |
| Idle on a chat: the window | 0.1 % CPU | ±0 | +0.5 % | 0.1 % |
| Idle on a chat: every process | 1.5 % CPU | ±0.2 | +1 % | 1.5 % |
| Window JS heap after GC (end of run) | 30.8 MB | ±0 | +4.6 MB | 30.9 MB |
| Sync steady pass: main-process stall | 18.9 ms | ±0.02 | +10 ms | 18.4 ms |
| Sync small-change pass: main-process stall | 17.2 ms | ±0.8 | +10 ms | 18.5 ms |
| Sync steady pass: wall time | 247 ms | ±10 | +40 ms | 244 ms |

Time: about 7–8 minutes of measuring (cold starts ≈ 1 min, 3 app launches ≈ 1.7 min each, sync ≈ 1 min). With
`--lock`, waiting for other agents' turns adds to that: the control run took 13.5 minutes in all on a busy box.
These numbers fit the rounds' own claims: chat clicks well under 16 ms, Lab tool calls ≈ 10–20 ms, a still scene
≈ 0.3–0.4 draws a second, sync stalls < 50 ms. The cold open here (≈ 0.14 s) is lower than coldopen73's ≈ 0.3 s
because the probe opens the project after the start has settled. The warm open (‹ Projects, then the card again)
comes out slower than the cold one here. This stream didn't look into why; the guard holds each number to its own
baseline.

Three fixes were made while building the baseline:
- The idle numbers were first measured with the CPU profiler on: sampling every 250 µs cost the window ≈ 10 % of a
  CPU by itself. The idle count now runs without the profiler, which runs for 5 s afterwards for the culprit list.
- The look's ambient loops pause once nobody has used the window for a minute. The probe shortens that to 2 s, as
  idlecpu does, so idle is idle.
- Startup work that runs off the main thread doesn't appear in its CPU profiles. One example is the store thread
  reading every chat file. The startup culprit list now also gives the start's phases (splash milestones) and how
  long the main process took to answer each IPC channel.

## Proof that it catches a regression
In a scratch copy of the tree (never committed), round 73's chat-list cache (startfast73, `storework.js`
`rowsLoad`) was switched off, so every start reads all 1,500 chat files again. Then the scratch copy's guard ran
against the committed baseline: `node dev/perfguard.js --only startup --lock`. Its exit code was 1:

```
Start → first usable chat: over the line, measuring startup again to confirm…

metric                                      baseline     now           change   allowed
Start → first usable chat                     564 ms  687 ms  +123 ms (+22 %)  +84.6 ms     REGRESSED
Start → settled (last long task)              893 ms  700 ms  -193 ms (-22 %)   +294 ms            ok

Likely culprits (…):
  startup (Start → first usable chat):
       195 ms  start phase: shell → chats  (+124 ms vs baseline)
       178 ms  ipc answered: chats:list ×1  (+124 ms vs baseline)
        65 ms  start phase: start → shell  (+15.4 ms vs baseline)
     54.31 ms  ipc answered: kv:get ×35  (-0.51 ms vs baseline)
      …
✖ 1 regressed · 0 better
```

The guard named the right place: the wait for the chats list (`chats:list` answered in 178 ms instead of 54). An
earlier run of the same demo, before the IPC waits were added to the culprit list, also failed (+164 ms, +29 %). Its
culprits were only the two processes' main-thread profiles, which don't show the store thread: that is why the IPC
answers were added. The control run on the unchanged tree passed (above).

## Notes and limits
- The memory metric is a level (heap after GC at the end of a run), not growth over hours. `longrun72` (32 min) and
  `labload75` stay the real leak checks. The guard catches a big new retained structure, not a slow leak.
- "Idle 0.2 %" in round 73 was Hearth hidden in the tray. The guard measures a chat on screen (Xvfb, software
  compositing), so its idle numbers are higher and are compared only with themselves.
- Times on this box move by ±10–30 % with the load of other agents. That is why there are medians of launches, the
  MAD-based allowance and the confirmation re-run. A metric with a big spread gets a wide allowance; the table shows it.
- Files: `dev/perfguard.js`, `dev/perfguard-probe.js`, `dev/perf-baseline.json`, `dev/checks/perfguard.js` (new);
  `dev/run-checks.js` (one group line). No app code changed.

## For the patch notes
- Behind the scenes: Hearth now has a performance guard. About ten minutes of measurements check the speed-ups of
  the last rounds together: a quick start with a big history, opening and switching projects, clicking through chats,
  the Lab answering the AI's edits, a still Lab scene resting, sync passes that don't stall the app, and a quiet idle.
  If a future change makes any of them noticeably slower, the guard fails and points at the code that got busier, so
  the slowdown is fixed before it reaches you.
