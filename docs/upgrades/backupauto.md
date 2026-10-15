# 💾 backupauto (round 45): backups that happen by themselves, are checked, and are easy to restore

The owner nearly lost every Lab scene. scenesafe and datasafe stopped the bleeding (a held file is never "empty", rotating
copies, 🛟 Recover…). This round makes the last line of defence automatic: a real backup of everything, off the data
folder, every day, checked after it's written, on the Mac and on Windows, with a restore that only adds.

Before this round, backups ran only when asked, or at start-up when "Auto" had been picked in a dialog (it was off by
default). Nothing checked a zip after writing it. The folder lived in config.json, which syncs, so the Mac got the PC's
`C:\…` path. The big videos were zipped again every time, and the list showed file names and sizes only.

New files:
- `backupauto-core.js`: the pure parts (UMD): rotation, when to run, places per system, what goes where, counts, the
  check's comparison, plain words.
- `backupautomain.js`: the main process. It does the backups, runs the schedule and keeps the state.
- `backupauto.js` + `backupauto.css`: the window. Lazy group `backupauto`, right after the first screen.
- `dev/backupauto-test.js` (UNIT, 107 checks) and `dev/checks/backupauto.js` (smoke, 31 steps).

## How it works
- **What's in a backup**: the zip holds the whole data folder as before (minus the chats' workspace, the After Effects
  kit and sync's own folder), plus config.json, theme.css and a list of contents (`hearth-backup.json`: counts, files,
  which computer, why).
  - The files are copied aside first, so the zip is a still picture of them. A file another program holds for a moment
    is read again a few times.
  - Big media (20 MB or more, never JSON) goes once into `<backup folder>/.hearth/media/`. It's skipped while unchanged
    (same name, size and date). Scenes, chats, memory and settings always go in the zip, whatever their size.
- **The check**: the zip is written under a temporary name in `.hearth/partial/`. It's opened again (every entry, CRC
  checked), every key file is parsed (config, memory, every chat, every tool store), the number of files and the
  counts (scenes, chats, AIs) are compared with its list, and the big files are looked up in the media store. Only a
  zip that passes gets its real name. A small card next to it (`.hearth/<zip>.json`) keeps what's inside and the check.
- **When**:
  - once a day (20 h after the last good one), only when the computer has been idle 3 min (1 min with Hearth hidden,
    30 s when a backup is 2 days late);
  - on powerwise's schedule (a look every 10 min, nothing asleep, calm after a wake);
  - never while rendering, exporting, making All formats, recording, presenting or updating;
  - never on battery below 40 % (the window tells the main process the level);
  - after a failure, again in 30 min, 1 h, 2 h, 4 h, then every 6 h at most;
  - also **before every update** (updatermain) and **before a restore or a Recover** (fsapi, datasafemain, the Lab's
    Recover lost scenes), unless a good one is under an hour old (10 min for a restore). Never more than 3 min in the
    way; a failed one doesn't stop the update (data/ isn't touched by it).
- **Kept**: the newest 3, one a day for 7 days, one a week for 4 weeks, one a month for 6 months, and the newest made
  before an update / a restore. A failed one goes once a good one is newer. Only this computer's are rotated; the
  other computer's backups in a shared cloud folder are never touched. Old ones go to the Trash / Recycle Bin (left
  alone where there's no bin). The media store keeps what any remaining backup points at.
