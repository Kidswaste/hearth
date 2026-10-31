# aside95: choosing between two versions of a very long chat no longer freezes the app (round 95)

Round 94 (keptaside94) built the shared compare-and-choose view and left three notes on the sync engine
(`sync-engine.js`, Codex's), which this round takes up:

1. Choosing a version of a very long chat read both versions whole on the main process.
2. "Keep the other" put the conflict's copy in the trash's hidden `conflicts/` folder, and the version it replaced was
   in Deleted files only on the computer where the choice was made.
3. A conflict's record named the computer that noticed it by name only, so the labels ("Keep PC" / "Keep Mac")
   were guessed from names.

## 1. A very long chat's choices off the main process

When the owner picks a version that sync kept, the engine read this computer's version and the other version whole,
parsed them, merged or kept both, and wrote the result, all on the main process. While that ran, every window waited.
For a 60 MB chat that was 0.3–1.9 s per choice (and more on a slow Windows disk).

Now, for a data store of 1 MB or more (a chat, or any `kv/` store; settings stay as they were), that work runs on
the store's files thread (`asidework.js`, ops `asideTake` / `asideForm` in `storework.js`). The thread writes the
result next to the file. Then the engine:
- keeps the version in place in Deleted files, as before;
- checks the file wasn't changed meanwhile;
- renames the result into place.

If the file was changed meanwhile (a reply landed), nothing is replaced and the choice says "Try again". The engine
does all its own bookkeeping as before: Deleted files, the write guard's base, the notes, the conflict record.

Measured by `dev/aside95-test.js` with the lag probe (`mainlag-probe.js`, `HEARTH_LOOPLAG=prof`). The setup:
- a 60 MB chat with 20,427 messages;
- "before" is round 94's engine (`sync-engine.js` at `c33c1f3`, read from git);
- "after" is this one, with the store thread;
- the box was loaded at about 2.5 per core.

"Stall" is the longest time the main process couldn't answer (event-loop delay). The total time is wall-clock time
from the click to done; the thread's work doesn't hold the app.

| Choice | Before: stall | After: stall | After: total |
|---|---|---|---|
| Compare (kept aside) | 12 ms | 10 ms | 0.1 s |
| Use the one kept aside | 484 ms | 22 ms (a GC) | 2.4 s |
| Keep both (kept aside) | 575 ms | 21 ms | 2.5 s |
| Keep the other (conflict) | 493 ms (1,907 ms in another run) | 14 ms | 3.3 s |
| Merge (conflict) | 453 ms (1,361 ms) | 11 ms | 2.7 s |
| Keep both (conflict: its own chat) | 286 ms | 12 ms | 1.6 s |
| Restore from Deleted files | 424 ms | 44 ms | 1.5 s |

The longest busy stretch of the main process after the change was 36 ms, the garbage collector's. Before the
change, each choice also had several busy stretches of 70–570 ms. The result is the same as round 94's for each
choice: the same title, the same messages, the paths in this computer's form, and as many versions in this
computer's Deleted files.

Also checked:
- A version that can't be read is said so, and nothing changes: "can't be read right now… so nothing was changed".
- If this computer's own version is damaged, Keep both and Merge stop (it's never taken as empty). "Use the one kept
  aside" still replaces it, and the damaged file waits in Deleted files.
- A change during the preparation leaves nothing replaced and no temp file behind.

### The audit: other places where `sync-engine.js` reads a whole chat on the main process

These are the reads of whole files and the `JSON.parse` calls on chat files in `sync-engine.js`.

Fixed this round (the same way, through `asidework.js`):
- `asideDo` 'theirs' / 'both': this computer's version (`readFileSync` + parse), the kept one (parse), Keep both,
  and the write.
- `resolve` 'theirs' / 'merge': `oursValue()` (`readFileSync` + parse), `theirsValue()` (parse), `merge3`, and the
  write.
- `resolve` 'both' for a chat: the copy parsed and written as its own chat.
- `restore` of a data file from Deleted files: parse + write in this computer's form.

Left as they are:

