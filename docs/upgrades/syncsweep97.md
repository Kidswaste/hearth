# syncsweep97: no sync write can be silently overwritten by a waiting save (round 97)

Round 96 (`checkfix96.md`) found that `restore()` wrote a store without keeping the write guard's **base**. A window
still holding the older version, with a save waiting (a StoreAck holder, round 77), then wrote that older version
straight back over what had just been restored. A pull keeps a base (`remember` → `pulledPrev`); the next save of the
older copy is merged three-way with what arrived (`guardWrite`). Restore didn't.

This round swept **every** place the sync engine, and the helpers it calls in the window and on the store thread,
writes a synced store into the data folder. For each one, the question was: can a holder with a save waiting overwrite
the result, and does the write keep a guard base (or flush and read again around it)?

Four gaps were found, plus a fifth kind of overwrite on the way. Each got a failing scenario first, then a fix with the
mechanism the engine already uses, then the scenario passing.

## How it was tested

New: **`dev/syncsweep97-test.js`** (in UNIT as `unit:syncsweep97-test`), 21 scenarios. They run through the two-computer
simulator (`dev/sync-sim.js` via `dev/sync72-test.js`) with:
- the real engine and its write guard, applied the way `store.js` applies it;
- the real StoreAck core;
- the real store thread (`storework.js`) for the big-store paths;
- the real pack lane (`syncpack.js`);
- the real `store.js` in a child process for Combine, with `keptaside.js`'s own `writeCombined` source run against it.

Each scenario has a window on the PC that holds the store and has a change of its own not written yet (a note typed:
"typed on the PC, not saved yet"). The write under test happens. Then the window handles the arrival the way it does in
the app: StoreAck writes the waiting change first, reads again and acks. If StoreAck left the change waiting (the
arrival said `guard: false`), the window's own debounced save lands a moment later. Two checks follow:
- the write's result is still on disk (the Mac's note, the version put back, the combined text…);
- the window's own change is kept too.

The `race-*` scenarios are the other way round: a save lands **while** a choice is being made, between its read and its
write. The test does this by hooking the copy into Deleted files that every choice makes first.

Before the fixes (the app files at round 96, this test file): **11 failures in 7 scenarios**. These were `restore-new`,
`restore-big`, `packs`, `race-resolve`, `race-aside`, `race-restore` and `combine`. After: **106 / 106**.

## The sweep

"Guarded" means a save of an older copy after the write is merged with the write's result (a guard base or Recover's
`outsideWrite` base), or the holder is flushed before the write and read again after it. Every scenario named below
has a holder with a save waiting.

