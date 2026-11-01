# syncstall103 (round 103): sync's own holds of the main process at 50,000 files

Round 102 (`checks102.md`, "For Codex") found that with 50,000 small files sync held the event loop for **287–604 ms**
in the first pass and the second computer's join (blocked, not on a CPU) and **307–362 ms** in a folder rename (on a
CPU). These are the code's own holds, not load. In the app the engine runs in the main process, so a hold freezes every
window's IPC: the owner feels the whole app pause.

This round finds each hold, says whose it is (the engine, `sync-engine.js`, or the two-computer simulator under it,
`dev/sync-sim.js`), and fixes it. Since synchard74's `many` (`dev/synchard74-test.js`) now judges the code's own work
phase by phase, against a budget of 150 ms.

Files: `sync-stall.js` (new: sync's long loops in slices), `sync-engine.js` (small edits, each marked
`(round 103, syncstall103)`, listed under "For Codex"), `dev/sync-sim.js`, `dev/loadwait.js` (`stallWatch`),
`dev/synchard74-test.js`, `dev/syncstall103.js` (new: the hold finder), `dev/syncstall103-mixed.js` (new: one computer
on the previous release), and a `syncstall103` group in `dev/run-checks.js`.

## How the holds were found
`node dev/syncstall103.js --many 50000` runs synchard74's `many` (first pass, steady pass, the Mac's join, 5 folders of
1,000 files renamed) with each phase under `stallWatch` (each hold split into the code's own work and its wait for a
CPU) and a CPU profile (the inspector's: the same samples `--cpu-prof` writes). Laid over every hold of 40 ms or more:
- the profile's samples inside it, each put on **engine** (the deepest app frame) or **sim** (a `dev/sync-sim.js`
  frame above that app frame: the simulator's work, which the app doesn't have);
- **every sync fs call of 5 ms or more** inside it, with its caller. This matters because a sync call on a busy disk
  sleeps where it can't be interrupted, and the profiler's sampler can't see it: the 287–604 ms holds had 2–9 samples
  each;
- the garbage collector's pauses (`perf_hooks`), and optional section marks (`--marks`: a temporary
  `globalThis.__mk(label)` in the engine, used once here, never committed).