| Where | What it does | Why it stays |
|---|---|---|
| `guardWrite` | After an arrival, each window save of that store reads the file whole (`readFileSync` + parse) and merges, until the window acks. A giant chat pulled through the thread keeps the guard (`remember(rel, null)`), so the first saves after such a pull parse it on the main process. | The guard runs inside a synchronous save. Moving it means an async save path for guarded files. |
| `renameThere` / `renameHere` | `readFileSync` of the base text (no parse) when a store is renamed. | 20–50 ms for 60 MB. Chats are named by id, so this is rare. |
| `absorbCopy` | A copy made by a cloud client ("… (conflicted copy).json") of a JSON store: both are read, parsed and merged with no size limit. | Rare. Its merge (`shared: true`, no base) isn't in `syncMerge`, so it needs a thread op of its own. |
| relink after a move | Reads and parses each store up to 16 MB (bigger ones are skipped). | Up to about 16 MB. |
| `preview`, `asideDo('compare')` | Stop at 6 MB (above that, only a stat). | Fine as is. |
| `localText`, `cloudText`, `relHashNow`, `keepStateAside`, `readBase` | Whole reads. | Only on the path for stores under 256 KB (`OFF_MIN`). Bigger ones go through `hashJson` / `pullJson` / `mergeJson`. |
| `keepScenesAside`, `localJsonText` | Whole reads. | Lab scenes and settings only. |

## 2. "Keep the other": the version it replaced, in Deleted files on both computers

On the computer where he chose "Keep the other" (by hand, by Settle all, or settled by itself), the version it
replaced was copied only into that computer's own Deleted files. The conflict's copy, which is the version now in use,
went into the trash's hidden `conflicts/` folder with the record. On the other computer nothing listed the replaced
version: if he chose on the Mac, the PC's Deleted files didn't have the PC's own version.

