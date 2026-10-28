# guardloss78: nothing lost when both computers edit the same text (round 78)

Round 77 (storeack77) left three things open:
1. When both computers edited **adjacent lines** of one text (the Mac changed line 3, the PC added a line right after it),
   the merge called it a conflict. The write guard then kept this computer's version and kept the other side **nowhere**.
2. 🛟 Recover wrote stores from the main process while the window could still hold an older copy. Nothing told the window,
   so its next save could write over what Recover had just brought back.
3. `node dev/storeack-scan.js --list` still named 59 synced stores that nobody declared.

All three are fixed.

## 1. Adjacent lines merge, and a side that loses is kept aside
**The text merge (`sync-merge.js` `mergeText`)** is now diff3 done by hunks. Each side's changes become base ranges
`[s, e)` replaced by new lines. Two hunks only collide when:
- they share a base line, or
- both insert at the same place, or
- one inserts strictly inside the other's range.

Hunks that only *touch* both apply, in base order. Before this, the whole stretch between two lines that all three
versions shared was treated as one block, so an edit next to another edit was a conflict.

- Still a conflict, as before: the same line changed two ways in code, and two different lines added at the same place
  (their order is unknown). For prose (notes, descriptions…), both versions' lines are kept, as before.
- Prose without a duplicate: before this round, a prose merge of "line 3 changed there + a line added after it here"
  kept the old line 3 *and* the new one. Now the result is clean.
