# scenesafe (round 43): the Lab never loses your scenes again, and lost ones come back

The owner reported: "i lost all my three js lab scenes?" It happened on the Windows PC, with sync between the PC and
the Mac. This round finds the cause, closes it and the paths next to it, and adds a way to get the scenes back.

## Root cause (reproduced on a throwaway copy)
1. **A read that failed looked like "no scenes".** `store.readKV` returned the fallback (`[]`) whenever
   `fs.readFileSync` threw for any reason other than bad JSON. `getKVOff` did the same when `fs.statSync` threw.
   On Windows a read fails for a moment when another program holds the file: Defender or another antivirus,
   the OneDrive or iCloud for Windows client, the search indexer, or an online-only placeholder that isn't
   downloaded yet. The errors are EBUSY, EPERM, EACCES and UNKNOWN. The .prev copy was never tried in that case.
2. **The Lab saved its starter over the real file.** `tools/three.js` did
   `if (!sketches.length) { sketches = [Basic scene]; save(); }`. The real `three-sketches.json` became one
   "Basic scene". The next save copied that file over `three-sketches.prev.json`, so both on-disk copies were gone.
   History, extras, notes, refs and thumbnails were read the same way. A failed read gave `{}`, and their next save
   wrote `{}` back. Thumbnails of "gone" scenes were pruned too.
3. **Sync carried it to the other computer as a deletion.** The PC's file changed and the cloud copy didn't, so
   the engine pushed `[Basic scene]`. The Mac pulled it. The three-way merge read it as "every scene deleted on the
   PC" (`merge3(base=all, ours=[Basic], theirs=all)` gives `[Basic]`). A Lab still open on the Mac then merged its
   next save with that deletion (sync's `guardWrite`), and the scenes were gone on both computers.

Proof:
- `dev/scenesafe-test.js` reruns the round-42 sequence with EBUSY injected. `getKV` and `getKVOff` returned `[]`,
  the starter save replaced the file, and the next save replaced `.prev`.
- The same test runs two real sync engines in temp folders, and the short list propagated.

I could not see the owner's machine, so which program held the file on that day is not known. Every Windows lock
or placeholder error takes this path.

I checked the other suspects and none of them can empty or replace the file:
- **labboot's warm page:** reads only, and skips when the list is empty.
- **The update and the staged swap:** `data/` is git-ignored. The stash is a plain `stash push` without `-u`.
  The collide stash covers only paths the update adds, and `OWN` excludes `data/`. There is no `git clean`.
  `updatesafe-test` passes.
- **twocomputers path mapping:** the data folder is always `path.join(__dirname, 'data')`, and no `process.cwd()` is
  used for data.
- **filewatch:** it only schedules sync passes.
- **labmemory:** sandbox-side only.
- **Sync's own writes:** atomic temp file and rename.

Two neighbouring paths were real and are fixed too:
- **The Lab saved before its read finished.** A chat's starter made with `scenes.create` before the load had a
  600 ms save that could reach the disk (behind the sync gate) with only that one scene. Nothing is saved before the
  read now, and scenes made meanwhile are merged into what was read.
- **A cut-short file.** The .prev copy was used, but the save that followed overwrote the good .prev with the
  damaged file.

## Upgrades
### Stop the bleeding
1. **A held or locked scenes file is never "empty".** Reads are retried 5× (≈0.4 s) on EBUSY / EPERM / EACCES / EIO /
   UNKNOWN. Then the .prev copy is used, never `[]` (`scenesafe-core.js readStatus`, used by store.js and storework.js).
2. **Reads say what happened.** `kv:get` with `{ status: true }` returns `ok` / `missing` / `unreadable`, and says
   whether `.prev` was used. The Lab reads all six of its stores this way and retries 3 more times (0.4, 1.2, 2.5 s).
3. **The Lab never saves over a store it couldn't read**: scenes, History, looks/songs, notes, references and
   thumbnails each wait until their read worked. Before this round the starter scene was saved over the file.
4. **A calm card over the preview**: "Your scenes couldn't be read just now — nothing was changed", with Retry,
   Recover scenes… and Later. Retry brings your scenes in and saving resumes. A scene you edited meanwhile is kept.
5. **The starter "Basic scene" is saved only on a truly fresh Lab.** If copies of earlier scenes exist, it waits
   on screen and the card offers them.
6. **The scenes guard in the store** (main process and store thread). A save that would drop scenes nobody deleted
   keeps them. The Lab names its deletes (`kvSet(…, { removed })`: Delete…, the browser's Delete, `scenes.remove`,
   Undo of a recovery). A non-list value is refused.
7. **Sync can't merge many scenes away through a save.** Two or more scenes and ¼ of the list at once is a lost list,
   not a delete, so they're kept. One scene deleted on the other computer still goes.
8. **The Lab is told when the guard kept scenes**: they join the list on screen with a toast.
9. **Rotating copies** in `data/kv/.history/three-sketches/` (and `three-history/`):
   - one every 10 minutes, and always right before scenes leave the file;
   - kept: the newest 10, one a day for a week, and the fullest one ever;
   - this computer only (hidden folders never sync), included in backups.
10. **Scenes left only in .prev are kept aside** before .prev is replaced: the file went missing, or a short list was
    saved over it.
11. **A damaged file is kept aside.** The good .prev isn't overwritten by it, and the Lab says it used the copy from
    the save before.
12. **A file held by another program is never written blind.** The save waits for the next one, and the file stays
    as it was.
13. **Before sync replaces this computer's scenes with a list missing some of them**, the file is kept in
    `.history` (tag `sync`).
14. **No save before the Lab's read**, and scenes made meanwhile (a chat's starter) join the list instead of
    replacing it.
