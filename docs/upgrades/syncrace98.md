# syncrace98: a save already on its way can't land over what sync wrote (round 98)

Round 97 (`syncsweep97.md`) guarded every sync write path against a waiting save, and left two cases open:
1. **A save already handed to the store thread before an arrival, landing after it.** Not reproduced then.
2. **A rename here and a window holding the old name.** Its save writes the old name back.

Each was reproduced first, with the real engine, the real StoreAck core, the real store (`store.js`) and the real
store thread (`storework.js`) doing the window's saves, as in the app. Case 1 turned out to be real data loss on both
computers, and is fixed. Case 2 cannot happen with any store a window holds today, and the fix suggested for it would
cause harm for the stores that do exist. It is pinned as it is (see below).

## How it was tested
New: **`dev/syncrace98-test.js`** (in UNIT as `unit:syncrace98-test`), 8 scenarios, 48 checks. It runs on the
two-computer simulator (`dev/sync-sim.js` via `dev/sync72-test.js`).
- `store.js` and the files it requires are copied next to the simulated PC's data folder. `store.js` keeps its data in
  `<its folder>/data`, so the copy's data folder is the PC's. A symlink would resolve to the repo's real `data`, so the
  test copies instead. It never touches real data.
- Saves go through the store thread (`HEARTH_STORE_THREAD`, as in Electron), and through sync's guard wired the way
  `syncmain.js` wires it (`setBeforeWrite`).
- **The timing is driven, not waited for.** A test hook holds the store thread: `store._hold(sab)` → `storework.js`
  `_hold`, only when `HEARTH_TEST_STORE_HOLD` is set, which the app never does. A save handed to the thread then waits
  until the test lets it go, so it lands exactly where the test wants it:
  - after the engine's write (the old code: let go when the arrival is announced);
  - or when the fixed engine asks the store to settle (let go 30 ms later).

## Case 1: a save handed to the store thread before sync's write, landing after it

### Cause
The window saves a store (`hub.kvSet` → `store.setKV` → `writeJson(…, { off: true })`). `writeJson` runs sync's guard
(`beforeWrite` → `guardWrite`) **when the save is made**, then hands the value to the store thread, which writes it a
moment later. A pass waits for the store to go idle before it starts (`store.idle`, round 20), but not before each write
inside the pass. So:
1. The pass looks at the PC's notes (unchanged) and reads the Mac's version.
2. The window saves. The guard has nothing to merge yet (nothing arrived), and the save goes to the thread.
3. The engine writes the Mac's version. Its check right before the rename (`same(file, ent)`) still sees the file it
   looked at, because the save hasn't landed yet. It keeps the guard base and announces the arrival.
4. The thread writes the window's save: the older copy plus what was typed, **over the Mac's version**.
5. StoreAck: the window has nothing waiting any more, so it reads that and acks.
6. The next pass sees the PC changed and the cloud unchanged since the base, so it pushes. **The Mac's note is gone on
   both computers.**

A save made while the engine writes (between its temp file and its rename) does the same. So does Restore from
Deleted files (round 96 / 97): its guard base is kept before the rename, but a save already on the thread skipped it.

### Before the fix
The app files at round 97, plus the hold hook: **11 failures in 5 scenarios.**
- `handed`, `during`, `during-thread`: "the Mac's change stays on the PC", "…and both reach the Mac", "the window holds
  both". The PC and the Mac ended with `n1, n2, typed`, and the Mac's note was lost on both.
- `restore`: the version put back was written over by the window's older copy.
- `quit`: there was no settle.

