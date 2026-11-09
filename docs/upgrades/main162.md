# Round 162 · main162: the main process, lighter and quieter

The owner wants Hearth lighter and quicker to start. Rounds 151 / 154 / 157 measured the windows; this round measured
the **main process** (main.js and its ~110 modules) from the process start to an hour-like session, and cut what it
does for nobody. No feature removed, no safety net moved.

## How it was measured

- **Start**: `dev/coldstart-report.js --runs 10` (median of 10 launches after a warm-up, an empty profile, fake engines;
  main-process marks from `dev/boot-probe.js`, its per-module `require` times through `Module._load`), plus one launch
  with `--profile` (a sampling CPU profile of the main process). Before = a copy of round 159's merge (ca7c6bc).
- **Steady state and session**: `dev/main162-measure.js` (a smoke.js script, not a check; new): `node dev/smoke.js
  --fake-engines --check-timeout 1500000 --script dev/main162-measure.js [--app <old copy>]`. A chat open and untouched
  for 60 s (after 75 s of start-up), the same with Hearth hidden, a ≈ 100 KB reply streaming (fake engine `huge-text`),
  then a session: 10 chats with a reply (5 deleted), the Lab shown, the Lab window opened and closed 10 ×, back to the
  chat, idle 60 s. Per phase: the main process' CPU (`process.cpuUsage`, all its threads), its timer wake-ups by the line
  that made them (powerwise's test probe), and **every file event under the data folder** (new test hook
  `power:test { writes }`: a recursive fs.watch on the temp data folder; one save is ~3 events: temp file, rename,
  `.prev` copy). Heap after a GC, listeners on app / powerMonitor / the window, IPC handlers, web contents
  (`power:test { longrun }`), and Hearth's modules loaded (new `power:test { modules }`). The old copy got this round's
  powerwisemain.js (test-only code) so both sides count the same way.
- This box: 4 shared CPUs, software GL, Linux, Xvfb. Two other agents ran checks between my runs (the shared lock kept
  them apart).

## Ranked offenders (before)

