# startup107: the first usable chat sooner (round 107)

Startup had been measured many times (firstscreen83/87/96, idleburst83, labload94, perf93, perf100, checks102). On the
heavy profile perfguard read about 1.05 s from launch to the first usable chat and about 4.5 s of CPU in the first
30 s. This stream looked at where the time between launch and "first usable chat" (start.js's `hearth:ready`) goes
today, with traces of every process and CPU profiles of the main process, and cut what was on that path.

**Result:** the main process no longer works through the window's load, and the store thread is ready when the window
asks for the chats list. **First usable chat in perfguard's A/B: 1,198 → 1,014 ms (−184 ms, −15 %, judged better), with
no regression**; −100 to −185 ms in three more interleaved A/B series. Nothing the window shows or does changed.

## Where the time went (HEAD 5efe9f3, heavy profile, this 4-CPU box)
One start, from the process starting (main-process clock, medians):

| step | ms | |
|---|---:|---|
| Electron's `ready` (main.js's top level ≈ 110–150 ms of it) | ≈ 240 | requires ≈ 40–60 ms; nothing big left (rounds 19 / 29) |
| window made | ≈ 290 | |
| the window's first script runs (splash.js) | ≈ 840 | the page process starting, index.html, 28 sheets, 92 script tags |
| all first-screen scripts run (DOMContentLoaded, `splash:shell`) | ≈ 930 | ≈ 100 ms of script |
| the chats list arrives (`splash:chats`) | ≈ 1,040 | **≈ 110 ms waiting for `chats:list`** |
| first usable chat (`hearth:ready`) | ≈ 1,130 | AppUI / Usage / Meter init, the config applied |

What the traces and profiles showed:
1. **The main process's thread was busy right when the window loaded.** `registerAfterWindow` ran ≈ 190 ms (profiled)
   just after the window was made: showsync's module (its Paris time formatter loads ICU's time zone data, ≈ 22 ms),
   the show night reminder checking the whole show log (`showprep arm`, ≈ 30 ms on this profile), the leave reminder,
   syncmain, and ≈ 40 more modules. Then, at ≈ 650–1,000 ms, **the engine install check** ran: engine-watch checks
   on the window's `focus`, and the window takes the focus when it is shown, so every start spawned the Claude / Codex
   version and sign-in checks from the main thread while the page loaded (≈ 100–150 ms of the thread with the pipes'
   shutdown). A timing variant proves this matters: **200 ms of extra main-thread work right after the window is made
   delays the first usable chat by ≈ 195 ms** (1,132 → 1,326 ms, 9 starts each). The window's navigation, its files
   and its first reads all pass through that thread.
2. **The store thread started on the window's first `chats:list`.** Starting a worker (an isolate, storework.js and its
   modules) and reading the list's row cache came on top of the list itself: `chats:list` answered in 100–120 ms, and
   the page had nothing else to do meanwhile (`splash:shell` → `splash:chats`).
3. The window's own side: 119 file loads (28 sheets, 64 scripts, 27 `lazy-at.js#…` tags) cost ≈ 2 ms of the browser's
   CPU each, all at once (≈ 240 ms of pool time on 4 CPUs); scripts wait for every sheet; script parsing is already
   streamed off the window's thread (91 compiles ≈ 2.6 ms on it).

## What changed
1. **The store thread starts with the window** (`store.js` `warm`, `storework.js` op `warm`, called in main.js right
   after the window is made). It starts while the page process starts, and reads the chats list's row cache back and
   checks it against the files (the same pass the list does). The window's first `chats:list` then finds it ready.
   It is a read only and answers nothing: the list still does its own full pass when asked, after any save, so a chat
   that can't be read is still a stub, never a missing chat ("never empty" unchanged); writes, StoreAck and the
   sync / settle gates are untouched (`chats:list` still waits for the startup sync pass). Started before Electron's
   `ready` it held `ready` back ≈ 30 ms, so it starts after the window instead.
