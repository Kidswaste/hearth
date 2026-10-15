# datasafe (round 43): a read that failed is never "empty", anywhere Hearth keeps your work

The owner lost all Lab scenes on Windows. A scenes file held for a moment (an antivirus, OneDrive or iCloud for
Windows, the search indexer, an online-only placeholder) read as "no scenes", and the Lab saved its starter over
everything. scenesafe fixed the Lab. This round applies the same protection to every other place Hearth keeps the
owner's work, with one shared guard, a lint check so new code can't bring the bug back, and a general **🛟 Recover…**.

## How the guard works (one helper, used everywhere)
`datasafe-core.js` builds on `scenesafe-core.js` (`readStatus`, `readRetry`):

- **`load(fs, file, fallback)`** retries a held file (EBUSY / EPERM / EACCES / EIO / UNKNOWN, 5 tries in ≈0.4 s).
  Then it falls back to `<name>.prev.json`, and only then to the fallback. It says which:
  `{ value, state: ok | missing | unreadable, from: file | prev | fallback, doubt, canSave }`.
  A file that's gone while its `.prev` is still there is read from the `.prev`, not as "nothing".
- **`store.js` remembers every read that wasn't the file as it is.** This is the "doubt": the fallback after a failed
  read, or a `.prev` / copy. Every kv store, chat, memory, website history, usage and token-stats read goes through it.
- **`guardWrite` runs before every save, on the main process or the store thread:**
  - **A save built on a doubted read is merged with the file as it is now.** sync-merge's two-way join is used: lists
    are joined by id, objects by key, and the saved value wins where both have it. Memory is joined line by line.
    Settings use a three-way merge against what the window was given. Nothing on disk is dropped, and the file as it
    was is kept aside first (`-unread`).
  - **A file that still can't be read is never written over.** The save is refused (`EHELD`) and retried at
    1 s, 2 s, 4 s … then every 2 min, about 25 times. Each retry merges again.
  - **A first save of a store without a read in this window's session:**
    - if the file can't be read, it's held the same way;
    - if the save shrinks the store to under half, a copy is kept first (`-before`).
  - **A damaged file is kept aside (`-garbled`),** and the good `.prev` isn't replaced by it.
  - **Rotating copies of the important stores,** at most every 30 minutes. They live in `data/kv/.history/<name>/`,
    or `data/.history/<memory|config|web-history>/`. Kept: the newest 10, one a day for a week, and the fullest one.
    These are hidden folders: they never sync, and they are in backups.
- **A reload of the window starts fresh** (`store.newPage()` on navigation): the new page reads everything again.
- **`DataSafe.load(name, fallback)` / `DataSafe.save(name, value, loaded)`** (datasafe.js) are for new renderer code.
  `dev/datasafe-scan.js` flags code that reads a store with a fallback and saves it without one of these.

