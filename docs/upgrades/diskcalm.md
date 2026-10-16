# 🧹 diskcalm (round 53): Hearth's disk use stays light and visible

Hearth now keeps a lot besides your work: ▶ Play builds and the optimize cache (round 52), Present bakes, backups and
their media copies, crash journals, the game window's shader / web cache, Electron's own caches, render frames, temp
folders, sync's set-asides, `.prev` / `.history` copies, held saves. Nothing showed how much, and a few of them had no
cap. This round measures every part, says it in one line in Settings, lets you free what comes back by itself, caps
what had no cap, and tidies provable leftovers calmly. Nothing is added to any prompt or message (0 tokens).

New files:
- `diskcalm-core.js` (pure, UMD): the parts and their plain words, where a file belongs, the one-line summary, the caps,
  the orphan rules, the note's thresholds, the Activity line.
- `diskcalmmain.js` (main, loaded on first use through `lazyIpc`, or by its schedule): measure, free, tidy.
- `diskcalm.js` + `diskcalm.css` (window): lazy group `diskcalm`, right after the first screen.
- `dev/diskcalm-test.js` (UNIT, 67 checks) and `dev/checks/diskcalm.js` (smoke, 28 steps), group `diskcalm`.

## What a heavy week takes (measured)
A throwaway data folder after a simulated heavy week (`node dev/diskcalm-test.js --table`; sparse files, so the sizes
are real to the disk's accounting): 400 chats, the Lab's stores, 6 recordings, 4 renders, 5 ▶ Play builds (2 of
deleted scenes), 2 optimized models + 1 a killed Optimize left, the game's shader cache, 5 Present bakes (1 of a deleted
scene, 1 stray), 7 backups + their media store, Electron's caches and sign-ins, 400 asset pictures, the engine logs,
safety copies, an ended render's frames, a render still writing, old and fresh temp folders.

| Group | Size | Parts |
|---|---|---|
| your work | 4.7 GB | chats, scenes, memory, settings, captures, renders, attachments, assets, engine sessions |
| backups | 1.7 GB | 7 zips + the media store (outside the data folder) |
| bakes | 1.3 GB | Present bakes |
| game cache | 736 MB | ▶ Play builds 52 MB · optimized models 600 MB · game shader cache 84 MB |
| other | 573 MB | leftovers 560 MB · logs 4 MB · sign-ins 7 MB · Hearth's records 2 MB |
| caches | 317 MB | web caches 254 MB · asset pictures 63 MB |
| safety copies | 115 MB | automatic copies, `.prev`, recently deleted chats, sync's set-asides, undo copies, held saves |
| **total** | **9.3 GB** | the line: "9.3 GB: your work 4.7 GB · backups 1.7 GB · bakes 1.3 GB · other 1.7 GB" |

Every part measured exactly what was written. Freeing every rebuildable part: 9.3 GB → 6.5 GB (2.8 GB; a render still
writing its frames and a fresh temp folder stayed). The automatic tidy alone moved 1.0 GB (the builds and bake of
deleted scenes, a stray bake, the killed Optimize's copy, the ended render's frames, an old zip temp folder).