- **Per computer**: the folder, on / off, the last result and the history live in `data/.backup/state.json`. That's a
  hidden folder, so it never syncs and each computer keeps its own. The old `settings.backupDir` is still used while it
  is a real folder on this computer (not the other computer's path).
- **datasafe rules for its own state**: read with `datasafe-core.load` (retries, `.prev`). A state file that can't be
  read is never written over; the backups go on with what was read before. It is written atomically with a `.prev`
  copy.
- **Where**: Documents/Hearth backups by default (Electron's real Documents, so OneDrive's moved Documents on Windows
  too). iCloud Drive is offered on a Mac and OneDrive on Windows when they're there, with a plain why. A backup can
  never go inside the data folder, the app's folder or the sync folder in the cloud drive (each refused with why). A
  chosen folder on a disk that's gone is never re-made on the computer's own disk.

## Upgrades
### Automatic
1. **Automatic backups are on by default**, on each computer: once a day when the computer is idle.
2. **Never while rendering**, exporting, making All formats, recording, presenting or updating.
3. **Never on battery below 40 %** (also not when the level isn't known on battery).
4. **Never while the computer sleeps**; after a wake it waits its turn (powerwise's schedule).
5. **A backup before every update**, unless one is less than an hour old.
6. **A backup before a restore and before 🛟 Recover…** (chats / memory / settings, and the Lab's Recover lost scenes).
7. **After a failure it tries again by itself**: 30 min, 1 h, 2 h, 4 h, then every 6 h.
8. **Big media is saved once** (20 MB+ videos, captures, renders) and skipped while unchanged. The daily zip stays
   small, and scenes, chats, memory and settings are always in it.
9. **A still picture**: files are copied aside before zipping, and a file held for a moment is read again.
10. **Rotation**: 7 daily, 4 weekly, 6 monthly, the newest 3, and the newest before an update / restore. Old ones go
    to the Trash / Recycle Bin.
11. **Two computers, one cloud folder**: each rotates only its own backups; the other computer's are listed, never
    removed.
12. **The media store tidies itself**: a big file no backup points at any more goes.
### Checked
13. **Every backup is checked after it's written**: the zip opened again, every key file parsed, counts and file
    count compared, big files found. Only then is it kept.
14. **A backup that fails its check isn't kept** and says why in plain words.
15. **Check it again** (right-click a backup) for any backup, old ones too. A damaged one gets a ⚠ with what's wrong.
16. **Recover… leaves damaged backups out** and looks in every backup folder of this computer (the old one too).
### Plain words when it fails
17. **A failed backup says why** (the disk is full, with how much is free and needed; Windows' Controlled folder
    access; macOS's Files and Folders permission; the folder's disk unplugged or the cloud drive signed out; the zip
    tool missing; a file held too long; too slow; a damaged result).
18. **Retry** on the Settings line, in Backups and on the note; **Choose another folder…** when the folder is the
    problem.
19. **An automatic backup that didn't finish** shows one calm note (through Hints, never over your work), once per
    kind of failure per day.
20. **No good backup for 3 days**: one calm note with Back up now (a 'notice': not silenced by "Don't show tips").
### Settings › Backups
21. **"Last backup: 2 h ago ✓"** in Settings › This computer & sync, with Backups…. It reads "didn't finish" + Retry
    when the last try failed, "Backing up now… Zipping…" while it runs, or "off on this Mac".
22. **Backups listed by date** (Today, Yesterday, Mon 12 Oct…) with **what's inside**: "3 scenes · 40 chats · 25
    memory lines · 3 AIs · 12 notes · settings", size, why it was made (automatic / you / before an update / before
    a restore) and ✓ checked.
23. **Older backups (made before this round) are looked into once**, so they show their counts too.
24. **Restore missing things** on each backup: the merging restore (you see the list first; nothing is deleted or
    replaced).
25. **Show in Finder / Show in Explorer** on each backup.
26. **Backups from your other computer** in the same folder are marked "from …".
27. **Where: Documents › Hearth backups** with Change…: Documents, iCloud Drive (Mac) / OneDrive (Windows) with why,
    Choose a folder…, Open the folder.
28. **A one-line offer** under it when iCloud Drive / OneDrive is there and backups are only on this computer: "if
    this Mac breaks or is lost, the backups are still there" → Use iCloud Drive.
29. **Each computer keeps its own folder and on / off** (never synced, never the other computer's path).
30. **A folder inside Hearth's data folder, the app's folder or the sync folder is refused**, with why.
31. **"By itself"** switch in Backups (on / off for this computer); Back up now, Recover…, and ⋯ (restore from a file,
    save a copy as, open the folder).
32. The Settings › Advanced › Backup and files line now shows the same "Last backup" words.
### Restore made simple
33. **A deleted Lab scene comes back with Restore missing things**. Lists of things with ids (Lab scenes, notes,
    prompts, boards, chat tags…) get what the backup has and you don't; keyed stores get missing keys. It goes
    through the store (its guard, `.prev`, copies). Before this round, a tool store that differed was only reported.
34. **Big media comes back too** when it's missing here (from the media store).
35. The restore preview says what comes back ("Lab scenes +1", big files) before anything changes.
36. Stores about this run or this computer (offline queue, usage counters, logs) are never merged back.
### Chat and search
37. **`/backup`** now backs up with the check; `/backup status` (the last one, where, the newest 5 with ✓ / ⚠ and
    counts), `/backup check` (checks the newest), `/backup folder documents|icloud|onedrive|pick`, `/backup auto
    on|off`, `/backup list`. `/backup as` and `/backups` as before.
38. Find anything: "Last backup (automatic backups)" in This computer & sync.
39. The app map (topic `sync`, read only when an engine asks) knows about backups and Restore missing things, so a chat
    can point the owner there when something was lost.

39 upgrades.

## Tests
- **`node dev/backupauto-test.js` (UNIT, 107 checks)**:
  - names per computer;
  - the rotation over 400 simulated days (7 / 4 / 6 + newest), failed, another computer's, before an update, many on
    one day, never-checked older ones;
  - every scheduling decision (off, asleep, one at a time, each busy hold, battery levels, due / not due, idle / hidden
    / late, retry back-off) and the 3-day note;
  - places on a simulated Mac (iCloud Drive from sync's detection), Windows (OneDrive, Documents moved into OneDrive,
    case-insensitive checks, either slash) and Linux;
  - refusals inside the data / app / sync folders;
  - what goes in the zip vs the media store, counts and words, the check's comparison, plain words per system;
  - the main side on real files with zip / unzip: a backup, its counts, card and media; the zip stays small; workspace,
    sync and state left out; the second backup skips the unchanged video; the list; a damaged zip; a failed check not
    kept; a full disk; a folder on a gone disk not re-made; 60 days of rotation on a moving clock; cards and media
    tidied; big media restored; an older zip looked into; Recover's list; before an update skipped when fresh; a held
    state file never written over, then read again.
- **`dev/checks/backupauto.js` (smoke, throwaway data, 31 steps)**:
  - waits while rendering (a real powerwise hold), on a 25 % battery and while in use, then runs when idle; checked,
    with counts;
  - "Last backup: just now ✓" under This computer & sync;
  - Backups: the row by date with "3 scenes · 2 chats · 2 memory lines · 2 AIs · settings", ✓, automatic, Restore
    missing things, Show in folder, Recover… (Lab scenes), Where;
  - a folder inside the data folder refused;
  - 14 daily backups → 9 kept;
  - a corrupted zip reported by Check again and ⚠ in the list;
  - a backup failing its check: not kept, plain why, the Settings line and the dialog with Retry, Retry works;
  - a deleted scene and a deleted chat: the restore preview says "Lab scenes +1", Restore brings both back (others
    kept), a "before a restore" backup came first;
  - `/backup status`;
  - the 3-day note queued in Hints.
  - Screenshots looked at (Settings line, Backups list, the failed state).
- Re-run: scenesafe, datasafe, sync, unit:sync-test, unit:store-thread-test, unit:datasafe-scan, settingscalm (with
  tidy, simplify2, firstrun), powerwise, unit:powerwise-test, unit:hintcalm-test, updater, lazy, unit:boot-test,
  unit:datasafe-test, unit:scenesafe-test: pass.
  - unit:datasafe-test and unit:scenesafe-test failed once each on a loaded machine and passed alone.
  - unit:appsearch-test failed its 16 ms keystroke budget once under load (18.7 ms) and passed alone.
  - appsearch's "Enter on an AI setup row in a closed fold" step fails intermittently on this round's starting commit
    too (1 of 3 runs there), so it isn't caused by this round.

## Caveats
- **Not tried on a real Mac or PC.** Windows' bsdtar and the Mac's tar make and check the zips there (the same tools
  as before); here Linux's zip / unzip did. Controlled folder access, iCloud Drive's "Optimize Mac storage" (old
  backups can be online-only) and OneDrive placeholders weren't tried for real.
- **The first backup on a computer with lots of big media copies it all once** into the media store (it can take a
  while; it runs only when idle and plugged in or above 40 %).
- The battery level comes from the window (Chromium's battery API). If it can't be read on battery, automatic backups
  wait until the computer is plugged in.
- **"Restore missing things" brings back items you deleted on purpose** if the backup still has them (that's what it's
  for); the preview lists them first. A Lab that's open picks the scenes up through scenesafe's guard (or a reload).
- Backups made by this round are named `hearth-backup-<date>-<time>-<computer>.zip`. Older ones without a computer
  name are treated as this computer's for the rotation (as the old "keep 10" did).
- In test runs, backups go to the test's own Documents folder, and the automatic schedule and the before-update /
  restore backups stay off unless a check turns them on.

## Edits outside the lane (small, additive)
- `main.js`: one register line.
- `preload.js`: `hub.backupauto`.
- `fsapi.js`:
  - the backup folder comes from backupautomain;
  - `backupNow` goes through it;
  - the restore does a backup first, merges tool stores by id / key and brings back big media.
- `updatermain.js`: one `before('update')`.
- `datasafemain.js`, `scenesafemain.js`: Recover's backup list from backupautomain; datasafe's Recover does a backup
  first.
- `tools/three-scenesafe.js`: a backup before Bring back.
- `appui.js`:
  - the Settings line;
  - the Backups dialog, Back up now and auto-backup delegate to backupauto;
  - the restore preview's lines.
- `addons-cmds.js`: `/backup` arguments.
- `appsearch-data.js`: one row.
- `mcp/hearth-map.js`: one sentence in `sync`.
- `lazy-data.js`: the group and the regenerated manifest.
- `index.html`: `backupauto` added to an existing lazy-at tag.
- `dev/run-checks.js`: UNIT and the `backupauto` group.

## For the patch notes
- **Hearth now backs up by itself, every day.** Your scenes, chats, memory and settings are zipped to Documents ›
  Hearth backups once a day when the computer is idle, and before every update and every restore. It never runs while
  you render or record, and never on battery below 40 %.
- **Every backup is checked** after it's written: the zip is opened again and every file read back. A backup that
  fails the check isn't kept, and Hearth says why in plain words ("the disk is full", "Windows' Controlled folder
  access blocked it"…) with Retry.
- **Settings › This computer & sync** shows "Last backup: 2 h ago ✓". Backups… lists every backup by date with
  what's inside (12 scenes · 40 chats · …), **Restore missing things** and **Show in Finder / Explorer**.
- **Restore missing things only adds**: a Lab scene or a chat you lost comes back next to yours; nothing is deleted
  or replaced, and you see the list first.
- **Each computer chooses its own folder.** On a Mac, iCloud Drive is offered; on Windows, OneDrive. Then the backups
  survive a broken or lost computer. Never inside Hearth's own data or sync folder.
- Kept: the last 7 days, 4 weeks and 6 months. Big videos are saved once, not every day.
- If no backup worked for 3 days, one calm note says so. `/backup status` tells you the same in a chat.
- What to try: open Settings › This computer & sync › Backups… on each computer, and pick iCloud Drive / OneDrive if
  you want the backups off the computer too.
