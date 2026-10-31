# checkfix96: three open check problems, two real data bugs behind them (round 96)

Three checks were open. Each was looked into before anything was changed, with checkfix88's method: judge under load,
never skip or loosen without a measured reason, and prove the check still catches the real bug.

- **sync72 `--thread`** found a real data-loss bug in the sync engine: a line added to a project's notes while
  offline could be lost on both computers. Fixed, with a new scripted scenario.
- **keptaside94's preset step** led to a real data-safety bug: a version put back from Deleted files could be written
  over by a window still holding the older one (a StoreAck holder). Fixed, with a regression test. The check itself
  also had a timing race, fixed too.
- **labcompile90** blamed one compile frame for two late frames. It now uses labflake95's counting.

All app runs were under `flock /tmp/hearth-run.lock`, at most 5 checks per run, with `TMPDIR=/tmp/cf96`. "Under load"
means `node burn.js 6` beside the run (6 worker threads spinning the CPU and allocating, load average 8–9 on 4 CPUs).
"IO load" means 3 writers each writing 32 MB and fsyncing in a loop.

## 1. sync72 `--thread`: "random 1: every line added to the notes" (a real data-loss bug)

### What the `--thread` mode is
`--thread` sends every computer's JSON stores through the store thread (`storework.js` `syncHash` / `syncPull` /
`syncMerge`), as the app does for stores of 256 KB or more. Without it, each computer of the random run picks the
thread at random (`thread: THREAD || R() < 0.5`).

That `||` short-circuits: under `--thread`, `R()` is not called. So **the random run under `--thread` is a different
random run**, not the same one on another code path. That is why it failed on round 94's tree too, and why it never
failed without `--thread`: no run without it had drawn this sequence.

### It is not the thread
The same sequence was replayed with every store on the main process (a copy of the test with the thread forced off).
It lost the same line. The merge on the store thread gives the same result as the one on the main process.

### What loses the line (shown step by step)
Logged per step: which computer acts, whether "PC note 5" is in each computer's notes, and the notes before and after
the final sync.
1. The PC's cloud client goes offline (step 4). Hearth on the PC keeps working and writes its pushes to its own copy
   of the cloud folder. The cloud client would upload them once back online.
2. Step 5: "PC note 5" is added on the PC, and a pass pushes it. The base becomes P1, and the step back (`state.prev`)
   becomes the version before it, B0.
3. Step 27: "PC note 27" is added on the PC, still offline, and pushed. The base becomes P2, and **the step back
   becomes P1**.
4. Meanwhile the Mac adds "Mac note 35" and "Mac note 38", built on B0 (it never saw P1 or P2), and uploads them.
5. The PC comes back. Its cloud client finds its upload and the Mac's in conflict, and moves the PC's aside (its own
   conflict copy). The engine sees "our last upload moved aside" and goes back one step (`rebase`): the base is now
   P1.
6. It merges three ways: base P1, ours P2, theirs = the Mac's (B0 + Mac lines). Against P1, the Mac's version has
   **removed "PC note 5"**. That looks like a delete, so the merge applies it.

   Before: PC `Notes / PC note 5 / PC note 27`, Mac `Notes / Mac note 35 / Mac note 38`.
   After, on both: `Notes / Mac note 35 / Mac note 38 / PC note 27`.

**For a real user**: edit a project's notes, a board, a Lab scene or any synced store twice while your cloud client is
offline or paused (two passes), edit the same store on the other computer, then come back online. The first of your
edits could be silently removed on both computers. (A copy was in the recovery folder, but nothing said so.)

### Fix (app: `sync-engine.js`, Codex's, marked `(round 96, checkfix96)`; `sync-state.js`)
- `setBase(rel, h, text, own)`: `own` means this computer uploaded that version itself (a push, or a merge it
  uploads). For two own versions in a row, the second one didn't reach the other computer before the first one did,
  so the step back stays the version before the first of them. A version that came from the cloud (a pull, a merge
  with nothing to upload, both sides agreeing) ends the run.
