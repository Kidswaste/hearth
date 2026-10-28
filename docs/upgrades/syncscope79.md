# syncscope79: sync passes that look only at what changed (round 79)

Round 78 found that every sync pass looked at (stat) every file on both sides, for every change: at 50,000 files that is
≈ 99,600 async stats + 706 folder listings per pass, each one going through Defender and the cloud drive's filter on the
owner's Windows PC. Round 77 made passes event-driven (one per save), so the cost was paid on every save. This stream
makes a pass look only at the paths the watchers reported, trusting what the last pass saw for the rest, and keeps a
whole look (full rescan) as the safety net, with checks that catch events the watchers lost.

## How it works
- **syncmain.js** collects every path the two watchers report (the data folder, `<cloud>/Hearth/files`) between two
  passes and hands them to the engine (`engine.pass({ scope: { local, cloud } })`). An iCloud placeholder appearing
  (`.x.icloud`) is reported as the file it stands for.
- **sync-engine.js** starts from the last pass's look (the two file maps and each folder's modified time, kept in
  memory) and looks again only at:
  - the paths heard (a folder: walked again; a path that appeared or went: its folder listed again, which also catches
    a rename's other half);
  - what the last pass left open (waiting, held while a reply streams, retried) and **every entry the state's cache
    doesn't confirm** — sync's own copies change the cache, so they are always looked at again, never trusted;
  - the files the other computers' journals name since the last pass (a file whose cloud event was lost still comes);
  - for a chat heard on either side, its trash copy on both (a delete is only taken when that copy is seen);
  - **safety checks, in turn**: up to 256 folders' modified times per side (a folder whose time changed is listed again;
    with nothing heard in it, its files are looked at again: that catches a save by rename whose event was lost) and 48
    files per side (size + time).
  The plan, merges, conflicts and every write are the same code on the same maps; every write still checks its file
  right before (a stale entry only makes that file wait for the next pass, it never overwrites anything).