## What held the loop (base `729f245`, profiled, box loaded)
| phase | longest hold (own, of it on a CPU) | whose | the call / the loop |
|---|---|---|---|
| first pass | **563 ms** (549 own, 2 on a CPU) | simulator | `ci()`, its case-insensitive name lookup, ran a `readdirSync` of the 1,000-file target folder on the event loop under the engine's async `fsp.mkdir` / `fsp.open` of every new file (`casWrite`): 13 calls, 3.0 s in all, up to **562 ms** each. Also `existsSync` for each part of the path under `writeFlushed` (up to 304 ms) and `same()` (up to 196 ms). |
| steady | 74 ms (79 own, 79 on a CPU) | engine | `probeWin` (Windows' cloud-file check): `[...files].filter(…)` over all 50,000 cloud entries in one go (`cachedThere` / `cachedHere`), with a `require('./cloud-files')` per entry |
| join | 137 ms (137 own, 3 on a CPU) | simulator | the same `existsSync` under `writeFlushed` (139 ms) |
| rename | **353 ms** (349 own, 349 on a CPU) | both, about half each | engine: `probeWin`'s filter and the 5,000 paths made by `Ent.file`'s getter; simulator: `view.attributes` (the PC's stand-in for PowerShell) ran the sync `ci()` lookup on each of the 5,000 paths |
| first pass (CPU) | 82 ms once the above were fixed | engine | the rename matching: `adds` built the push / pull maps by hash over 50,000 plan entries in one go, reading `state.base` (a watched map, through its Proxy) for each, twice; plus `live` / `ops` / `dels` filters |

The engine's own sync file calls on a pass didn't show at 50,000 tiny text files, but they run once per JSON store
pulled, merged or renamed in real data (≈ 1,800 stores on the owner's profile) and once per pass:
- `localJsonText`: `openSync` + `readSync` + `closeSync` of the store, and `readFileSync` of the settings file;
- the merge's base: `readBase` (`readFileSync`);
- `keepScenesAside`: `readFileSync` of the Lab's scenes (megabytes), then `mkdirSync` + `writeFileSync`;
- `refreshExt`: a `statSync` of `kv/video-library.json` every pass, a `readFileSync` when it changed, an `existsSync`
  per new render;
- `renameThere` / `renameHere`: a `readFileSync` of the base text;
- `copyBig`: `readJsonSync` + `statSync` of the resume note and part;
- a fresh start: `rmSync` of the whole `base/` folder.

**And the measurement itself**: `stallWatch` reads `/proc/<tid>/schedstat` of every thread every 5 ms, with sync
calls. With the disk saturated these reads took up to 27 ms (191 ms once), and they fell into the next hold as the
code's own: a first pass "held" 129 ms with 3 ms on a CPU, and the profile's one sample was that read.

## The fixes
**Simulator (`dev/sync-sim.js`)**: the async wrappers look names up asynchronously, on the thread pool (`ciP`), as the
OS does inside the call. The sync wrappers keep the sync lookup. To keep the pool calls to a minimum (the simulator's
wall times are perfguard's `many.first` / `many.steady`):
- a read (`stat`, `lstat`, `readFile`, `readdir`, an `open` for reading) tries the name as spelled first, and looks
  it up only on ENOENT;
- a new name in a folder that is there as spelled lists only that folder;
- a temp name the engine made up (random lowercase hex) lists none, because no other spelling of it can exist;
- `view.attributes` with no placeholder anywhere looks nothing up; with placeholders, each path asynchronously.

Creating, removing and renaming names keep the full lookup, so the simulated case-insensitive disk behaves exactly as
before (sync72's case-only renames, NFD names, provider copies: all pass).

**Engine (`sync-engine.js` + `sync-stall.js`)**: the loops over every file give the event loop a turn (the engine's
own `breathe()`, at most every ~12 ms), and do the same work in the same order:
- `Stall.winProbeList`: `probeWin`'s list of entries to ask about, and their paths;
- `Stall.byHash`: the rename matching's maps;
- `Stall.filter`: `live`, the two delete lists, `ops`, `dels`.

`cloud-files` is required once per probe. The pass-path sync file calls above are now async (`fsp`), with the same
reads and the same answer on a failed read as before.

**Watcher (`dev/loadwait.js` `stallWatch`)**: a hold now runs from the end of one look to the start of the next. The
watcher's own reads are left out and reported apart (`watchMax`). `dev/synchard74-test.js` and the hold finder print
it.

## Before and after, per phase (50,000 files)
`node dev/synchard74-test.js --only many --many 50000`, longest hold of the code's own (wall − the wait for a CPU inside
it; a sync read on the loop counts as own), and of it on a CPU. Same box, 4 CPUs.

| phase | round 102 (wall) | base, profiled, loaded box | base, calm box | after: run 1 (loaded) | after: run 2 | **after: final** (calm) |
|---|---|---|---|---|---|---|
| first pass | 287–604 ms | **549** (2 on a CPU) | 36 (36) | 146 (113) | 29 | **33** |
| steady | 63–118 ms | 79 (79) | 60 (60) | 31 (31) | 40 | **28** |
| join | 287–604 ms | **137** (3) | 48 (4) | 58 (2) | 32 | **45** |
| rename | 307–362 ms | **349** (349) | **279** (277): FAIL | 29 (5) | 31 | **35** |
| pass times: first / steady / join / rename | | 177 / 13.7 / 104 / 25.7 s | 99.3 / 12.0 / 96.5 / 31.3 s | 129.7 / 14.4 / 127.1 / 35.5 s | 153.5 / 20.2 / 135.6 / 39.5 s | **85.6 / 9.0 / 95.6 / 25.4 s** |

- "Base, calm box": the base tree's engine and simulator, run with this round's test and watcher. The first-pass and
  join holds of the base are the simulator's sync lookups waiting on the disk. They are small on a calm disk and grow
  with its load (549 ms loaded). The rename's 277 ms of CPU is there either way.
- "After: run 1 / run 2": before the simulator's lookup was trimmed. Its async calls queued behind the engine's
  fsyncs on the thread pool, so the passes took longer; final: trimmed.
- Run 1's first pass once had a 146 ms hold with 113 ms on a CPU. It came back in none of 4 later 50,000-file runs
  (profiled with GC pauses and section marks: the longest first-pass holds then were 41–90 ms, with 2–42 ms on a CPU,
  inside the copy loop, no sync call and no long GC pause in them: time the thread was blocked under a saturated disk,
  not computation). Under 150 ms, so it passed, but not explained.
- Profiled after (`dev/syncstall103.js`, its CPU profile and fs tracing cost on top): first 72–129 own (1–12 on a
  CPU), steady 32–53, join 40–63, rename 36–55. In every one of these holds, nothing was the engine's sync call or a
  loop of its own over 150 ms.
- `many` at the default 5,000 files: 16–24 ms per phase.

## Guarantees kept
- **Guard bases**: `setBase` / `remember()` / `afterLocalWrite` run in the same order around each write; only
  `localJsonText`'s text is awaited before `casWrite` (it was computed before it already).
- **`store.settle` gates (syncrace98)**: every write still goes through `casWrite` → `settled()`. Untouched.
- **`choiceWrite`**: the same loop; its text is awaited. Its own `statSync` / `readFileSync` (a click, not a pass) left
  as they were.
- **Scoped passes**: `probeWin`'s list is the same entries in the same order; `scopedScan` / `rescope` untouched.
- **A read failure is never "empty"**: every read made async keeps its failure handling: the merge's base unread
  merges two-way, as before; Lab scenes not read means none kept aside, logged, as before; the renders list unread
  keeps the list; the resume note unread means the copy starts over. One existing exception is listed for Codex below.
- Nothing else decides what is copied, deleted or kept. The slices read the same maps; the only difference is turns of
  the event loop between items. A big-lane job could change `state.base` during a turn. The lane only sets bases for
  files it copies, which are not in this pass's push / pull lists, and the pass already gave such turns before.

## Runs (this branch)
- Mixed versions with the previous release (`dev/syncstall103-mixed.js`: one computer on `729f245`'s
  `sync-engine.js`):
  - `node -r ./dev/syncstall103-mixed.js dev/sync72-test.js`: 209 passed (Mac old), 209 passed (PC old);
  - `… dev/synchard74-test.js`: 170 passed (Mac old).
- Plain node, after each step: sync72 209 ✓, sync72 `--thread` 209 ✓, synchard74 170 ✓, syncsweep97 106 ✓,
  syncrace98 48 ✓, kvrename99 89 ✓, sync-test 180 ✓, aside95 76 ✓, packs89 100 ✓, devices90 73 ✓, twocomputers 117 ✓,
  syncstate75 109 ✓, datasafe-scan ✓.
- Under the lock (`run-checks --exact`, ≤ 5 per run): see "Final runs" below.

## For Codex
All edits in `sync-engine.js` are marked `(round 103, syncstall103)`:
1. `require('./sync-stall')` as `Stall` (top).
2. `probeWin`: the list from `Stall.winProbeList` (`{ entries, files }`); `cloud-files` required once; the attribute
   loop breathes every 1,024 entries and reads each entry's path from `files`.
3. `passOnce`, rename matching: `live`, the two delete lists, `ops`, `dels` through `Stall.filter`; `adds` is
   `Stall.byHash` (awaited).
4. `localJsonText` is `async` (an `fsp` handle for the first 2 bytes, `fsp.readFile` for the settings file); every
   caller awaits it (`pull`, `merge`'s `m.local()`, `absorbCopy`, `relink`, `choiceWrite`).
5. `readBase` is `async` (`fsp.readFile`); `merge` awaits it.
6. `keepScenesAside` is `async` (`fsp.readFile` / `mkdir` / `writeFile`); `pull`, `merge`'s `aside()` and
   `absorbCopy` await it.
7. `refreshExt` is `async` (`fsp.stat`, `fsp.readFile`, `exists` for a new render's name); `localExtras` awaits it.
8. `renameThere` / `renameHere`: the base text by `fsp.readFile`.
9. `copyBig`: the resume note by `fsp.readFile` (unreadable / held: start over, as before) and the part by `fsp.stat`.
10. `passOnce` with `opts.fresh`: `base/` removed by `fsp.rm`, then `baseDirs` cleared.

Left as sync, on purpose (not on a pass, or sync by design): the machine file at start (`readJsonSync` /
`writeJsonSync`, with its HELD rule) and a copied data folder's new id; `fix()`'s name check; `preview`, `incoming`,
`listTrash`, `choiceWrite`'s own checks, `restore`, `asideDo` (clicks in the panel); `guardWrite` (the store's write
guard, called synchronously by the store); `hearthIn`.

One thing seen, not changed (it is behaviour): `localJsonText` for `app/config.json` reads the settings file and, on
any read error, writes the portable settings over `{}`. A settings file held for a moment (Windows) would then lose
this computer's own settings (engine paths, hotkey). That is a read failure taken as "empty". Throwing on anything but
ENOENT would make the pull wait and retry.

## Final runs (this branch, under the lock)
(filled in below)

## For the patch notes
- **Faster feel with big sync folders**: with tens of thousands of files, sync no longer freezes Hearth for up to half
  a second at a time during a first sync, when your other computer joins, or when you rename a big folder. In our tests
  with 50,000 files the longest pause sync caused was usually 30–60 milliseconds, never more than about a seventh of a
  second.
- **Behind the scenes**: sync reads the files it needs (stores it brings in, the Lab's scenes it keeps aside, the
  renders list) without making the rest of Hearth wait for the disk.
- **Behind the scenes**: the sync test with very many files now checks each phase on its own (first sync, nothing
  changed, the other computer joining, a folder renamed), and no longer counts its own measuring as Hearth's time.