| Path | Guarded before | Guarded after | Covered by |
|---|---|---|---|
| pull, main process (stores < 256 KB) | yes: `remember(prev)` right after the write, same tick | yes (unchanged) | `pull` |
| pull, store thread (bigger stores) | yes: the version replaced, kept lazily (a giant chat: no base, `null`) | yes (unchanged) | `pull-thread` |
| merge, main process / store thread | yes: `remember(m.ours)` | yes (unchanged) | `merge`, `merge-thread` |
| `absorbCopy` (a cloud client's "conflicted copy") | yes: `remember(ours)` | yes (unchanged) | `absorb` |
| relink (Rename for Windows: links in stores follow) | yes: `remember(v)` | yes (unchanged) | `relink` |
| rename here / `fix('rename')` | not needed: the new name wasn't here, so nobody held an older copy of it. A holder of the **old** name with a save waiting writes the old name back. That undoes the rename, but loses nothing, the same as a save after a delete. | unchanged | (`synchard74` winnames) |
| rename there, delete there | write only in the cloud folder | — | — |
| delete here | the file goes to Deleted files; a holder's save brings it back (never lost, as before) | unchanged | — |
| `resolve` Keep the other / Merge, small store | yes: `remember(ours)` before the write | yes, and a save landing **during** the choice is merged in (`choiceWrite`) | `resolve-theirs`, `resolve-merge`, `race-resolve` |
| `resolve` Keep the other / Merge, store ≥ 1 MB (aside95 thread path) | yes: `big.prev`; `put()` writes only over the version read | yes (unchanged) | `resolve-theirs-big` |
| `resolve` Keep both, data | yes: `remember(ours)` | yes, and `choiceWrite` | `resolve-both` |
| `resolve` Keep both, chat | a new chat file: nobody holds it | — | (`aside95-test`) |
| `resolve` Keep this one | nothing written here | — | — |
| `asideDo` Use that one / Keep both, small store | yes: the base is the window's last saved copy (`guardOurs`), else the version replaced | yes, and `choiceWrite` | `aside-theirs`, `aside-both`, `race-aside` |
| `asideDo` Use that one, store ≥ 1 MB (aside95 thread path) | yes: `big.prev`; `put()` writes only over the version read | yes (unchanged) | `aside-theirs-big` |
| `asideDo` Compare / OK | nothing written | — | — |
| `restore`, small store in place | yes (round 96) | yes, and a save landing during it is merged in | `restore`, `race-restore` |
| `restore`, store **≥ 1 MB** | **no**: no base, `guard: false`; the holder's own timer then wrote its older copy over the version put back | **yes**: the version replaced, in cloud form, made on the store thread and kept as text (parsed only if a save needs it) | `restore-big` |
| `restore` of a store **not here** (or unreadable) | **no** (`guard: false`); the version put back was also removed from Deleted files, so it was lost | **yes**: no common base (`null`): a save of the window's copy keeps everything of both | `restore-new` |
| packs adopt / take (`syncpack.js`, chats ≥ the pack size) | **no**: written with no base. The chat window's waiting save (a reply streaming) wrote the chat without the other computer's messages; the next publish then **removed them on both computers** | **yes**: no common base, as a giant pull already does (`guardBase` → `remember(rel, null)`) | `packs` |
| devices90 rejoin | writes only this computer's own machine record in the cloud folder's `.sync`: no data-folder store | — | (`devices90-test`) |
| Kept aside › **Combine…** (`keptaside.js` `writeCombined`, `hub.kvSet` + StoreAck) | **no**: it flushed and acked, then saved. Something typed between that read and the save was written over the combined text by the holder's flush after. | **yes**: the save carries `base` (the version it read): `store.js` registers it as Recover does (`outsideWrite`), so the holder's copy merges in until it acks | `combine` |
| aside95 thread path (`asidework.js`) | yes: `take` returns `prev` (the guard's base); `put()` only over the version read | yes (unchanged) | `resolve-theirs-big`, `aside-theirs-big`, `restore-big` |
| Lab presets (`LabPresets.take`, `tools/three.js`) | yes: its saves go through `hub.kvSet` (the guard); it is a StoreAck holder; round 96 closed its start-up hole | unchanged (a Lab file: left to labproj97) | (`storeack77-test` `restore`, `labsync88`) |
| projaudit91's merges (Keep both keeps one project, both names) | yes: they run inside `resolve` / `asideDo` Keep both | yes, and `choiceWrite` | `resolve-both`, `aside-both` |
| projaudit91's "Use its name" | through `projects.js` (a StoreAck holder) and the guard | unchanged | (`projaudit91-test`) |
| 🛟 Recover (`datasafemain.js`) | yes: `outsideWrite` (round 78) | unchanged | (`guardloss78-test` recover) |
| `keepScenesAside`, `keepStateAside`, keep-here copies | written outside the synced data (history, recovery, Deleted files) | — | — |

## The fixes

### 1. Restore keeps a guard base for every store (`sync-engine.js`, Codex's)
In `restore()`:
- **A store over 1 MB.** The version in place is read on the store thread (`asideBig.form(…, { to: 'cloud' })`, the
  op aside95 already uses for the version put back) into a temp file in `data/sync`. Its text becomes the base
  (`{ lazy: text }`, parsed only if a save needs it, like a pull's). Without the thread, it is parsed here up to 16 MB,
  as the small path does. At 16 MB and up without the thread there is no base, as before (round 77's rule).
- **A store not here, or one that can't be read.** The base is `null`: no common base. A save of the window's copy is
  then merged with the version put back, keeping everything of both. Before, the arrival said `guard: false`. StoreAck
  then left the window's change waiting, and the window's own timer wrote it over the version put back. That version
  had also just been removed from Deleted files, so it was lost.

### 2. A choice never writes over a save that landed while it was made (`sync-engine.js`)
`resolve` (Keep the other / Merge / Keep both for data), `asideDo` (Use that one / Keep both) and `restore` read this
computer's version, copy it into Deleted files, then write the result. On the main-process path (stores under 1 MB),
that write was unconditional (`atomicWrite` / a plain rename). A save landing in between (a debounced save, a StoreAck
holder's flush) was written over. The window had already saved, so nothing was waiting any more. It then read the
store again and lost its change from memory too.

Now:
- The final write is `choiceWrite`: a `casWrite` against the file as it was read.
- If it changed, the save that landed is merged in. The base is the version read; the choice wins a field changed both
  ways in that moment. Then it tries again, up to 4 times. If it still can't, it says "It changed while this was being
  prepared. Try again." That is the same message as the store-thread path (`asidework.js` `put()`), which already
  checked.
- A big restore checks the same way. Its value is never parsed here, so when its file changed it says try again, and
  drops the base it set.

### 3. A chat taken from pieces keeps the guard (`syncpack.js`; one hook in `sync-engine.js`)
`syncpack.js`'s take wrote the merged chat with `casWrite` and announced it, but kept no base. A whole pull of a giant
chat keeps one (`remember(rel, null)`).

So: the chat window was streaming a reply, which made `Native.forget` say no, and the chat's save landed after the take.
It was saved whole, unguarded, without the Mac's message. The PC then published that version, and the Mac took it as a
deletion. **The Mac's message was gone on both computers** (`packs` before the fix: "both messages on the Mac" failed).

Now the take calls `api.guardBase(rel)` right after its write. That is a new engine hook, `remember(rel, null)`: no
common base, as for a giant pull. The window's save merges with the chat taken, and both messages stay on both.

### 4. Combine's save is guarded (`keptaside.js`, `store.js`)
`writeCombined` (Kept aside › Combine…) runs in this order:
1. StoreAck flushes the holders, reads again and acks.
2. It reads the store and puts the edited text in.
3. It saves.
4. StoreAck runs again.

Something typed between steps 1 and 3 was waiting in the holder. In step 4 the holder wrote its copy (the old text plus
what was typed) over the combined text. The ack had already cleared the guard, so nothing merged it.

Now the save passes `{ base: cur.value }` (the version it read) to `hub.kvSet`. `store.setKV` registers it with
`outsideWrite`, the same mechanism 🛟 Recover uses (round 78). Until the window acks, a save of an older copy from the
window is merged three-way with the combined text. `sync:ack` already clears it (`outsideAck`).

## guardWrite's synchronous whole read of a giant chat (aside95's audit)
**Not changed: it isn't small.** After an arrival of a giant chat (a pull, and now a take from pieces), the chat's next
whole save runs `guardWrite` inside `store.js`'s synchronous `beforeWrite`. That means `readFileSync` and `JSON.parse`
of the whole chat, then `merge3`, on the main process: about 1–2 s for a 60 MB chat. It happens once per arrival, until
the window acks. Delta saves are refused while the guard wants the file, so the first save after it is a whole one.

Moving it off the main process would take:
1. **`store.js`.** For a file the guard wants and that is big (≥ `BIGCHAT`), with the thread up, `writeJson` skips
   `beforeWrite` and sends the save to a new thread op (`guardedWrite`), in order with that file's other pending
   writes (`pending`). Every caller of `writeJson` that relies on it returning synchronously must accept a promise for
   those files. Chats already save through `writeOff`, but the kv path does not.
2. **`storework.js`.** The op reads the disk version, takes the base (the engine's lazy text or `null`), merges with
   `merge3` (in `sync-merge.js`, loadable there), writes, and returns the conflicts and the hash of the result.
3. **`sync-engine.js` (Codex's).** A `guardPlan(rel)` that hands over the base (a 60 MB string copied to the thread per
   save, or written to a file once per arrival). A `guardAfter(rel, result)` that does what `guardWrite` does on the
   main process afterwards: `guardLoser` (the Kept aside note, `aside.wrote`) and `guardOurs`.
4. **The window's value.** It arrives as an object over IPC and must reach the thread as bytes. That is one stringify
   on the main process (~100 ms for 60 MB), unless the window sends it as bytes.
5. **Tests.** The guard's semantics through the new path (`storeack77`, `guardloss78`, this file), the ordering against
   delta saves, and a quit mid-way.

That is roughly 150 lines over three files, one of them Codex's, and every giant-chat save's path. Not this round. The
cheaper alternative aside95 named (no guard after a giant arrival, `guard: false`) is what lost the Mac's message in
fix 3. It isn't safe.

## What's left
- **A save already handed to the store thread before an arrival, landing after it.** `writeOff` computes the guard
  when the save is made. A pull or merge that renames its file in between is then overwritten by that older save. The
  engine waits for the store to go idle before each pass (`store.idle`, round 20), but not before each write inside a
  pass. Closing it means the engine asks the store to finish the pending writes of that one file right before its
  `casWrite`, so the CAS then fails and the next pass merges. That is a hook in the engine plus `store.js`. Narrow
  (milliseconds), not reproduced here.
- **Rename here and a holder of the old name.** Its save writes the old name back: the rename is undone (both names
  exist, nothing lost). The same goes for a save after a delete here. This was left as it is.
- **The Combine base crosses the IPC whole** (the store as read). Combine is for text stores (notes, scenes), so this
  is small.

## Mixed versions
Nothing that crosses computers changed: no cloud format, no state format, no machine record. Every change is in how
this computer writes its own data folder and which guard base it keeps in memory. An older Hearth on the other computer
sees the same files. `packs89-test` (including its mixed-versions scenario with an older Hearth) and `devices90-test`
pass.

## Final runs
See the table at the end of this section (filled in after the runs).

## For Codex
`sync-engine.js` (each edit marked `(round 97, syncsweep97)`):
- **`choiceWrite(rel, file, ent, base, v)`**, with `entNow` and `CHANGED`, just before `restore`. A choice's result
  is written only over the version it read. A save that landed meanwhile is merged in (base: the version read), and it
  tries up to 4 times, else says try again.
  - Used by `resolve` 'theirs' / 'merge' (small path), `resolve` 'both' for data, `asideDo` (small path), and
    `restore`'s small JSON path (after its checked rename fails).
- **`prevText(rel, file)`**: a big store's cloud form made on the store thread (`asideBig.form(…, { to: 'cloud' })`)
  into a temp file in `data/sync` (`.hearth-tmp-…`, swept as usual), read back as `{ lazy: text }`.
- **`restore()`**:
  - the base for a store ≥ 1 MB (`prevText`; without the thread, parsed here below 16 MB);
  - `null` for a store not here or unreadable;
  - its rename checked against the file as read (`same(dst, ent)`); on a change, `choiceWrite` (small store) or "try
    again" (big), and the base it set is dropped.
- **`PK.attach` gets `guardBase: (rel) => remember(rel, null)`**: the pack lane's take keeps the guard as a giant pull
  does.

Not Codex's: `syncpack.js` (calls `api.guardBase?.(rel)` after its write), `store.js` (`setKV`'s `o.base` →
`outsideWrite`), `keptaside.js` (`writeCombined` passes `base`), `dev/syncsweep97-test.js`, `dev/run-checks.js`.

## For the patch notes
- **Fixed**: putting back a big item from Deleted files could be undone a moment later by an open screen still holding
  the older version. Round 96 fixed this for small items. Now big ones (over 1 MB) are safe too.
- **Fixed**: putting back something from Deleted files that wasn't on this computer any more could be overwritten by an
  open screen's next save. The version you put back was then gone from Deleted files too. Now both are kept.
- **Fixed**: with "Send very long chats in pieces" on, a message from your other computer could be lost on both
  computers if it arrived while a reply was still being written in that chat here. Now both messages stay.
- **Fixed**: Kept aside › **Combine…** could lose the combined text if you typed in the same place (a note, a scene)
  while it saved. Now the combined text and what you typed are both kept.
- **Fixed**: "Use the other version", "Keep both", "Merge" and Restore could write over a change saved a split second
  before the click finished. Now that change is merged in. If it keeps changing, Hearth says to try again and nothing
  is replaced.
