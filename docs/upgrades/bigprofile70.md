# bigprofile70: the lag hunt on a heavy, owner-like profile (round 70)

The owner's complaint is still the lag: hiccups of 1–2 s "every few seconds, about everywhere", and a main-process
event-loop p99 of 7 s in his week-long report. Round 65 fixed what it found on a big chat folder (uilag65, mainhang65,
questperf65). Rounds 66–69 then added a lot that reads data: shows, tickets, leave reminders, My Paris photos, music
sessions, Sidequest layers. This stream built a profile as heavy as the owner's, ran Hearth on it in isolation,
measured both processes and fixed the biggest causes it found.

## How it is measured
- **`dev/bigprofile.js`** (new) makes the synthetic profile in a throwaway folder. Everything in it is made up, with a
  fixed seed; nothing comes from real data. `node dev/bigprofile.js <dir>` (the default is `/tmp/hearth-bigprofile70`;
  ~140 MB, ~4 s):
  - 1,500 chats over two years (folders, tags, pins, archived). 120 of them are long: 250–900 messages each, with
    Markdown, code, tables, thinking, tool steps, token usage, and pictures attached with their files (800 attachments).
    A third have .prev copies, 150 chats are in the trash, plus bookmarks and snippets.
  - Sidequest's journal, built with Codex's own QuestCore and checked by its `validate()`: the Paris map is full
    (100 places, the guide included, half of them visited), with 60 campaigns, 220 side quests, ~280 finished quests
    with a journal note, and 60 ideas.
  - 50 Lab scenes (2–4 layers of real-sized code each) and their history.
  - Shows: 600 cached Shotgun / DICE shows over the coming weeks and 25 follows. Also a show log of 120 nights, 40
    prepared nights, 80 shows with ticket files and 60 leave reminders.
  - My Paris: 400 photos (copies and thumbs on disk) on the map's places.
  - 200 music sessions with sketches on disk, the Sound bank index (6,000 presets), a year of feature use, 400 days of
    token stats and a 4,000-line work journal.
- **`dev/checks/bigprofile70.js`** (new, opt-in): `BIGPROFILE70=1 node dev/run-checks.js --exact bigprofile70`. It runs
  for about 6 minutes, and run-checks makes the fixture the first time. The disk is made Windows-slow
  (`HEARTH_SLOWFS_US=150`) and the main-process lag probe is on (`mainlag-probe.js`). The check covers:
  1. **Cold start**: the main process starting → the first frame, Hearth's ready mark, and idle (the last long task of
     either process in the first minute).
  2. **Sync to a cloud folder switched on** (the PC ↔ Mac sync). The first pass is reported. Then **2 minutes idle**
     with sync on, so its minute-by-minute passes run inside the measurement.
  3. **Typical clicks**: switching between 10 long chats, clicking 6 list rows, Sidequest's map, the Sound desk,
     Settings opened and shut, and a sentence typed in the chat box. A CPU profile of the window covers all of it.
  4. **Chatting with sync on**: that sentence sent (Enter, the fake engine answers), then the sync pass that follows
     the saved chat.

  For each phase the check reports the main process's event-loop delay (p99 / max) and its busy stretches with the app
  lines behind them. It also reports where the main process's time went, IPC handlers by time, and sync file calls.
  For the window it reports long tasks and long animation frames, plus the 🐢 hiccup count (jankmain's
  `recent().stalls`, the same thing the "That was slow" card counts). Budgets: first frame < 6 s; idle < 20 s;
  main-process p99 < 50 ms and max < 150 ms in idle / clicks / chat + sync (a max only counts when a busy stretch
  ≥ 150 ms is behind it); no hiccup ≥ 500 ms; no window task ≥ 100 ms in the idle minutes; the window's longest task
  in the clicks < 400 ms; key presses handled in < 50 ms. `window.BP_REPORT = 1` reports without failing,
  `BP_BUDGET` overrides budgets and `BP_IDLE_MS` changes the idle length.