## How it works
- **Where things belong** (`classify`): a file is your work unless it's proven to be something else. The rebuildable
  parts: `data/game` (▶ Play builds), `data/game-cache` (optimized models), `data/.cache` (asset pictures),
  `engine.log` / `engine.prev.log`, Present bakes (`<captures>/Present bakes`, wherever captures go), the game
  window's cache folders (`Partitions/hearth-game/{Cache, Code Cache, GPUCache, Dawn…}`), Electron's own caches (the
  default profile's and each partition's). Leftovers: `.hearth-titles-*` render frames, cut-off saves (`*.tmp`),
  sync's `.hearth-tmp-` / `.hearth-part-`, Hearth's own temp folders in the computer's temp folder (`hub-zip-`,
  `hearth-backup-`, `hearth-report-`, `hub-restore-`… by name only). Kept: backups (every backup folder of this
  computer), safety copies (`.history`, `kv/.history`, `.prev.json`, `-torn-`, `trash`, `sync/trash`, `.undo-hold`,
  `.held`, `safetynet`, `.backup`), sign-ins (the rest of Electron's profile), Hearth's records (sync's state, window,
  AI run files).
- **Measure**: read only, links never followed, cached 30 s; runs when Settings or `/disk` asks.
- **Free up** (a click, one part): to the Trash / Recycle Bin, platform46's no-bin check first (a network share or a USB
  stick on Windows keeps the files and says why). The game's shader cache and the web caches are Chromium's own, open
  while Hearth runs: they're emptied through Electron (`clearCache`, `clearCodeCaches`, the shader cache) instead of
  moved. A game playing holds the game parts ("free this after it ends"). Bakes: their list (`present-bakes`) is
  emptied with them; if the list can't be read, nothing moves. Optimized models: the index goes with them
  (gamereadymain forgets its copy); a damaged index → nothing moves.
- **The calm tidy**: every 6 h on powerwise's schedule (first 10 min after the start; never asleep), only when no game
  plays, no render / export / backup / sync copy is writing (crashsafe's in-flight list) and no Lab show runs:
  - **caps (new)**: ▶ Play builds at most 8 / 2 GB, asset pictures at most 1 GB, the oldest first; never one used in the
    last hour. The optimize cache (4 GB / 200) and bakes (12 / 4 GB) keep their own caps;
  - **orphans**: Play builds and bakes of scenes that are gone (the Lab's scenes read as they are: unreadable, from a
    copy, empty or missing = unknown, and then nothing is decided), bake files no list entry points at (a day old),
    optimized copies no index entry points at (a day old), render title frames 6 h old, Hearth's temp folders two
    days old;
  - one quiet line in Activity: "🧹 Tidied 1.0 GB Hearth no longer needed (play builds, present bakes, optimized 3D
    models) — to the Trash". Nothing when nothing moved.
- **The note** (Hints): under 5 GB free on the data folder's disk (a notice: "Your disk has 3.2 GB left. Hearth can free
  2.1 GB it can rebuild by itself."), or Hearth over 25 GB with 1 GB+ to free (a tip). At most once a week each, with
  "See what's free…".

## Upgrades
### Space Hearth uses
1. **Settings › This computer & sync › Space Hearth uses**: one folded line, "2.4 GB: backups 1.2 GB · game cache 600 MB
   · bakes 400 MB · other 200 MB" (the three biggest, the rest as other).
2. Open, every part in plain words, biggest first: what it is, its size, and what comes back by itself or why it stays.
3. **Free up ▶ Play builds** — rebuilt next time you press ▶ Play.
4. **Free up optimized 3D models** — made again next time you choose Optimize for play.
5. **Free up the game shader cache** — comes back by itself next time you play.
6. **Free up Present bakes** — baked again next time you Present that scene.
7. **Free up web caches** — they fill again as you use Hearth.
8. **Free up asset pictures** — made again when you look at your assets.
9. **Free up logs** — new ones start by themselves.
10. **Free up leftovers** — pieces renders, copies and cut-off saves left behind.
11. A toast after each Free up says how much and what comes back.
12. Your work, backups, safety copies and sign-ins are never offered (and refused by command too); the backups row opens
    Backups….
