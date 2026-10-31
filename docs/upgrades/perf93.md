# perf93: did eight rounds of features make Hearth slower? (round 93)

Rounds 86–92 added windowed giant chats, sending long chats in pieces, the Lab hitch fixes, projaudit, the clearer sync
panel and Lab chats that apply code to the scene. Each was measured on its own. This stream compares the whole app
now against two releases with the load-aware guard (`dev/perfguard.js`, perfguard82): **1e73364** (round 85 release)
and **c6f9be3** (round 92 release, this branch's main).

**Answer: nothing regressed.** Every measure is the same as at round 85 within the noise, or better (a giant chat opens
6× faster). The two measures that first came out "unsure" were measured again on their own and are not slower (below).
Two cheap costs were taken off on the way: the first screen is back to 1743 KB, and a one-time job that read every
recent chat on the main process now runs on the store's own thread.

## What perfguard was missing, and what was added (dev only)
- **Startup** (`dev/coldstart-report.js`, `--cpu-at 30000`; perfguard passes it): the **first picture** (the window on
  screen with the splash), **usable** (every early feature group in) and the **CPU of the first 30 s** (main + window,
  the start left alone). `--cpu-also <ms,…>` reads the CPU again later (used below for idle on a warm profile).
- **Typing, key → paint** (`dev/perfguard-probe.js`): from the key's event to the first frame presented after it
  (requestAnimationFrame, then a message posted from it), next to the handlers per key that were there.
- **A new part `fresh`** (`dev/perfguard-fresh.js`, opt-in: `--only …,fresh`, `--fresh N`, ≈ 6 min a launch). Hearth
  starts on the heavy profile plus one giant chat (`dev/bigprofile.js --projects 40 --giant 1`: 6,000 messages, the
  bigchat84 chat) and nobody touches it:
  - memory at 30 s: the window's, the main process's and the store thread's JS heap (after a GC);
  - idle at 1 min (65–75 s) and at 5 min (300–310 s): every process, the main process, the window;
  - then Settings' first open and a second one, the Lab's first start (press → preview on screen → first frame drawn),
    the giant chat opened, and typing in it (key → paint).
  The store thread's heap needs `power:test { threadMem }` (round 91): a round-85 build has none, so that row reads
  "base lacks it" and isn't judged.

Run it: `node dev/perfguard.js --ab <ref> --lock --only startup,app,fresh,sync` (≈ 70–90 min with the lock shared).

## Before / after
Medians of every sample per side; "p" is the one-sided Mann–Whitney test that the new side is slower. Base and new were
launched in turn in the same minutes. "Now" in the round-85 table is the round-92 app (the same code as c6f9be3 apart
from this stream's measuring code). "Now" in the round-92 table is this branch with its two fixes.

| measure | round 85 | now | p | round 92 | now | p |
|---|---:|---:|---:|---:|---:|---:|
| **Startup** (9 cold starts a side, heavy profile) | | | | | | |
| Start → first picture (splash on screen) | 1076 ms | 1072 ms | 0.57 | 1053 ms | 1059 ms | 0.54 |
| Start → first screen (first usable chat) | 673 ms | 691 ms | 0.33 | 671 ms | 673 ms | 0.69 |
| Start → usable (every early feature in) | 5004 ms | 5129 ms | 0.27 | 5159 ms | 4865 ms | 0.86 |
| Start → first screen: CPU, main + window | 3500 ms | 3480 ms | 0.6 | 3470 ms | 3540 ms | 0.35 |
| First 30 s: CPU, main + window | 3730 ms | 3710 ms | 0.46 | 3710 ms | 3770 ms | 0.31 |
| **Idle** (a fresh start left alone) | | | | | | |
| Idle at 1 min: every process | 13.4 % | 13.6 % | 0.15 | 14.1 % | 14.1 % | 0.5 |
| Idle at 1 min: main process | 12.8 % | 12.9 % | 0.15 | 13.5 % | 13.6 % | 0.3 |
| Idle at 1 min: the window | 0.6 % | 0.6 % | 0.8 | 0.5 % | 0.6 % | 0.2 |
| Idle at 5 min: every process | 0.7 % | 0.7 % | 0.35 | 0.6 % | 0.7 % | 0.05* |
| Idle at 5 min: main process | 0.6 % | 0.5 % | 0.65 | 0.5 % | 0.7 % | 0.15 |
| Idle at 5 min: the window | 0.1 % | 0.1 % | 0.3 | 0.1 % | 0.2 % | 0.2 |
| Idle on a chat after using the app: every process | 3 % | 5.9 % | 0.25 | 5.2 % | 2.7 % | 0.95 |
| **Memory** | | | | | | |
| After start (30 s): window JS heap | 15.9 MB | 16 MB | 0.2 | 16 MB | 16 MB | 1 |
| After start: main process JS heap | 11.3 MB | 11.4 MB | 0.05 | 11.4 MB | 11.3 MB | 1 |
| After start: store thread JS heap | — | 5 MB | | 5 MB | 5 MB | 1 |
| Window JS heap after the whole app run | 31.4 MB | 31.6 MB | 0.05 | 31.6 MB | 31.6 MB | 0.5 |
| **Projects** (Hearth's part; window CPU) | | | | | | |
| Cold open | 192 ms (331) | 234 ms (317) | 0.5 | 228 ms (310) | 226 ms (330) | 0.5 |
| Warm open | 452 ms (590) | 660 ms (614) | 0.2 | 589 ms (505) | 695 ms (529) | 0.06** |
| Switch | 339 ms (431) | 377 ms (442) | 0.11 | 399 ms (432) | 385 ms (409) | 0.63 |
| **Chats** | | | | | | |
| Long chat opened from its list row | 133 ms | 159 ms | 0.08** | 140 ms | 133 ms | 0.29 |
| … its window CPU | 68.5 ms | 75 ms | 0.03** | 66.6 ms | 67.8 ms | 0.33 |
| Giant chat (6,000 messages) opened | 4992 ms | **843 ms** | better | 698 ms | 1065 ms | 0.5 |
| … its window CPU | 1061 ms | **193 ms** | better | 171 ms | 188 ms | 0.35 |
| Typing in a long chat: key → paint | 17.6 ms | 16.9 ms | 0.98 | 17.7 ms | 17.4 ms | 0.8 |
| Typing in a long chat: window CPU per key | 6.2 ms | 6.6 ms | 0.3 | 6.3 ms | 6.3 ms | 0.35 |
| Typing in the giant chat: key → paint | 4.3 ms | 4.5 ms | 0.03* | 4.6 ms | 4.2 ms | 0.99 |
| **Settings** | | | | | | |
| First open (window CPU) | 73 ms (50) | 84 ms (62) | 0.65 | 62 ms (52) | 106 ms (58) | 0.35 |
| Opened again (window CPU) | 33 ms (36) | 38 ms (40) | 0.25 | 34 ms (37) | 37 ms (46) | 0.1 |
| **The Lab** | | | | | | |
| First start: press → preview on screen | 153 ms | 128 ms | 0.65 | 131 ms | 140 ms | 0.35 |
| First start: press → first frame | 2257 ms | 2688 ms | load** | 2561 ms | 2313 ms | 0.5 |
| First start: window CPU | 317 ms | 368 ms | 0.5 | 307 ms | 396 ms | 0.1** |
| Tool call, end to end (CPU) | 11 ms (201) | 14.5 ms (194) | 0.1 | 14 ms (185) | 12 ms (177) | 0.36 |
| **Sync** (steady pass) | | | | | | |
| Main-process stall | 17.5 ms | 17 ms | 0.67 | 19.6 ms | 18.1 ms | 0.67 |
| CPU | 469 ms | 451 ms | 0.64 | 408 ms | 426 ms | 0.14 |

\* significant, but far inside the allowed line (0.1 % of a CPU, 0.2 ms): not a change anyone can notice.
\** "unsure" or "too loaded" in the full run, measured again on its own (next section).

The box: the round-85 run had a load of up to 8.8 on 4 CPUs during startup and fresh (perfguard said "too loaded to
tell" for those parts' doubtful rows); the round-92 run had ≤ 1.8. Full reports: `report.json` of each run.

## The doubtful rows, measured again
- **Long chat opened from its list row** (round 85 → now, +19 %, p 0.08). Measured on its own: 4 launches a side, 24
  opens each, alternating: round 85 **118 ms** (CPU 65 ms) vs now **108 ms** (CPU 62 ms). Not slower; the full run's
  +25 ms was its busy minutes. Against round 92 it was already ok (140 → 133 ms).
- **The Lab's first start** (round 85 → now, +431 ms, "too loaded": load 8.8). Measured on its own, 5 fresh launches a
  side: round 85 **1989 ms** (preview on screen 227 ms, window CPU 305 ms) vs now **1904 ms** (120 ms, 283 ms). Against
  round 92 (window CPU +89 ms, p 0.1): 6 launches a side, round 92 **2212 ms / 280 ms CPU** vs now **2022 ms / 288 ms**.
  Not slower.
- **Project warm open** (wall +18 % against round 92, its CPU fine): this stream changes nothing in projects; see the
  app-only run below.

The app part against round 92 again, on its own (`--ab c6f9be3 --only app --runs 4`, 17 min, load ≤ 1.8): **✓ no
regression**, every row ok. Project warm open came out 536 ms vs 533 ms (CPU 579 vs 567 ms); the first run's +106 ms
was waiting, not work.

## What this stream changed
1. **Chat stats moved off the first screen** (`native.js` → `chat-cmds.js`, `ChatCmds.stats`). The first screen had
   grown to 1744 KB of code (round 92's last additions). The ⋯ menu's Chat stats counting (≈ 1 KB) now
   lives in the chat commands group, which loads right after the first frame. Native.stats loads it on first use and
   shows the same message (checked in the app on a 770-message chat). First screen: **1743 / 1751 KB**, 68 scripts.
2. **The tool-use log's one-time seed runs on the store's folder thread** (`tokenauditmain.js` `seedSync`,
   `storework.js` op `toolSeed`). On a profile that has no tool-use log yet (a first start, a new computer), the budget
   group read and parsed every chat of the last 35 days **on the main process**. A main-process profile of such a
   start showed `seed` at **1,032 ms** of main-thread time between 10 and 30 s. A 55 MB giant chat is one
   `JSON.parse` there. Now the same function runs on the store's second thread (the one for folder work, so saves
   never wait for it). The answer is identical: checked against the old async seed on both test profiles (33 and 36
   days of history), `dev/tokenaudit-test.js` passes, and in the app the log is written as before. Without a store
   thread it falls back to the old way.

## Where startup and idle time goes now (and what's left)
Measured with main-process CPU profiles over the first 95 s (`dev/boot-probe.js`, `HEARTH_BOOT_CPUPROF_MS=95000`),
the lazy groups' load times, and `coldstart-report --cpu-also` on a warm profile:
- **The busy minute after a first start is the recall index**, not a regression. The 13–14 % at 1 min (in both rounds)
  is the store thread building recall's index ("what did we decide about X?"). It starts 45 s after the start and runs
  in paced slices at ≤ 11 % of a CPU (idleburst83). The main process's own JS thread is idle then (24 ms in 15 s). The
  `fresh` part copies its profile for each launch, so it always starts with no index (and no chat-list cache). On a
  warm profile the index is read back from disk: `coldstart-report --cpu-also 65000,75000` on a profile used before
  gives **0.4 %** for the main process at 1 min, and 0.5–0.6 % at 5 min. So the `fresh` part's 1-minute number is the
  first start on a new computer or after a restore. A later start doesn't have it.
- **The Lab's code, right after the first frame.** The `lab` group (≈ 3.4 MB of code, `asap` since round 29) takes
  200–350 ms of the window's time just after the first screen at every start. It is the biggest single item after the
  first screen. Deferring it would make the first Lab press slower, and many features expect it. That needs its own
  stream; it's not a cheap change.
- **Codex-side groups loaded at start without being used**: `creative` (40–57 ms, ≈ 0.7 s in, when the last project
  is restored: `project-workspace.js` loads lab + board + creative together) and `questjournal` / `questcore` /
  `leavesoon` (≈ 100–140 ms, ≈ 17 s in). They were the same at round 85. They're in Codex-owned files, so they're
  listed below, not changed.
- **The Lab's first start** waits ≈ 1.6–1.9 s after the preview is on screen for its first frame. The window's own
  CPU is only ≈ 0.3 s of that. The rest is the preview page booting three.js and compiling shaders, in software GL
  here.
- **The first 30 s** cost ≈ 3.7 s of CPU (main ≈ 1.9 s, window ≈ 1.8 s), almost all before the first screen is
  settled. Only ≈ 0.15 s comes after. The main process's JS is ≈ 0.6 s of it; the rest is Chromium's own browser
  process work. Same as round 85.

## Checks
- perfguard A/B against round 85 (all four parts, 91 min, load up to 8.8): no regression, 2 better (the giant chat).
  "Inconclusive" only on the two rows measured again above. Against round 92 (68 min, load ≤ 1.8): no regression;
  "inconclusive" on two rows measured again above. The app part again on its own (17 min): ✓ no regression.
- `idlecpu calmstart fastboot` ✓ · `lazy projects chatwindow72` ✓ (under the run lock).
- Unit scans `unit:datasafe-scan unit:winmac-test unit:errorcalm-scan unit:storeack-scan unit:chatsafe-scan
  unit:chatwin-scan unit:boot-test unit:lazymanifest-test`: 8/8 ✓ (chatwin-scan's counts updated for the stats move:
  chat-cmds.js 32 → 33, native.js 74 → 73; the stats run only after the chat is loaded whole).
- `dev/tokenaudit-test.js` ✓.

## Files
- App: `native.js`, `chat-cmds.js` (Chat stats), `tokenauditmain.js`, `storework.js` (the seed).
- Measuring: `dev/perfguard.js`, `dev/perfguard-fresh.js` (new), `dev/perfguard-probe.js`, `dev/coldstart-report.js`,
  `dev/chatwin-scan.js` (counts).

## For Codex
No Codex-owned file was edited. Two things for you to consider:
- `project-workspace.js` loads `creative` together with lab and board on every project open, including the one
  restored at start (≈ 40–60 ms of the window's time ≈ 0.7 s in). If the Workbench's `setProject` could wait until
  the Sound / Creative board tab is first shown, that time would come off every start.
- Something loads `questjournal` / `questcore` ≈ 17 s into every start (≈ 100–140 ms of window time), with no quest
  opened. Loading them only when the quest HUD needs them would save that.

## For the patch notes
- We checked whether the last eight updates made Hearth slower. They didn't: starting up, sitting idle, memory,
  opening projects and chats, typing, Settings, the Lab and sync are all as fast as before, and a very long chat now
  opens about six times faster than it did eight updates ago.
- The first time Hearth sets up its "which tools did each AI use" history (a new computer, or a fresh install), it no
  longer freezes for a moment while it reads your recent chats. That work now happens in the background.
- A little less code loads before the first screen appears.
