# syncstate75: sync's own state in pieces, a lighter main process (round 75)

Round 74 left two costs on the main process with sync on. At 50,000 files sync's own state file (`data/sync/state.json`,
~14 MB: every file's base hash and stat caches) was turned into text in one piece every time anything in it changed
(≈ 120–180 ms, at every checkpoint of a first sync and at the end of most passes), and a steady pass still held the
event loop 120–220 ms in a few long loops. And round 73's usage merge read and parsed the whole year-sized usage store
on the main process once a minute while sync was on (sync's write guard turned its cache off).

## What changed
- **The state is kept in pieces** (`sync-state.js`, new): `data/sync/state/index.json` (the small part: the cloud
  folder, the clocks, renders outside the data folder, and which file holds each bucket) plus up to 256 bucket files.
  Every file name falls in one bucket by a hash of its name, and everything known about one file (base hash, local and
  cloud stat caches, the base before, keep-all and freed marks) is in the same bucket. The engine's maps are watched
  (a Proxy on set / delete only), so a save turns into text and writes only the buckets that changed, one at a time with
  a breath between: one changed chat = one ~55 KB bucket + a small index. A pass with nothing changed writes nothing.
- **Crash-safe by construction**: changed buckets go to NEW files (never over a file the index names), each flushed to
  the disk; then the index is written to a temp file, flushed and renamed over `index.json` (the one atomic step); only
  then are the replaced bucket files removed. A crash at any moment leaves the state before the save or the new one,
  never a mix and never a damaged file. Whatever a cut save left (unnamed buckets, temp files) is removed at the next
  start. Loads and saves of one folder run one at a time, and a save builds on the index on the disk, so two engines on
  one folder (sync switched off and on while a pass ends) never remove a file the other's index names.
- **Migration once**: the old `state.json` is read, written in pieces, then renamed `state.json.prev` (kept). If a Hearth
  from before this round runs meanwhile (an update undone), its newer `state.json` is taken again the same way. A held
  index or bucket (Windows) is "held": the pass waits, nothing is written over it (round 43's rule). A damaged bucket
  (it never should be) only makes its own files "never synced" (both sides kept, nothing deleted), and is rewritten.
- **Read asynchronously at start**, bucket by bucket with breaths; a pass, Free up space, a fix, a conflict choice or a
  restore waits for it; nothing is saved before the state was really read.
- **The last long loops of a pass breathe**: the per-kind sizes (`K.sizesAsync`), the set of every name, the lists of a
  big first sync; `Object.keys` of a watched map goes through the plain object (through the Proxy it was ~10× slower).
  Only the 4,000 journal lines kept are turned into text (a first sync stringified all 50,000).
- **Faster passes**: a folder's files are looked at 24 at a time (each scan of 50,000 files took ≈ 5.5 s, now ≈ 2.8 s),
  in the folder's order, so the maps and the plan are exactly as before. On a first sync (or many new files from the
  other computer) the small files not hashed yet are read and hashed 8 at a time before the plan (was one after the
  other: ≈ 16 s at 50,000 → ≈ 6.5 s).
- **The usage merge runs on the store thread** (`storework.js mergeKV`, `kvops.js`): the file read, changed and written
  there (with the same .prev copy, data-safety guard and held-file rules); the main process only passes the changes on.
  The thread keeps the store as it last wrote it while the file stays as it left it. Sync now says which files its write
  guard wants (`setBeforeWrite(fn, wants)`: a file that just arrived from the other computer); only those merge on the
  main side through the guard, as before. A merge on the thread and one on the main side keep their order.

## Numbers (50,000 small files + a long chat + a Lab scenes store)
`node dev/sync72-perf.js --fixture <that> --slowfs 0` (engine + store thread in Node, the event loop measured by
mainlag-probe). Before = base fcf203a (`--root`), run back to back on this box (4 shared CPUs, load 5–6 from other
agents the whole time). "Loop max" = the longest the main process's event loop was held (what an IPC call waits).

| phase | before: wall · loop max | after: wall · loop max |
|---|---|---|
| PC's first pass (all up) | 65.3 s · 198 ms | **59.1 s · 47 ms** |
| PC steady passes (nothing changed) | 6.4–9.0 s · 144–162 ms | **6.7–6.9 s · 25–33 ms** |
| one long chat changed | 8.8 s · 157 ms | 6.8 s · **44 ms** |
| the Mac joins (all down) | 55.8 s · 155 ms | 59.5 s · 87 ms |
| Mac steady passes | 8.1–9.4 s · 125–127 ms | 6.1–6.6 s · **24–28 ms** |
| PC steady after the Mac joined | 8.4 s · 216 ms | 6.3 s · **27 ms** |
| a Lab scene saved / arrives / merged | 8.8–10.5 s · 145–183 ms | 5.9–6.9 s · **19–46 ms** |

- Target "steady pass main-process max stall < 50 ms": met (19–46 ms in every steady / small-change phase).
- Target "first pass < 60 s": 59.1 s here under load 6 (the base took 65.3 s in the same conditions); its loop max is
  47 ms. The wall time is now mostly the 50,000 copies themselves (each written, flushed and renamed: ≈ 45 s).
- The Mac's join still has an 87 ms moment (GC + a whole-state save of 50,000 new entries); not a steady pass.
- Usage merge (a year-sized ≈ 1 MB store, a minute of clicks, sync on): main process **0.2–0.5 ms** (before: 18–35 ms
  here, ≈ 50 ms on the heavy profile with a slow disk). Target < 5 ms: met.
- Bucket saves: a steady pass writes 0 files; one changed file writes 1 bucket + the index; the whole state at 50,000
  files costs ≈ 140 ms of main-process time in all, in slices of a few ms.
- The probe's "busiest" column (the profiler's longest run of back-to-back work, which joins many short tasks between
  disk waits) still shows 60–230 ms stretches; the event loop is never held that long (it answers within the loop max).

