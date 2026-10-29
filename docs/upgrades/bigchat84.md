# bigchat84: giant chats open, export and restore without a stall (round 84)

Round 82 (bigchat82) took a giant chat (6,000 messages, ≈ 63 MB) off the main process for opening, saving, sync,
versions and search. It left two things: opening one still cost **one ≈ 190 ms task of the window**, and **exporting**
or **restoring** one (Earlier versions, a backup, Recently deleted) still parsed, copied and wrote 60 MB on the window
or the main process. Both are done here; nothing about what you get changed (checked byte for byte).

## "Old parts cached / hidden": what already existed, what was missing
- **Already there (chatwindow72, round 72):** a long chat draws only its last 40–59 messages. Older ones rest as empty
  spacers of their height, in blocks of 20; scrolling up wakes the blocks you reach, blocks far away go back to rest and
  their rendered Markdown is let go. Find and jump wake only the block they need. So drawing never cost the whole chat.
- **What was missing:** the window still *received* the whole chat in one go (one structured copy of 60 MB) and then
  guessed every resting block's height from all 60 MB of text, in the same task. Export and restore read and copied the
  whole chat on the window / main process. This round makes those three paths cost a few ms at a time (below). The chat
  data itself is still held in the window (search, saving by change, the lighter history need it): see "What's left".

