# bigchat82: giant chats stay smooth everywhere (round 82)

Long chats were already light in the window (chatwindow72's resting blocks, chatsteady73). But a chat that never got a
fresh start — 5,000+ messages, 50 MB+ once tool output, attachments' details, thinking and plans pile up — was still
read **in one go** by everything else: opening it, saving a new message, sync, Earlier versions, Find in this project,
recall, the chats search, the hand-over brief, the lighter history. Each held a thread for seconds, several of them the
main process (the whole app waits then). Now every one of those paths reads such a chat by its **messages' bytes**,
in slices, or only what changed — and the chat's content is never altered (every new path is checked byte for byte
against the old one).

## The fixture
`node dev/bigprofile.js <dir> --giant N [--giant-messages M]` adds N giant chats (6,000 messages, ≈ 63 MB each, made up
with a fixed seed): replies with pasted tool output (logs, listings, test runs: 6–60 KB), thinking, plans (progress
steps), things made (paths), timings; your messages with attached pictures' details and pasted files. The first one
joins project "Clink" when there are projects. The app check uses `--chats 40 --long 4 --projects 4 --giant 1`
(`/tmp/hearth-bigchat82`, 136 MB).

## Measured before → after
Same box, back to back (a shared 4-CPU box, load 4–5). **Node** (`node --expose-gc dev/bigchat82-bench.js`, the real
modules and the store thread as a real worker; "before" = the code before this round, `--root`):

| Path (one 63 MB, 6,000-message chat) | Before | After |
|---|---|---|
| Find in this project: longest store-thread slice (p95) | 1,317 ms (1,317) | 20 ms (14) — 169 slices |
| Recall / app search's chat part: longest slice (p95) | 1,384 ms (1,384) | 33 ms (13) — cold first slice; 200 slices |
| Chats list after the giant chat changed (store thread) | 643 ms | 73 ms |
| Chats text search: first / next query (store thread) | 1,097 / 1,841 ms | 494 / 45 ms |
| Save a new message: window → main → thread | 72 ms window + 238 ms main | < 0.1 ms + < 0.1 ms (a ~1 KB change) |
| … the store thread's write | 1,299 ms | 667 ms (unchanged messages copied as bytes; then fsync) |
| Open: main process | 1,184 ms (read + parse + reply) | ≈ 1 ms per 4 MB part (27 ms longest part in Node's serializer; 15 × ≈ 1 ms in the app) |
| Sync: hash this computer's copy / the cloud copy (files thread) | 2,985 / 1,918 ms | 536 / 369 ms |
| Sync: push (MAIN process) | 2,367 ms | 0.2 ms (bytes made on the files thread) |
| Sync: merge, both sides added a message (files thread / main writes) | 8,128 / 273 ms | 1,473 / 0.1 ms — same bytes as before |
| Sync: pull (files thread / main) | 3,723 / 377 ms | 406 / 0.1 ms |
| Earlier versions list: longest main-process block | 7,156 ms (9.0 s in all) | 13 ms (2.9 s in all on the files thread; again: 0.14 s) |
| Earlier versions: a version read for Preview / Restore (main) | 382 ms | 24 ms (bytes to the window) |

**In the app** (`HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat82 --script
dev/checks/bigchat82.js`, the same check on the code before this round with `window.BC_REPORT=1`):

| Step | Before | After |
|---|---|---|
| Open the giant chat: main process | one 867 ms block (`chats:get` 762 ms) | no busy stretch (15 parts × ≈ 1 ms) |
| … the window's longest task | 375 ms | 189 ms (the chat parsed in a worker; the window only receives it) |
| Send a message, the reply arrives: main process | blocks of 417 / 413 / 370 / 205 ms (2 whole saves, 780 ms each) | no busy stretch (2 changes saved, 1.4 ms each) |
| … the window's longest tasks | 2,233 / 663 / 453 / 386 ms | 72 / 51 ms |
| A reaction on an old message: main | 156 ms (a whole save) | 0.3 ms (a change) |
| The chats list searched twice | 1,199 ms | 695 ms |

Other paths, Node, the giant chat: the lighter history built on each message sent 200–300 → 5–10 ms (window);
autocompact's "continue lighter?" decision ≈ 250 → 20–30 ms per reply (its older messages' words kept, made in idle
moments after opening); `withContext` (the earlier conversation sent once) 51 → 0.3 ms; the hand-over brief to the other
AI 34 s → 1.3 s; chat_do earlier 1.4 s (unchanged for words found in most messages; faster for rarer words).