- The rebase then goes back to B0, the version the Mac started from. The merge runs keeping everything (`keepAll`, as
  every rebase already did), and both computers' lines stay. A same line added on both sides merges once (checked
  with `merge3`: "Notes / PC 5 / PC 27 / PC 30 / Mac 35").
- The mark is kept in the sync state (`state.own`, a seventh map in `sync-state.js`, row key `o`), so a restart in
  between keeps it. An older Hearth reading this state ignores the extra key. `dropBase` and `rebase` clear it.

### Proof
- New scripted scenario **`offline-pushes`** in `dev/sync72-test.js`: the PC pushes two note lines while offline, the
  Mac adds one, and the PC comes back. It runs for OneDrive, Dropbox and iCloud, each with stores on the main process
  and on the store thread.
  - On the old engine: **12 failures** ("every line of both computers in the notes": `Notes / Mac line / PC line 2`).
  - Now: 30 / 30.
- `node dev/sync72-test.js --thread`: 209 / 209 (was 2 failed). `--thread --seeds 12 --only random`: 120 / 120.
  Without `--thread`: 209 / 209.
- The random run keeps its `--thread` sequence. It is the run that found this, so it stays as it is.
- `unit:syncstate75-test` now also round-trips the new map (its seed state has `own` entries): ✓.
- Also ✓: `unit:sync-test`, `syncscope79-test`, `synchard74-test`, `guardloss78-test`, `projsync76-test`,
  `storeack77-test`, `packs89-test`.

## 2. keptaside94 "preset: 'Use the Mac's instead' → 16 bars" read 8

### What was found
- **Is the Lab's holder there in this check?** No. The Lab's presets holder (`LabPresets` in `tools/three.js`) only
  exists once the Lab has been opened (it lives in `sketchTab`). Loading the Lab's code isn't enough: after
  `Lazy.load('lab')` and 60 s, `window.LabPresets` was still undefined. keptaside94 never opens the Lab. The check now
  records this at each Undo (`labHolder`), and it was `false` at every Undo of the runs below.