## The fixture
`node dev/bigchat84-fixture.js /tmp/hearth-bigchat84`: bigchat82's small profile (`dev/bigprofile.js --chats 40 --long
4 --projects 4 --giant 1`, made-up, fixed seed, never real data) plus a rare word in message #30, an earlier version of
the giant chat kept as a restore keeps one (10 messages fewer), and a second giant chat in Recently deleted.

## Measured before → after
Same box, the same check (`dev/checks/bigchat84.js`), the code before this round run with `node dev/smoke.js --app
<base checkout>`. A shared 4-CPU box (other streams running): a few ms of noise per task.

| Step (one 63 MB, 6,000-message chat) | Before | After |
|---|---|---|
| Open: the window's longest task | 437 ms (+71) · bigchat82's own check: 189 ms | 51–55 ms (bigchat82's check: 51 ms); 4 opens in a row: one 51 ms task in all, then none ≥ 50 |
| Open: main process | no block | no block (unchanged) |
| /export json: main process | 625 ms block (60 MB received + written at once) | no block (max delay 16 ms) |
| /export md / html: main process | 405 / 498 ms blocks | no block (28 / 23 ms) |
| /export: the window | one task per format (Node: JSON.stringify 350 ms; the page's Markdown, seconds) | no task ≥ 50 ms (Node: 12 ms slices) |
| Earlier versions › Restore: main process | blocks of 4,023 / 1,370 / 119 ms (parse, keep, canon, clone, send) | no block ≥ 50 ms (max 49 ms) |
| … its Undo: main process | blocks of 2,663 / 772 / 498 / 123 ms | no block ≥ 50 ms (one 35 ms GC) |
| Recently deleted (the chats' Trash): main | 387 ms block | 49 ms (the rest of that list; the giant one cut on the files thread) |
| Deleted things: main | 348 ms block | no block (15 ms) |
| Restore from a backup zip (whole-data restore, `backup:restore`): main | two 60 MB parses per giant chat per look (≈ 1.5 s; a restore looks twice) | its title and times cut on the files thread |

Node (`node --max-old-space-size=6000 dev/bigchat84-test.js --bench`): open's largest slice copied 18 ms (the whole
chat 170 ms); export JSON in 12 ms slices (whole: 350 ms); restore the old way held the main process up to 1,189 ms at a
time, the new way ≤ 9 ms (the store thread does it: ≈ 6 s there, of which ≈ 4 s used to be versions-core's copy + text
comparison, now done in place).

Startup A/B (`node dev/perfguard.js --ab cfafaa5 --only startup --lock`): no regression (first usable chat +23 ms,
p 0.3, inside the allowed +85 ms; CPU +0–1 %).

## What changed
### Opening (window)
1. `chatparse-worker.js` sends the parsed chat back **in slices**: its own fields first (an empty `messages` in place,
   so the keys keep their order), then batches of ≈ 1 MB of messages, each its own message, i.e. its own task in the
   window (≈ 40 tasks of a few ms, with clicks and frames between). One 60 MB structured copy was the 190 ms task.
2. **The end first**: the last 100 messages (what the chat shows when it opens, and the two blocks above) come first;
   their replies are handed to the Markdown worker at once, so the end is rendered while the rest arrives. The window
   puts the batches back in order when all are in.
3. Each batch's messages get their **save shape** (round 82's saving by change) and their **text height** made as they
   arrive, so the last task doesn't walk 6,000 messages.
4. The resting blocks' height guess reads each message line by line **without splitting** (60 → 35 ms for 60 MB) and is
   **kept per message** (made again only when the text or the width changes): the same heights, checked against the old
   code on the whole fixture.
5. The finished chat is drawn in a task of its own (not the one that put the last batch in place).
6. Autocompact's idle warm-up (its older words) stops a slice after 10 ms of its own: an idle moment filled to its end
   plus one long message was a 50–65 ms task right after a giant chat opened.
Scroll position (the end), Find highlights (a word in a resting block, marked) and jump-to-message (#100 woken and on
screen) are checked by the app check.

### Export (`/export json | md | txt | html`, to a file or the clipboard)
7. `chatexport-core.js` (new, lazy group `chatcmds`): each format as a list of pieces, one per message, whose joined text
   is **exactly** the whole-chat way (`JSON.stringify(…, null, 2)` with each message stringified and indented in place;
   `Native.chatMarkdown`; its plain text; chat-cmds' web page). `pump()` turns them into ≈ 2 MB parts, pausing whenever
   12 ms went by.
8. A long chat (≥ 300 messages) is written **in parts**: `hub.saveStream.start / part / end` (fsapi.js: the same save
   dialog / test folder; each part handed to the disk asynchronously; a temp file flushed and renamed at the end, so
   there is never a half file in place; a stopped export removes its temp file). Nothing is uploaded.
9. The web page's replies are rendered on a Markdown worker of its own (md.js), in batches; only if it can't run, here.
   Shorter chats export exactly as before.

### Restore (Earlier versions, a backup's copy, Recently deleted)
10. `storework.js` op **chatRestore**: a giant chat's restore runs on the store thread, in the order of that chat's saves:
    the version read (a cloud copy made this computer's, a kept copy taken out of its wrapper, a backup's copy taken out
    of its zip into a temporary folder by versionsmain), the chat as it is now read — **one there that can't be read:
    nothing is done, nothing kept, "can't be read just now"** (never treated as no chat) — kept first as before
    (`data/.versions/…`, the same copy `keep()` writes), then written as a whole save writes it (versions-core's rule:
    the chat's id and current AI kept, its engine session dropped when the texts differ). Byte for byte the main-process
    way (tested, Undo included).
11. `versionsmain.js restoreBig`: the main process only names the files. The window gets no 60 MB copy back:
    `{ __bigOver }` stands for the chat as the restore left it, and its **Undo** is made again from the same files on the
    thread (the same three-way merge as `undoOnto`: what came after the restore stays). Sync's guard wanting the chat,
    a held chat or one in doubt → the usual way (they merge with the disk, whole).
12. `storework.js` op **chatHead**: a chat's own fields and message count, its messages never parsed when it's big.
    Used by Recently deleted (`chats:trash`), Deleted things and a backup zip's restore (fsapi.js `chatMeta`). A file
    that can't be read says so (it isn't listed / counts as unreadable, never copied over — as before).
13. Bringing a chat back from Recently deleted stays a move (rename) of the file: deletes still go to the Trash.

### For builders
14. `dev/bigchat84-test.js` (80 checks; `--bench` for the Node numbers), `dev/bigchat84-fixture.js`,
    `dev/checks/bigchat84.js` (opt-in `BIGCHAT84=1`; `window.BC_REPORT = 1` reports without failing), run-checks group
    `bigchat84`. `dev/chatsafe-scan.js`: the restore rule on the store thread allowed (it keeps the chat's current AI).

## Tested
- `dev/bigchat84-test.js` — **80 / 80**: the slices put together = JSON.parse (values and key order; tail 0 / 5 / 100 /
  1000; empty chat); export JSON / Markdown / text / page = the whole-chat ways byte for byte (accents, emoji, lone
  surrogates, control characters, ` ** __ in texts, empty / missing lists, null messages, a session, hearthExport
  already there), pump in parts; chatHead (pretty, compact, damaged, missing); chatRestore plain / wrapped / same texts
  (session kept) = restoreValue + JSON.stringify, the copy kept, the Undo = undoOnto, a chat that can't be read → nothing
  written or kept, a version gone → nothing, no chat there → the version; versionsmain old vs new on two copies of a
  data folder: the same chat file after Restore and after Undo, the same versions listed after, the same Deleted things.