## Crash safety, proven with the simulator's fault hook
`dev/syncstate75-test.js` (new, in UNIT, 109 checks): from the k-th disk call in the state folder on, every call there
fails (the process is dead to that folder); then a new store / engine reads the folder, as after a restart.
- **crash**: a save of changes, deletes, adds and the small part cut at EVERY one of its disk calls: what is read after is
  exactly the old state or exactly the new one (both happen), never a mix, never damaged; nothing left behind.
- **full**: the same for a save that rewrites every piece (a new drive / a replaced map) and its tidy.
- **migrate**: the old state.json moved in, cut at every disk call: read again whole every time; kept as .prev; an older
  Hearth's newer state.json taken again; another cloud folder starts fresh; a damaged piece costs only its own files.
- **engine**: through the two-computer simulator, the PC's first sync of 400 files cut at disk call 1, 2, 5, 12, 40, 200,
  600 of its state saves and the Mac's join at 3, 30, 300; restarted; converges, every file whole, edits / deletes on
  both sides afterwards converge, both state folders hold exactly what their index names.
- **steady**, **held** (index held by another program: the pass waits, nothing written), **two** (two engines on one
  folder), **usage** (the store-thread merge: same file, the guard honoured, order kept, missing / unreadable say so).

## Tested
- `node dev/run-checks.js --exact unit:sync72-test unit:syncmedia73-test unit:synchard74-test unit:sync-test
  unit:store-thread-test unit:chatsteady73-test unit:syncstate75-test sync72 synchard74 lazy unit:boot-test`
  (app checks under `flock /tmp/hearth-run.lock`): **11 / 11 pass**.
- Also: sync72-test `--thread` (179/179), `--only random --seeds 30` (300/300); syncmedia73-test `--thread` (103/103);
  datasafe-test (104/104), scenesafe-test (79/79), winmac-test (609), datasafe-scan, errorcalm-scan: pass.