## The audit (store → risk → fix)
| Store | What a failed read did | Fix |
|---|---|---|
| **config.json** (agents, settings) | `readConfig` threw, the window got no config, and `saveConfig()` could write the text `undefined`. No retry. No copies. The rename fell back to a blind overwrite. | `datasafemain.config()` does these: <br>· retries a held file; <br>· falls back to the last good version from this run, then the newest automatic copy (`data/.history/config/`); <br>· never saves over a file it can't read: the save waits, then puts the window's changes on top of the file (three-way merge); <br>· refuses a value that isn't a config or has no agents list; <br>· a save can't drop every agent (or 2+ and half at once), the whole settings, or a top-level part; <br>· keeps rotating copies; <br>· retries the rename before overwriting; <br>· when the file reads again, the window is told (`config:changed`). |
| **memory.json** | `{}`, so the next save wiped every memory line. No `.prev`. | A careful read, a `.prev` copy, rotating copies. A save built on a failed read is held, then joined line by line. The backup restore never merges into an unreadable memory, and it saves through the store. |
| **Chats** (`data/chats/*.json`) | A held chat file vanished from the list. A folder that couldn't be listed meant "no chats". The backup restore copied a backup chat over a chat it couldn't read. | Chat reads are retried. An unreadable file keeps its last row, or a stub (`chatStub`), on the store thread and off it. A folder that can't be listed gives the last list. The calm card says so. The restore skips a chat that's there but can't be read. Recover… never overwrites: a chat id you already have comes in as "… (recovered)". |
| **Sync** (`sync-engine.js`) | A local or cloud folder that couldn't be listed made every file in it look deleted. The deletes went to the cloud's trash and on to the other computer. A held `state.json` or `machine.json` gave a new id and an empty state, and the bases were deleted. | A folder or file that can't be listed or looked at is "unknown" for that pass: nothing under it is deleted or pulled. A held state or machine file makes the pass wait, and nothing is written over it. |
| **Website history** (`web-history.json`) | `{}` saved over it. | Store guard, plus a `.prev` and rotating copies. |
| **Usage** (`usage.json`) | `addUsage` read `{}` and wrote today's count over every earlier day. | Store guard: the count waits and is merged in. |
| **Token stats** (kv `token-stats`) | An unreadable file was rebuilt and written over. | Not rebuilt while it can't be read. |
| **Every kv store**: notes, prompts, chat tags / folders / bookmarks / snippets, chat scenes, projects, boards, board-*, director tasks, flows, routines' kv, makes, aiundo records, tokenaudit log, devreport, renders, assets, ui-usage, offline queue, memory-meta, astra personas… (60 read-with-fallback-then-save sites) | The fallback (`[]`, `{}`, `null`) was saved over the store. | The store guard handles them all in one place (merge, hold, copies). The important ones get rotating copies. No per-module code was needed. All 60 sites are listed in `dev/datasafe-baseline.json`. |
| **Lab scenes / History** (`three-sketches`, `three-history`) | Fixed by scenesafe. | Left to scenesafe's own guard (named deletes), which datasafe doesn't touch. |
| **Templates** (`data/templates`), **recipes** (`data/recipes`) | One file per item, so no list is saved over anything. A held file only hid an item until the next look. | `fs:read` now retries a held file (≈0.4 s). Nothing was ever saved from the list. |
| **Undo log** (`data/.undo-hold/log.json`) | A failed read counted as "none yet". The next save wrote only this session's entries, and the sweep **moved every kept copy to the Trash**. | A log that's there but can't be read is retried every 5 s. Nothing is saved and nothing is swept until it reads. A damaged log is kept aside. |
| **Sync settings** (`data/sync/settings.json`) | `{}`, so sync was off. The next change saved `{}` and the drive was forgotten. | A careful read. An unreadable file is never saved over: changes wait and are merged once it reads. |
| **twocomputers**: this computer's id, media links (`kv/media-here.json`) | A new computer id was written over the real one. The links were saved over with `{}` plus one. | A held id file gives an id for this run only, and nothing is written. The links file is never written while it can't be read. |
| **App keys** (`hearth-app-keys.json`), **Meshy jobs** (`apps/…jobs`) | Setting one key wiped the other keys. The jobs list was saved over. | A careful read. A save built on a failed read is merged with the file once it reads, and never written blind. |
| **Tool wake log** (toolwake) | `{}` saved over it. | Not written while it can't be read. |
| **portable** (`hearth-origin.json`) | A held file looked like a first start, and the origin was rewritten (a moved data folder wasn't fixed). | Retried; while it's held, nothing is decided. |
| **safetynet** (`session.json`, `journal.json`) | A held journal read as missing. | Retried. |
| **Recall index** | Kept in memory only. | Nothing to fix. |
| **Routines, hints seen, budget, Activity log** | localStorage, not files: no Windows lock or placeholder. | No change. |

## Upgrades
### The guard
1. **A store that can't be read is never "empty"** (every kv store, memory, chats, website history, usage). It's read
   again a few times, then from its `.prev` copy.
2. **A save built on a failed read is merged with the file**, never written over it (lists by id, objects by key,
   memory line by line).
3. **A file held by another program is never written blind.** The save waits and is retried for about 20 minutes.
4. **A store file that vanished but still has its `.prev` copy** is read from the copy.
5. **A damaged store is kept aside**, and its good `.prev` is no longer replaced by the damaged file.
6. **Automatic copies of the important stores**: memory, settings, website history, notes, prompts, chat tags and
   folders, bookmarks, snippets, chats' scenes, projects, boards, director tasks, your flows, Astra personas.
7. **A first save that empties a store without reading it** keeps a copy aside first.
8. **memory.json and website history now keep a `.prev` copy** like the other stores.

### Settings (config.json)
9. **Settings that can't be read at start come from the last good version or the newest automatic copy**, never a
   fresh default and never "no settings".
10. **Settings are never saved over while they can't be read.** Your change waits, then lands on top of the real file.
11. **A save can't drop every AI, the whole settings, or a part of them.** Deleting one AI still works.
12. **The window gets the real settings by itself** once the file reads again.

### Chats
13. **A chat file that can't be read keeps its row in the list** ("Chat (couldn't be read just now)"), and its real
    row comes back on Retry.