### Fix
In each file, the smallest change that fits the existing mechanisms (the CAS check, the guard base, the store's
`pending` / `idle`):
- **`sync-engine.js` (Codex's)**: a new `settled(file, fn)`. When the app gives `o.localWrite` and the file is in the
  data folder, it asks the store to settle that file, runs the write, then releases it with `setImmediate`. That runs
  after the caller's own synchronous steps right after the write: `remember()` (the guard base), `setBase`. It is used
  in two places:
  - `casWrite` (around the test fault hook and the rename). That covers pull (main and store-thread paths), merge,
    `absorbCopy`, relink, `choiceWrite` and the pack lane's take.
  - `restore`'s rename.
- **`store.js`**: `settle(file)` → `release()`.
  - **Saves already on their way land first.** If that file has a save pending on the thread (or a giant chat's delta),
    it waits for the thread (`ping`). The engine's check before its rename then sees the file changed and leaves it.
    The next pass merges, as for any change made here.
  - **Saves made from then until `release()` wait**, in the order made. Each then goes through `writeJson` again, so
    sync's guard merges it with what arrived (its base is now in place). It is never written over.
  - `idle()` waits for those saves too. `flushSync()` (quit) writes any still waiting.
  - A giant chat's delta save is refused while sync writes that chat. The window then saves it whole, through the
    guard, after the write.
  - A gate is never held more than 60 s.
- **`syncmain.js`**: `localWrite: (file) => store.settle(file)`.

A write the engine refuses this way is the same as a change made a moment before the pass: the next pass merges both.
Nothing is written over and nothing is dropped.

### After the fix
**48 / 48**, run 4 times.

| Scenario | What happens | Before | After |
|---|---|---|---|
| `handed` | the window's save handed over after the pull read the Mac's version (store-thread pull path), before its write | the Mac's note lost on both computers | the pull leaves it; the next pass merges: both notes on both, the window holds both |
| `during` | two saves made while the pull writes (main path) | the Mac's note lost on both | they wait, then merge with the arrival; both notes on both; the later save wins |
| `during-thread` | the same on the store-thread pull path | lost on both | as `during` |
| `restore` | a save handed over while Restore copies the version in place aside | the version put back written over | the save lands first; Restore's check sees it and merges it in (`choiceWrite`): both kept |
| `quit` | a save made while sync writes; `idle()`; quit with one still waiting | (no settle) | it waits; `idle()` waits for it; it lands on release; one still waiting is written by `flushSync`; another store isn't held |

## Case 2: a rename here and a window holding the old name

### What was found
Reproduced with the real engine first. Then every store a window or the main process holds (StoreAck, round 77) was
checked against the two ways a store gets renamed here:
- **The other computer renamed it** (`renameHere`: a delete here and an add of the same content become a move). Every
  store a window holds with a pending save is a **kv store** (`kv/<name>.json`: notes, boards, `board-<id>`,
  `workbench-<id>`, `three-tm-<id>`…). A kv store is **never renamed or deleted here**: one gone from the cloud is put
  back (the engine's `appStore` rule). So the move is never planned. Scenario `rename-kv` shows this: the Mac renames a
  held board, both names end on both computers, and the window's change is in the name the app reads.
- **Rename for Windows** (`fix('rename')`). kv names are `[\w-]{1,80}` (`store.js` `kvPath`), and the app's names are
  never a bare reserved word (`con`, `nul`…). So a kv store never needs it, except on a PC whose data folder path is
  over ~170 characters (see "What's left").
- **The other held stores** have fixed names (`tickets/index.json`, `showsync/*.json` (drop only),
  `creative-vst/soundbank/index.json`, quick ideas). Chats aren't StoreAck's: the chat window's own path
  (`Native.forget`). A chat deleted on the other computer is moved to `trash/`, and a save of it brings it back. That
  is the accepted "save after a delete" rule: never lost.

### Why the suggested fix wasn't made
"Move the pending save to the new name" only helps a holder that can follow the rename. For a kv store, the name **is**
how the app finds it (a board's id, a project's id). The app would go on reading the old name, so the window's change
would land in a file it never opens again. Writing the old name back, as now, keeps the change where the app reads it.
A redirect in `store.js` was written and then taken out. It would only have taken effect for chats renamed into
`trash/` (a delete on the other computer), where it would have buried the reply being written into the Deleted copy
instead of keeping the chat.

### Pinned
- `rename-kv`: not renamed here; the card and the window's change are in the name the app reads, on both computers;
  the new name is there too. Nothing lost.
- `rename-held`: a store under another name that a window would hold (none does today), renamed by the Mac. The
  window's change comes back under the old name, the new name has what moved, both computers end the same. Nothing
  lost.
Both pass before and after this round.

## The table (round 97's sweep, updated)

| Path | Round 97 | Round 98 | Covered by |
|---|---|---|---|
| pull, main process / store thread: a save **already handed to the store thread** before the write | **no**: it landed after and wrote the older copy over what arrived (lost on both at the next push) | **yes**: it lands first; the CAS sees it; the next pass merges | `handed` |
| pull / merge / absorb / relink / choice / pack take: a save made **while** the engine writes | **no** (the same) | **yes**: it waits until the write and its base are in place, then goes through the guard | `during`, `during-thread` |
| `restore`: a save handed to the thread while it restores | **no**: written over the version put back | **yes**: it lands first; Restore's check merges it in (`choiceWrite`), or says try again (big) | `restore` |
| a giant chat's delta save while sync writes that chat | (the same race) | refused: saved whole, through the guard, after | — |
| quit with a save waiting for sync's write | — | written (`flushSync`) | `quit` |
| rename here, a window holding the old name | old name written back; nothing lost | unchanged: not reachable for any held store today (kv stores are put back, not renamed) | `rename-kv`, `rename-held` |

The rest of round 97's table is unchanged.

## Cost
- One `settle` per file sync writes into the data folder: one promise and one map entry, released on the next
  `setImmediate`. A thread round trip happens only when that file has a save on its way.
- A save made while sync writes that store waits for the write (milliseconds).
- Nothing changes when sync is off: `localWrite` is only given by `syncmain.js`.
- `store.js` is a main-process file, not on the first screen. `unit:boot-test` and `unit:lazymanifest-test` pass.

## Mixed versions
Nothing that crosses computers changed: no cloud format, no state format, no machine record. Both changes are in how
this computer writes its own data folder. `packs89-test` (with its older-Hearth scenario), `aside95-test` and
`devices90-test` pass.

## What's left
- **A `mergeKV` already on the store thread** (feature usage, saved by what changed). It reads the disk when it runs.
  If that falls between the engine's check and its rename, those few counts are written over. Same window as before,
  not reproduced, counts only.
- **A synchronous save** (not through the thread: none of the window's saves) landing between the engine's check and
  its rename is written over. This is the CAS's own gap, as before.
- **Rename for Windows on a kv store.** It is only offered on a PC whose data folder path is over ~170 characters. It
  would cut that store off from the app, because the name is its id. Worth refusing for `kv/` in a later round.

## Final runs
All app checks ran under `flock /tmp/hearth-run.lock`, at most 5 per run, with `TMPDIR=/tmp/sr98` (since removed).

| What | Result |
|---|---|
| `node dev/syncrace98-test.js` | ✓ 48 / 48 (before the fix: 11 failures in 5 scenarios) |
| keptaside94, sync72, syncpanel92, guardloss78, projaudit91-sync | ✓ 5 / 5 |
| labsync88, sync, lazy | ✓ 3 / 3 |
| unit: syncrace98, syncsweep97, storeack77, sync72, syncstate75, sync, aside95, keptaside94, packs89, devices90, synchard74, guardloss78, store-thread, datasafe-scan, winmac, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan, boot-test, lazymanifest | ✓ 21 / 21 |
| `node dev/sync72-test.js --thread` | ✓ 209 / 209 |

## For Codex
`sync-engine.js` (each edit marked `(round 98, syncrace98)`):
- **`settled(file, fn)`**, just before `casWrite`. If `o.localWrite` is given and the file is in the data folder, it
  calls `await o.localWrite(file)` (→ a release function), runs `fn`, then `setImmediate(release)`. The release comes
  after the caller's synchronous steps (`remember`, `setBase`).
- **`casWrite`**: the fault hook and the rename run inside `settled(file, …)`. The fault hook moved inside, so a test
  can make a save "during" the write.
- **`restore`**: its rename runs inside `settled(dst, …)`.
- New option **`o.localWrite(file)`**, given by `syncmain.js` (`store.settle`).

Not Codex's: `store.js` (`settle`, gated saves, `idle`, `flushSync`, `saveChatDelta`, the test-only `_hold`),
`storework.js` (`_hold`, test-only), `syncmain.js` (`localWrite`), `dev/syncrace98-test.js`, `dev/run-checks.js`.

## For the patch notes
- **Fixed**: with sync on, a change from your other computer could be lost on both computers. This happened if it
  arrived at the very moment Hearth was saving the same thing here (a note, a board, a project's worktable…). Your
  save could land a split second later, over what arrived, and the next sync sent that version back. Now your save goes
  first and the next sync merges both, or it waits and is merged with what arrived. Both changes are kept.
- **Fixed**: putting back something from Deleted files could be undone by a save Hearth was already making of the same
  thing. Now that save is merged in.
