# chatsave101: long chats save by what changed (round 101)

Round 100 (`perf100.md`, "What's left") measured that a long chat under 800 messages was still saved **whole** on
every change: the window sent the whole chat (≈ 600 KB for 778 messages) to the main process, which handed it to the
store thread. A send turn makes 2–3 saves. Giant chats (≥ 800 messages, or opened as bytes) have saved by change since
round 82 (`chatDelta`, `bigchat82.md`).

## Measured first
### Node: each piece of one save (`node --expose-gc dev/chatsave101-bench.js`, a 782-message, 593 KB long chat of the heavy profile, medians)

| Piece | ms |
|---|---|
| window: structured clone out (IPC send) | 1.2 |
| main: structured clone in (IPC receive) | 1.0–5.6 |
| main → store thread: clone out / in | 0.8 / 1.0 |
| thread: `JSON.stringify` (pretty) + sha1 | 1.4–5.5 + 0.7 |
| thread: the whole `write` op (round trip, with the fsync) | 12.9–24.4 |
| **by change** — window: the shape compare (each save) | 3.9 |
| by change — window: the shape made (once, after a whole save) | 0.8 |
| by change — the change itself through both hops (one new message) | 0.02 |
| by change — thread: first change after a whole save (cut + write + fsync) | 6.2 |
| by change — thread: the next changes (copy + write + fsync) | 4.0–5.2 |

In Node the clones are cheap. In the app they aren't: round 100 measured ≈ 68 ms from the call to "written", of which
the store's own work is ≈ 12 ms. The rest is the chat crossing from the window to the main process.

### The app: perfguard's send-and-save measures
@@AB@@

## The choice
Three options were on the table:
1. **Extend `chatDelta` to normal chats above some size.** Chosen. The whole mechanism already exists and is proven:
   the window's shape compare, the thread's byte-for-byte delta writer, the version chain, every refusal (sync's guard,
   `store.settle` gates, datasafe's held / doubt / blind, another writer, a changed / gone / compact file), the quit
   wait, `chats:get` waiting for changes on their way. Only the line moves: `native.js` `DELTA_MSGS = 100` (was
   `BIG_MSGS = 800`). The window sends one message instead of the chat, and the main process only passes a few KB on.
2. **Send only changed messages, write the whole file on the thread.** The thread would have to keep every long chat
   parsed (memory), and still stringify it whole on each save. It needs a new op, a new version chain and the same
   refusals as (1), so it is more new code for less gain.
3. **Move the copy off the window thread.** The main process would still receive and clone 600 KB per save, and the
   thread would still stringify it. It cuts the window's part only.

Why 100 messages: under that, a whole save costs a few ms, and keeping the window's shape (≈ 160 KB of small arrays for
an 800-message chat; the strings are shared, not copied) isn't worth it. 1,500 of the heavy profile's 1,660 chats are
under 20 messages and keep the whole way unchanged.

## What changed
- `native.js`: `DELTA_MSGS = 100`. A chat with no shape yet and at least 100 messages is saved whole once, with its
  version (its shape taken), and its next saves go by change. Under 100: whole, as before. Windowed giant chats
  (`chatwin.js`, chatwindow86) are untouched: `saveChat` hands them to ChatWin first, as before.
- `storework.js`: `bigsTouch(file)`. The thread now keeps the version record (own fields + offsets, no messages) for
  more chats, so it keeps the **64 most recently saved** chats under 8 MB. An older one is let go, and its next save is
  refused (`version`) and saved whole once. Giant and windowed chats (≥ 8 MB, or with records) are never let go.
- Nothing else. `store.js`, `main.js`, `preload.js` and the sync files are unchanged.

## Every guarantee kept
- **Byte for byte**: the delta writer writes what `JSON.stringify(chat, null, 2)` writes (bigchat82). Here it is
  checked again from the window's real code (below).