14. **A chats folder that can't be listed keeps the list it had** instead of showing no chats.
15. **Restoring a backup never copies over a chat it can't read**, and its memory merge never starts from an
    unreadable memory.
16. **Sync never reads a folder it can't list as "everything deleted"**, here or in the cloud folder.
17. **Sync waits when its own state or computer id is held**, instead of starting over as a new computer.

### The rest
18. **The undo log is never saved over, or its kept copies swept**, while it can't be read.
19. **App keys and Meshy jobs**: setting one key no longer wipes the others after a failed read.
20. **twocomputers**: the computer id and "Find this file" links are never replaced after a failed read.
21. **Sync settings**: a held file no longer switches sync off and forgets the drive.
22. **Files read through Hearth** (templates, recipes, the undo log, references) are retried when held for a moment.
23. **Tool wake log, token stats and the portable origin** are never rebuilt or rewritten over a file that can't be
    read.

### In the window
24. **A calm card** (bottom right) says what couldn't be read and that nothing was changed, with Retry, Recover… and
    Later. It shows once per new problem.
25. **Retry** reads everything again, refreshes the chats list, and offers a Reload.
26. **🛟 Recover…** brings back:
    - lost chats from Recently deleted, chats kept before a restore, what sync kept aside, the cloud folder's copy, its
      trash, sync conflict copies, and the newest 4 backup zips;
    - memory lines from the `.prev` copy, automatic copies, sync and backups;
    - AIs and settings from automatic copies, backups and sync;
    - tool data the guard kept aside.

    Everything is added next to yours: nothing is replaced or deleted. A chat you already have comes in as
    "… (recovered)".
27. **A Lab scenes row in Recover…** opens scenesafe's 🛟 Recover lost scenes.
28. **Ways in:**
    - Settings › Advanced › Backup and files › Backups… › **Recover…** (this replaces "Recover lost Lab scenes…");
    - Ctrl/⌘+K "Recover… (lost chats, memory, settings, Lab scenes)";
    - a Find anything help answer ("How do I get back chats, memory or settings I lost?");
    - `/recover` (`/recover list` answers in the chat).

### For developers
29. **`DataSafe.load` / `DataSafe.save`** (renderer) and **`datasafe-core` `load`** (main) for new code.
30. **`dev/datasafe-scan.js` (UNIT)** flags new code that reads a store with a fallback and saves it without the guard.
    The 60 sites found in round 43 were audited (`dev/datasafe-baseline.json`).
31. **`data/.datasafe-faults.json`** injects Windows-style read errors in test runs only (smoke / unit). The owner's
    app never reads it.

## Files
- New:
  - `datasafe-core.js`, `datasafemain.js`, `datasafe.js`, `datasafe.css`;
  - `dev/datasafe-test.js`, `dev/datasafe-scan.js`, `dev/datasafe-baseline.json`, `dev/checks/datasafe.js`.
- Changed:
  - `store.js`, `storework.js`: the guard, doubts, holds, chat stubs, health;
  - `main.js`: config through `datasafemain`, `newPage` on navigation, one register line;
  - `preload.js`: `hub.datasafe`;
  - `sync-engine.js`: unknown folders, a held state;
  - `syncmain.js`, `twocomputersmain.js`, `appsmain.js`, `toolwake.js`, `portable.js`, `safetynetmain.js`;
  - `fsapi.js`: a read retried; the restore made safe;
  - `undoall.js`;
  - `appui.js`: the Backups button;
  - `appsearch-data.js`: help;
  - `lazy-data.js` (the new `datasafe` group, regenerated), `index.html` (one lazy-at tag).