- `mainlag-probe.js` (tests only) now also gives the process start time, its profile's start time (to place busy
  stretches in time) and `appTop` (the app's lines over the whole measured stretch).

## Numbers (this machine: Xvfb, software GL, a shared 4-CPU box; the same check, before = round 69 main 9fd5b8d)
| phase | before | after |
|---|---|---|
| cold start: first frame / ready / idle | 3.3 s / 1.5 s / 8.6 s | 3.3 s / 1.5 s / 8.6 s (7.8 s in another run) |
| startup: `shows:get` (main process, one block) | 116–200 ms | 11–28 ms |
| idle 2 min with sync on: main p99 / max | 11 ms / 46–107 ms (a GC) | 11 ms / 35–40 ms |
| idle: window long tasks, hiccups | none, 0 | none, 0 |
| clicks: main p99 / max | 14–16 ms / **224–264 ms** (185–236 ms stretches in `shows:get`) | 15 ms / **51–62 ms** |
| clicks: `shows:get` handler | 124–130 ms | 11–14 ms |
| Sidequest map open: wall / window long tasks | 1.5–2.3 s / 201–222, 125–134, 85–96 ms | 1.4–1.5 s / 164–191, 135–140, 62–74 ms |
| Sidequest render JS (CPU profile, open + Map + reopen) | `render` 548 ms, My Paris ≈ 280 ms of it | `render` 204 ms, My Paris ≈ 40 ms |
| sync first pass (5,000 files): `saveState` CPU on the main process | 1.85–2.2 s in ~200 bits of 15–70 ms | out of the top 10 (a few saves) |
| sync first pass: base `mkdirSync` calls | 1,791 (≈ 0.4–0.46 s on the slow disk) | one per folder |
| chat + sync pass: main p99 / max | 15 ms / 56 ms | 18 ms / 87 ms (a 89 ms stretch as the message went out: cost.js / store, not sync) |
| typing in a long chat: key handled (wait + handlers) | max 14–24 ms | max 14 ms |

Typing *feels* slow here only because software GL takes ≈ 50 ms per frame to paint a long chat (key → next paint is
56–232 ms on both commits). The handlers take 1–2 ms. The check reports that paint time but doesn't budget it.

## What was found and fixed
1. **Every read of the shows held the main process for 120–240 ms** (`showsync-core.js merge`). `shows:get` merges
   the cached shows of all sources on each call. Startup, the ✦ tracker and every Sidequest map open make that call.
   The merge compared every show with every show before it, building two `Date`s per pair (`nightOf`). That cost
   grew with the square of the cache, and the cache grew in round 69 (programmes, syndication, 6-month favourites).
   It now looks only at the shows that share its id or its night, still in list order, and builds each night once.
   The output is byte-identical: checked on 300 random lists with duplicate ids, date-only shows and programmes.
   1,200 shows: 235 → 32 ms. On the profile: `shows:get` 116–200 ms → 11–28 ms.
2. **Sync's state was written ~200 times in a big pass, each time turned into text twice.** The checkpoint every
   25 files wrote the whole state (every file's hashes and stat caches, ~MBs) after converting it to text twice.
   A first pass over ~5,000 files cost ≈ 2 s of main-process CPU in 15–70 ms bits. The same happens when the other
   computer brings in a lot. Now a mid-pass checkpoint happens at most every 5 s, and the text is made once when
   nothing changed. A crash still resumes cleanly: files done since the last checkpoint are compared again, never
   overwritten. The end-of-pass save is unchanged.
3. **Sync re-made the same folders ~1,800 times per big pass** (`writeBase`: a sync `mkdirSync` per JSON file). Each
   folder is now made once per run. If a folder went away, it is made again on the spot. The two places that wipe the
   base folder clear that memory.
4. **My Paris made Sidequest's map slow to draw** (`tools/parisjournal.js`, `parisjournal-core.js`, round 64, ours).
   Every timeline dot built a new date formatter twice (`toLocaleDateString`): ≈ 130 ms per map draw with a few
   hundred moments. Every show in the log looked its venue up twice by name, folding every guide place and pin each
   time: ≈ 90 ms. Now there is one shared formatter (the same words), and each name is looked up once per collect.
   My Paris went from ≈ 280 ms to ≈ 40 ms of the Studio's render.

## Not changed (reported)
- **The 2 idle minutes are clean on Linux**, even with this profile and sync on: p99 11 ms, no hiccup. The owner's
  7 s p99 is still not reproduced here. As round 65 found, it may include sleep without a 'suspend' event, or be
  Windows-only (Defender / OneDrive holding files, the cloud client's own activity).
- **`sync:on` holds the main process ≈ 0.9 s** when sync is switched on, and the first pass shows ≈ 5 s of
  `node:path` / `#watchFolder` work. Both come from Node's recursive `fs.watch` on Linux: a JS walk with sync
  readdir / stat. Windows and the Mac use the system's own recursive watch. Linux only, like round 65.
- **First paint ≈ 3.1–3.4 s on both an empty and the big profile** (the window opens at ≈ 1.0 s). Here the gap is
  long animation frames with nothing blocking: software GL presenting. The big profile adds ≈ 0.3 s.
- **The window's remaining Sidequest cost** is Codex's `quest-journal.js render()` (re-render plus page style:
  3,370 elements restyled when the map opens, a `scrollTo` forcing layout ≈ 55–85 ms) and `quest-core clone`
  (≈ 40 ms). Those are Codex's files, left as is (see For Codex).
- Smaller spread-out work (no stretch over 40 ms): costcoach's scan, tokenaudit's one-time seed (≈ 0.3 s over startup),
  diskcalm's walk, and the sync passes' per-file stat work (≈ 0.4 s of CPU per everyday pass over 5,000 files, in
  small bits, at most every 20 s while things change).

## Files
- New: `dev/bigprofile.js`, `dev/checks/bigprofile70.js`.
- Changed: `showsync-core.js` (merge), `sync-engine.js` (saveState, writeBase), `tools/parisjournal.js`,
  `tools/parisjournal-core.js`, `mainlag-probe.js` (tests only), `dev/run-checks.js` (the fixture, the probe's env and
  the `bigprofile70` group: bigprofile70, mainhang65, uilag65, lazy, unit:boot-test).
- Tested: bigprofile70 (passes after; fails before on the clicks' 185–236 ms main stretches). One run among other
  checks failed on a 160 ms stretch that was only the probe's simulated slow disk inside the trivial `parisphotos:dir`
  handler (the process waiting for a CPU on the loaded box); it passed when re-run alone, parisjournal64,
  showsync61, photos69, lazy, unit:boot-test, unit:sync-test (180 passed), dev/showsync-test.js,
  showsync-syndicated-test, showsync-venues-test, dev/parisjournal64-test.js.

## For Codex
- `showsync-core.js merge()`: the `out.find(...)` scan is replaced by an index by id and by night. The result is the
  same first match in list order, including shows whose id or night changes when merged. The parsers, `combine()`,
  `similar()` and keys are untouched. If you change the match rule, keep `venueMatch` / the two indexes in step.
- No quest / workbench file was changed. On a heavy journal, the Studio's biggest remaining cost is `render()` from
  `navigate` (the Map tab: ≈ 150 ms of script plus a 3,370-element restyle and a forced layout in `scrollTo`), and
  `QuestCore.clone` on each read (≈ 40 ms with ~550 quests and 100 places). `dev/bigprofile.js` makes that journal.

## For the patch notes
- **The Sidequest map and the ✦ tracker no longer freeze Hearth for a moment when they read this week's shows.**
  With a big list of shows, each read held the whole app for up to a quarter of a second. Now it takes a few
  hundredths.
- **Opening Sidequest's map is quicker with a long "My Paris" history** (many shows, places and photos): the timeline
  under the map draws several times faster.
- **Sync between your computers is lighter when a lot changes at once** (the first sync, or coming back after a long
  time). It no longer rewrites its own bookkeeping hundreds of times during one sync.
- Behind the scenes: a big test profile (1,500 chats, a full quest journal, shows, photos) now checks that Hearth
  stays smooth at startup, while idle with sync on, and while you click around.