## What changed
### Opening and saving a giant chat
1. A giant chat (≥ 8 MB) opens without the main process reading it: the store thread reads it into 4 MB parts handed
   over without a copy, the window fetches them one at a time (≈ 1 ms of the main process each).
2. The window parses it in a small worker (`chatparse-worker.js`) and only receives the finished chat.
3. Saving a giant chat sends only what changed: the window keeps the chat's shape (every value by reference, a few ms to
   compare 6,000 messages) and sends the changed fields and messages.
4. The store thread writes it by copying every unchanged message's bytes from the file and writing the new ones: byte
   for byte what a whole save writes (checked), crash-safe as before (temp file, flush, rename).
5. If the thread doesn't hold that version (sync brought a change, another save wrote it whole, sync's guard wants the
   chat), the window saves it whole once, through the usual guards, and the chain starts again.
6. A version opened twice (the window and anyone else) stays valid for both until one of them changes the chat.
7. Quitting waits (up to 5 s) for changes on their way, so the last message is on disk.
8. A read right after a change on its way waits for it (`chats:get`, Earlier versions).
9. The usage file is written on the store thread (its flush held the main process ≈ 60–70 ms after every reply).

### Sync
10. A giant chat's cloud form is made from its messages' bytes: a message already written as JSON.stringify writes it
    and holding no path is copied; the others are converted one by one. Same bytes and hashes as before.
11. Push: the bytes come from the files thread, the main process only writes them (was ≈ 2.4 s of the main process).
12. Pull: the cloud copy is laid out in this computer's form from its bytes (pretty or compact as the file was).
13. Merge (both computers changed it): the messages all three versions share stand in as tiny stand-ins, so a new message
    on each side doesn't re-merge 60 MB; the result is laid out again from bytes — the same text, hash, conflicts and
    file here as the whole-file merge.
14. Each pass reuses the cloud form it made (hash → push / pull / merge), only for the very bytes it was made from.

### Earlier versions
15. A giant chat's versions are listed from digests made on the files thread (no copy parsed on the main process):
    the same versions, labels and words ("10 messages fewer · 2 messages worded differently").
16. Digests are kept per copy: opening the list again takes ≈ 0.1 s.
17. Preview / Restore get a giant version as bytes in this computer's form (parsed in the window).

### Indexes and searches
18. Find in this project reads a long chat (≥ 128 KB) and the Lab's scenes file a slice at a time, and builds every
    source's words doc by doc (a layer's 60,000 characters of code in parts): slices stay ≈ 12 ms.
