# longrun72: Hearth over hours, not minutes (round 72)

The owner keeps Hearth open for days, mostly in the tray, and says the hiccups "got worse for a few versions". Rounds 65
and 70 (uilag65, mainhang65, bigprofile70) fixed startup and click stalls, but on a fresh run they found no idle
hiccups. The idea this round tested: something builds up over hours, such as memory, listeners, timers, caches, page
parts that are never removed, IPC channels or child processes. This stream built a long-run soak test on the heavy
profile and ran a compressed day in it. It found what kept growing and fixed it, then measured again.

## How it is measured
**`dev/checks/longrun72.js`** (new, opt-in): `LONGRUN72=1 node dev/run-checks.js --exact longrun72` (the `longrun72`
group adds lazy and unit:boot-test). It takes about 32 minutes on the bigprofile70 fixture (`dev/bigprofile.js`:
1,500 chats, a full quest journal, 50 Lab scenes, shows, reminders, photos), which run-checks makes the first time. The
disk is made Windows-slow (`HEARTH_SLOWFS_US=150`), and the main process's lag probe is on (`HEARTH_LOOPLAG=prof`).
`--eval "window.LR_MINUTES=8"` gives a short run, `window.LR_REPORT=1` reports without failing, and
`window.LR_SNAP='<dir>'` saves heap snapshots of the window and the main process after the warm-up and at the end.

One cycle is one "hour" of a day, about 25 s, so a 30-minute run covers about 72 hours (three days):
- **Day hours (08:00–23:00):** four long chats switched and scrolled up, and a list row clicked. A message is sent
  every hour (fake Claude), plus one to fake Astra every third hour (that chat then goes to the Trash). Sync to a cloud
  folder is on, so every saved chat makes a pass. Two of these take turns:
  - the Lab (a scene of the profile opened, then hidden)
  - the Sound desk, with the fake audio host: an instrument goes live, then the desk is left
  - Sidequest: the journal's Map tab, then the ✦ tracker opened and closed
  - dialogs: Settings, Ctrl+K with a search, a confirm, a right-click menu
  - the window hidden to the tray for 12 s and shown again
- **Night hours (00:00–07:00):** the window is hidden to the tray, the screen locks, and the computer sleeps. These
  are the real powerMonitor `lock-screen` / `suspend` / `resume` / `unlock-screen` events, so every listener hears them.
- **Every hour:** the leave reminders' fake clock (`LeaveSoon._test.clock`) moves one hour on, so the reminders ring
  on the day's timeline. Notifications are stubbed, as if Hearth were away.

**Every minute** the check takes a sample in the same state: the first long chat on screen, nothing open, after
forced GCs.
- **Window:**
  - JS heap; DOM nodes (in all, and in the page); JS listeners
  - listeners on window and document (DOMDebugger)
  - live intervals, pending timeouts, observers and object URLs, each by the line that made it
  - timeouts fired per minute, and animation frames
  - IPC listeners per channel (`hub.ipcListeners()`, new)
  - event-loop delay p99 / max (a 50 ms ticker, counted only while the window is visible) and long tasks
  - the 🐢 hiccups the "That was slow" card counts
- **Main process:**
  - JS heap; handles by kind
  - live timers by line, and timers fired per minute
  - child processes, with what they run
  - ipcMain listeners and invoke handlers
  - listeners on app / powerMonitor / the window
  - the app's processes by type, web contents
  - event-loop delay p99 / max, and busy stretches ≥ 100 ms with the app lines that started them

Growth per hour is the least-squares slope after a 4-minute warm-up. A metric "grows" when the fit is clean (R² ≥ 0.6)
and it gained more than its noise floor. For hiccups that only come later, busy stretches, long tasks, 🐢 hiccups and
the main process's p99 are counted in the first and the last third of the run. The whole series is written to
`longrun72.json`.

New test hooks (tests only, behind `HEARTH_TEST_SAVE_DIR`): `power:test` `{ longrun }` (the main process's sample,
`snapshot` for a heap snapshot) and `{ power: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen' }`. The main
process's timer probe also tracks the timers alive now, by line.