Now that version is also put in the synced Deleted files (`<sync folder>/Hearth/trash/<day>/<its path>`, in the
cloud's form). The other computer lists it and can restore it. The steps:
- The two copies get the same short prefix ("1a2b3c4d-boards.json"), so on the computer where the choice was made the
  Deleted files list shows them once (`sync-conflicts.js`).
- Restore takes the prefix off: the version goes back to its own place.
- The conflict's own bookkeeping is unchanged: its record and copy still go to the trash's `conflicts/` folder, and
  the engine's lists and notes read them as before. The Undo in the compare view still uses this computer's copy.
- Files over 200 MB stay in this computer's Deleted files only, so a big video isn't uploaded a second time.
- If the copy can't be written to the sync folder, it stays in this computer's Deleted files as before (logged).

Checked in `dev/aside95-test.js` through the two-computer simulator: a board renamed on both, and a picture changed
on both. After "Keep the other" on one computer, the replaced version is listed on the other computer and comes back
from there on both.

## 3. Conflict records name the noticing computer by id

New conflict records carry `byId` (the noticing computer's id) next to `by` (its name, as before). The field is
called `byId`, not `by`, because round 94 reads `by` as a name: on the other computer still on round 94, an id in
`by` would turn up in the labels and would make that computer call neither version its own.

`Sync.whose(c)` in `sync.js` says, for this computer, which side is its own:
- `a`: the version in place;
- `b`: the copy;
- `third`: neither (a third computer).

It uses the id when the record has one, and the name as before when it doesn't.

**Found and fixed on the way: round 94's "the way this computer sees it" never ran in the app.** The window's sync
status (`syncmain.js publicStatus`) gives `machine` as the computer's name (a string), not `{ id, name }`, so
`Sync.status().machine?.id` was always undefined. On the computer the copy came from, "This PC" still labelled the
other computer's version, and "Keep PC" kept the Mac's: exactly what round 94 meant to fix. Its checks didn't see this
because in them the conflict was always noticed by the computer they ran on. The status now also carries `machineId`,
and `Sync.whose` reads it. With a main side that doesn't send it, the labels are guessed by name as before, and no
side is ever called "a third computer's". The panel card (`sync-panel.js`),
the Conflicts list (`sync-conflicts.js`) and the compare view (`keptaside.js`) all use it. On a third computer,
neither version is called "This PC": both are named by their computers. Two computers with the same name are no
longer mixed up.

## Two computers on different versions

`dev/aside95-test.js` runs round 94's engine on one computer (from git, compiled next to this tree) and this one on the
other, both ways round:
- A conflict noticed by either computer is listed on both, previewed and settled on the other one.
- Both computers end with the version chosen.
- The record goes away on both.
- Round 94's window code (`mineOf` from round 94's `keptaside.js`) and `Sync.whose` label the sides of a new record
  the same way.

Old records (no `byId`) are labelled as before. The synced Deleted files copy is an ordinary file in the trash, so
round 94 lists and restores it as well.

## Files

- `asidework.js` (new): the thread side (`work`: take, form) and the main side (`create`: `take` / `put`, `form`,
  `share`).
- `storework.js`: ops `asideTake`, `asideForm`.
- `syncmain.js`: hands the engine `asideBig` (only when the store's files thread is there). The status adds
  `machineId`.
- `sync-engine.js` (Codex's): the marked hooks below.
- `sync.js` (first screen, about +0.5 KB: 1748 / 1751 KB, was 1747): `Sync.whose`.
- `sync-panel.js`, `sync-conflicts.js`, `keptaside.js`: labels through `Sync.whose`. `sync-conflicts.js` also lists
  the two copies of a replaced version once in Deleted files.
- `dev/aside95-test.js` (new, UNIT), `dev/run-checks.js` (`unit:aside95-test`, group `aside95`).

## Runs

All passed:
- `unit:aside95-test` (72 at 60 MB; 67 at 10 MB);
- `unit:keptaside94-test` (57), `unit:sync72-test` (179), `unit:sync-test` (180), `unit:packs89-test` (100),
  `unit:devices90-test` (73), `unit:twocomputers-test` (117), `unit:guardloss78-test` (103);
- `unit:datasafe-scan`, `unit:winmac-test` (609), `unit:errorcalm-scan`, `unit:storeack-scan`, `unit:chatsafe-scan`,
  `unit:chatwin-scan`, `unit:boot-test` (3074), `unit:lazymanifest-test`.

App checks under the lock, all passed: `keptaside94`, `sync72`, `syncpanel92`, `guardloss78`, `projaudit91-sync`,
`sync`, `lazy`. A first run failed `keptaside94` and `sync72`, which is how the status `machine` problem above was
found. They passed after the fix.

`node dev/sync72-test.js --thread` (not in the list) fails "random 1: every line added to the notes" the same way on
round 94's tree: it was already failing before this round.

## For Codex

Each edit in `sync-engine.js` is marked `(round 95, aside95)`; the logic is in `asidework.js`. `cloud-files.js` is
untouched.

- **`sides()`: `byId: machine.id`.** New conflict records name the noticing computer by id. It is a new field because
  round 94 reads `by` as a name.
- **`asideDo`, the JSON branch.** `o.asideBig?.take(...)` first. `null` (a small store, or no thread) runs the code as
  before. Otherwise:
  - the guard's base is `big.prev`, a `{ lazy }` whose text is made only if a save needs it;
  - `keepHere` runs as before;
  - `big.put()` renames the prepared file into place, only if the file is as it was read.
  A `keepHere` failure lets the prepared file go (`big.drop()`).
- **`resolve` 'theirs' / 'merge' (JSON).** The same hook, with `src: copy, cloud: true` and `theirsNewer`. Merge's
  conflict count comes back from the thread (`big.conflicts`) for guardloss78's `lost`. The write goes through
  `big.put()`.
- **`resolve` 'theirs' (any kind), after `keepHere`.** `keptHere = await o.asideBig.share(...)`: the replaced version
  also goes into the synced trash under its own name, with a prefix shared with this computer's copy. The record and
  copy still go to `trash/<day>/conflicts/`. `noteLoser` gets the renamed path.
- **`resolve` 'both' for a chat.** `o.asideBig?.form(copy, made, ctx, { copyOf })` writes the chat copy on the thread.
  `false` (small) runs the code as before.
- **`restore`.** `o.asideBig?.form(src, tmp, ctx, { rel })` for a big JSON file. Then `flushed` and `renameRetry` run
  as before.
- **Not changed, for you to weigh:**
  - `guardWrite`'s synchronous whole read: an async guard for big stores, or no guard after a giant pull
    (`remember(rel, null)` → `guard: false`, as for the ≥ 16 MB local path).
  - `absorbCopy` with no size limit.
  - The base read in `renameThere` / `renameHere` (could be `fsp.readFile`).

## For the patch notes

- **Choosing between two versions of a very long chat no longer freezes Hearth.** Using the version kept aside, Keep
  both, Keep the other, Merge, or bringing a version back from Deleted files used to hold the whole app for half a
  second to two seconds on a 60 MB chat. Now it happens in the background, and the app keeps responding (about
  0.02 s at most). If the chat changes while the choice is being made, nothing is replaced and Hearth asks you to try
  again.
- **The version you replace is in Deleted files on both computers.** When you choose "Keep the Mac's" on the PC (or
  the other way round), the PC's version now also shows up in Deleted files on the Mac, and you can bring it back from
  either computer. On the computer where you chose, it's listed once.
- **Fixed: on the computer a conflict's other version came from, "Keep PC" could still keep the Mac's version.**
  Round 94's fix for this didn't reach the app. It does now.
- **Each side of a conflict is labelled exactly.** Hearth now records which computer noticed a conflict by its id, not
  just its name. "Keep PC" and "Keep Mac" are always the right way round, even if two computers have the same name or
  you look from a third one. Conflicts from an older version are labelled as before, and both computers can run
  different versions while you update.