- Fixed on the way: store-thread-test, scenesafe-test and datasafe-test copied store.js's helpers without
  `sync-hard.js` (needed by sync-merge.js since round 74): store-thread-test failed outright on main, scenesafe-test had
  2 failures and datasafe-test 9; all pass now.
- Known, not from this change: `synchard74-test --only many --thread` fails its "event loop never held 150 ms" check on
  the base commit too (256 ms there, 178–202 ms here): the simulator's own fs wrappers run on the same thread.
- One-time cost: the migration parses the old 14 MB state.json once (≈ 150 ms of the main process, at the first pass
  after updating). Every start after that reads 256 small pieces with breaths.

## For Codex
All edits in `sync-engine.js` are marked `(round 75, syncstate75)`.
- State: `createStateStore` from `sync-state.js` (`store`): `loadState()` (async; `ready`, `loading`), `saveState`
  now `store.watch(state)` + `store.save(state)` (coalesced queue, never throws; `stateQ` is its promise), `keysOf(m)`
  (Object.keys of the plain map), `afterLoad(fn)` on `freeable / free / fix / resolve / resolveAll / restore`, the held
  path in `passOnce` reloads the pieces, `_stateStore()` (tests). Removed: `watchBig / watchState / plainOf / savedKey`.
  New maps `prev / keepAll / freed` always exist (watched); `state.base = {}` (fresh) is still fine (a full rewrite).
- `walk()` runs `fn` for up to `WALK_N` (o.walkN, 24) files at once; `fn` may return a commit function, run in order
  (scanLocal / scanCloud do).
- `passOnce`: `K.sizesAsync`, `rels` built with breaths, the hash prefetch block (8 at a time, small non-JSON files not
  cached; `tick` reset after it), breaths between the rename-matching lists; `flushJournalNow` stringifies the last 4,000.
- Elsewhere: `sync-kinds.js` (`sizesAsync`), `store.js` (`mergeKV` → the store thread, `mergeOnMain`, `offMerging`,
  `setBeforeWrite(fn, wants)`; `applyOps` now in `kvops.js`), `storework.js` (op `mergeKV`, `merged` memo),
  `syncmain.js` (the guard's `wants`: `engine.hasPulled(engine.relOfLocal(file))`).
- Tests: `dev/syncstate75-test.js`, `dev/syncstate75-usage.js`; `dev/synchard74-test.js` (diskfull reads the index),
  `dev/datasafe-test.js` (the held index), copy lists in store-thread / scenesafe / datasafe / chatsteady73 tests;
  `dev/run-checks.js` (UNIT: syncstate75-test).

## Risks
- Going back to a Hearth from before this round: it finds no state.json (it is .prev) and starts the way a new drive
  does (both sides merged, nothing deleted; files deleted on one side may come back once). Coming forward again takes
  its state.json.
- 256 bucket files in `data/sync/state/` instead of one; they live in the never-synced `sync/` folder.
- A long first sync now checkpoints every piece that changed (all of them) every ≥ 5 s, flushed: more small writes than
  one big file, off the main thread.

## For the patch notes
- Syncing with tens of thousands of files no longer makes Hearth stutter: a routine sync check used to freeze the app
  for up to a fifth of a second, now it is under a twentieth.
- Hearth keeps its record of what is synced in small pieces and only saves the pieces that changed, instead of
  rewriting one big file each time.
- If your computer crashes or loses power in the middle of a sync, that record is never damaged: Hearth picks up from
  the last good save. We tested a crash at every single step of a save.
- Your existing sync record is converted by itself the first time; the old file is kept beside it as a backup.
- Big first syncs are a little faster: Hearth now checks several files at once.
- Button-usage counting no longer costs the app anything noticeable each minute while sync is on.
- Install this update on both computers as usual; nothing to set up.