15. Thumbnails are pruned only with every scene read, and only a few at a time.

### Recover lost scenes
16. **🛟 Recover lost scenes…** looks in every place a scene can still be:
    - the scenes file, its .prev, and the rotating copies;
    - History's deleted scenes and per-layer versions (rebuilt into scenes);
    - the time machine (`three-tm-<id>`, newest state);
    - what sync kept aside here (`data/sync/trash`);
    - the cloud folder's copy, its trash, and conflict copies (`.sync/conflicts`, `trash/<day>/conflicts`);
    - the newest 8 backup zips in ~/Documents/Hearth backups (or your backup folder).

    It reads only.
17. A list with each scene's name, date, layer count, thumbnail (when three-thumbs has one), "From: …" (hover: every
    place it was found) and whether it's missing from your list or newer than yours. Scenes you deleted on purpose,
    and starter scenes, are shown unticked.
18. **Bringing back merges.** The scenes are added next to yours and never replace one. A different version of a
    scene you have comes in as "Name (recovered)". It's saved at once, with one Undo on the toast.
19. Offered by itself:
    - on the card when the scenes couldn't be read;
    - when the Lab opens with no scenes but copies exist;
    - when only the starter "Basic scene" is there while copies hold more (once per start, quietly).
20. Ways in: Lab › Sketch ▾ › 🛟 Recover lost scenes…, Ctrl/⌘+K "Recover lost Lab scenes…", Settings › Advanced ›
    Backup and files › Backups… › Recover lost Lab scenes…, a Find anything help answer, and the chat command
    `/recover-scenes` (`/recover-scenes list` answers in the chat).

## Files
- New:
  - `scenesafe-core.js` (UMD, pure, fs injected for tests);
  - `scenesafemain.js` (lazy IPC `scenes:scan`);
  - `tools/three-scenesafe.js` (lab group);
  - `dev/scenesafe-test.js` (UNIT);
  - `dev/checks/scenesafe.js`.