- Lists without ids (a worktable's storyboard shots): one place edited on both computers is now merged *inside* that item,
  field by field and line by line, as long as nothing moved. Swapped shots plus an edit stay a conflict, so shots are
  never mixed up.

**The losing side is kept** (new `sync-aside.js`, used by `sync-engine.js`). This covers both ways sync settles a real
conflict by picking a side on its own:
- **The write guard.** A save right after the other computer's version arrived: this computer's field won. The version on
  disk (what arrived) is now written into Deleted files under its real name (`data/sync/trash/<day>/<rel>`). A note is
  added to `data/sync/aside.json`. This computer's later saves (it keeps saving until the window reads the store again)
  don't add more notes, because the disk then holds the guard's own merge.
- **A conflict settled by itself** (auto, or "Settle all for me"). In a data merge the newer side wins each field. The older
  side used to sit only in the trash's `conflicts/` folder, which Deleted files doesn't list. It is now also there under
  its real name, with a note. When files are settled "newest wins", the note points at the loser that was already in
  Deleted files.

**The sync panel** (`sync-panel.js`, lazy) has a **Kept aside** section with one plain line per note, for example
"Mac's version of Notes kept aside — compare". Each note has four buttons:

| Button | What it does |
|---|---|
| **Compare** | Shows "In use now" and "Kept aside" side by side. |
| **Keep both** | The engine's Keep both: a scene, board or note shows twice ("… (from Mac)"), and text appears as both texts. |
| **Use that one** | The kept version comes back. The version in use goes to Deleted files. |
| **OK** | Clears the note. The kept version stays in Deleted files for 30 days. |

For Keep both and Use that one, the window is told the same way as for an arrival (StoreAck). The guard's base for the
window's next save is set to the copy the window *last saved*. So a change still waiting in the window merges with the
restored version, and the line that window had won stays replaced. The indicator line also says it:
"Synced just now · 1 kept aside — compare".

## 2. 🛟 Recover goes through StoreAck
- **`datasafemain.js` `recover`** records each store it is about to write as "written from outside" (`store.outsideWrite`),
  together with the version from just before. It then writes, and returns `done.rels`.
- **`store.js` `outsideMerge`:** until the window acks, any save of that store from the window is merged three-way with
  what is there now, using the earlier version as the base. This works the same way sync's guard does for an arrival.
- **`datasafe.js`** hands `done.rels` to `StoreAck.arrived`. The window writes what is waiting (merged), reads the store
  again, shows it, and acks. `syncmain.js` `sync:ack` now also clears `store.outsideAck`, and works even when sync is off.
- **Main-process holders** (`storeackmain.js`) get the same list. The "reload to see the tool data" hint only appears for
  a store that nobody here could take in.
- **Memory:** Recover's added memory lines are protected the same way from the memory editor's next whole save.
- The window's older copy can no longer be written over what Recover brought back. Its own change is kept too.

## 3. Every synced store declared or explained
`node dev/storeack-scan.js --list` now prints four lists:
- what's declared (25 stores, was 16);
- what's left to the guard on purpose, each with why (the new `GUARDED` table in the scan);
- this computer's own stores (never synced, found through `sync-merge.localOnly`);
- **written, not declared, not explained: (none)**.

The scan now fails on a synced store that is written, not declared and not explained (rule C, with a self-test).

Newly declared (each one: what waits is written first, then read again, then shown, then acked):

| Store | Holder | On screen |
|---|---|---|
| `chat-meta` (tags, folders, archived) | chat-ux.js | the chats list redraws |
| `chat-bookmarks`, `chat-snippets` | chat-ux.js | read again on next use |
| `three-beatmaps` (beat grids, marks, cues) | tools/three-media.js | the song on screen shows the new grid; waits while a mark is selected |
| `video-cuts` (Lab sequences and cuts) | tools/cut-store.js | each changed key announced |
| `lab3d-library` | tools/three-models.js | — |
| `flows-mine` | flows-ui.js | — |
| `context-memory` (pinned facts) | chat-memory.js | — |
| `chat-context` (what a chat uses) | chat-context.js | — |

Left to the guard, with why:
- **Read fresh at each change:** board palettes and templates, capture marks, Forge patch sets and snapshots, footage
  pacing, Astra scoreboard, present bakes, project front page.
- **Logs that only grow:** access log, AI undo, error log, tool use, makes, deploy history, media ids, renders.
- **Pictures and versions:** three-thumbs, three-history, gallery and chat-scene thumbnails. Costly to re-read.
- **Small caches and learned numbers:** Discover, apps habits, inspo drop, send preview, router learn, cost coach, local
  answers, usage limits.
- **Rarely edited user lists:** Astra personas, capture tours, LUT names, Meshy library (updated in place mid-generation),
  assets, Forge patches, director tasks, memory meta.
- **Other owners' files:** Codex's (quest journal, its backup, outings, creative playground) and the creative-direction
  session's credit log.

## Upgrades
### Both computers editing the same text
1. Edits on neighbouring lines of one text now merge cleanly: Lab scene code, notes, a project's worktable text, chat
   messages.
2. Notes and other prose no longer keep a stale copy of a line next to the new one after such a merge.
3. A storyboard shot edited on both computers now merges inside the shot. Before, one computer's edit lost.
### The other side, kept
4. When this computer's save wins a line both changed, the other computer's version is kept in Deleted files. Before, it
   was kept nowhere.
5. A conflict settled by itself now keeps the losing version in Deleted files under its real name. Before, it was in a
   hidden folder.
6. Sync panel › **Kept aside**: one plain line per version kept aside ("Mac's version of Notes kept aside — compare").
7. **Compare** shows both versions side by side.
8. **Keep both** brings the other version back beside yours.
9. **Use that one** swaps it in. Yours waits in Deleted files.
10. **OK** clears the line. The version stays in Deleted files for 30 days.
11. The sync indicator's line says "… · 1 kept aside — compare".
### 🛟 Recover
12. Tool data brought back by Recover shows on screen at once (no reload) wherever the window holds it.
13. A save from the window right after Recover can't write over what came back. It is merged, and your own change is kept.
14. Memory lines brought back by Recover survive the memory editor's next save.
### Your stores on both computers
15. Chat tags and folders follow the other computer live, and a tag taken off stays off.
16. Bookmarks and snippets follow the other computer.
17. Lab beat grids, marks and cues update on screen when the other computer changes them. They wait while you have a mark
    selected.
18. Lab sequences and cuts follow the other computer, and a deleted sequence stays deleted.
19. The Lab's 3D model library follows the other computer.
20. Your flows follow the other computer, and a deleted flow stays deleted.
21. Pinned memory facts and a chat's context follow the other computer, and a forgotten fact stays forgotten.
### For builders
22. `dev/storeack-scan.js`: every synced store is declared or explained (`GUARDED`). A new undeclared store fails the scan.
23. `sync-aside.js` plus the engine's `aside(id, how)` / IPC `sync:aside`: one place for "the losing side, kept, with a
    note".

23 upgrades.

## Tested
**`node dev/guardloss78-test.js`** (new, in UNIT, 103 checks, 5 scenarios):
- **`text`:** 13 line-merge cases. Adjacent change and insert both ways, neighbouring lines changed, top and end inserts,
  delete next to an insert, last line changed and a line added after it. Same line changed two ways stays a conflict
  (code). Different inserts at one place stay a conflict. The same insert on both sides appears once. Prose without
  duplicates, and prose same-line keeps both. A storyboard shot merged inside; swapped shots plus an edit stay a conflict.
- **`adjacent`:** through the two-computer simulator with the real engine, for notes, a Lab scene's layer code, worktable
  text, worktable storyboard notes (prose) and a chat message. Each runs on both paths: a sync pass (both files changed)
  and the write guard (the window saves its older copy right after the Mac's arrived). Both lines end up in order on both
  computers, with no conflict and nothing kept aside.
- **`guard-loses`:** same line two ways through the guard.
  - This computer's line stays, and one note appears (from the Mac, `darwin`).
  - The Mac's version is in Deleted files and restorable. The status carries the note.
  - Later saves add no notes. Compare shows both.
  - Keep both gives "Shot list (from Mac)" next to it, with later typing kept; the window is told and the note goes.
  - Use that one restores the Mac's version, and the window's change written after it merges instead of writing over it.
  - OK clears the note, and the version stays restorable.
- **`auto-loses`:** a pass conflict settled by itself. The loser is in Deleted files under its real name with a note,
  Compare shows the losing line, and Keep both brings it back.
- **`recover`:** a child process on a throwaway copy of store.js and datasafemain.js.
  - Chat tags are emptied, then offered by Recover and brought back.
  - The window saving its older copy (with its own new tag) keeps everything.
  - StoreAck writes what waits, reads again and acks, and the merge is over.
  - After the ack, a tag taken off stays off.

**`dev/checks/guardloss78.js`** (new, app, real sync on a temp folder):
- A note is typed in while the Mac changed the same line. The panel shows "Mac's version of Notes kept aside — compare".
- Compare shows both. The version is in Deleted files. Keep both gives "Set list (from Mac)". The note goes.
- Then neighbouring lines (the Mac's line and one typed here): both are in the note and nothing is kept aside.
- Screenshot looked at.

All pass:
- Unit: guardloss78-test, sync-test, sync72-test, storeack77-test, projsync76-test (one expectation updated: a shot's
  notes changed two ways now keep both lines), synchard74-test, syncstate75-test, syncmedia73-test, synclatency77-test,
  versions75-test, projects-test, store-thread-test, datasafe-test, datasafe-scan, winmac-test, errorcalm-scan,
  storeack-scan, chatsafe-scan, cache-test, boot-test.
- App checks (under the shared lock): guardloss78, storeack77, sync72, lazy, datasafe, sequence, plus music,
  lab3d-models, flows and context.
- Group: `node dev/run-checks.js guardloss78`.

## Numbers
- First screen: 1873 KB of code (budget 1880, unchanged), 71 scripts.
  - Additions: a few hundred bytes in sync.js (the kept-aside count) and chat-ux.js (three declarations).
  - The panel section is in the lazy `syncpanel` group. The engine, store and datasafe changes run in the main process.
- Per save: the guard does one extra hash of each side, and only while a store has an unacknowledged arrival (the guard's
  window). Nothing runs when nothing arrived.

## For Codex
Edits in your files are small and marked `(round 78, guardloss78)`:
- **`sync-engine.js`:**
  - `guardWrite` reads the disk text once and calls `guardLoser` (keeps the disk version aside on a real conflict) and
    `guardOurs` (the window's last guarded save).
  - `resolve(id, keep, ro)` takes `ro.auto`. An auto merge's older side is copied under its real name into the cloud
    trash, with `noteLoser`.
  - `keepHere` returns where it kept the file.
  - New `asideDo` (`aside: afterLoad(asideDo)`) and `trashFile`.
  - `publicStatus` carries `aside`. `ackPulled` also clears `guardOurs`.
- **`syncmain.js`:** IPC `sync:aside`. `sync:ack` also calls `store.outsideAck`. `publicStatus` passes `aside`.
- **`sync-merge.js`** (shared): `mergeText` by hunks (`hunksOf`, `collide`), and the positional inner merge in `mergeArr`
  for lists without ids.

## Edits outside the lane (small, marked)
- Files edited: `sync-engine.js`, `syncmain.js`, `sync-merge.js`, `sync.js`, `sync-panel.js` (+ css), `preload.js` (one
  line), `store.js`, `datasafemain.js`, `datasafe.js`, `chat-ux.js`, `chat-memory.js`, `chat-context.js`, `flows-ui.js`,
  `tools/cut-store.js`, `tools/three-media.js`, `tools/three-models.js`, `dev/storeack-scan.js`, `dev/projsync76-test.js`
  (one expectation), `dev/run-checks.js` (UNIT + group).
- New files: `sync-aside.js`, `dev/guardloss78-test.js`, `dev/checks/guardloss78.js`.
- Not touched: the creative-direction session's files, or Codex's quest / outing / playground files (left to the guard,
  explained).

## Risks
- Adjacent edits in **code** now merge without asking. That is what the owner wants, but two edits next to each other can
  still be logically at odds (as with git's merges). Before, one side was lost silently; now both are there.
- A store explained in `GUARDED` keeps the old behaviour: never lost, but a removal right after an arrival may come back.
- Kept-aside notes live on the computer that settled the conflict. A note made by the Mac's guard shows on the Mac.
- Both computers need this update for the new merge. An older engine on the other computer still merges as before, and the
  side it drops is not kept by it.

## For the patch notes
- When your Mac and PC change neighbouring lines of the same thing (a scene's code, a note, a project's worktable, a
  message), both changes are kept now. Before, one of them could be lost.
- When both computers change the very same line, Hearth still has to pick one. The other version is no longer thrown
  away: it waits in Deleted files.
- The sync panel (click the sync indicator at the bottom left) has a new **Kept aside** list, for example "Mac's version of
  Notes kept aside — compare". Each line has Compare, Keep both, Use that one and OK.
- The indicator says "… 1 kept aside — compare" while there's one to look at.
- 🛟 Recover now updates what's on screen right away, and a save happening at that moment can't undo what it brought back.
- Chat tags and folders, bookmarks, Lab beat grids, Lab sequences, your 3D model library, flows and pinned memory facts now
  follow your other computer live. Something you remove stays removed.
- Install this update on both computers.