| # | What | Cost (before) | Where |
|---|---|---:|---|
| 1 | A streaming reply: pieces sent to the window every 40 ms | **23 IPC sends / s**, 1,460 main wake-ups / min, 73 ms CPU / s | engines.js `batched` (the chat paints at most every 60 ms) |
| 2 | …and a new idle timer for every piece of output (clear + set ≈ 250 times a second) | timer churn on every line (dominant in the profile with the test probe on) | engines.js `touch` |
| 3 | The config safety net (a stat of 4 files) every 10 s | **6 of 6** idle wake-ups a minute | main.js `config-stat:files` |
| 4 | Main-process work between the window being made and shown | 107 ms busy: `registerAfterWindow` 53 (sync module 9.7 incl. its engine, lazyIpc reading 35 sources 4.2, capture 3.2, portable 3.2, gamebridge 2.5, config watchers 2.5…), `createWindow` 27 (BrowserWindow 17, native), `session.defaultSession` 11 | main.js `whenReady` |
| 5 | Modules loaded by the first screen | 110 (113 settled): the sync engine + 8 helpers with sync off, the 40 KB frame reader, the engines module for `engine:status` in front of the chats list | syncmain.js, capturemain.js, main.js |
| 6 | Hidden | 2 wake-ups / min (memtrim's arm, bgmain), 0.3 ms CPU / s | fine |
| 7 | Writes | idle **0**, hidden **0**; after the session 23 events / min for a minute (the window's own stores ui-usage / speed / jank-log saved after use, each with its `.prev`); streaming 279 / min (the chat's saves, the crash journal every 0.8 s) | already write-on-change |
| 8 | Leaks | none found: 10 Lab windows opened / closed → 0 listeners, 0 IPC handlers, 0 web contents left, heap +0.7 MB | — |

**mem154's claim** ("the main process already loads modules lazily"): true of the mechanism (36 modules behind
`lazyIpc`, 9 behind `later()`), but by the time the first screen settles **110** of Hearth's own modules are in: 8 of
the 36 lazy ones are pulled in by the window's own first calls (aemain, diskcalmmain, filewatchmain, hooksmain,
updatermain, tokenauditmain, twocomputersmain, assetsmain), and `engines.warm()` loads the tool guides (mcp/*) 8 s after
the start on purpose (the first message's speed). 28 of the 36 stay out.

## What changed

1. **Streamed pieces every 60 ms, 250 ms while hidden** (engines.js `batched`): matches the chat's 60 ms paint; while
   Hearth's window is hidden nobody sees the text grow. The first text still goes at once; the reply is byte-identical.
2. **One idle timer per engine run** (engines.js `touch`): the 50-minute "stopped answering" timer is re-armed only when
   it fires early, instead of being cleared and made again for every piece of output. Same stop, same time.
3. **The config safety net every 30 s** (was 10 s; 3 min hidden, as before ×6). fs.watch still tells a change at once
   (the check: 103 ms); the watchers are armed once the first screen is up, with a check right after so nothing in
   between is missed.
4. **Sync's engine on first use** (syncmain.js): sync-engine.js and its 8 helpers load when sync is on, or when a cloud
   drive really has a Hearth folder; a computer that doesn't sync never loads them. With sync on, `ready()` loads it at
   the start as before (the startup pass still runs before the window reads your data).
5. **The frame reader and the WebM fixer on first use** (capturemain.js; the first capture call loads them).
6. **lazyIpc's channels kept between starts** (main.js): the channels read from each lazy module's source are cached in
   Electron's profile folder by the file's size + modified time (35 stats instead of 35 reads and searches); a changed
   file is read again. boot-test still proves source = register().
7. **`engine:status` answered one turn later** (main.js): the first screen asks it with the chats list and waits for the
   list, not for this; loading engines.js and looking for both programs no longer go in front of the list.

Kept exactly: the single-instance lock, crash journal (still every 0.8 s while a reply streams), protocol handlers,
updater scheduling, sign-in state, store read-failure handling, the sync startup pass, quit flush.

## Before → after

| | Before | After |
|---|---:|---:|
| Window on screen (ms since the process started, median of 10) | 438.7 | 431.1 · 443.5 (two runs: **unchanged within noise**) |
| Window made / ready-to-show / first screen up (median of 10) | 169 / 502 / 516 | 158–173 / 486–488 / 476–505 |
| Main `require` time in the 3 s after the window | 34.7 ms | **27.2 · 28.6 ms** (sync 8.7 → 3.8, capture 3.3 → 0.7) |
| Hearth modules in at the first screen / settled / after the session | 110 / 113 / 117 | **102 / 105 / 109** |
| Idle, chat open: main CPU · wake-ups · data-folder events | 3.3 ms/s · **6 / min** · 0 | 3.2 ms/s · **2 / min** · 0 |
| Hidden: main CPU · wake-ups · events | 0.3 ms/s · 2 / min · 0 | 0.2 ms/s · **1 / min** · 0 |
| A reply streaming: main CPU · wake-ups · pieces sent | **73.3 ms/s** · 1,460 / min · 23 / s | **58.8 ms/s** · 1,010 / min · **15.6 / s** (hidden: 3.6 / s) |
| Streaming: data-folder events | 279 / min | 265 / min |
| Main working set settled / after the session | 198 / 213 MB | 198 / 215 MB (same: it is Chromium's) |
| Main JS heap after a GC: settled · session growth | 11.7 MB · +0.7 | 11.3 MB · +0.7 |
| 10 Lab windows opened / closed: listeners, handlers, contents left | 0 | 0 |

The CPU figures are taken with the test's timer probe on (it captures a stack per timer), which magnifies timer churn:
outside tests the streaming saving is smaller than 73 → 59, the wake-up and send counts are exact. The start barely
moves because the main process isn't the start's bottleneck: of the ≈ 290 ms from Electron's `ready` to the window on
screen, the main thread is busy ≈ 107 ms, mostly creating the window and its session (native), and the renderer's own
launch and first frame take the rest.

## Seen, not changed

- `engines.warm()` (8 s after the start) loads the tool guides into the main heap: on purpose (the first message).
- The window's first calls pull in 8 lazy main modules within seconds (above); answering those without loading the
  module would need the window to ask later (renderer side: boot160's scope).
- The crash journal rewrites the whole streaming reply every 0.8 s (≈ 70 writes / min while streaming): a safety net.
- After use the window saves ui-usage / speed / jank-log a few times (3 events per save with the `.prev` copy and the
  temp file); they stop on their own within a minute.
- `session.defaultSession` (11 ms) and BrowserWindow creation (17 ms) are native and unavoidable before the window.

## Check

`dev/checks/main162.js` (`node dev/run-checks.js --exact main162`; group `main162`): the window up within 1.5 s and the
first screen within 3 s · the sync engine and frame reader not loaded once settled, the frame reader loads on the first
capture call and answers · idle ≤ 3 main wake-ups / min, no stat polling, nothing written · settings changed outside
Hearth reach the window within 5 s · hidden ≤ 3 / min, nothing written · a streaming reply's pieces ≤ 18 / s shown, ≤ 5 /
s hidden, the same whole reply both ways · 10 Lab windows leave no listener / handler / contents, heap within 3 MB.
On round 159 it would fail idle (6 / min), streaming (23 / s) and lazy. `dev/checks/powerwise.js`: its "half pace"
step now expects the config net at 60 s (30 s × 2).

Runs: see the end of this file.

## For Codex

No Codex-owned file was edited.
- `codex-server.js` line ~133 `touch()` has the same pattern as engines.js had: `clearTimeout` + a new `setTimeout`
  for every event of a Codex turn. The one-timer form (re-arm only when it fires early, from `lastEvent`) gives the same
  stop with no per-event timer. Not measured here (the fake Codex streams little), so not a top offender in these runs.
- `sync-engine.js` is now loaded on first use by syncmain.js (`SE()`): nothing in it changed; a new top-level side
  effect in it would now run only when sync starts.