- Changed:
  - `store.js`, `storework.js`: reads with status and retries, the guard, the copies;
  - `main.js`: `kv:get` / `kv:set` options, and one lazyIpc line;
  - `preload.js`: `hub.scenesafe.scan`;
  - `sync-engine.js`: kept aside before a pull or merge drops scenes;
  - `tools/three.js`: `kvOk` gating, named deletes, the load, `scenes.recover / unrecover / adopt / blocked`, and the
    Sketch ▾ row;
  - `tools/three-lab.css`, `appui.js` (the Backups button), `appsearch-data.js` (help), `lazy-data.js` (regenerated).
- 13 dev tests that copy `store.js` into a temp folder now copy `scenesafe-core.js` with it.

## Tests
- `node dev/scenesafe-test.js`: 79 checks. They cover:
  - Windows errors injected: EBUSY every time, EPERM twice then readable, EACCES / EIO / UNKNOWN, a cut-short
    file with and without .prev;
  - the guard: named deletes, unnamed drops, sync merging one vs many away, non-lists;
  - copies: naming, pruning, when they're due;
  - store.js on throwaway copies with the store thread off and on: a starter list never replaces scenes, a held
    file is never written, Delete still deletes, scenes only in .prev are kept aside, a damaged file is kept aside and
    .prev stays good, copies are capped, History gets copies, other stores are untouched;
  - the scan over every source (a real zip);
  - the merge rules;
  - two real sync engines: the short list arrives, the Mac's scenes are kept aside, and Recover finds them.
- `dev/checks/scenesafe.js` (real app, throwaway data):
  - a scenes "file" that can't be read at start: the card, nothing written, an edit not written; Retry brings the
    scenes back and saving resumes;
  - a starter list sent over the scenes: kept;
  - Delete still deletes, with a copy right before;
  - cut-short and missing reads;
  - Sketch ▾ › Recover: finds the .prev-only scene, the trashed scene (unticked) and the backup scene, with sources;
    Bring back merges and saves; Undo takes back exactly those;
  - the Ctrl/⌘+K action, `/recover-scenes list`, and the Settings › Backups button.
- Re-run: labhub, timemachine, safetynet, sync, unit:sync-test, labboot, labtemplates, labrecipes, labbatch, updater,
  unit:updatesafe-test, lazy, unit:boot-test, unit:store-thread-test (results in the final report).

## Caveats
- Real Windows locks and real iCloud / OneDrive placeholders were simulated by injected `fs` errors (and a folder in
  the file's place in the app check). The first real test is the owner's PC.
- The rotating copies cost one extra file write every 10 minutes while the Lab is used. The store thread never
  reads the scenes file again just to guard a save; it remembers what it wrote.
- Many scenes deleted on the other computer while this one was off now come back once, because the guard treats
  that as a lost list. Delete them again.
- Scenes rebuilt from History's layer versions have no name ("Recovered scene (date)") unless another copy had it.
  Their layers carry code only (default opacity / blend).

## For the patch notes
- **Your Lab scenes are safe now.** On Windows, a scenes file held for a moment by an antivirus, OneDrive or iCloud
  could read as "no scenes", and the Lab saved its starter "Basic scene" over everything. That can't happen any more.
- If the scenes can't be read when the Lab opens, a calm card says "nothing was changed", with Retry and
  Recover scenes….
- **🛟 Recover lost scenes…** (Lab › Sketch ▾, Ctrl/⌘+K, or Settings › Backups) finds scenes in automatic copies,
  History, the time machine, sync's copies and your backups. Tick them, and they're added next to yours. One Undo.
- Hearth now keeps automatic copies of your scenes (every 10 minutes, and right before any scene leaves the list) in
  the data folder's kv/.history.
- A save can no longer drop scenes nobody deleted, and sync can't carry a lost list to your other computer as a
  deletion.
- If you lost scenes: open the Lab › Sketch ▾ › 🛟 Recover lost scenes… on each computer, tick them, and click
  Bring back.
