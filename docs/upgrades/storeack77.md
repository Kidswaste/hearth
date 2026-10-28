# storeack77: every store, when the other computer's version arrives (round 77)

Round 76 found, for projects only (bug 7): when the window reads a store again because the other computer's version
arrived, it must first write the change it hasn't saved yet and then tell sync it now holds what arrived
(`hub.sync.ack`). Otherwise sync's write guard keeps merging every later save against the version from **before** the
arrival — and a thing taken out right after it arrived comes back. This stream audited every store the window and the
main process hold in memory, gave all of them one shared helper (**StoreAck**), made what's on screen follow the
arrival (the worktable too), built a two-computer scenario per store type, and added a scan so new stores get it right.

## The helper: StoreAck (`storeack-core.js`, `storeackmain.js`)
When sync brings a store, for every module that declared it (`StoreAck.hold(store, …)`):
1. its change not written yet is written (sync's guard merges it with what arrived: nothing typed is lost);
2. the store is read again and put in memory and on screen (`apply` is synchronous: something typed during the read is
   written and read again first);
3. sync is told (`ack`) — only for what every holder read fine. A read that fails, a holder that can't take it now
   (you're typing in that board note, dragging, a Lab edit being tried), a store nobody declared → no ack: sync keeps
   merging (never lost; a removal may come back, as before).

Safety rules found on the way (each a failing check first):
- **An ack for an older read is ignored.** If the store arrives *again* while the window is reading it, the engine
  ignores that ack (`ackPulled(rels, since)`: a read that began before the last arrival). Before, an ack right after a
  second arrival would have let the window's older copy be written over it.
- **Two holders of one store:** if one writes after the other read, no ack (the other's copy would be older than the
  disk).
- **A store of 16 MB or more** (sync keeps no guard base for it): the engine marks the arrival `guard: false`, and a
  change waiting here is neither written over what arrived nor read over.
- **Feature usage counted twice (fixed).** `ui-usage` is saved by what changed (store.js `mergeKV`): the change is
  applied to the file as it is right now, then the guard merged it *again* against the version before the arrival —
  every one of the other computer's clicks was added a second time on each save (each minute). A merge made from the
  disk now skips the guard (`writeJson(…, { fresh: true })`).
- **The sound bank and show listings lost the other computer's changes (fixed).** They live in the main process,
  keep their file in memory and write it themselves (no guard at all): their next save put the old copy back over what
  arrived (a ★ set on the Mac, a venue followed). The sound bank now takes what arrived, merging a change waiting here
  with it three-way; show listings let their copies go and read them again.

## The audit: every store held in memory
| Store | Who holds it | On arrival now | What's on screen |
|---|---|---|---|
| `projects` | projects.js | write, read, ack (round 76's fix, now through StoreAck) | Projects, the Desk, toasts (as round 76) |
| `three-sketches` | the Lab | write (incl. code typed into the open scene), read, ack | new scenes join the picker, newer ones replace, **scenes deleted there leave it** (before: they stayed until restart); the scene on screen reopens only if it changed; while an edit is tried (Keep / Undo) or the scene on screen was deleted there: kept, no ack |
| `three-lab-extras`, `three-notes`, `three-refs` | the Lab | write, read, ack | references panel redraws |
| `three-tm-<scene>` (time machine) | three-history.js | write, read, ack (before: merged in, never acked) | the version strip |
| `boards` | board.js | write, read, ack | the board list / HUD; the board open here stays open |
| `board-<id>` | board.js | write, read, ack | **the board on screen redraws**; your view, selection and undo stay; typing in a note or dragging → it waits until you're done |
| `chat-scenes` | chat-scenes.js | write, read, ack (before: links only joined) | a chat unlinked there is unlinked here |
| `workbench-<project>` (worktable) | workbench-ui.js | write, read, ack | **the worktable on screen redraws** (round 76's open item): put into the same objects (`StoreAck.into`) so open stations keep working; scroll kept; typing / drawing → waits; the Sound desk keeps playing and shows it next time |
| `notes` | notes.js | write, read, ack | the list and the open note redraw; **your caret, selection and scroll stay** (`StoreAck.keepCaret`) |
| `prompts`, `prompts-meta` | notes.js (saved prompts) | read, ack | the picker's list |
| `ui-usage` | usage.js | its clicks sent, ack | — (the double count above) |
| `music-sessions` | bouncelog.js | write, read, ack | the Sessions panel |
| `show-follows` | follow.js | write, read, ack | the ✦ tracker, ★ badges, map pins |
| `show-nights` | showprep.js | write, read, ack | reminders armed again |
| `paris-photos` | parisphotos.js | write, read, ack | photo pins and moments |
| `quick-ideas` | quickideamain.js (main) | its change lands, ack | the ideas inbox redraws |
| `creative-vst/soundbank/index.json` | soundbankmain.js (main) | merged / taken | (the bug above) |
| `showsync/*.json` | showsyncmain.js (main) | copies let go | (the bug above) |
| settings (`config.json`) | the app | its own path (config:changed → ack), unchanged | — |
| chats | native.js | its own path (`Native.forget` → ack), unchanged | — |
| `three-history`, `three-thumbs`, time machine pictures, `chat-scene-thumbs` | the Lab | left to the guard on purpose: megabytes of versions and pictures; re-reading them for each arrival costs frames | — |
| `tickets/index.json` | ticketsmain.js | nothing needed: read at every change, written whole by itself, nothing held | — |
| leave reminders | leavesoonmain.js | never sync (each computer's own) | — |
| `credit-log` | credits.js | the creative-direction session's file, not touched: merges on save; left to the guard | — |
| everything else written somewhere | — | `node dev/storeack-scan.js --list` names them: left to the guard (never lost) | — |

## The scan: `dev/storeack-scan.js` (unit:storeack-scan)
Fails on (A) a `hearth:synced` listener that reads a store again (kvGet / …FromDisk / reload… / refresh…) in a file
that declares nothing with StoreAck and acks nothing — unless marked `storeack: guard` with why, or in its ALLOW list
with why; (B) a store StoreAck acks that another file writes without declaring it (that file could hold an older copy,
which the ack would let it write over what arrived). `--list` prints what's declared and what's left to the guard.

## Upgrades
### Your two computers, store by store
1. A thing taken out right after it arrived from your other computer now stays out — for every store, not only projects.
2. Lab: a scene deleted on your other computer leaves the Lab's scene picker here too.
3. Lab: scene settings, notes and references from the other computer are taken in (and the references panel redraws).
4. Lab: the time machine's version strip takes in the other computer's versions, and versions thinned here stay thinned.
5. Boards: the board on screen updates when the other computer changes it — your view, selection and undo stay.
6. Boards: while you type in a board note or drag, the update waits until you're done, then catches up.
7. Worktable: the project's worktable on screen updates when the other computer changes it (shelf, storyboard, drawing).
8. Worktable: typing in a field or drawing isn't interrupted; it catches up when you're done.
9. Notes: the open Notes panel takes in the other computer's notes while you type — your caret and scroll stay.
10. Notes: what you were typing when they arrived is kept and merged with the other computer's edit.
11. Chat ↔ scene links: a chat unlinked on the other computer is unlinked here.
12. Saved prompts and their ★ favorites follow the other computer.
13. Music sessions: the Sessions panel shows the other computer's sessions as they arrive.
14. Followed artists & venues: the tracker, ★ badges and map pins show the other computer's follows as they arrive.
15. Show nights: reminders set on the other computer are armed here as they arrive.
16. My Paris photos: photos added on the other computer show as they arrive.
17. Quick ideas: the ideas inbox updates when the other computer's ideas arrive.
### Bugs fixed
18. Feature usage no longer counts the other computer's clicks twice (it grew a bit more every minute).
19. The sound bank no longer undoes a ★ or tag set on the other computer when it saves.
20. Followed venues / show settings from the other computer are no longer overwritten by this computer's next save.
21. A second arrival while a store is being read can no longer let the older copy be written over it.
22. A very big store (16 MB+) is never written over what arrived.
### For builders
23. One helper for every new store (`StoreAck.hold`) — written first, read again, acked, on screen; `StoreAck.into` /
    `StoreAck.keepCaret` keep what the screen holds.
24. `dev/storeack-scan.js` catches a store reloaded on arrival without it.

24 upgrades.

## Tested
- **`node dev/storeack77-test.js`** (new, in UNIT, **177 checks**) through the two-computer simulator with the real sync
  engine and its write guard and the real coordinator: `core` (order write → read → apply → ack; typed during the read;
  a failed read / apply / write → no ack, nothing read over; nobody declared → no ack; two holders and a late write →
  no ack; a store without a guard base; a path pattern; again(); `into`; the engine ignores an ack for a read begun
  before the last arrival), **one scenario per store type** — Lab scenes, Lab scene settings, time machine, boards list,
  a board's items, chat ↔ scene links, worktable shelf (a list without ids), notes, prompts' favorites, music sessions,
  show nights, My Paris photos, projects, quick ideas (main): the Mac adds a thing, the PC's window (with a change of
  its own not written yet) handles the arrival, the PC takes the Mac's thing out right away → **stays out on both**,
  the PC's change is there, no conflict — `without-ack` (the bug itself: it came back), `typing` (typing before and
  during the reload + the Mac's line: all kept), `counts` (5 + 3 + 1 = 9, not 12), `soundbank` (both ★ stay; without
  the fix the Mac's save put the old one back).
- **`node dev/storeack-scan.js`** (new, in UNIT, with its own self-test).
- **`dev/checks/storeack77.js`** (app, sync on a temp folder; "the Mac" edits the cloud copy, then Sync now pulls it
  through the real engine): Notes open with the caret mid-note while typing → the Mac's note appears in the list, focus,
  caret and the typed words stay, both on disk, acked; the Mac's note deleted here → stays deleted in the cloud. The
  board on screen: the Mac's note appears on it; taken off → stays off in the cloud. The Lab: a Mac scene joins, deleted
  on the Mac it leaves (the scene on screen stays open).
- Ran: unit:storeack77-test, unit:storeack-scan, unit:projsync76-test, unit:sync72-test, unit:sync-test,
  unit:projects-test, unit:datasafe-scan, unit:winmac-test, unit:errorcalm-scan, unit:boot-test, and the app checks
  listed in the report (under the shared lock).

## Numbers
- First screen: `storeack-core.js` (≈ 5 KB of code) + a few lines each in notes.js, usage.js, chat-scenes.js:
  1866.7 → 1872.4 KB of code (budget 1872, unchanged); scripts 70 → 71 (docs/upgrades/firstscreen.md). The first
  screen is now at its budget.
- Per arrival: one read of each store that arrived and is held (what the window already did for projects / scenes);
  nothing runs when nothing arrives. Thumbnails and version histories (megabytes) are deliberately not re-read.

## For Codex
Edits in your files are small and marked `(round 77, storeack77)`:
- `sync-engine.js`: `pulledAt` (when each store last arrived), `ackPulled(rels, since)` ignores an ack for a read begun
  before it; `notePulled` adds `guard: false` to an arrival of a JSON store it keeps no guard base for (≥ 16 MB).
- `syncmain.js`: `sync:ack` passes `o.since`; `onPulled` hands the list to `storeackmain.js` first; `SAmain.setAck`.
- `tools/workbench-ui.js`: one block before `beforeunload`: the worktable as a StoreAck holder (`pendingSaves` /
  `flush()`; read + `validateAsync`; `StoreAck.into(state, …)`; the station re-mounted unless it's the Sound desk;
  waits while typing / drawing).
- `projects.js`: `reloadFromDisk()` became a StoreAck holder (same steps, the ack now with `since`).
- `store.js` (shared): `writeJson(…, { fresh })` skips the guard; `mergeOnMain` passes it.

## Risks
- The guard's line merge treats edits on **adjacent lines** of the same text (the Mac changed line 3, this computer
  added a line right after it) as a conflict where this computer's version wins, without keeping the other's line
  anywhere (engine `guardWrite` ignores `conflicts`). Pre-existing; StoreAck makes it rarer (after the ack later saves
  aren't merged at all) but the first write of a pending change still goes through it. Worth keeping the losing side
  in Deleted files the way a sync pass does.
- Stores nobody declared (the scan's `--list`) keep the old behaviour: never lost, a removal right after an arrival may
  come back. New stores should declare themselves.
- Recover (datasafemain.js) and Earlier versions write stores from the main process while the window may hold them
  (versions75 handles its own live modules; Recover doesn't tell the window) — outside this stream.
- Show listings: a long fetch that started before its files arrived doesn't save its result (re-fetched next time).
- Both computers need this update for the ack-with-time and the big-store flag; with an older engine the window's ack
  works as in round 76.

## For the patch notes
- When your other computer's changes arrive, Hearth now writes what you were doing first and then shows the new version,
  everywhere: the Lab's scenes, boards, notes, the project worktable, chat ↔ scene links, saved prompts, music sessions,
  follows, show nights, photos and quick ideas.
- Something you remove right after it arrived from your other computer now stays removed (before, it could come back).
- The board, the worktable and the Notes panel update on screen by themselves, without losing your place: your view,
  selection, caret and scroll stay, and if you're typing or dragging they wait until you're done.
- A scene deleted on your other computer now also leaves the Lab here.
- Feature usage no longer counts your other computer's clicks twice.
- The sound bank no longer undoes a ★ you set on your other computer, and followed venues from your other computer are
  no longer overwritten.
- Install this update on both computers.