- Outside the lane, small and additive:
  - `dev/checks/scenesafe.js`: its Backups step accepts "Recover…";
  - 14 dev tests that copy `store.js` into a temp folder now copy `datasafe-core.js` too (two of them also lacked
    `scenesafe-core.js`);
  - `dev/run-checks.js`: UNIT entries, a `datasafe` group, the fixture.

## Tests
- **`node dev/datasafe-test.js`: 104 checks.**
  - `load`: EBUSY every time, EPERM twice then readable, EACCES / UNKNOWN / EIO, a held file with a `.prev`, a
    cut-short file, a missing file with a `.prev`.
  - `union`, `mergeMemory`, `guardConfig` and `rebaseConfig`, `guardWrite` (held, merged, blind, rotating, damaged),
    and that faults are honoured only in test runs.
  - Config held at start: the copy is used; a save while held writes nothing; it lands on top of the file; it can't
    be "nothing" or no agents.
  - Sync: a held chats folder deletes nothing; a held state file is never replaced.
  - The scan.
  - `store.js` on throwaway copies, with the store thread off and on (Windows errors from the faults file): notes,
    memory, website history, usage, token stats, a held chat file, a damaged store, a vanished store, a blind
    shrink, rotating copies, everything merged once readable, deletes still delete after a real read, a held chats
    folder.
  - Recover…: a chat from Recently deleted and from a real backup zip, a memory line, an AI, tool data, all merged.
- **`dev/checks/datasafe.js`** (real app, throwaway data; settings, memory, a chat and notes held for the first 20 s):
  - the calm card;
  - the window runs from the settings copy;
  - the held chat's row stays;
  - saves while held write nothing;
  - once readable, everything lands merged;
  - Retry;
  - Recover… finds and brings back a chat from a backup zip;
  - the ways in.
- Re-run:
  - all passed: scenesafe, sync, unit:sync-test, memorytidy, labtemplates, labrecipes, undoall, routines, safetynet,
    lazy, unit:boot-test, unit:store-thread-test, unit:scenesafe-test, unit:twocomputers-test, unit:toolslim-test,
    unit:tokens-test;
  - `options` passed 2 of 3 runs. It failed once under load ("an instruction is added": a click target not there
    yet) and passed on the two re-runs.

## Caveats
- **Real Windows locks and iCloud / OneDrive placeholders weren't tested.** They were simulated with injected errors.
  The owner's PC is the first real test.
- **Deletes don't stick until the next reload after a failed read.** A store that failed to read stays merged with
  the disk on every save until the window reloads (the calm card offers it), so a delete made in that window comes
  back. Erring towards keeping is on purpose.
- **A save waiting for a held file isn't on disk yet.** If Hearth quits before the file reads again, that one change
  is lost. The file itself is untouched.
- **Some reads are a little slower.** The first save of each store per session reads it once (to catch a big
  shrink), and the important stores read the disk once every 30 minutes for their copy. A held file costs ≈0.4 s of
  retries.
- **Recover… looks at the newest 4 backup zips** for chats, memory and settings (it unzips them into a temp folder),
  so a scan can take a few seconds.

## For the patch notes
- **Nothing of yours can be wiped by a file that couldn't be read any more:** chats, memory, settings, notes, prompts,
  tags, boards, projects or any tool data. This is the same fix the Lab scenes got, now everywhere: on Windows, a file
  held for a moment by an antivirus, OneDrive or iCloud used to read as "empty" and could be saved over.
- **If something can't be read when Hearth starts,** a calm card says what and that nothing was changed. Retry when
  it's free.
- **Your settings are never replaced by a fresh default.** If config.json is held, Hearth runs from its last
  automatic copy and puts your changes on top of the real file once it reads.
- **A chat that can't be read stays in your list.** Sync never treats a folder it couldn't look at as "everything
  deleted".
- **🛟 Recover…** (Settings › Backups, or Ctrl/⌘+K "Recover") finds lost chats, memory lines, AIs, settings, tool data
  and Lab scenes in Recently deleted, automatic copies, sync's set-asides, the cloud folder and your backups. Tick
  them, and they're added next to yours.
- **Hearth now keeps automatic copies of your memory, settings, notes, prompts and chat tags** in the data folder's
  hidden `.history` folders, on this computer only.
