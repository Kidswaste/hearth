# syncfix111: the engine-side items round 110 left (round 111)

Round 110 (`docs/upgrades/syncaudit110.md`, "For Codex") walked sync by clicks and left three things that sit in the
engine. Each one is reproduced in `dev/syncfix111-test.js` through the two-computer simulator (`dev/sync-sim.js`, the
sync72 harness), on the main side and on the store thread, and (item 1) with the previous release on the Mac. The
logic is in a new file, `sync-fix111.js`; `sync-engine.js` carries one-line hooks marked `(round 111, syncfix111)`.

## 1. A chat restored from Deleted files stayed in Recently deleted

**Cause.** Hearth's Delete moves a chat to `trash/<id>.json` (Recently deleted), and sync carries that move to the
other computer. Deleted files can still hold an older version of that chat (`chats/<id>.json`, for example "the
version before the last change"). The engine's `restore()` put that version back in `chats/` and did nothing about
`trash/<id>.json`. So the chat was in the chat list **and** in Recently deleted, on this computer, in the cloud copy
and on the other computer. Round 110 routed the window's own Restore through Recently deleted where it could. The
engine path (the "before the last change" row, `/sync restore`) still left the copy behind.

**Fix.** Once a restore of `chats/<id>.json` has worked, `Fix.chatTrashAside` **moves** the Recently deleted copy
`data/trash/<id>.json` into Deleted files (`data/sync/trash/<day>/trash/<id>.json`, kept 30 days, restorable). Nothing
is removed. The next pass sees `trash/<id>.json` gone here. Like any delete made here, the cloud copy's version then
goes to the synced Deleted files, and the other computer's copy goes to its own Deleted files. The previous release
does that too, because it is an ordinary delete. The window hears the change as a `file-deleted` arrival, which shows
no "Reload" toast. If the move fails, it is logged and the restore still counts as done (as it did before).

The version the owner chose is the one that comes back. The newer copy from Recently deleted is not lost: it waits in
Deleted files.

**Proof** (`restore` cases): a chat renamed on the Mac, then deleted there. On the PC: Deleted files → the chat's
version → Restore. Checked: the chat is back on the PC, the Mac and the cloud copy. `trash/c1.json` is on none of them.
The newer copy is in the PC's Deleted files with the Mac's title and both messages. The Mac's copy is in the Mac's
Deleted files, and the chat stays back over the next passes. Main side, store thread, and the previous release on
the Mac. Before the fix: 4 failures per case ("left in Recently deleted: pc, mac, cloud").

## 2. "Version before the last change" copies piled up in Deleted files

**Cause.** Before any pull or merge replaces a chat or a `kv/` store, the engine keeps this computer's version in
`data/sync/recovery/` (Codex's switch-safety round: one per file, and a failed write stops the replacement). When two
Hearths are joined, the first pass merges every store both have **with no common base**. That two-way merge keeps
everything of both sides, yet it still kept a copy of every store. The other computer then pulls the merged version
and keeps one too. Deleted files listed all of them first, under "Before last sync". In the simulator, three shared
stores gave 3 copies on each computer, none of them the only copy of anything.

**Decision.**
- Copies from a **first merge** (no base) are dropped when everything in this computer's version is still in the
  merged one (`Fix.inside`): every key, every list item (matched by id, or by role and time for messages), every
  value. A time stamp moving on (`updatedAt`, `…At`…) doesn't count. Such a copy would be the only copy of nothing. If
  anything is only in the old version, the copy is made as before.
- **Day to day** (a base is known), the copy is still made. It is how the other computer's change is undone
  (`dev/sync-test.js` switch-safety: "previous scene store is offered as a recoverable version" after the Mac only
  added a layer, then restored to one layer). Stopping it would remove that undo. These copies stay one per file.
- **Grouped:** Deleted files' listing (`engine.trash()`, through `Fix.listed`) marks a recovery copy `inside: true`
  when everything in it is in the current file. This covers copies from day-to-day pulls that only added, the other
  computer's copies after a first sync, and copies left by older releases. Files over 4 MB aren't read for this, and
  nothing is removed. `sync-conflicts.js` folds those copies into one row, "Earlier versions already in what you have
  now (n)". Each one is still there with its Restore. Copies holding something of their own are listed as before.

The store thread does the same: `storework.js` `syncMerge` skips the copy only when it has no base file and the
version is inside the merge. Every guarantee holds: an unreadable local version still stops the replacement (it is
parsed before anything is decided), and a failed copy write still stops it.

**Proof** (`recovery` cases, main side and store thread): two Hearths with their own chats and three shared stores,
joined. The computer that merged makes **no** copies (it made 3). The other computer's copies are all marked `inside`.
A message arriving: the copy is made and folded. A title changed and an item removed on the Mac: both copies are made,
not folded, hold the old title and the removed item, and Restore brings the item back. An old copy written by hand
that is inside the current file is marked, one that isn't stays shown, and listing removes nothing. Unit cases for
`inside`: keys, time stamps, messages added or edited, plain lists, counts.

## 3. Files that only wait, marked by the engine

**Cause.** A file another program holds (EBUSY; EPERM on a PC), a store that can't be read just now (EHELD), or a drive
that didn't answer is retried by the engine on its own. These are not counted in `pending`. Their blocked entries
looked like the ones that need a click, and each reader had to know the codes. Round 110 taught `sync.js` and
`sync-panel.js` `why === 'locked' || why === 'drive'`.

**Fix.** `block()` adds `waits: true` to such an entry (`Fix.mark(why, code)`: `locked`, `drive`, or the codes
EBUSY / ETXTBSY / ELOCKED / EHELD). It is never added for `read-only` or `denied` (macOS refusing), which need a click.
`sync.js` (`waitN`) and `sync-panel.js` (the "Waiting until it's free" heading, Copy details) read `b.waits` first and
fall back to their own inference for an older engine's entries. `Fix.waitsOf(entry)` does the same for any other
reader. The first screen stays at 1694 KB of code.

**Proof** (`waits` case): on the PC, a file held (EPERM) and one on a drive that didn't answer (EIO) are both
`waits: true`. A read-only one is not. Once they are free, everything syncs by itself and the list is empty.
`syncaudit110-states` gained two steps that click through the window with engine-marked entries: "↻ 2 waiting" /
"Waiting until it's free (2)", and an entry the engine says doesn't wait is "⚠ 1 to fix". The older entries without
the mark still say "↻ 1 waiting" as before.

## Mixed versions

- Item 1's propagation is an ordinary delete of `trash/<id>.json`. The previous release follows it (tested: the Mac on
  `sync-engine.js` from before this round).
- Recovery copies and blocked entries are this computer's own (`data/sync/`, the status). Nothing new is written to
  the cloud copy, and no record format changed.

## Files

- `sync-fix111.js` (new): `waits` / `mark` / `waitsOf`, `inside` / `textInside`, `listed`, `chatTrashAside`.
- `sync-engine.js` (Codex's: see below), `storework.js` (one marked line in `syncMerge`).
- `sync.js`, `sync-panel.js`: the engine's mark first, the old inference as fallback.
- `sync-conflicts.js` (lazy): copies marked inside folded into one row.
- `dev/syncfix111-test.js` (new), `dev/checks/syncaudit110-states.js` (+2 steps), `dev/run-checks.js`
  (`unit:syncfix111-test`; a `syncfix111` group).

## For Codex

`sync-engine.js` edits, each marked `(round 111, syncfix111)`; `cloud-files.js` untouched:

1. `require('./sync-fix111')` beside the other requires.
2. `block()`: `...Fix.mark(why, x.code)`, so a blocked entry that only waits carries `waits: true`.
3. `keepStateAside(rel, L, next)`: returns without a copy when `next` is given and holds all of the local version
   (`Fix.textInside`). The local version is still read and parsed first, so an unreadable one still stops the
   replacement.
4. `merge()` (main side): `keepStateAside(rel, L, state.base[rel] ? undefined : r.value)`, so only a first merge (no
   base) can skip. `pull()` is unchanged.
5. `restore()`: after a successful restore, `Fix.chatTrashAside(...)` moves `trash/<id>.json` into Deleted files, and
   `onPulled` gets `{ rel: 'trash/<id>.json', kind: 'file-deleted' }` too.
6. The returned `trash`: `listTrash()` through `Fix.listed` (adds `inside: true`).

`storework.js` `syncMerge` (not Codex-owned, noted for the same rule): `recovery && (baseFile || !inside(ours, r.value))`.

## Runs

- `node dev/syncfix111-test.js`: on the base engine (`sync-engine.js` and `storework.js` from b74a1c2) **55 passed,
  22 failed**: 4 restore checks in each of 3 cases, 4 recovery checks in each of 2 cases, and 2 waits checks. After
  the fix: **77 passed, 0 failed**.
- App checks (under the lock): `syncaudit110`, `syncaudit110-states` (with its two new steps), `syncpanel92`,
  `keptaside94`, `sync72`, `sync`, `guardloss78`, `lazy`: 8 / 8 passed.
- Sync unit suites, all passing: `sync-test` (Codex's switch-safety, including its previous-version restore),
  `sync72-test` (also `--thread`: 209 / 0), `synchard74`, `syncstall103`, `merge105`, `emptyread104`, `syncsweep97`,
  `syncrace98`, `guardloss78`, `kvrename99`, `aside95`, `keptaside94`, `storeack77`, `syncstate75`, `store-thread`,
  `syncscope79`, `syncmedia73`, `projsync76`, `packs89`, `devices90`, `twocomputers`. The scans also passed:
  `datasafe-scan`, `winmac-test`, `errorcalm-scan`, `storeack-scan`, `chatsafe-scan`, `boot-test` (first screen
  1694 / 1696 KB) and `lazymanifest-test`.
  - `aside95`'s "giant: restore holds the main process under 150 ms" measured 166 ms once, while the app checks ran
    beside it (load 0.74). Alone it passes: 76 / 0.
- `node dev/run-checks.js release`: 304 / 309 passed. The 3 known failures (tests106) were expected, and 1 opt-in
  test was skipped. There were two ✖, both outside sync, and both pass when run alone right after:
  - `unit:robust-engine-test` (engines): 22 passed;
  - `unit:liveset64-test` (the Live set host): its core and host checks passed.

  Neither reads a file this round changed.

## For the patch notes

- **Restoring a deleted chat from Deleted files no longer leaves it in Recently deleted.** It comes back on both
  computers and leaves Recently deleted on both. If Recently deleted held a newer copy, that copy is kept in Deleted
  files, so nothing is lost.
- **Deleted files is tidier after you join two computers.** Hearth no longer keeps a "version before the last change"
  of every chat and list when the two are first merged, because the merge already keeps everything from both. Earlier
  versions that hold nothing you don't still have are folded into one line ("Earlier versions already in what you have
  now"). You can still open it and restore any of them.
- **"Waiting" is now decided in one place.** Hearth itself marks a file that's only busy for a moment (in use by
  another program, or a drive that didn't answer). Every place that shows sync's state now agrees that it is waiting,
  not broken.