19. Recall (and app search's chat part) indexes a long chat a slice at a time; a quote is read back from that one
    message's bytes.
20. The chats' text search reads a giant chat's bytes (lowercased once while you search): the same hits, counts and
    snippets, ≈ 45 ms a query instead of ≈ 1–2 s.
21. The chats list reads a changed giant chat's own fields without parsing its messages (643 → 73 ms).

### Summaries
22. The lighter history (historylean) is built from the end: only the rows that fit (the same text).
23. Autocompact keeps the older messages' words between replies, made in idle moments after a giant chat opens.
24. The earlier conversation sent once (`withContext`) is built from the end (the same text).
25. The hand-over brief and the local summary: seen sets and the path search only around file extensions (same text,
    34 s → 1.3 s for 6,000 messages).
26. chat_do earlier skips messages that can't hold the asked words (the same messages found).

### For builders
27. `bigchat-core.js` (pure): the byte-level cut (a fast one for files laid out as the app writes them), a stepwise
    reader, compact / pretty byte for byte as JSON.stringify, the delta writer, sync's cloud form / pull / merge,
    versions' digests, the byte search.
28. `dev/bigprofile.js --giant N`, `dev/bigchat82-bench.js` (every path, `--root` for another checkout),
    `dev/bigchat82-test.js` (+ parts delta / sync / versions / index / summaries), `dev/checks/bigchat82.js` (opt-in
    BIGCHAT82=1), run-checks group `bigchat82`.

28 upgrades.

## Tested
- `dev/bigchat82-test.js` — **107 / 107**: the cut / compact / pretty / shell byte for byte against
  JSON.parse / JSON.stringify (escapes, accents, emoji, lone surrogates, empty lists, a BOM, odd spacing); reading in
  steps (a file changed or cut short midway); the delta writer byte for byte through 11 kinds of change and a 40-step
  random walk, refusals (another version, a changed file, a compact file, a change that doesn't fit: nothing written),
  two readers, store.js (parts, the guard, the quit); sync's cloud form / pull / 9 merge cases = the whole-file results,
  the thread ops on files; versions from digests = from chats; projfind / recall / the text search built in slices =
  the whole builds (case, Kelvin K, İ, quotes, words across a line break); historylean / autocompact = the whole ways.
- **Every sync suite with the fast paths forced on every chat** (`HEARTH_SYNCCHAT_MIN=1`): sync-test 180, sync72 179,
  guardloss78 103, syncstate75 109, projsync76 125, syncmedia73 103, synchard74 164, synclatency77 37, syncscope79 175,
  storeack77 177 — all pass; and normally (below).
- Old vs new on the giant chat and random chats, outputs identical: context-core localSummary / handoff build / earlier
  (309 / 309), withContext (14 / 14).
- The app check (above): open, send (2 changes saved, 0 whole), a reaction on an old message (by change), search; the
  file on disk = the chat in the window.
- `node dev/run-checks.js --exact …` (normal settings): bigchat82-test, sync-test, sync72, guardloss78, syncstate75,
  syncmedia73, synchard74, projsync76, synclatency77, syncscope79, storeack77, projsearch81, versions75, store-thread,
  boot, recall, appsearch, historylean, handoff, autocompact, context, sendpreview, chatkeep, datasafe, crashsafe,
  projbundle, winmac, winmac49, errorcalm + the scans datasafe / errorcalm / storeack / chatsafe / commandonly — **34 / 34
  pass**. App checks (under `flock /tmp/hearth-run.lock`): chatwindow72, lazy, bigchat82 (BIGCHAT82=1) — **3 / 3 pass**.
- Unit scans: datasafe, winmac, errorcalm, storeack, chatsafe — pass. boot-test: first screen 1879 / 1880 KB, 71 / 71
  scripts (the window's part is ≈ 3 KB inside native.js; the worker isn't a first-screen script).

## Files
New: `bigchat-core.js`, `chatparse-worker.js`, `dev/bigchat82-*.js`, `dev/checks/bigchat82.js`, this file.
Changed (marked `(round 82, bigchat82)`): `storework.js` (ops chatOpen / chatDelta / syncText / chatDigest / chatBytes,
big-chat paths in list / search / recall / projfind / syncHash / syncPull / syncMerge), `store.js` (openChat / openPart /
saveChatDelta / saveChat with a version / getChatFresh, the quit wait, Buffers from threads, usage off-main),
`main.js` + `preload.js` (chats:open / chats:part / chats:delta; one line each), `native.js` (getChat / saveChat /
withContext), `sync-engine.js` (push's bytes, Uint8Array writes), `syncmain.js` (textJson), `projfind-core.js`,
`recall-core.js`, `versions-core.js`, `versionsmain.js`, `versions.js`, `historylean-core.js`, `autocompact.js`,
`context-core.js`, `handoff-core.js`, `dev/bigprofile.js`, `dev/projsearch81-test.js` (budget 0 moves one doc per call),
`dev/run-checks.js`.

## For Codex
Nothing in Codex's files changed. If Codex code saves a chat with `hub.saveChat(chat)` (whole), it still works: a giant
chat's next change from the window is then saved whole once (≈ 0.2 s) before going back to changes.

## Risks / not done
- Exporting a project with a giant chat (projbundle75) still copies the chat in the window and on the main process
  (an explicit action with its progress bar): ≈ 0.3 s + 1–2 s on a 60 MB chat. Restoring a giant version keeps a copy of
  the chat in place first (`versions:keep`, the main process stringifies it).
- The window still holds a giant chat whole (chatwindow72 draws it lightly); opening one costs it ≈ 0.2 s once.
- Sync's per-pass work on a giant chat is on the files thread (0.4–1.5 s per hash / pull / merge), never on the main
  process or the store thread; chats between 8 and 16 MB keep sync's whole-file path (also on the files thread).
- The first text search with a giant chat builds its byte index (≈ 0.4 s of the store thread, once while searching).
- A chat with literal "hearth-…" strings in its words comes back from a cloud copy with them turned into paths — as before
  (the whole-file way does the same); not changed here.

## For the patch notes
- Very long chats (thousands of messages) no longer freeze Hearth. Opening one, sending a message in it, or reacting to
  an old message happens without the app stalling: only what changed is saved.
- Sync handles very long chats much faster and in the background: a new message on each computer no longer means
  re-processing the whole chat, and nothing heavy runs on the part of Hearth that answers your clicks.
- Earlier versions of a very long chat open quickly, without a pause.
- Find in this project, search and "what did we decide" stay smooth while they read a very long chat.
- Handing a long chat over to the other AI takes about a second instead of half a minute; sending in a long chat no
  longer hitches while Hearth prepares the lighter history.