13. How much your disk has free, and how much Hearth could free, under the list.
14. Free up waits while a game plays, and moves nothing when its list couldn't be read.
15. **Ctrl/⌘+K "Disk space"** opens Settings at the fold, open.
16. **`/disk`** says it in the chat; `/disk free <part>`, `/disk tidy`, `/disk open`.
### Caps
17. ▶ Play builds: at most 8 scenes / 2 GB, the oldest built first, to the Trash.
18. Asset pictures: at most 1 GB, the oldest first.
19. The optimize cache's own moves to the Trash now check for a bin first (a network share keeps the copy).
### Leftovers, tidied calmly
20. ▶ Play builds of scenes you deleted.
21. Present bakes of scenes you deleted, and bake files a cancelled bake left.
22. Optimized copies a killed Optimize left.
23. Render frames of a render that ended (a render still writing keeps them).
24. Hearth's temp folders a killed backup / zip / restore / report left in the computer's temp folder (two days old).
25. Every 6 h, never during a game, a render, a backup or a show; nothing decided when the scenes can't be read.
26. One quiet line in Activity when something went.
### Notes
27. A calm note when the disk has less than 5 GB free.
28. A calm tip when Hearth uses more than 25 GB with 1 GB+ that comes back by itself.
### For developers
29. `node dev/diskcalm-test.js` (UNIT): the rules, a heavy week measured part by part, Free up into a test Trash with
    the owner's work checked file by file, the tidy's caps and orphans, unknown reads deciding nothing.
30. `dev/checks/diskcalm.js` (`sh dev/run-checks.sh diskcalm`): the same in the real app, through Settings, Ctrl/⌘+K,
    `/disk` and Activity.

30 upgrades.

## Files
- New: `diskcalm-core.js`, `diskcalmmain.js`, `diskcalm.js`, `diskcalm.css`, `dev/diskcalm-test.js`,
  `dev/checks/diskcalm.js`.
- Changed (small, additive):
  - `main.js`: `lazyIpc('diskcalmmain.js')` + the 6-hour schedule (not in test runs);
  - `preload.js`: `hub.diskcalm`;
  - `appui.js`: one slot in This computer & sync (as backupauto's line);
  - `gamereadymain.js`: `forget()` (Free up resets its index) and the no-bin check in its `trash`;
  - `lazy-data.js` (the `diskcalm` group, regenerated), `lazy-meta.js` (regenerated), `index.html` (one name in a
    lazy-at tag);
  - `dev/run-checks.js`: UNIT entry, a `diskcalm` group.

## Tests
- `node dev/diskcalm-test.js`: 67 checks, all pass (3 s).
- `sh dev/run-checks.sh diskcalm`: 28 steps, all pass.
- Re-run alone: see the report (backupauto, crashsafe, datasafe, settingscalm, appcalm, lazy, unit:boot-test,
  unit:datasafe-scan, unit:winmac-test).

## Caveats
- **Chromium's own caches** (the game's shader cache, the web caches) are emptied through Electron, not moved: the
  measure shows what Chromium actually let go (it keeps its index files and anything in use).
- **Sizes are file sizes**, not blocks on disk: an iCloud / OneDrive "online only" backup counts its full size.
- **Backups count the whole backup folder**, the other computer's backups in a shared cloud folder too (they're on
  this disk as well); they're never offered — Backups… manages them.
- The scenes deleted rule needs the Lab's scenes file read as it is: while it can't be read, builds and bakes of
  deleted scenes wait for a later tidy.
- Not run on a real Mac or Windows PC: the Trash calls are the same ones backups and captures already use there.

## For the patch notes
- **See what Hearth keeps on your disk**: Settings › This computer & sync › Space Hearth uses ("9.3 GB: your work 4.7 GB ·
  backups 1.7 GB · bakes 1.3 GB · other 1.7 GB"). Open it for every part in plain words.
- **Free up** anything Hearth rebuilds by itself — ▶ Play builds, optimized models, the game's shader cache, Present
  bakes, web caches, asset pictures, logs, leftovers — in one click, to the Trash. Each says what comes back ("rebuilt
  next time you press ▶ Play"). Your chats, scenes, memory, settings, captures, renders and backups are never offered.
- **Hearth tidies after itself**: builds and bakes of scenes you deleted, frames of finished renders and temp folders
  left by an interrupted backup go to the Trash by themselves, with one quiet line in Activity. ▶ Play builds and
  asset pictures now have a size cap.
- **A calm note** only if your disk has under 5 GB free, or Hearth grows past 25 GB.
- Ctrl/⌘+K "Disk space" or `/disk` get you there.
