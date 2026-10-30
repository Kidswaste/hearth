# longrun91: Hearth after a whole working day (round 91)

The owner keeps Hearth open all day on his Windows PC and said "the app is just slow". Recent rounds fixed many
causes, each measured on a fresh start or a single action. What had never been measured since round 72 is how
Hearth behaves after **hours** of the things he does now:
- switching projects
- the giant chat
- the Lab's scenes
- the Usage window and the sync panel
- Find in a project
- sync with his second computer

Round 72 covered a day of chats, the Sound desk and Sidequest. This round built a long-session driver for the newer
parts and looked for anything that only grows: memory, page parts, listeners, timers, idle CPU, and each process and
thread on its own (the window, the Lab page, the main process, the store thread and the files thread).

## How it is measured
**`dev/checks/longrun91.js`** (new, opt-in): `LONGRUN91=1 node dev/run-checks.js --exact longrun91` (the
`longrun91` group adds idlecpu, unit:store-thread-test and unit:boot-test). It runs on the **bigchat84** fixture
(`dev/bigchat84-fixture.js`): 40 chats, 4 projects with their scenes, and one GIANT chat of 6,000 messages (≈ 63 MB).
All of it is made up, never real data, and run-checks makes it the first time. **`dev/longrun91.js`** (new) is the
by-hand driver: it runs the same check, prints the table, and with `--snap <dir>` diffs heap snapshots by constructor
and shows who holds a constructor's newest objects (`--who Name`). `--diff <dir>` redoes that part on snapshots
already taken.

A working day is squeezed into **24 cycles, about 10.5 minutes**. One cycle:
- **a project**: opened (the four in turn; the fixture's project whose scene "hasn't arrived from the other computer"
  says so and is left out), its Desk's *Find in this project* with a word, then left for the chats
- **the giant chat**: opened (windowed), scrolled up, and on every other cycle Alt+F for a rare word, then Escape.
  Two other chats are opened after it, so it is closed again.
- **a message** sent in the day's chat and answered (fake Claude). Every 4th cycle that chat is deleted the way the
  panel's Delete does it (to the Trash, 30 days to undo) and a new one starts.
- **the Lab**: opened, one scene then another drawn, then left
- **windows**: Settings, the Usage window and the sync panel, each opened and closed
- **search**: Ctrl+K with "sync", then with "?<rare word>" (the chats' full-text search), and the chats' search
- **a sync pass** on the fake two-computer setup: "Studio Mac" (a machine record in a temp cloud folder) changes one of
  its chats there, then Sync now. Nothing is uploaded anywhere: the "cloud" is a temp folder.

**Every 3 cycles** a sample is taken in the same state: a small chat on screen, nothing open, the Lab hidden. Everything
is GC'd first: the window and the Lab page through DevTools, the main process and each store thread through their own
`gc()` (`--expose_gc` set at runtime, tests only).
- **Heap**: the window, the Lab page (its own process), the main process, the store thread and the files thread.
  The threads also report each cache's size.
- **DOM**: nodes in all and in the page, nodes per region (the chat list, each surface, each kept chat list)
- **Listeners**: JS listeners, and listeners on window and document, by type and by the line that added them
- **Timers**: the window's pending timeouts, live intervals and observers, each by the line that made it (wrappers this
  check installs; nothing in the app); the main process's live timers by line; IPC listeners on both sides
- **Idle CPU**: 10 s with nothing asked of Hearth, every process's CPU time, and the store threads' busy time. Each
  renderer that used ≥ 1 % is listed with the pages it runs, and any animations, animation frames and timer fires in
  that window.

**The verdict** uses the post-GC numbers by **cycle**, never wall time. After the first two samples (warm-up), the
Theil–Sen slope (the median of every pair's slope, so one odd sample doesn't tilt it) must stay under a small limit for
each heap, the DOM nodes, listeners, timers, observers and IPC listeners. Idle CPU must not climb more than 3 % of a
CPU over the run. Debug options (`LR91_PARTS`, `LR91_TRACE`, `LR91_STORESNAP`, `LR91_IDLE_PRE`) are listed in the
check's header.