- **A whole look** (every file, as before) still runs:
  - engine: the first pass after a start, after a wake, after an option changed, after a fix / Free up space / a
    conflict's choice / a restore / a kept-aside choice (they write outside a pass), after a pass that didn't end well
    (error, cut short, a folder that couldn't be read, the cloud client's copies, deletes waiting for a yes, conflicts
    settled by themselves), when the cloud folder was replaced / moved / unmounted (its identity changed or the pass
    went offline), when the journals name thousands of files, and at least every 6 hours;
  - **right away when a lost event is found** by the checks (a change from before the last pass started that nobody
    reported): the found change is synced in that pass, and a whole look follows at once;
  - syncmain: Sync now and every pass not asked by a watcher / the calm check, a nameless event (a Windows watch buffer
    overflow, FSEvents' "rescan this folder"), more than 2,000 paths, a watcher that failed / was re-armed / is polling or
    isn't watching recursively (`filewatchmain` tree `healthy()`), the cloud folder not watched yet, and **every 30
    minutes while Hearth is idle on mains power** (6 h otherwise).
  - **Linux**: Node's recursive watch loses most saves that replace a file by a rename (round 77), so Linux keeps whole
    looks as before (`HEARTH_SYNC_SCOPE=1` turns scoped passes on for tests that watch each folder plainly, as the Mac /
    PC hear). The owner's Mac (FSEvents) and PC (ReadDirectoryChangesW) get scoped passes.

## Numbers: one pass at 50,000 files (`dev/syncscope79-perf.js`, new)
The heavy profile (≈ 4,400 files) + 45,600 small files in 228 folders, the store thread doing the big-JSON work as in the
app, `HEARTH_WINSIM=1` (round 78: each sync fs call 150 µs, each async open / stat / readdir / read answers 1 ms later).
Medians of 3 runs; "before" = this round's base (3c9dfd5) through `--root`, which does a whole look on every pass.

| pass (Windows simulation) | before: wall · stats · listings | after, whole look | **after, scoped** | loop max (before → scoped) |
|---|---|---|---|---|
| steady (nothing changed: the calm check) | 11.9 s · 98,925 · 706 | 13.6 s · 99,628 · 706 | **1.25 s · 615 · 3** | 18 → 25 ms |
| one long chat got a message | 12.0 s · 98,927 · 706 | 13.5 s · 99,630 · 706 | **1.21–1.38 s · 627 · 4** | 20 → 22 ms |
| a picture from the Mac arrives | 14.5 s · 98,930 · 706 | 13.9 s · 99,635 · 706 | **1.16–1.24 s · 624 · 5** | 26 → 24 ms |
| 20 files saved in 4 folders | 14.5 s · 98,969 · 706 | 13.6 s · 99,680 · 706 | **1.36–1.43 s · 739 · 12** | 72 → 22 ms |

- **≈ 160× fewer stats** per pass (99,600 → ≈ 620) and **≈ 10× less wall time** (12–14 s → 1.2–1.4 s). Without the
  Windows simulation: 5.2–5.7 s → 0.45–0.58 s. Of the ≈ 620 stats left, ≈ 610 are the safety checks (256 folders + 48
  files per side); the rest of the scoped pass's time is the in-memory plan over all 100,000 names (unchanged).
- A whole look costs ≈ 700 more stats than before (each folder's modified time, read before it is listed): +0.7 %.
- Main-process event loop: the scoped pass's longest wait stays at the whole pass's level (19–25 ms; one 47 ms outlier
  under load). The last pass's look is changed in place (copying 2 × 50,000 entries held the loop ≈ 30 ms).
- Memory: the look kept between passes costs ≈ 16 MB of main-process heap at 50,000 files (32 → 48 MB after GC; each entry
  makes its absolute path when asked instead of keeping it: this was 24 MB). On the owner's ≈ 5,000-file profile ≈ 1.6 MB.
- **perfguard** (`PERFGUARD=1 node dev/perfguard.js --only sync`, twice): no regression. Steady stall 18.9 → 19.9 /
  17.0 ms, small-change stall 17.2 → 19.1 / 17.0 ms, steady wall 247 → 283 / 257 ms (all within the allowance; the
  guard's sync part measures whole looks).

## Proof: lost watcher events (`dev/syncscope79-test.js`, new, in UNIT)
Two computers (PC / Mac) over the simulated cloud of `dev/sync-sim.js` (own views, delays, half downloads, placeholders,
the provider's conflict copies, ±40 s clocks). The watchers are simulated from what really changed on each disk between
two passes (every add / change / remove in the data folder and the cloud folder, sync's own writes included); a share is
DROPPED at random, and a folder that appeared or went is half the time reported only as the folder (Linux's rename
issue, FSEvents' folder events). Half of all saves are temp file + rename (only the folder's time says so when the
event is lost).
- **lossless**: nothing dropped: everyday work (chats, notes, new chat, a delete, a nested folder, a folder renamed)
  syncs with **no whole look after the first sync**; a scoped pass made ≈ 78 fs calls vs ≈ 1,000–2,400 for a whole one.
- **detect**: every event of a change lost: a file changed in place and a new file are found by the checks within a few
  passes (whole look at once); a file replaced by a rename with its event lost is found by its folder's time in a scoped
  pass (and NOT without the folder check: verified); an arrival whose cloud event was lost comes through the other
  computer's journal in a scoped pass.
- **deletes**: a chat deleted (moved to trash/) with the chat's event, the trash copy's event, or both lost: never
  comes back (in a randomized run before the trash-copy rule, one was pulled back next to its trash copy).
- **lossy**: 6 seeds × 5 / 10 / 20 % events dropped, 70 random steps each (messages, new chats, pictures added /
  removed, scenes, note lines, chat deletes, project folders made / renamed / removed, a computer offline, restarts,
  time jumps), then scoped passes with lost events, then the periodic safety look: **converges every time; 1,061 of
  8,270 events lost; 1,933 scoped / 229 whole passes; 78 lost events found by the checks; nothing gone**: every message
  once, every scene, note line, picture and folder there, removed things gone, no duplicates. (Under this harsh
  workload a few true conflicts keep one side and put the other whole in Deleted files, by design (guardloss78): 0–16
  items per 3–8 seeds, the same order with every pass a whole look: `SCOPE79_ALLFULL=1` gave 0–32.)
- **fallback**: a whole look after a restart, a wake, an option changed, a fix, a nameless event, thousands of paths, a
  folder that couldn't be read, the cloud folder replaced, and at the 6-hour mark (20 min in the test); an empty scope
  (the calm check) stays scoped.
- **main**: the app's real sync main side on two computers in real time (dev/synclatency77.js, fast cloud): every
  item arrives, the passes are scoped after the first (PC 20 scoped / 1 whole, Mac 18 / 1 in a full latency run), and
  latency is as round 77 (stores shown 0.02–0.33 s after they land).

## Found and fixed along the way
- **Simulator bug** (`dev/sync-sim.js`, test-only): a Mac "dataless" placeholder removed by the provider left its entry
  keyed by the freed inode (the inode was read after the file was removed); a NEW file given the same inode was then
  "hydrated" with the old file's bytes (a picture written on the Mac came out as a chat). Entries now hold the file's
  size and time and a stale one is dropped. This also removes some false conflicts from earlier randomized runs.

## Upgrades
1. Sync passes look only at the files the watchers reported (and their folders when something was added or removed).
2. At 50,000 files a pass makes ≈ 620 file checks instead of ≈ 99,600 (≈ 1.2 s instead of ≈ 13 s with Windows costs).
3. Sync's own copies are always looked at again in the next pass (never trusted from the last look).
4. The other computer's journal brings a file even when the cloud folder's event was lost.
5. Folders' modified times are checked in turn: a file added, removed or replaced whose event was lost is found.
6. Files are checked in turn (48 a pass per side): a change made in place whose event was lost is found.
7. A lost event found → that change syncs at once and a whole look follows.
8. A deleted chat's trash copy is always looked at with it: a delete never turns into the chat coming back.
9. Whole looks remain: start, wake, Sync now, fixes / restores / conflict choices, options, errors, a folder unread, the
   cloud folder moved or unmounted, a watcher failing or overflowing, every 6 h, every 30 min idle on mains power.
10. Linux keeps whole looks (its recursive watch loses saves by rename).
11. The watcher service says whether a folder is really watched (`tree().healthy()`).
12. The look kept between passes makes file paths when asked (≈ 16 MB at 50,000 files, not 24).
13. `dev/syncscope79-test.js` (UNIT, ≈ 90 s; `--seeds N`, `SCOPE79_ALLFULL=1` for the comparison, `SCOPE79_DBG=<name>`).
14. `dev/syncscope79-perf.js`: stats / listings / async fs / wall / loop per pass, whole vs scoped, `--root` for before.
15. `dev/synclatency77.js` counts passes by look (`looks {"PC":{"full":1,"scoped":20}}`) and runs scoped (its watch is
    the Mac / PC kind).
16. The sync status carries the last pass's look (`scope: { mode, why, looked, lastFull, missed }`).
17. Simulator: stale dataless placeholders no longer hydrate a new file.
18. Run-checks group `syncscope79`.

## Tests run (final code)
- Units (19/19): unit:syncscope79-test (also `--seeds 6`: 301/301), unit:sync-test, unit:sync72-test,
  unit:synchard74-test, unit:syncstate75-test, unit:syncmedia73-test, unit:projsync76-test, unit:synclatency77-test,
  unit:guardloss78-test, unit:storeack77-test, unit:filewatch-test, unit:twocomputers-test, unit:twocopies-test,
  unit:versions75-test, unit:datasafe-test, unit:scenesafe-test, unit:chatkeep-test, unit:winperf78-test,
  unit:cloud-files-test (re-run after the last engine change: 17/17).
- App checks under the run lock: sync72, synchard74, guardloss78, idlecpu, lazy, unit:boot-test (6/6).
- Scans: unit:datasafe-scan, unit:winmac-test (3 new `/`-splits of sync's own names marked winmac-ok), unit:errorcalm-scan,
  unit:storeack-scan, unit:chatsafe-scan: pass.
- perfguard `--only sync` ×2: no regression. First screen untouched (main-process and dev files only).

## For Codex
`sync-engine.js` (every addition marked `(round 79, syncscope79)`; with no `opts.scope` a pass is a whole look exactly
as before, except one stat per folder):
- `walk(root, fn, rel, blind, dirs)`: `dirs` records each folder's modified time (read before it is listed).
- The per-file callbacks of `scanLocal` / `scanCloud` became `localFn(out)` / `cloudFn(out, copies)` (same bodies; an
  optional third argument is a stat already made); `scanCloud`'s Windows attribute probe became `probeWin()`;
  `scanLocal`'s config / theme / outside renders became `localExtras(out)` (it records which entries it added).
- Scan entries are `Ent` objects (`file` is a getter: root + name); a cloud client's copy keeps a plain object.
- New block "scoped passes" (before "peers and journals"): `scopeOf`, `rescope`, `scopedScan`, `needFull`, `seen`.
- `readPeers`: a new journal entry notes its name for the next scoped pass (`noteJournal`).
- `pass()`: a call while a pass runs adds its scope to the next round (`addScope` / `takeScope`).
- `passOnce()`: the scan is scoped or whole; at the end, `seen.touchy` and `needFull` (and `again` when a lost event was
  found); `why()` and the hold path record every name left open.
- Returned API: `free / fix / aside / resolve / resolveAll / restore` wrapped by `wrote()` (next pass: whole look);
  `woke()` and `set()` ask a whole look; new `scope()` (tests / syncmain); the status has `scope`.
Also touched: `syncmain.js` (scope collection, trust, triggers), `filewatchmain.js` (`tree().healthy()`), dev tools.

## Risks
- A change whose event is lost AND that keeps its size and modified time, in a folder that also had a heard event, waits
  for the file checks in turn or the next whole look (≤ 30 min idle on mains power, ≤ 6 h otherwise). The engine's
  cache already makes the same assumption about size + time.
- A lost event found triggers a whole look at once (≈ 13 s at 50,000 files with Windows costs): on a cloud drive that
  delivers many files mid-pass this can add whole looks (changes are judged by their change time on this disk, which a
  cloud client's kept modified time doesn't fool).
- ≈ 16 MB more main-process memory at 50,000 files (≈ 1.6 MB at 5,000).
- Real FSEvents / ReadDirectoryChangesW behaviour was simulated, not run: the Windows test plan should confirm that a
  change on the PC still syncs within seconds and that the sync panel shows nothing stuck.

## For the patch notes
- Sync is much lighter on big Hearth folders: after a change it now checks only the files that changed instead of every
  file, about 160 times fewer file checks at 50,000 files.
- On Windows with OneDrive and Defender, a sync after a change takes about a second instead of about 13 seconds at that
  size, and the computer's disk stays quieter while you work.
- Nothing to set up: it works on the Mac and the PC on its own.
- As a safety net Hearth still looks at everything when it starts, after the computer wakes, when you click Sync now,
  every half hour while it's idle on mains power, and at least every 6 hours.
- If the computer misses a change notice (it happens with network drives and cloud placeholders), Hearth notices by
  itself, syncs that change and double-checks everything right away.
- A chat you delete stays deleted on both computers, even if a notice about it was missed.