- Unit: datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, boot-test (first screen 1805 / 1810 KB,
  71 / 71 scripts), bigchat82-test, bigchat84-test, versions75-test, store-thread-test, autocompact-test, recall-test,
  sync72-test, projbundle-test — **14 / 14 pass**.
- App (under `flock /tmp/hearth-run.lock`, ≤ 5 at a time): recall, sync72, lazy, chatwindow72, versions75, bigchat82
  (`BIGCHAT82=1`), bigchat84 (`BIGCHAT84=1`), chatkeep — **8 / 8 pass**. bigchat82's open: 189 → 51 ms.
- `dev/perfguard.js --ab cfafaa5 --only startup --lock`: no regression (exit 0).

## Files
New: `chatexport-core.js`, `dev/bigchat84-test.js`, `dev/bigchat84-fixture.js`, `dev/checks/bigchat84.js`, this file.
Changed (marked `(round 84, bigchat84)`): `chatparse-worker.js`, `native.js` (≈ 1 KB: parseOff's slices, the height
guess), `autocompact.js` (warm slice cap), `chat-cmds.js` (exportBig), `lazy-data.js` / `lazy-meta.js` (the group's new
file; `node dev/lazy-manifest.js`), `fsapi.js` (dialog:saveStart / savePart / saveEnd, chatMeta in restoreBackup),
`preload.js` (one line: `hub.saveStream`), `store.js` (listTrash from heads, restoreChatBig, chatHead), `storework.js`
(ops chatHead / chatRestore), `versionsmain.js` (restoreBig, readMeta), `dev/run-checks.js`, `dev/chatsafe-scan.js`.

## For Codex
Nothing in Codex's files changed (no `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*`, `engine-watch`). One thing to know: `hub.versions.restore` of a **giant** chat
(≥ 8 MB) now answers `value: { __bigOver }` instead of the restored chat (pass it back as `over` for the Undo, as
versions.js does); reload the chat with `hub.openChat` / `Native.load` if you need it.

## What's left
- The window still **holds a giant chat whole** (its 60 MB of objects): search in the chat, saving by change, the lighter
  history and autocompact read it. Opening now costs ≈ 40 short tasks instead of one long one, but memory is the same,
  and a garbage collection of that much can still make one task ≈ 50 ms (seen 51–55 ms on this busy box; the check
  allows 60). Keeping old messages only on disk until you scroll up would need those features to read from the store
  thread — a bigger change, not done.
- A restore of a giant chat takes ≈ 6–7 s of the store thread (parse the version and the chat, keep, write; an Undo
  adds a ≈ 3.5 s merge): nothing waits on it but that chat's own saves, and the window shows the result when it's done.
- Exporting a **project** with a giant chat (projbundle75) is unchanged: it still prepares the chat in the window.
- The Preview of a giant earlier version still parses its bytes in the window (an explicit click, ≈ 0.5 s).
- A backup zip's whole-data restore still extracts and copies files on the main process's own pace (only the giant
  chats' reading moved off it).

## For the patch notes
- Opening a very long chat (thousands of messages) no longer freezes Hearth for a moment: it now arrives in small pieces,
  the newest messages first, while the app keeps answering your clicks. The older parts of a long chat already stayed
  "asleep" until you scroll up to them; now loading them doesn't stall anything either.
- Exporting a very long chat (to a file or the clipboard, as JSON, Markdown, text or a web page) no longer freezes the
  app. The file is exactly the same as before.
- Bringing back an earlier version of a very long chat (from an automatic copy, a backup or Recently deleted), and
  undoing that, now happens in the background without the app stalling for seconds. As always, the version you had is
  kept first, nothing is ever treated as empty if it can't be read, and deleted chats still go to the Trash.
- Opening Recently deleted or Deleted things with a very long chat in it is instant again.