- **Sync's guard and `store.settle`** (syncsweep97, syncrace98): `saveChatDelta` is refused while the guard wants
  the chat (just pulled, or 🛟 Recover's outside write), and while sync writes it (`gates`). The window then saves it
  whole, through the guard, after the write. A `settle` pings the thread when a change is on its way (`deltaFiles`),
  so it lands before sync's check.
- **StoreAck**: chats aren't StoreAck stores (the chat window's own path). Nothing changed there: `unit:storeack-scan`
  and `storeack77-test` pass.
- **A read failure is never "empty"**: a file changed, gone, held or in doubt → the change is refused, nothing is
  written from it, and the window's whole chat is saved through datasafe. A chat never read in this session is saved
  "blind" (datasafe), with no version, so its next change is refused and it is saved whole once more.
- **Windowed chats** (chatwindow86): untouched (`unit:chatwindow86-test`, `unit:chatwin-scan`, app check
  `chatwindow86`).
- **Quit**: changes on their way are waited for (≤ 5 s, round 82), as for giant chats.

## Tested
**`dev/chatsave101-test.js`** (`unit:chatsave101-test`): native.js's real `saveChat` / `saveWhole` / `takeShape` /
`shapeOf` / `sameShape` (read from its source) against a copy of the real store (`store.js` + its thread), and the
old way (every save whole) against a second copy, through the same steps. After every step the two files are byte for
byte the same. **92 checks**, run with seeds 101, 7, 42, 1234 (walks of 300–400 steps):
- every edit kind: a new exchange, a streamed reply finishing, a reaction (added, a note, removed), an edit, edit-from-here
  (trunc + a new end), retry, a delete in the middle and at the end, pin / bookmark a message, the chat pinned, renamed,
  its model and session changed, a field gone / added / set to `undefined`, the field order changed, a message replaced,
  the same content in new objects (nothing sent), six saves in flight at once, cut to 2, emptied, filled again;
- each saved by change (counted), and nothing sent when nothing changed;
- refusals, each saved whole and then by change again: another writer saved it whole, the file changed by another
  program, the file gone, a compact file, sync's guard wanting it (the whole save went through the guard each time),
  sync writing it (`settle`: the save waits for the write), a change on its way when `settle` starts (it lands first);
- a random walk (exchanges, reactions, edits, cuts, deletes, inserts, pins, own fields set / removed, new objects,
  bursts of saves without waiting, another writer now and then): every step byte for byte the whole-save file, and the
  file = the window's chat as JSON;
- a short chat (< 100) is still saved whole with no shape kept;
- 70 long chats: the oldest is let go by the thread (saved whole once), the newest by change, all 70 files the same;
- the chats list rows and the chats search are the same as the whole way; `chats:get` right after a change waits for it.

Sabotage check: dropping the window's changed own fields from the change (`set`) makes the test fail (26 failures).

@@CHECKS@@

## Files
- `native.js` (first screen; +3 lines, the first screen stays **1686 / 1696 KB**, 64 scripts): `DELTA_MSGS`.
- `storework.js`: `bigsTouch`, called after a whole save with a version and after a change.
- New: `dev/chatsave101-test.js`, `dev/chatsave101-bench.js`, this file. `dev/run-checks.js`: `unit:chatsave101-test`
  and the group `chatsave101`.

## For Codex
Nothing in Codex's files changed. Codex code that saves a chat whole (`hub.saveChat(chat)`: project-workspace.js,
astra-workspace.js) still works: the window's next change to that chat is refused (`version`) and saved whole once,
then by change again.

## Risks / not done
- Recall's index: a whole save added the chat to it at once; a change only marks it changed, and the next recall
  query re-reads that chat (on the store thread, inside its time budget). Giant chats already worked this way.
- The chats search's kept texts are let go for a chat saved by change and read again at the next search (store thread).
- The window keeps a shape for each long chat it has saved (≈ 160 KB for 800 messages), as long as it keeps the chat.

## For the patch notes
@@NOTES@@