- **But with the Lab open, a holder does write back stale data: a real bug.** A diagnostic copy of the preset step
  (6 rounds a run) opened the Lab first. Just before "Use the Mac's instead" it gave the Lab's presets a save waiting
  (a palette saved, as the Lab's menu does).
  - Old engine: **6 of 6 rounds ended at 8 bars**. The check's own 8-bar item was back over the restored 16. That is
    the reported symptom exactly.
  - Fixed engine: 6 of 6 at 16.
- **Without the Lab, the restore was not slow.** The same diagnostic without the Lab ran 8 rounds under a 6-thread
  burn and 6 rounds under the burn plus IO load (io pressure "some" 13–18 %). The restore landed 75–160 ms after the
  click every time, against the check's 1.2 s. The single 8 in round 95's run was not reproduced without the Lab, and
  its log wasn't kept. So the exact path of that one run is not proven (see "What's left").

### Cause (app): a restore kept no guard base
When the other computer's version of a store arrives through a pull, the engine keeps the version it replaced
(`remember` → `pulledPrev`). A window that still holds the older copy and saves it is then merged three ways with what
arrived (`guardWrite`): its own changes are kept, and the arrived version isn't undone. StoreAck's whole design
(round 77) relies on this: "its change not written yet is written (sync's guard merges it with what arrived)".

`restore()` (Restore from Deleted files, and the Undo / "Use … instead" of every choice) wrote the file and announced
it (`onPulled`, `from: 'trash'`). But it kept no base and set no arrival time. The step by step, with the Lab open:
1. The Lab's presets holder had a save waiting (debounced, 400 ms).
2. The restore put the 16-bar version on disk and announced it.
3. StoreAck had the holder write its change first, as it should. Unguarded, that write was the holder's whole store,
   with the 8 bars, written over the 16.
4. Then it read it back (8) and acked.

Any StoreAck holder with a save waiting does the same (boards, notes, projects, the worktable…). So does a plain
debounced save landing just after a restore.

### Fix (app)
- `sync-engine.js restore()`, marked `(round 96, checkfix96)`. Before replacing a JSON store, the version in place
  (in cloud form, for a store up to 1 MB) is kept as the guard's base, as after a pull. It is
  kept just before the rename, so a save racing the restore is merged too. The arrival time is set, so an ack for a
  read from before the restore is ignored (round 77's rule).
- When no base could be kept (a store over 1 MB, an unreadable one, or none here before), the arrival says
  `guard: false`. StoreAck then neither writes a waiting copy over it nor reads over that copy (round 77's rule for
  stores ≥ 16 MB).
- `tools/three.js LabPresets` (a smaller hole of the same kind): an arrival while the Lab's first read of its presets
  is still on its way used to say "fine" (`apply` returned `undefined` while not started). Then the start went on with
  its older read and could save it. Now that arrival isn't acked (sync's guard stays), and the start reads again before
  taking anything.

### Fix (check: `dev/checks/keptaside94.js`)
- `undo()` still waits 1.2 s after the click, as before. It then waits for the Undo's own outcome note ("Back as it
  was…", "That copy is in…", or an error), up to 20 s. Each Undo is recorded in `undone` (label, ms, note, labHolder),
  and the preset step's detail shows it.
  - Tried first and dropped: waiting for the note, then only what was left of 1.2 s. That shortened the time before
    the next section by about the click's own time. The picture and sound steps then failed 4 of 4: the pass the
    restore asks for (`schedule(500, 'restore')`) ran in the middle of their edits.
- **A second race found under load (in the base check too)**: "scene: the same line of code both ways → waits for a
  choice · null". It failed 1 of 1 under a 6-thread burn, and the base check failed the same way.
  - Cause: `both()` makes this computer's change, waits 300 ms, then writes the Mac's change into the cloud copy. A
    pass started by the file watcher in between pushes this computer's change first. The Mac's edit is then made on
    top of it, and there is truly nothing to choose.
  - Fix: both changes are made while no pass can start. `still()` pauses sync (`sync:pause`), runs one pass so the
    one in flight is over, makes the two changes, then resumes. The same goes for the picture's and the sound's two
    writes. Nothing is waited on or loosened.

### Proof
- `dev/storeack77-test.js` new scenario **`restore`**, with the real engine through the simulator and the real StoreAck
  core. The PC keeps its 8 bars, then "Use the Mac's instead" while the holder has a change of its own waiting.
  - On the old engine: **3 failures** ("the holder's waiting save didn't write the 8 bars back over the 16":
    `bars 8`; the window holds 8; the Mac gets 8).
  - Now: ✓. The 16 bars stay, the holder's own change is kept, it acks, and the Mac gets both.
- The app-level diagnostic with the Lab open: old engine 6 / 6 rounds at 8 bars, fixed engine 6 / 6 at 16.
- keptaside94, final check:
  - ✓ 5 of 5 calm (95–97 s);
  - ✓ 3 of 3 under a 6-thread burn (load 8.6–9.5, 100–101 s), where the base check had failed.
- `unit:storeack77-test` 187 / 187, `unit:keptaside94-test`, `unit:aside95-test`, `unit:labsync88-test` ✓.

## 3. labcompile90: one compile frame counted for two late frames

### Cause (the check counting wrong)
labcompile90 judged each late frame by its own frame's compiles **or its neighbour's**. So a new layer's setup frame
(its programs made in its one frame, where shaders can't compile in the background), followed by a late frame while
the software GPU catches up, gave two "compile" hitches for one setup. That is labflake95's cause 1 in labfps89.

The same pairing also called an upload inside a frame "compile". So the texture stretch's setup-frame allowance could
hide a big picture uploaded inside a frame.

### Fix (check: `dev/checks/labcompile90.js`)
labfps89's rule, unchanged:
- A compile frame, or an upload inside a frame, explains **one** late frame: its own, or else the next one. Another
  late frame next to it is judged on its own: CPU, else load.
- An upload inside a frame is its own verdict (`upload`) and **always counts**, in every stretch, the texture
  stretch included.
- The setup-frame allowance (the texture stretch, without background compiles) still covers its compile hitch only.

No budget changed.

### Proof
- **The counting, replayed on synthetic frames** (the judging block read from each version of the check file;
  `compile / upload / over / load` hitches):

| case | before | after |
|---|---|---|
| one setup frame (3 compiles in frame 4), frames 4 and 5 late | 2 / 0 / 0 / 0 | **1 / 0 / 0 / 1** |
| compiles in frame 3, only frame 4 late | 1 / 0 / 0 / 0 | 1 / 0 / 0 / 0 |
| two compile frames (3 and 8), each late | 2 / 0 / 0 / 0 | 2 / 0 / 0 / 0 (still fails ≤ 1) |
| a big upload inside frame 6, frames 6 and 7 late | 2 / 0 / 0 / 0 ("compile") | 0 / **1** / 0 / 1 (counts, texture too) |
| a late frame with 80 ms of its own CPU | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |

- **Still fails on the real bug**: with the Lab preview's runtime precompile switched off (`tools/three-sandbox.html`,
  `lcCheck` skipped, put back after the run), the new check fails 11 steps. These are "no shader compile inside a
  frame on screen" in 10 stretches, and "shadow:caster: hitches over 2× budget judged the app's ≤ 1" (2 compile
  hitches). Every stretch with in-frame compiles shows exactly 1 compile hitch per compile run, not 2.
