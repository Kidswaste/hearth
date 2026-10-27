# synchard74: sync on real Windows and Mac computers (round 74)

Rounds 72–73 made PC ↔ Mac sync careful about cloud clients (late, half, placeholders, their own copies) and big files.
This round is about the computers themselves: Windows holding files open, read-only marks, names a PC can't have, full
disks, a cloud folder that moves or goes away, two computers on different Hearth versions, very many small files, the
computer going to sleep mid-pass, and secrets. Each case was added to the two-computer simulator first; every case
that broke something is fixed, and each blocked file is explained in the sync panel in plain words, with a fix button
where one exists.

## What was wrong (found by the simulator, all fixed)
| # | What the owner would have seen | Why | Fix |
|---|---|---|---|
| 1 | **The cloud folder moved, renamed or ejected while sync was looking at it: Hearth reported "Synced", started a brand new cloud copy, and files went to Deleted files** | a folder that vanished between being listed and being read was read as "empty" | a folder gone mid-scan is "unknown", and the cloud folder is checked to be the same one before and after the scan: if not, sync pauses ("isn't there"), nothing deleted |
| 2 | **A cloud client starting over (OneDrive reset, iCloud signed out and in, an empty folder put in place) emptied the PC's data into Deleted files** when there were fewer than 26 files | only "many deletes at once" was held for a yes | the cloud folder there but empty while no computer's journal says those files were deleted = paused ("is empty right now"), with "Start the cloud copy again from this computer" |
| 3 | **A chat deleted on the PC came back after the Mac slept** an hour with that delete half-arrived | the 30-minute "delete still arriving" wait counted the time asleep | the time asleep doesn't count toward any wait (the app tells sync how long it slept; a pass also sees the jump itself) |
| 4 | **Half a file taken as the whole one** after an 8-hour sleep with the download stopped midway | the 6-hour "still arriving" wait counted the sleep | same as 3 |
| 5 | **The computer slept in the middle of a pass**: on waking it went on with a plan made before the sleep | — (each write checked its file first, so nothing was overwritten, but the rest of the plan was stale) | a jump of the clock between two files stops the pass and starts it again from a fresh look (once in a row, so a really slow disk never loops) |
| 6 | **Disk full: half temp files and half big-file parts left behind**, taking the room the owner needed back; and sync's own state file write threw the whole pass out (the status never said why) | the temp file was only removed when the rename failed, not when the write did | nothing half-written is left (temp files, parts and their notes removed); the file being replaced is untouched; state.json keeps its old whole copy; "disk full" by name |
| 7 | **A file held by another program** (the Sound desk's host on a WAV, an antivirus, OneDrive) showed as "can't be read (damaged or in use)" or as a raw error | every fs error was "unreadable" or "error" | EBUSY / EPERM / EACCES / ENOSPC / ENAMETOOLONG / EIO… are sorted into plain kinds; the file in use is untouched and retried |
| 8 | **A Mac file named "Capture 10:32.png" (or "what?.md", "notes.", "CON.txt", a path over 260 characters) never reached the PC**, silently; on the PC, ":" in a name makes an NTFS stream, not a file | nothing knew Windows' name rules | the Mac holds such a file back (never sends it) and shows **Rename for Windows**; the PC never writes such a name and says which Mac file it is |
| 9 | **Keys could sync**: a chat project's `id_rsa`, `server.pem`, `credentials.json`, `secrets.yaml`, `service-account-….json`; settings fields like `openaiApiKey`, `githubToken`, an agent's `ANTHROPIC_API_KEY` | only hidden files (.env) and a few named stores were left out | key / token / password files never sync (by name; Keynote's `.key` still does); secret settings fields and values that look like keys stay on each computer, and are kept through merges |
| 10 | **Per-computer files synced**: the graphics start marker (`gpu52.json`: the Mac took the PC's "that graphics path crashed"), each GPU's measured play budgets and getting-ready times, the instrument host's warm-up | not in the per-computer list | added to it |
| 11 | **50,000 small files: passes held the main process for up to ~0.9 s** (≈ 0.5–0.7 s even with nothing to do), and a first sync took 2 min 40 s | sync's 14 MB state file was turned into text on every pass to see whether it changed, and written synchronously at each checkpoint; cached hashes are awaited without giving the event loop a turn; one small file after the other, ~10 disk calls each | the state file is only written when it changed (changes are tracked), asynchronously, with checkpoints spaced by their cost; the long loops breathe every ~12 ms; 4 small copies at a time with fewer disk calls each; renames matched by hash through a map (was every delete × every add) |
| 12 | **On a Windows PC with tens of thousands of files, nothing would sync** ("only in the cloud" for every file) | each pass asked PowerShell about every cloud file in one call (8 s / 8 MB limits); a failed call marks every file unknown | only files changed since the last pass (in the cloud or here) are asked about, in batches of 1,500; a failed batch only leaves its own files waiting |

## What the owner sees
- The indicator at the bottom of the rail says **⚠ 2 can't sync** (its words: "2 files can't sync — see why") when a file
  is blocked; the ⋯ menu has "2 files can't sync — see why…".
- The sync panel has a **Can't sync (N)** section: each file by name, why in plain words, and its button:

| why | the panel says | button |
|---|---|---|
| a name Windows can't use (on a Mac syncing with a PC) | Its name has “:” in it, which Windows can't use, so it stays on this Mac until renamed. (also: ends with a dot or space · a name Windows keeps for itself, like CON) | **Rename for Windows** |
| a path over 260 characters | Its folders and name are too long for Windows… | **Shorten for Windows** |
| on the PC, a Mac file with such a name | Made on your Mac with a name Windows can't use. On the Mac, open this panel and click “Rename for Windows”. | — |
| in use by another program | Another program is using it right now (the Sound desk, a player, your cloud drive or an antivirus)… / Your cloud drive is busy with it… | **Try again now** |
| read-only | It is marked read-only on this PC, so sync can't update it. | **Allow changes** |
| macOS refused (privacy) | macOS didn't let Hearth change it. In System Settings › Privacy & Security › Files and Folders (or Full Disk Access), allow Hearth… | **Try again now** |
| disk full | This PC's disk is full. Nothing was damaged; it copies once there is room. (or: the disk with your cloud folder) | **Free up space…** |
| written by a newer Hearth | It was last saved by a newer Hearth on your Mac. Update Hearth here (⬆ Update) to sync it; nothing is lost meanwhile. | — |
| a key in the cloud from an older version | A key or password file an older version put in your cloud copy. Keys never sync now. | **Remove from the cloud** |

- **Rename for Windows** renames the file on this computer (":" → "-", "?" dropped, "CON.txt" → "CON_.txt", long
  folders shortened the same way for every file in them) and changes every link to it in Hearth's own data (chats,
  scenes, boards…) the way a file arriving from the other computer does: a copy of each store kept first, the app told
  to reload, its next save of an older copy merged. The name shown in a chat stays as it was.
- Paused by itself, in plain words: "The Hearth folder in OneDrive isn't there (moved, renamed or the drive isn't
  connected). Sync is paused; nothing here was touched." · "…is empty right now (your cloud drive may be starting over).
  Sync is paused; nothing here was deleted." · "Update Hearth on this computer: the other computer runs a newer Hearth…"
- When the other computer runs an older Hearth: "Hearth on Studio PC is an older version: update it there too."

## Two versions of Hearth
- Every computer's record in the cloud (`.sync/machines/<id>.json`) now carries `format` (74) and the app version, and
  every journal line carries `f`.
- A file whose last journal line was written by a **newer** format is never pushed, merged or deleted over by an older
  Hearth (it could drop what it doesn't know); taking it whole is still allowed. Listed as "written by a newer Hearth".
- `.sync/format.json` `{ min }`: a future Hearth that changes how it keeps things in the cloud sets it (engine option
  `minFormat`); an older Hearth then stops writing altogether and says "Update Hearth on this computer". This version
  only reads it. (Hearth from before this round ignores both; it is the next break that this protects against.)

## 50,000 small files
`node dev/sync72-perf.js --fixture <50,000 small files + 1 chat> --slowfs 0` (the engine and the store thread in Node,
the main process's event loop measured with mainlag-probe, no simulator). Before = this round's base (660fb71).

| phase (50,000 files) | before: wall · longest main-process stretch · event-loop max · sync disk calls | after |
|---|---|---|
| PC's first pass (all up) | 160 s · 315 ms · 314 ms · 88 (1.7 s) | **68 s** · 209 ms · 185 ms · 1 |
| steady passes (nothing changed) | 9–11 s · 130–190 ms · **590–700 ms** | 12 s · 120–200 ms · 150–200 ms |
| one long chat changed | 12 s · 268 ms · 430 ms | 12 s · 177 ms · 176 ms |
| the Mac joins (all down) | 156 s · 387 ms · 294 ms · 85 (1.4 s) | **75 s** · 217 ms · 201 ms · 1 |
| Mac steady passes | 10–11 s · 130–150 ms · 480–570 ms | 7–8 s · 130–205 ms · 150–165 ms |
| a Lab scene saved / arrives / merged | 10–12 s · 250–360 ms · 405–560 ms | 12 s · 166–230 ms · 150–180 ms |

(This box: 4 shared CPUs, load 4–6 from other agents' checks the whole time; Linux, no slow-disk emulation.)
What is left at 50,000 files: ≈ 100–200 ms of plain bookkeeping per pass (the lists of 150,000 names a pass compares)
and ≈ 150–200 ms to turn the state into text when something did change (once per pass, not at every checkpoint any
more). On the owner's ~5,000-file profile both are a tenth of that. A state kept in pieces would remove the second.

In the simulator (`node dev/synchard74-test.js --only many --many 50000`, which adds its own fs wrappers on the same
thread, so its stalls are higher than the app's): 50,000 files made, first pass ≈ 96 s, steady ≈ 19 s, the Mac's join ≈ 99 s, 5,000 files in renamed folders moved in
the cloud in one pass (no delete + upload). The unit run uses 5,000 files (`--many 50000` for the full one).

## Upgrades
### Nothing lost on a real PC or Mac
1. A cloud folder moved, renamed or ejected while sync looks at it: paused, never "everything deleted", no new cloud copy started.
2. A folder that vanishes mid-scan counts as "unknown", never "empty" (on either side).
3. A cloud folder emptied by its cloud client starting over: paused with a plain question, nothing deleted here.
4. "Start the cloud copy again from this computer" offered for an emptied folder too.
5. Sleep never counts toward a wait: a half download stays waiting after 8 hours asleep.
6. A chat deleted on the other computer stays deleted after a sleep (it came back).
7. Asleep in the middle of a pass: it starts again from a fresh look on waking.
8. The app tells sync how long the computer slept (powerwise's wake), so waits move on by that much.
9. Disk full: no half temp file, half part or part note left behind.
10. Disk full: the file being replaced is untouched, sync's own state file stays whole, the pass isn't thrown out.
11. Disk full mid-pass: no more copies tried this pass (each would fail the same way); the big lane stops too.
12. A file in use by another program is left untouched and retried, never called "damaged".
13. A Mac name Windows can't hold is never sent (it would never arrive on the PC).
14. The PC never writes a name Windows can't hold (":" would make a hidden NTFS stream).
15. A file last written by a newer Hearth is never merged or pushed over by an older one.
16. A newer Hearth can tell an older one to stop writing (`.sync/format.json`); the older one says to update.
17. Every computer's record and journal line carry the sync format and the app version.
### Seeing it and fixing it
18. The indicator says "⚠ N can't sync" when a file is blocked.
19. The sync panel lists each blocked file by name with why in plain words.
20. Rename for Windows (":" "?" "*" "<>" "|", quotes, trailing dots / spaces, CON / NUL / COM1…).
21. Shorten for Windows for paths over 260 characters (folders shortened the same way for every file in them).
22. Links to a renamed file in chats, scenes and boards follow it (a copy of each store kept first).
23. On the PC: a Mac file Windows can't name is listed, with where to fix it.
24. "In use" in plain words, with Try again now (here, or the cloud drive busy with it).
25. Read-only files: "Allow changes" takes the mark off.
26. macOS privacy refusals say where to allow Hearth.
27. Disk full: which disk (this computer's or the cloud folder's), with Free up space….
28. "Written by a newer Hearth: update here" for files an older Hearth must not merge.
29. "Hearth on Studio PC is an older version: update it there too."
30. Plain pause reasons: the cloud folder isn't there / is empty / this Hearth needs an update.
31. The ⋯ menu has "N files can't sync — see why…".
### Secrets and per-computer settings
32. Key, token and password files never sync (id_rsa, *.pem, *.p12, credentials.json, secrets.yaml, service-account-….json, .npmrc, private_key…).
33. Keynote decks (.key) and files that merely mention keys still sync.
34. Settings fields named like secrets (apiKey, …Token, …Secret, password, OPENAI_API_KEY in an agent's env) stay on each computer.
35. Settings values that look like keys (sk-…, ghp_…, xoxb-…, AKIA…, AIza…, a private key) stay on each computer, whatever their field.
36. Both are kept through every merge from the other computer.
37. A key an older version put in the cloud is listed, with Remove from the cloud (kept in this computer's Deleted files).
38. The graphics start marker, measured play budgets / getting-ready times and the instrument host's warm-up stay per computer.
### Lighter with many files
39. A pass over 50,000 files no longer holds the main process for seconds: the long loops let it breathe every ~12 ms.
40. A renamed folder of thousands of files is matched by hash through a map (was every delete × every add).
41. Small copies and deletes run 4 at a time (they mostly wait on the disk).
42. Each small write makes fewer calls to the disk (its folder once per run; written and flushed through one handle).
43. Sync's own state file is only written when it changed (a pass with nothing to do doesn't turn 14 MB into text).
44. That file is written off the main thread, in order; checkpoints during a long first sync space out by their cost.
45. The per-kind sizes don't recount every name from scratch at 50,000 files.
46. A first sync of 50,000 small files: 68 s instead of 160 s; the other computer joining: 75 s instead of 156 s.
### Windows at scale
47. A Windows PC asks about the cloud state of only the files that changed (was every file, each pass).
48. That probe runs in batches of 1,500: tens of thousands of files no longer make every file "unknown" (nothing synced).

48 upgrades.

## Tested
- `node dev/synchard74-test.js` (new, in UNIT): **164 checks in 11 scenarios**, each through the two-computer simulator:
  locked (EBUSY / EPERM, here and in the cloud folder), readonly, winnames (7 kinds of names + an older Mac's file on
  the PC + a bad name the PC's cloud folder did get; Rename for Windows and the chat link), diskfull (the data disk at
  2 MB and 100 bytes, then the cloud folder's), unmount (ejected, moved mid-scan, emptied, then a real delete still
  works), versions (format stamps, newer-app, the min-format pause, then the update), many, sleep (8 h with a half
  download, 1 h with a delete half-arrived, 5 h mid-pass), secrets (11 key files, 13 per-computer files, config fields
  and values, a key already in the cloud), winprobe (batches; a steady PC pass asks about no unchanged file),
  classify (every code has the panel's words).
- **Against the base engine** (660fb71, with no-op stubs for the new calls): unmount (moved mid-scan: "synced" and a new
  cloud copy started), sleep (the deleted chat came back; the half file taken; no restart mid-pass) and diskfull (the
  pass threw) all fail; with this round they pass.
- `dev/sync-sim.js` gained: `lock(file, code)` / `unlock()`, `T.winReadOnly` (Windows' read-only semantics),
  `quota(dir, bytes)` (ENOSPC, cutting the write that crosses it), `T.hook(op, path)` (any fault, e.g. a folder moved
  mid-readdir), and a PC view's `winNames` (OneDrive / iCloud for Windows never create such names).
- Also run, all pass: unit:sync72-test (+ `--thread`, + `--only random --seeds 30`: 300 / 300), unit:syncmedia73-test,
  unit:sync-test (180), unit:cloud-files-test, unit:winmac-test (609), unit:boot-test, unit:datasafe-scan,
  unit:errorcalm-scan. APP_CHECKS
- `node dev/sync72-perf.js --fixture <50,000 files>`: the table above (before with `--root` on the base commit).
- `dev/checks/synchard74.js` (app, clicks): a Mac syncing with a Windows PC on an older Hearth; "Capture 10:32.png" is
  held back (not in the cloud folder); the chip says "⚠ 1 can't sync"; the panel's "Can't sync (1)" names it, says
  "“:” in it, which Windows can't use", has Rename for Windows, and says "Hearth on Studio PC is an older version";
  one click: renamed, "1 link to it updated", the chat's attachment path follows, it reaches the cloud folder, the
  chip is back to ✓ Synced; every button named; Escape closes.
- Not testable here: a real NTFS / APFS disk, real OneDrive / iCloud clients, a real antivirus lock, a real full disk,
  real sleep (all simulated from their documented behaviour; Windows' read-only and in-use errors are EPERM / EBUSY).

## For Codex
All edits in `sync-engine.js` are marked `(round 74, synchard74)`; the rules are in the new pure `sync-hard.js`.
- `block(rel, why, x)` / `blockErr(rel, err)`: `status.blocked` [{ rel, why, where, fix, part?, code? }] (first 60), built
  per pass (`blockNow`), the big lane's kept 10 min; `Hard.classify` sorts fs errors (`platform` decides EPERM: locked
  on Windows, denied elsewhere).
- Windows names: `winPeers` / `winRootLen` / `winTarget` (a win32 peer or `o.winNames`, OneDrive); in the plan loop the
  PC skips bad names ('win-there'), a Mac holds back unsent ones; on win32 the peers' journal names are listed too.
- `fix(rel, how)` ('rename' → `Hard.winSafeRel` + `relink(from, to)`, 'writable', 'unsecret'), `woke(ms)` → `excuse(ms)`
  (moves `ahead` / `arriving` / `copySeen` / `goneSeen` clocks); `SLEEP_GAP` (`o.sleepGapMs`, 2 min) checked per file in
  both loops, `sleepRuns` caps restarts at one in a row.
- Versions: `ME` (`o.format`, default `Hard.FORMAT` 74) in the machine record and every journal line (`f`);
  `journalLatest` keeps `f`; `readFormat()` / `o.minFormat`; 'newer-app' before push / merge / deleteThere / renameThere.
- Scans: `walk` marks any unreadable folder blind except ENOTDIR (also ENOENT); `filesId` (dev:ino of files/) before and
  after the scans; the 'emptied' pause; `out.secrets` from `scanCloud`.
- Disk: `writeFlushed` (open, write, sync, close; removes the temp on failure), `madeDirs`, `copyBig` removes the part +
  note on ENOSPC, `saveState` never throws. Ops: `POOL` (`o.pool`, 4) for push / pull / deleteHere / deleteThere;
  merges and renames alone, in order; `breathe()` every ~12 ms in both loops (and the journal parse, the gone-sizes
  loop); rename matching by hash map.
- State file: `watchBig` puts a set / delete-only Proxy on `state.base` / `local` / `cloud` (`watchState()` at each pass
  and save; `plainOf` stringifies the targets); `saveState` skips the big stringify when they are clean and the rest is
  the same, writes through `stateQ` (async, renameRetry, never throws), checkpoints every `max(5 s, 40 × its cost)`;
  `pass()` and `laneIdle()` await `stateQ`.
- Windows probe: `scanCloud(local)` asks `cloudAttributes` only for files not cached on both sides (`cachedThere` /
  `cachedHere`) plus the copies; `cloud-files.js` `attributes()` splits into batches of 1,500 (marked round 74).

## Edits outside the lane (small, additive)
`sync-merge.js` (secret names in `localOnly`, secret fields / values in `stripMachine` / `applyPortable`, four per-computer
files), `syncmain.js` (`sync:fix`, `woke` on resume, `winNames` / `appVersion`, blocked / peersOld / need in the status),
`preload.js` (one call), `sync.js` (words, chip, menu), `sync-panel.js` / `sync-panel.css` (Can't sync section),
`dev/sync-sim.js` (locks, Windows read-only, quotas, a test hook, Windows-name filtering in a PC's view),
`dev/winmac-scan.js` (sync-hard.js's `/` splits allowed, as for sync-engine.js), `dev/run-checks.js` (UNIT),
`cloud-files.js` (batches), `sync-kinds.js` (memo bound 250,000).
New: `sync-hard.js`, `dev/synchard74-test.js`, `dev/checks/synchard74.js`.

## Risks
- Renaming for Windows changes links only inside Hearth's own JSON data; a file that links to it from outside Hearth
  (a project's own code in the workspace) keeps the old name. The panel's button says links in chats and scenes follow.
- A file a Mac held back because of its name stays only on that Mac until renamed (shown, never lost).
- "Emptied" pauses when the cloud folder has nothing while this computer synced at least 3 files with it; a really
  emptied cloud (the owner deleting the Hearth folder on purpose) asks for "Start the cloud copy again".
- Both computers need this update for all of it; the version stamps only start protecting from the next format change.

## For the patch notes
- Sync now copes with what real computers do: a file another program is using (the Sound desk playing a WAV, your
  cloud drive, an antivirus), a read-only file, or a full disk no longer shows up as a scary error and is never left
  half-copied. Hearth tries again by itself.
- Click the sync indicator at the bottom of the left rail: when something can't sync it says "⚠ 1 can't sync", and the
  panel lists the file by name, says why in plain words, and gives you the button that fixes it.
- Names your PC can't use (a Mac capture called "Capture 10:32.png", a name ending in a dot, "CON.txt", a very long
  folder path) now get a "Rename for Windows" button on the Mac. Links to the file in your chats and scenes follow the
  new name. Before, those files just never reached the PC.
- If your cloud folder is moved, renamed, unplugged or emptied by the cloud app starting over, sync pauses and says so.
  It never treats that as "you deleted everything".
- If your computer goes to sleep in the middle of syncing, nothing that was still arriving gets mistaken for finished,
  and a chat you deleted stays deleted.
- Keys, tokens and passwords (key files in a project, API keys in your settings) never sync anymore. If an older
  version had already put one in the cloud copy, the panel offers "Remove from the cloud".
- When your two computers run different Hearth versions, the panel tells you to update the older one, and an older
  Hearth won't overwrite what a newer one saved.
- Big folders sync much faster: 50,000 small files went up in about 1 minute instead of nearly 3, without the app
  stuttering.
- Install this update on both computers.