## Growth curves (30-minute run ≈ 72 "hours"; minute 4 → minute 30)
Before is the base commit (fee53a5) with the same measuring hooks. After is this branch. Both ran on the same machine
(4 shared CPUs, software GL, other agents' checks running).

| Window | Before | After |
|---|---|---|
| JS heap | 35.5 → 44.1 MB (**+19.4 MB/h**) | 35.6 → 38.4 MB (+4.8 MB/h, most of it in the first 10 min; +2.7 MB/h after) |
| DOM nodes | 29,214 → 68,179 (**+83,000/h**, R² 0.9) | 32,218 → 50,401 (no trend, R² 0: swings 50–56k with what was last open) |
| Nodes kept but not in the page | 11,370 → 43,161 (**+71,000/h**) | 14,374 → 29,530 (no trend, R² 0) |
| JS listeners | 2,673 → 6,766 (**+9,500/h**) | 2,461 → 2,446 (flat) |
| Live observers | 40 → 62 (**+51/h**) | 37 → 37 (flat) |
| Window + document listeners · intervals · pending timeouts · object URLs · IPC listeners | 394 · ≤ 2 · 16–25 · 0 · 94 (flat) | same (flat) |

| Main process | Before | After |
|---|---|---|
| JS heap | 19.7 → 22.1 MB (noise) | 23.8 → 22.4 MB (noise) |
| Handles · child processes · ipcMain listeners · app / power / window listeners · processes · web contents | 13 · 1 (the Sound desk's host) · 27 · 133 · 5 · 1 (flat) | same (flat) |
| Timers alive · fired per minute | 6–11 · 6–78 (follows activity, no trend) | same |

The main process doesn't build anything up over the day: no timer pile-up, no IPC or power listeners added again, no
child process respawning, no extra windows.

## Hiccups, early vs late (9 minutes each, ≈ 24 "hours")
| | Before: early → late | After: early → late |
|---|---|---|
| Main busy stretches ≥ 100 ms | 22 → 21 | 18 → 15 |
| Main p99 (average of minutes) | 13.8 → 12.3 ms | 13.3 → 12.0 ms |
| Window long tasks ≥ 250 ms | 6 → 5 | 6 → 5 |
| Window event-loop delay p99 (average) / max | 60 → 77 ms / 542 → 528 ms | 52 → 51 ms / 666 → 327 ms |
| 🐢 hiccups (≥ 500 ms) | 0 → 0 | 0 → 0 |

No hiccup showed up only later in these 30 minutes. What did grow was the window's memory: every opening of Settings
and of the ✦ tracker stayed in memory for good. The cost of that only shows over days. A day of normal use (say 20
Settings visits and 40 tracker openings) added tens of thousands of hidden page parts and several MB of heap. Each full GC
and style pass has more to walk the longer Hearth stays open. That fits "worse the longer it's open".

## What was found and fixed
1. **Every closed dialog stayed in memory, with everything inside it** (`a11y.js`). The keyboard helper watched each
   `<dialog>` with its own MutationObserver, and that observer's callback held its dialog. An observer that still
   observes something stays alive, so every closed Settings, confirm and picker stayed too. In the heap snapshot,
   27 "MutationObserver at watchDialog" held 24 closed Settings after 30 minutes. Now one observer watches every dialog
   and reads the dialog from the change record. The behaviour is the same: focus still goes back to the opener.
2. **Closed Settings were also held by four app-wide lists.** Each Settings opening subscribed a row to a list that
   only removed it at the next change of that thing:
   - `backupauto.js`: the backup line, kept until the backup state changed (once a day)
   - `bigscreen.js`: the size row, kept until the screen changed
   - `look.js`: the look picker, kept until the look changed
   - `sync.js`: the sync line, never removed (only if it threw)

   Now a row that has left the page (and is more than 10 s old, so one still being built is safe) goes when the next
   one is made. The sync line also goes on the next sync status.
3. **The ✦ tracker kept one closed panel per missed reminder** (`leavesoon.js`). The "missed" row remembers which
   opening showed it, and that held the whole panel. It now holds the panel weakly. The row's behaviour (it shows in
   one opening, then never again) is the same.
4. **Sidequest's map kept a chain of its old searches** (`tools/quest-journal.js`, Codex's, one line). When the map
   page redraws in place (round 65's kept map), each new search function held the previous kept page, whose search
   held the one before it, and so on. That made a chain one link longer per redraw, each link holding its old filters
   (category select, matches, the dice). The old page's search is now dropped when a new one takes over.

After the fixes, the heap snapshot's entries into page parts no longer in the page are each a single, bounded thing:
- the kept chat lists (the LRU of 12, by design)
- the last Settings' look picker, until the next opening
- the palette's reused box
- the Lab player's cached canvases
- one Meter probe span

## Not changed (reported)
- **Waking from sleep holds the main process 0.2–1.5 s here, on Linux only, and no longer later than earlier.** After
  the wake settles, filewatch re-opens every watch (`rearm()`, by design: FSEvents can drop events across a sleep). On
  Linux, Node's recursive `fs.watch` walks the data folder in JS with sync calls, and this test makes each of those
  calls slow (the simulated Windows disk). The Mac (FSEvents) and Windows (ReadDirectoryChangesW) use the system's own
  recursive watch. These busy stretches are most of the "main busy stretches" in the table, and all of them come from
  night hours. Round 70 saw the same Linux-only cost at `sync:on`.
- **The owner's 7 s main-process p99 is still not reproduced.** Here, three compressed days with the tray, sleep, wake
  and locks keep the main process at a p99 of 12–14 ms with nothing growing. If it comes back, the owner's own
  "That was slow" report after a long session is the next thing to read.
- The window's heap still rises ~2–3 MB/h after the warm-up. That is the day's chat growing (48 replies kept in the
  "today" chat) and caches warming, with no constructor or listener site behind it.

## Files
- New: `dev/checks/longrun72.js`.
- Changed:
  - fixes: `a11y.js`, `backupauto.js`, `bigscreen.js`, `look.js`, `sync.js`, `leavesoon.js`,
    `tools/quest-journal.js` (one line)
  - tests only: `powerwisemain.js` (timers alive by line; the `longrun` sample; real power events, all in the test
    hook), `preload.js` (`hub.ipcListeners()`: counts only, no data)
  - `dev/run-checks.js` (the env, the time limit and the `longrun72` group)
- Tested:
  - longrun72: 30-minute runs before, after the first fixes and after all fixes, plus a 4-minute and an 11-minute
    trial. With every fix in, nothing grows and no hiccup comes later, so it passes (the before run would fail on
    five growing metrics).
  - Passed: backupauto, bigscreen, leavesoon68, powerwise, quest-world, sync, lazy, unit:boot-test,
    unit:leavesoon68-test, unit:leavefix70-test, unit:bigscreen-test, unit:backupauto-test, unit:datasafe-scan,
    unit:winmac-test.
  - a11y (noRole on the Lab's layers box; Esc on a menu with "no opener found") and leavefix70 (timed out ticking
    Earplugs in 🎒 Before I go) fail the same way on the base commit fee53a5: they are stale, not caused by this.
  - idlecpu failed on the Lab's idle wakeups (2.3/s against a budget of 2: powerwise.js's timer and three.js's
    stallTick / rAF). That is the window's Lab, which this stream didn't touch. It ran while the labfps72 checks were
    running too.

## For Codex
- `tools/quest-journal.js`, `worldMap()`: one line before `worldKeep={…}`, marked `(round 72, longrun72)`:
  `if(keep)keep.search=null;`. The kept map page's previous `search` was reachable from the new one (its closure keeps
  `keep`), so redraws in place built an ever-longer chain of old searches and their filter nodes. If you add more
  closures to `worldKeep`, drop the old ones the same way (or avoid capturing `keep` in them).

## For the patch notes
- **Hearth stays light when it's left open for days.** Every time you opened Settings, and every time the ✦ tracker
  showed a missed reminder, a hidden copy of it stayed in memory until you quit. Over a long session that added up
  and made Hearth slower to tidy its memory, a likely part of the hiccups that got worse the longer it was open.
  Closed windows now really go away. In a test of three compressed days, Hearth's memory stopped climbing.
- **Sidequest's map no longer collects old copies of its search bar** while it redraws in place.
- Behind the scenes: a long-run test now plays a whole day on a big profile (chats, the Lab, the Sound desk, the map,
  Settings, sync, reminders, the tray, sleep and wake) and checks every minute that nothing builds up.