- **Normal runs**: ✓ 130 s and 131 s, each with "can't tell under load" on runtime:mats (a 133 ms frame with 0–1.6 ms
  of the preview's CPU). The texture stretch had 1 compile hitch (its setup frame) and its 900 / 800 ms neighbours
  judged load.

## Final runs (under the lock)

| what | result |
|---|---|
| keptaside94 | ✓ 5 of 5 calm (+ 3 of 3 under a 6-thread burn) |
| labcompile90 | ✓ 2 of 2 |
| sync72, labsync88, sync, lazy | ✓ 55 s, 91 s, 58 s, 110 s |
| unit:sync72-test | ✓ (209); `node dev/sync72-test.js --thread` ✓ 209 / 209 (run-checks has no way to pass the flag) |
| unit:sync-test, keptaside94-test, aside95-test, labsync88-test, storeack77-test, datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan, boot-test (+ syncstate75-test) | ✓ 14 / 14 |

The first screen is unchanged: `sync-engine.js` / `sync-state.js` are main-process files, and `tools/three.js` is lazy.

## What's left
- keptaside94's one 8-bar read in round 95: in that check the Lab's holder isn't there, and the restore took
  75–160 ms under CPU and IO load in every try. That run's exact path isn't proven. The holder bug found on the way
  is real and fixed. If it comes back, the step's detail now shows the Undo's outcome note, how long it took and
  whether a Lab holder was there.
- The random run under `--thread` draws different random choices than without it (`THREAD || R()`). It was left as it
  is because it is the run that found the bug, but the two modes don't test the same sequences.
- `resolve('theirs' / 'merge')` already keeps a guard base. `asideDo` was not audited for the same gap this round.

## For Codex
`sync-engine.js` (marked `(round 96, checkfix96)`):
- `setBase(rel, h, text, own)`: the new `own` flag; a run of own versions keeps the step back (`state.prev`) at the
  version before the first one. `dropBase` / `rebase` clear it. `push` passes `own`, and `merge` passes `hm !== ch`.
  `saveState`'s small part leaves `own` out (it is a bucketed map).
- `restore()`: keeps the replaced version (≤ 1 MB JSON) as the guard's base just before the rename, sets `pulledAt`,
  and announces `guard: false` when there's no base.

`sync-state.js` (not Codex's): `own` added to the watched maps (row key `o`).

## For the patch notes
- **Fixed**: if you edited a project's notes (or a board, a Lab scene, any synced data) more than once while your
  cloud drive was offline, and changed it on your other computer meanwhile, your first edit could be lost on both
  computers when the drive came back. Now both computers' changes are kept.
- **Fixed**: "Use … instead" and Restore from Deleted files could be undone a moment later by an open screen still
  holding the older version, for example the Lab's presets with a change waiting to be saved. The version you put back
  now stays, and the open screen's own change is kept with it.
- **Behind the scenes**: the sync choices check no longer fails on a busy computer when sync happens to run between its
  two edits. The Lab's shader check counts a new layer's one setup moment once instead of twice, and still catches
  shaders made in the middle of a scene.