2. **"After the first screen" in main.js** (`afterFirstScreen(fn)`): start.js tells the main process when the first
   screen is up (`hub.bootReady()` → `boot:ready`; at the latest 8 s after the window was made, for a page that never
   says). Kept for it, one task each from 0.3 s after:
   - **the engine install check**: engine-watch's `start` (its 30-minute schedule, wake and focus hooks) is attached
     then, and the check runs then if the window has the focus, as it did on the first focus before. An
     `engine:installs` asked earlier (the window's own engine health) runs at once, as before. One side effect: the
     check's report used to reach the window before engine-health.js (an `asap` group) listened for it, so the window
     only acted on its own check ≈ 2.5 s in; now it also hears this one. Its notice is the same single one, shown at
     most once in 20 hours (and never for test copies), so at most it comes ≈ 1 s sooner.
   - **the show night reminder's arming** (showprepmain.js) and **the leave reminder's** (leavesoonmain.js): their
     timers are armed ≈ 1 s later in the start. Any `shows:remind` / `leave:op` asked before that arms first, so the
     state they answer is the same; a reminder due in that second rings then (as after a sleep: leavesoon's "due →
     rings within 2 min").
3. **showsync-venues.js makes its Paris time formatter on first use** (a refresh of a venue's programme), not at load.

## Measured
### Interleaved A/B series (`coldstart-report --data <heavy profile>`, 3 starts a block, blocks alternating, medians)
| series | HEAD | this stream | |
|---|---:|---:|---|
| ab2 (9 a side) | 1,123 ms | 991 ms | −132 ms (store thread warmed before `ready`) |
| ab3 (9 a side) | 1,153 ms | 1,053 ms | −100 ms |
| ab5 (9 a side) | 1,152 ms | 968 ms | −184 ms |
| the window's first script (`splash:start`) | 893 ms | 768 ms | −125 ms (ab5) |
| `chats:list` answered (perfguard's starts) | 98 ms | 33 ms | the store thread already up |

### perfguard (`node dev/perfguard.js --ab 5efe9f3 --only startup,app --lock`, load-aware)
36 min, load ≤ 2.2 on 4 CPUs, 9 cold starts a side (3 blocks, alternating) and 3 app launches a side. **No
regression; first usable chat judged better.**

| measure | base (5efe9f3) | this stream | p | |
|---|---:|---:|---:|---|
| **Start → first usable chat** | 1,198 ms | **1,014 ms** | 0.99 | **better (−184 ms, −15 %; 95 % interval −245 … −59 ms)** |
| Start → first picture | 1,822 ms | 760 ms | 0.81 | ok (bimodal on this box, see below) |
| Start → settled (last long task) | 1,878 ms | 2,035 ms | 0.09 | ok (interval −141 … +1,216 ms) |
| Start → usable (every early feature in) | 8,367 ms | 8,273 ms | 0.67 | ok |
| Start → first screen: CPU, main + window | 4,840 ms | 4,780 ms | 0.23 | ok |
| First 30 s: CPU, main + window | 5,070 ms | 5,030 ms | 0.23 | ok |
| Project cold / warm open / switch (Hearth's part) | 388 / 1,784 / 1,206 ms | 411 / 1,538 / 1,108 ms | | ok |
| Long chat opened from its list row | 252 ms | 251 ms | 0.68 | ok |
| Typing: key → paint | 8.8 ms | 8.0 ms | 0.93 | ok |
| Send in a long chat → on disk | 58.1 ms | 58.4 ms | 0.48 | ok |
| Idle on a chat: every process | 11.3 % | 10.8 % | 0.7 | ok |
| Lab tool call: CPU, main + window | 304 ms | 350 ms | 0.15 | "unsure" (too close to call): measured again below |
| every other app row | | | | ok |

The CPU of a start barely moves (−40 to −70 ms): the work kept for after the first screen still runs, about a second
later. What changed is that it no longer sits on the path to the first usable chat.

An earlier full run (stopped by the 2-hour tool limit while queued behind another session's release run) had the same
startup picture: first usable chat 1,181 → 1,051 ms, first 30 s main + window 5,210 → 5,050 ms, `chats:list` 98 → 33 ms.

**The app part again, three more times** (`--only app --runs 4`, 31 min each, load ≤ 2.4), because the full run left
one row "unsure". Each run flags something different and nothing twice in the same direction once all four are in:

| row | full run | app run 2 | app run 3 | app run 4 |
|---|---|---|---|---|
| Lab tool call: CPU, main + window | 304 → 350 ms, unsure | 343 → 377 ms, unsure | 315 → 382 ms, unsure | **327 → 325 ms, ok** |
| Typing: window CPU per key | 8.6 → 8.3 ms, ok | 7.9 → 8.95 ms, **regressed** (+1.05, allowed +1) | 8.6 → 8.3 ms, ok | ok |
| Send in a long chat → on disk | 58.1 → 58.4 ms, ok | 59.6 → 79.3 ms, unsure | 55.9 → 61.7 ms, ok | 44.5 → 65.4 ms, unsure |
| Project warm open (Hearth's part) | 1,784 → 1,538 ms, ok | 1,338 → 1,707 ms, unsure | 1,647 → 1,339 ms, ok | ok |
| Project switch (Hearth's part) | 1,206 → 1,108 ms, ok | ok | 1,013 → 1,014 ms, ok | 994 → 1,098 ms, unsure |
| every other app row | ok | ok | ok | ok |

Nothing this stream changed runs during these steps: the window's only change is one `bootReady()` call at the first
screen, and the main-process jobs it moves (the engine check, two reminders' timers, the store thread's warm-up) all
happen in the first seconds, a minute or more before the app part's chats, typing, projects and Lab turns. The Lab row
(three times higher, then the same) was looked at closely: the first of its two rounds was the same on both sides in
every run, the second higher in the first three runs only. No mechanism was found and the fourth run shows none. The
typing row's base median itself moved 8.6 → 7.9 → 8.6 ms between runs. These are this box's run-to-run spread on the
app part (perf93 and perf100 saw the same rows "unsure"), not a change.

## Tried, measured, not shipped
| idea | measured | why not |
|---|---|---|
| One stylesheet instead of 28 | first usable chat −72 to −134 ms in two series (9 a side); split at the lazy groups' `cssBefore` anchors (6 sheets, which keeps every cascade order) −49 ms vs this stream | a generated 423 KB file every CSS edit must regenerate (merge conflicts for every stream that touches CSS), for ≈ 50 ms within this box's noise |
| One file for the 64 first-screen scripts | the page doesn't start (top-level names collide between files) | |
| The 27 `lazy-at.js#…` tags as one | −40 ms (9 a side, noisy) | small; the tags keep the stand-ins' order (lazy-manifest); not worth a new mechanism |
| V8 code cache for the first-screen scripts | Electron 44 compiles file:// scripts fresh every launch: 280 `produceCache`, 0 consumed, also with `v8CacheOptions: 'bypassHeatCheck'`. A preload `vm.Script` can't run in the page's (isolated) main world, and a custom scheme with `codeCache` changes the page's origin (every localStorage key) | parsing is already streamed off the window's thread; what's left (lazy compiles inside script runs) is ≈ 20–40 ms, not worth an origin change |
| Showing the window at once (not on its first frame / 0.25 s) | no gain once measured correctly (1,009 vs 968 ms). A first try looked −80 ms only because it threw before `registerAfterWindow` | |

### The first picture on this box
perfguard's "first picture" (the window on screen with its first frame) flips between ≈ 0.7 s and ≈ 1.7 s from one
start to the next, in every variant, and the page's own first paint is ≈ 0.5–0.6 s after the first usable chat even
when the window is visible from the start. Traces show why: **a single buffer swap in the GPU process blocks for
0.7–1.5 s** (`SkiaOutputSurfaceImplOnGpu::SwapBuffers`: software GL under Xvfb, swaps here take 60–1,500 ms). Every frame
the window makes waits behind it. Whether the splash's frame gets in before that swap decides the 0.7 vs 1.7 s. That
is this test machine's display path, not Hearth's code; on a real graphics card a swap takes milliseconds. It also
means "first usable chat" (the page's own mark) is the honest measure here, not what this box puts on screen.

This stream doesn't change the odds: counting every start of the A/B series above and perfguard's, the first picture
came early (< 1.2 s) in 19 of 45 starts of HEAD and 15 of 36 of this stream (42 % each). Extra main-thread work right
after the window is made (x1) made it late every time (0 of 9).

## Checks
- App checks (under `flock /tmp/hearth-run.lock`): `fastboot calmstart idlecpu lazy firstscreen96` ✓ 5/5,
  `labload94 projects showprep62 leavesoon68` ✓ 4/4 (the two reminders' own checks: `shows:remind` / `leave:op` arm
  first, so their states read as before; winperf78 is opt-in, not run).
- `node dev/run-checks.js release` (the qa app group + every unit test): **302 / 307 passed, the 3 known failures
  (KNOWN_FAIL, Codex's), 1 opt-in skipped**, 0 /tmp/hearth-* folders left. The two others, `unit:robust-engine-test`
  (a fake engine's reply timing) and `unit:labpace-test` (the Lab's frame pacing), passed when run again on their own
  right after (22 / 22, all passed); neither touches anything this stream changed.
- Unit, on their own: boot-test (3,110 checks; first screen 64 scripts, 1,689 KB, unchanged), store-thread-test (70),
  storeack-scan, datasafe-scan, showsync-test, showsync-venues-test, showsync-syndicated-test, showprep-test,
  leavesoon68-test: all pass.
- Nothing moved between the first screen and lazy groups: `lazy-manifest` not needed (no group changed).

## Files
- `main.js`: the store thread warmed after the window is made; `afterFirstScreen` / `boot:ready`; the engine check,
  showsync's `later`, leavesoon's `later`.
- `store.js` (`warm`), `storework.js` (op `warm`), `preload.js` (`bootReady`), `start.js` (one line).
- `showsyncmain.js` / `showprepmain.js` (the reminder armed via `later`), `leavesoonmain.js` (same),
  `showsync-venues.js` (the formatter on first use).
- First screen: unchanged (64 scripts, 1,689 KB of code; start.js +1 line).

## For Codex
No Codex-owned file was edited. `engine-watch.js` is unchanged: main.js now calls its `start()` after the first screen
instead of right after the window, because `start()` hooks the window's `focus` and the window takes the focus as it is
shown, which ran the whole install check while the page loaded. If engine-watch ever needs the check before the first
screen, `engine:installs` still runs it on demand.

## For the patch notes
- Hearth is ready a little sooner after you open it: your chats list and the chat you were in come up about a tenth of
  a second earlier on a big profile.
- Checking your Claude and Codex installs, and setting your show and leave reminders, now happens a moment after the
  window is ready instead of while it's opening. Reminders still ring on time.
- Nothing looks or works differently.