New test hook (tests only): `power:test { threadMem }` asks each store thread for its heap after a GC, its caches'
sizes, and optionally a heap snapshot (`storework.js` `_mem`). The hook throws unless `HEARTH_TEST_SAVE_DIR` is set,
and nothing in the app calls it.

## Growth after the warm-up (cycle 6 → cycle 24, the same check both times)
"Before" is this branch with only the old `director-dock.js` put back (`dev/smoke.js --app`). "After" is this branch.
Both ran on the same machine (shared CPUs, software GL), one after the other.

| Window | Before | After |
|---|---|---|
| JS heap | 37.6 → 39.7 MB (+120 KB/cycle) | 38.6 → 39.6 MB (+60 KB/cycle: JIT code, no object behind it) |
| DOM nodes | 11,943 → 15,772 (**+67/cycle ✖**) | 11,821 → 15,091 (+34/cycle: the day's chat, see below) |
| Nodes kept out of the page | 5,999 → 6,605 (+48/cycle) | 5,857 → 5,904 (+14/cycle) |
| JS listeners | 2,388 → 2,663 (**+15.5/cycle ✖**) | 2,324 → 2,314 (flat) |
| Window + document listeners | 415 → 433 (**+1/cycle ✖**, `document pointerdown`) | 410 → 410 (flat) |
| Intervals · pending timeouts · observers · IPC listeners | 1 · 12–14 · 41–42 · 96 (flat) | same (flat) |

| Other processes and threads | Before | After |
|---|---|---|
| Lab page heap | 5.1 → 4.8 MB (flat) | 5.2 → 4.9 MB (flat) |
| Main process heap | 20.2 → 19.4 MB (flat, swings 19–21.6) | 20.2 → 21.9 MB (+27 KB/cycle, the same swings) |
| Main timers alive · IPC listeners · handles | 7–8 · 27 · 11 (flat) | same |
| Store thread heap | 84.7 → 83.2 MB (swings 18 ↔ 82 MB, see below) | 84.7 → 83.3 MB (same swings) |
| Files thread heap | 5.0 → 3.7 MB | 5.0 → 3.4 MB |
| Idle CPU, % of one CPU (each sample) | 2.3 · 7 · 6.8 · 3.8 · 4.5 · 9.4 · 1 · 3.5 · 33.8 | 2 · 9.1 · 2.8 · 3.7 · 41.1 · 3.4 · 4.3 · 4 · 32.6 (+1.8 over the run: no climb) |

The before run fails on DOM nodes, JS listeners and window + document listeners. The after run passes.

## What was found and fixed
1. **Every re-docked director kept its old strip alive, forever** (`director-dock.js`). A tool's docked director (the
   Lab's, a project's) is attached again each time its dock changes: a project opened, the Lab shown with another
   director. `attach()` added a `pointerdown` listener on `document` to close the activity list, and `off()` never took
   it away. That listener's closure held the old strip, chips, list and thin bar, with every listener on them: ~15
   listeners, one document listener and their page parts per re-dock. The log showed it plainly: `+18 pointerdown
   Object.attach director-dock.js:104` and 72 chip buttons' listeners in 18 cycles. Now the listener is named and
   `off()` removes it. Nothing else changes: the list still closes on a click outside the strip.

## Looked at and not changed
These all looked like growth at first, but each one is bounded or by design:
- **Idle CPU at first read 13–18 % of a CPU after the first cycle** (0.1–4 % before it), almost all in the GPU
  process. Bisecting by part, a raw compositor trace and a 65 s wait showed it is the look's ambient loops during the
  minute after the last input (`idlecpu.js`'s hush, by design). On this machine's software GL each frame is a 30 ms
  full-window swap. Once hushed it is 0.1 %, and it never grew from cycle to cycle. The check now sets the hush to 3 s
  (`idlecpu.hushMs`, the app's own test knob, in the throwaway profile) so its quiet window measures Hearth left
  alone. Two samples still read 30–40 %: a sync pass finished in the quiet window (the store threads busy, "Sync done"
  in Progress), which is real work arriving late, not a climb.
- **The store thread swings between 18 and 82 MB.** The ~60 MB is *Find in this project*'s index (`projfind-core.js`,
  `findIdx`) holding the text of the project Clink's chats, the giant one included, as strings (54 MB of strings in the thread's heap snapshot). It is let go 20
  minutes after the last find, or replaced when another project is searched, so it alternates with the projects and
  never adds up. The giant chat's own find buffers (`winFind`, `bigSearch`) are Buffers outside the JS heap and are
  let go after 10 minutes.
