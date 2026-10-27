# sync72: PC ↔ Mac sync you can trust (round 72)

The owner uses Hearth on a Windows PC and a Mac through a cloud folder (iCloud Drive / OneDrive), and once thought every
chat was gone. Earlier rounds tested sync with **one shared folder** standing in for "the cloud". Real computers each have
**their own copy** of the cloud drive, and a cloud client moves files between them on its own schedule: late, in pieces,
as placeholders, and with its own "x 2.json" copies when both computers wrote. This stream built that world as a
simulation, ran the owner's real situations through it, and fixed every loss and duplicate it found. It also gave sync a
click-first status (one chip in the rail and a plain panel) and took big-store work off the main process.

## What was wrong (all found by the simulation, all fixed)
| # | What the owner would have seen | Why | Fix |
|---|---|---|---|
| 1 | **Messages written on the PC vanished** after both computers wrote in the same chat while iCloud was slow | iCloud kept one version as "chat 2.json"; Hearth merged that copy against the version it had just pulled, so the copy looked as if it had deleted the PC's messages | a cloud client's copy is merged keeping both sides (no base); counters take the larger value, never counted twice |
| 2 | **A Lab scene rename (or any edit) made on the Mac disappeared** | the cloud client moved the Mac's own upload aside because the PC's version got there first; Hearth then saw "unchanged here, changed there" and pulled the PC's | Hearth recognises its own upload moved aside (same size and time as the file it wrote), steps the base back one version and merges both, keeping everything until it settles (also across a restart) |
| 3 | **A chat deleted on the PC came back on both computers** | on the Mac its trash copy was still arriving, and "can't prove it was deleted" meant "publish it again" | a trash copy still arriving, or a delete the PC's journal already announced, means *wait* (≤ 30 min), not republish |
| 4 | **Half a video in the data folder** for as long as a download stayed paused | a file smaller than what the other computer wrote was taken as final after a minute | smaller than announced = still arriving, for as long as it stays so (up to 6 h) |
| 5 | **"1 waiting" forever after renaming Photo.png to photo.png** | on Mac / Windows disks both names are one file: the move "couldn't" happen | a case-only (or accent-form-only) rename of the same file goes through |
| 6 | **Changes from the other computer took as long as the clock difference** (16 min apart = 16 min late) | a modified time in the future counted as "still being written" | a time ahead of this clock counts as settled once the file stays the same for the settle time |
| 7 | **An edit pushed over a newer version** hidden behind an iCloud placeholder | a cached hash was trusted when the newer version's journal line was "older than the last good pass", which a late cloud client makes true | the cache remembers which journal line it was made under; a new line = look again (download first) |
| 8 | **"logo 2.png", "theme 2.css", "plan (1).md", "theme-PC.css" duplicates** in both data folders | only JSON copies (and Dropbox's) were recognised | the same copy names for any file, next to a file both computers have, while no computer's journal claims the name (10 min for a stranger); Dropbox's 2nd copy "… (1))" and OneDrive's "x-PC-2.json" too |
| 9 | **Project notes / a scene's code edited on both computers: one side's edit gone** (newest won) | text was one value: changed two ways = conflict | text merges line by line (different lines both stay); notes changed on the same line keep both lines; code on the same line stays a conflict (never two versions pasted into code) |

## The simulation
- **`dev/sync-sim.js`**: a fake cloud provider with a server and one view of the cloud drive per computer. It has upload
  and download delays, uploads that take several ticks, downloads written in place in pieces, iCloud ".icloud" stubs
  (asked for through `brctl download` the way Hearth asks), Mac "dataless" files (sparse, downloaded when read), OneDrive
  online-only files, and the provider's own conflict copies (iCloud / OneDrive / Dropbox / Google Drive naming).
  Case-only renames, Mac NFD names, per-computer clocks and a computer offline for days are covered too. Data and
  cloud folders behave like Mac / Windows disks (case- and accent-insensitive) on this Linux box.
- **`dev/sync72-test.js`** (in UNIT): the merge rules on their own, then 13 scenarios and a randomized run. The
  scenarios: the same chat written on both; project notes on both; a Lab scene saved on both; delete on one / edit on the
  other; a big attachment mid-upload with the download paused for an hour; settings that must stay per computer;
  placeholders; case / accents; clocks 16 min apart; 3 days offline; the providers' copies; and the owner's choices.
  After each one, both computers must end identical, with nothing lost, nothing duplicated and per-computer settings in
  place. The randomized run mixes all of it, plus restarts. `--thread` sends every store through the real store thread
  (the app's path for big stores); the randomized run mixes both. 100 seeds: 1,000 / 1,000.

## Click-first status
- **The indicator** (bottom of the rail, where the dot was) is a small chip with a word: **✓ Synced**,
  **↻ 12 waiting**, **⚠ 1 conflict**, **○ Offline**, **‖ Paused**. Its full words are its name and tooltip:
  "Synced 2 min ago", "1 conflict — choose". It is worked out when the engine reports (its own cadence) or the pointer
  comes over it: no timer, no polling.
- **One click opens the sync panel** next to it (right-click keeps the menu). The panel shows:
  - where things stand, with the drive, when it last checked and when the other computer last synced
  - **what is waiting, by name, and why**: on its way from Studio Mac · only in the cloud for now · being saved here ·
    deleted on the other computer and still arriving · your cloud drive made a copy, checking it… Plus **Download those
    now** for big files kept online only.
  - **the last problem in plain words** ("Last problem (2 min ago): …", Hearth tries again by itself), raw reason
    under Details
  - **conflicts side by side**, PC always on the left and Mac on the right on both computers. Each side shows what it
    has: the title, the messages only it has, the scene's lines only it has, a picture. Then **Keep PC / Keep Mac / Keep
    both**: one click, and the version not kept waits in Deleted files for 30 days. Settle all for me when there are
    several.
  - a note when conflicts settled by themselves ("Settled 2 conflicts by itself 5 min ago…")
  - **Sync now**, **Deleted files…**, **⋯** (pause, open the cloud folder, big videos, other drive, turn off)
- **Keep both now works for data too**: a scene or board changed two ways stays twice ("Neon (from Mac)"); text keeps
  both texts. Before, Keep both was refused for anything but chats and files.
- The panel's code loads on the first click (lazy group `syncpanel`): nothing new on the first screen except the chip's
  word (sync.js / sync.css).

## Speed (bigprofile70: ≈ 3,900 synced files, 140 MB; slow Windows-like disk, 150 µs per sync fs call)
`node dev/sync72-perf.js` (new; the engine and the store thread in Node, the main process's event loop and busy
stretches measured with mainlag-probe). Before = this round's base commit (fee53a5), same script (`--root`).

| phase | before: longest main-process stretch | after |
|---|---|---|
| PC's first pass (3,892 files up) | 31–38 ms · 3,600 sync fs calls (1.2 s blocking) | 0–31 ms · 10 sync fs calls |
| steady passes (nothing changed) | < 30 ms | < 30 ms |
| **the Mac joins (3,890 files down)** | **143 ms**, 125 ms, 59 ms · 9,279 sync fs calls (2.3 s blocking) | **30 ms** (a GC) · 10 sync fs calls |
| **a Lab scene saved on the Mac arrives on the PC** (2.3 MB store) | **63 ms** + 34 ms + 33 ms | **< 30 ms** |
| both saved the scenes: merged | 53 ms | < 30 ms |
| worst of all phases | 143 ms | **38 ms** (GC) |

What changed: a big store (≥ 256 KB) that arrives or must be merged is read, put in this computer's form, kept aside
and merged on the store thread (`syncPull` / `syncMerge` in storework.js). The main process only writes. Base copies
are written asynchronously, in order per store. A pulled file is stat'ed and re-hashed asynchronously, and the state
file is stringified once per save, not twice.

## Upgrades
### Nothing lost, nothing doubled
1. Messages written in the same chat on both computers all stay, even when iCloud / OneDrive is slow and makes its own copy.
2. An edit whose upload the cloud client set aside (the other computer got there first) is merged back, not lost.
3. Several saves while the cloud client was offline merge without dropping earlier ones (nothing removed until it settles).
4. That merge survives a restart of Hearth halfway through.
5. A chat deleted on one computer no longer comes back while its trash copy is still arriving.
6. A video still downloading (or paused mid-download) never lands half-written in the data folder.
7. Renaming Photo.png → photo.png (or an accent-only change) settles instead of waiting forever.
8. Two computers with clocks minutes apart sync at once instead of waiting out the difference.
9. A local edit is never pushed over a newer version hidden behind a cloud-only placeholder.
10. No more "logo 2.png", "theme 2.css", "plan (1).md" or "theme-PC.css" copies in your folders (iCloud, Google Drive, OneDrive).
11. Dropbox's second "conflicted copy" and OneDrive's numbered copies are recognised too.
12. Project notes edited on both computers: different lines both stay.
13. Notes changed on the same line on both: both lines kept, nothing hidden.
14. A Lab scene's code edited on different lines on each computer: both edits stay.
### Seeing and choosing
15. The sync indicator says it in a word: ✓ Synced · ↻ 12 waiting · ⚠ 1 conflict · ○ Offline · ‖ Paused.
16. One click opens the sync panel: where things stand, with which drive, when, and when the other computer last synced.
17. What is waiting, by name, with why in plain words.
18. "Download those now" for big files kept only in the cloud.
19. The last problem in plain words (Details has the raw reason).
20. Conflicts side by side: what each computer has (title, messages, the scene's lines, the picture), and when.
21. Keep PC / Keep Mac / Keep both, one click each (PC on the left, Mac on the right on both computers).
22. Keep both for scenes, boards and other data ("Neon (from Mac)"), not only chats and files.
23. Settle all for me in the panel when there are several.
24. A note in the panel when conflicts settled by themselves, with Deleted files a click away.
25. Sync now, Deleted files and the rest (⋯) in the panel; right-click still opens the menu.
### Lighter
26. A big store arriving from the other computer (the Lab scenes, a long chat) no longer stalls the app.
27. A big store changed on both computers merges off the main process.
28. A computer joining (thousands of files) stays smooth: no stretch over 40 ms.
29. Sync's own bookkeeping writes no longer block (≈ 2 s of blocking on a slow disk during a first sync, gone).

29 upgrades.

## Tested
- `node dev/sync72-test.js` (in UNIT): 13 scenarios + merges + randomized, 179 checks. Also `--thread`, and
  `--only random --seeds 100` (1,000 checks). Every bug in the table above was a failing check first.
- `node dev/sync-test.js` (180), `dev/cloud-files-test.js`, `dev/twocomputers-test.js` (117),
  `dev/store-thread-test.js` (63): still pass.
- `node dev/sync72-perf.js`: the speed table (exits 1 over the 50 ms budget).
- App checks: `sync72`, `lazy`, `sync` pass; `unit:boot-test` (2,852), `unit:winmac-test`, `unit:datasafe-scan`, `unit:errorcalm-scan` pass.
- `dev/checks/sync72.js` (app, clicks): the chip; the panel opens on a click (words, where, when, the other
  computer); Sync now; no status / conflict calls while it sits open (no polling); a file still arriving → "↻ 1 waiting"
  with its name and why; a chat renamed on both → "⚠ 1 conflict", both versions side by side with what each has, Keep
  PC / Keep Mac / Keep both, Keep Mac applied; a data item changed two ways → Keep both; a real sync error → Last
  problem in plain words; Escape / a click elsewhere close it; right-click still opens the menu; every button named.
- Not testable here: real iCloud / OneDrive / Dropbox / Google Drive clients (simulated from their documented behaviour);
  real APFS / NTFS (emulated: case and Unicode forms); a real slow Windows disk (emulated: 150 µs per sync call).

## For Codex
All edits in `sync-engine.js` are marked `(round 72, sync72)`; `cloud-files.js` is untouched.
- `absorbCopy`: a cloud client's copy merges with `merge3(null, …, { shared: true })`. Our own moved-aside upload
  (`cp.ours`) goes straight to the cloud trash. A non-JSON copy (`cp.unsure`) waits 10 min unclaimed before it becomes
  a conflict record.
- `scanCloud`: copy names for any file (iCloud " 2", Google " (1)", OneDrive "-HOST[-n]"), Dropbox's "(1))", and the
  `ours` test (size + mtime + hash = our last upload).
- `setBase` keeps the previous base (`state.prev` + `base/<rel>.prev`); `rebase()`; `state.keepAll` marks stores to
  merge with `keepAll` until they settle.
- `cloudHash`: `fresh()` (clock ahead), short-vs-journal wait (`o.shortMs`, 6 h), placeholder cache keyed by journal
  line (`state.cloud[rel][3]`), no hash from a 'del' journal line.
- `chatRemoved` → true / false / 'wait'; journal 'move' lines mark the old name deleted; `waitGone` (`o.goneWaitMs`).
- `renameThere` / `renameHere`: case-only renames of the same file (`caseOnly`, `sameNode`).
- `status.waiting` ([{ rel, why }], first 60) and `status.lastError`. Keep both for JSON (`S.keepBoth`), `canBoth` for
  everything but app/config.json.
- Speed: `o.pullJson` / `o.mergeJson` (storework `syncPull` / `syncMerge`) for stores ≥ `o.offMin` (256 KB); base
  writes async per store (`baseJob` / `baseIdle`, awaited before a pass ends); async stat / re-hash after a pull;
  `saveState` stringifies once; `remember()` keeps big previous versions as text, parsed only if needed.

## Edits outside the lane (small, additive)
`sync-merge.js` (text merge, keepAll / shared, keepBoth), `syncmain.js` (pullJson / mergeJson options, waiting /
lastError in the status), `storework.js` (syncPull / syncMerge), `sync.js` / `sync.css` (the chip, click → panel,
a few exports), `lazy-data.js` + `docs/lazy-groups.md` (group `syncpanel`; its code also starts loading when the pointer reaches the chip), `index.html` (`syncpanel` added to an existing lazy-at.js tag: no new script; first-screen CSS kept in budget by removing the old dot's now-unused styles), `mcp/hearth-map.js` (one sentence in
`sync`), `dev/run-checks.js` (UNIT).

## Risks
- Keep-everything merges after a cloud client set an upload aside can bring back something the other computer deleted
  in the same moment (it shows, and can be deleted again). That trade was chosen on purpose: never lose.
- A file the other computer really named like a copy ("plan 2.md") waits up to 10 minutes on a computer that sees it
  before its journal line arrives (it is shown as waiting, never deleted).
- Both computers need this update for all of it; one updated computer is already safer on its own side.

## For the patch notes
- Sync between your PC and your Mac got a lot more careful: messages written in the same chat on both computers, scene
  edits, and notes edited on both all stay. Nothing quietly disappears when iCloud or OneDrive is slow.
- No more "logo 2.png" / "theme 2.css" style copies appearing in your folders, and a chat you delete stays deleted.
- A video still downloading never shows up half-finished, and renaming "Photo.png" to "photo.png" no longer leaves sync
  waiting forever.
- Look at the bottom of the left rail: the sync indicator now says it in a word (✓ Synced, ↻ 12 waiting, ⚠ 1 conflict,
  ○ Offline).
- Click it for the sync panel: what's waiting and why, the last problem in plain words, and Sync now.
- When something was changed on both computers, the panel shows both versions side by side. Click Keep PC, Keep Mac or
  Keep both; the one you don't keep waits in Deleted files for 30 days.
- Keep both now works for Lab scenes and boards too: you get both, one named "(from Mac)".
- Sync is lighter: a big Lab scene file arriving from the other computer no longer makes the app stutter.
- Install this update on both computers.