- **The main process gains ~75 `FSWatcher`s over the run.** These are Linux only: Node's recursive `fs.watch` there
  is one watcher per folder, and the day makes new folders (versions of new chats, cloud folders). Windows and the Mac
  use one system handle per watch. Its JS heap does not grow.
- **The window's heap still rises about 60 KB per cycle.** The snapshot diff shows no JS constructor growing. The gain
  is V8's compiled code (more of the day's features used) and Blink's layout objects for the page parts on screen.
- **DOM nodes still rise about 34 per cycle.** That is the day's chat: two messages per cycle, about 88 nodes a cycle, and it
  starts again every 4 cycles. Deleting a chat takes its kept list with it (checked by region: the list count goes
  back to one).
- **Smaller ones, all bounded:**
  - `panel.js`'s "Show N more" buttons are kept by count, then pruned past 64
  - `chat-rest.js`'s observers belong to each kept chat list (12 at most)
  - the Usage window's 30 s countdown interval stops itself on its first tick after the window closes
  - the store thread's `written`, `index` and datasafe caches are one entry per file or store

## What's left
- **A project's Find holds its chats' text on the store thread for 20 minutes** (about 60 MB for Clink with the giant chat).
  It doesn't grow, but the giant chat could be searched by its bytes the way chat Find and the chats' search already
  do (`bigchat-core.js` `searchIndex`). That's a change to the find index, outside a leak fix.
- **A tip waiting while something is in the way looks again every 0.7 s** (`hints.js` `pump`, ~1.5 timer wakeups a
  second while idle). It is flat from the first sample on and cheap per look; a later round could look again on the
  event that frees the way instead.
- Measured here, on Linux with software GL. The owner's Windows GPU makes each frame far cheaper, and his watches are
  single handles. The Windows-only parts (the tray, sleep) were round 72's.

## Files
- New: `dev/longrun91.js` (the driver), `dev/checks/longrun91.js` (the check), `docs/upgrades/longrun91.md`.
- Fix: `director-dock.js`. It is on the first screen; still 1,741 / 1,751 KB.
- Tests only: `storework.js` (`_mem` op), `store.js` (`_threadMem`), `powerwisemain.js` (`power:test { threadMem }`,
  refused outside tests).
- `dev/run-checks.js`: the `longrun91` group.
- Tested:
  - longrun91 before and after (above), plus bisect runs by part
  - passed: idlecpu, calmstart, lazy, projects, chatwindow72, sync72, chatwindow86 (`CHATWINDOW86=1`; one
    "can't tell under load" on its edit step: a 65 ms task with 40 ms of its own CPU, the rest waiting for a CPU)
  - passed: unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:storeack-scan, unit:chatsafe-scan,
    unit:chatwin-scan, unit:boot-test, unit:lazymanifest-test, unit:store-thread-test, unit:chatcalc87-test

## For Codex
- Nothing of yours changed. No Codex-owned file (quest-*, projects*, project-workspace*, sync-engine.js,
  cloud-files.js, workbench-*, creative-vst*, astra*, engine-watch) was edited. The project workspace, its banner
  worker and the sync engine were measured over the day and nothing in them grew.

## For the patch notes
- **Hearth no longer collects hidden copies of the director's bar.** Every time you opened a project or the Lab, the
  little activity bar above the docked chat was rebuilt, and the old one stayed in memory with all its buttons until
  you quit. Over a day of switching projects that kept adding up. Old bars now really go away.
- **We tested a whole working day in fast-forward.** Projects, the giant chat, sending messages, the Lab's scenes,
  Settings, the Usage window, the sync panel, search and syncing with your other computer, over and over. Memory,
  background timers and how busy Hearth is while you're away all stay flat over the day now. When you leave it alone,
  Hearth uses next to no processor time, and that doesn't creep up the longer it stays open.
