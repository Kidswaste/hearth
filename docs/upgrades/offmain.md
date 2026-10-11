# Offmain (round 20): heavy work off the main threads

You asked: "make it smoother always". This stream moved the heaviest work Hearth did while you work off the two threads
that have to stay free: the **window's thread** (it draws, scrolls, takes your typing) and the **main process's thread**
(it answers every request the window makes: open a chat, save a scene, a setting, a search). Nothing was removed and
nothing looks different; results are the same as before (checked in each test).

## How it was measured
`dev/checks/offmain.js` (new) drives the real flows in a throwaway copy and records, for each one: the window thread's
busy time (Chrome's TaskDuration), its long tasks (any single task over 50 ms: a dropped frame you can feel), the
main process's longest block (its event-loop delay, through a new `perf:lag` probe) and the round trip of a ping sent
to the main process every few ms while the flow runs (p95 / worst). Data: 60 chats of 200 messages, one 300-message
chat, one 60-message "director" chat with ~120-line code replies, a 4 MB Lab scenes store, 300 notes in a folder,
cloud sync to a temp folder. Three runs of the round-19 build and three of this one on the same machine (headless
Linux, software GL, a shared CPU: noisy; medians, single runs where noted). Profiles were taken with CDP's sampling
profiler in the same flows.

| Flow | Before | After |
|---|---|---|
| Show every message of a 300-message chat (↑ Show earlier) | one **131 ms** long task, 188 ms busy | **no long task**, 37 ms busy |
| Open a 300-message chat (last 40) | 93 ms busy | 62 ms busy |
| Search every chat (8 searches, as you type) | 217 ms; main process blocked **37 ms**; ping p95 **27.7 ms** | 34–62 ms; blocked 7 ms; ping p95 **1.7 ms** |
| The chats list rebuilt (3×) | 23 ms, main blocked 9 ms | **5 ms**, blocked 5 ms |
| Save a 4 MB Lab scenes store (2×) | main process blocked **59 ms** | **30 ms** |
| Search a folder of 300 notes (Forge "search inside", 3 searches) | ping p95 12.2 ms, blocked 17.5 ms | ping p95 **1.5 ms**, blocked 7.8 ms |
| Open a code-heavy director chat (30 replies × 120 highlighted lines) | Markdown + highlighting on the window thread (≈ 40–60 ms of it) | rendered on the Markdown worker (425 k characters in 42–61 ms there); the window builds the nodes |
| Encode a 1280×720 JPEG (director screenshot, contact sheet) | a 42 ms task each | ≈ 22 ms, in pieces, **no long task** (5 encodes: 212 → 112 ms busy) |
| Encode a full PNG frame in the Lab preview (screenshots) | one 60 ms task (≈ 1080×1920: 100+ ms) | in pieces between frames, **no long task** |
| Ctrl+K palette typing, Commands page typing, sync passes | (no change you'd notice: within the noise of these runs) | |

The profile that found the biggest one: showing a long chat spent **60 ms in `fmtDate`** and ~40 ms more in the two
other date labels per message: `toLocaleString(…, options)` builds a new date formatter every call. Markdown for all
300 messages was only 9 ms. So the fix for long chats is a cached formatter, and the Markdown worker is for the chats
where Markdown really is heavy (long code replies).

## Upgrades

### Chats
1. **Showing a long chat's earlier messages no longer freezes the window**: dates and times are written by one cached
   formatter per style (`fmtLocal` in ui.js, the same text as before): the 300-message chat's ↑ Show earlier went from a
   131 ms freeze to none (188 → 37 ms of work).
2. **Opening a long chat is lighter** (93 → 62 ms of work): the same formatters for each message's time, title and the
   day lines.
3. **A Markdown worker** (md.js runs as a worker too): when a chat about to be drawn has more than ~24 k characters
   of replies not rendered yet (director chats full of code), they're rendered and highlighted on the worker first and
   the window only inserts them; never waits more than 0.4 s (then it renders here as before). Same HTML as before.
4. **↑ Show earlier is ready before you ask**: a long chat's earlier replies are rendered on the worker at the first
   idle moment after it opens, so showing them only builds their nodes.
5. **Code highlighting compiles its rules once per language** (it built a regular expression and a keyword list for
   every code block).
6. **Searching every chat no longer stalls the app** (Ctrl+K `?words`, `/search`): it runs on Hearth's store thread,
   from an index of your chats kept in memory (a chat file is read again only when it changed): the main process
   answers the window in 1.7 ms instead of 28 ms while you search, 8 searches 217 → ~50 ms.
7. **The chats list is built from the same index** (only changed chat files are read again): 3 rebuilds 23 → 5 ms.
8. Deleting a chat right after its last save waits for that save, so the chat can't come back.

### Saving your data
9. **Saves run on a store thread**: chats, Lab scenes and every kv store (boards, notes, usage…), memory and history are
   turned into JSON and written there, not on the main process (a 4 MB scenes store: the main process held 59 → 30 ms;
   what's left is receiving the store from the window). Until a save is on disk, every read returns it.
10. **Saves that change nothing are skipped**: no write, the store's `.prev` (one step of undo) is kept, and cloud sync
    has nothing to look at. A file someone else changed (sync, another program) is always written again.
11. **Big stores are read on the store thread** (over 512 KB, e.g. the Lab scenes when the Lab opens): read and parsed
    there, the main process only hands the result over.
12. **Quitting waits for the last saves** (up to 2 s), then writes anything left itself: no save is lost.
13. If the store thread can't start or stops, saves go back to how they were (synchronous), automatically.

### Files and cloud sync
14. **Searching a folder** (Forge's search inside its workspace) and listing a folder with its subfolders
    run on a second "files" thread, so a big folder never holds up a save or the window: ping p95 12.2 → 1.5 ms.
15. **Cloud sync hashes big JSON stores on the files thread** (≥ 256 KB: Lab scenes, boards, long chats): read, put in
    their cloud form and hashed there; a push in the same pass reuses that text and hash (no second parse / hash).
16. Sync hashes plain files over 1 MB in 1 MB steps (the main process answers between them; same hash).
17. A sync pass waits for saves still on the store thread before it reads the folder (no half-saved state reaches it).

### The Lab
18. **Lab screenshots no longer freeze the preview**: the sandbox encodes the picture with the browser's own encoder in
    small pieces between frames (toBlob) instead of one long PNG encode (60 ms at 1280×720, 100+ ms at 1080×1920).
19. **The director's screenshot (`three_screenshot`, the 3rd tool it uses most), its reference pictures and contact
    sheets** are encoded the same way: a 1280-px JPEG is ≈ 22 ms of work in pieces instead of a 42 ms freeze.

### Search boxes
20. The Commands page search keeps each command's words ready (lower-cased once, not ~1,000 strings per keystroke).
21. Ctrl/⌘+K: rows below the first screenful skip layout until you scroll to them.

## For the next streams (dev, not counted)
- `node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/offmain.js` (or
  `sh dev/run-checks.sh offmain`): the flows above with busy ms, long tasks, main-process block and IPC p50 / p95, plus
  result checks (same search hits, same Markdown, same highlighted code, folder search, a screenshot).
- `node dev/store-thread-test.js` (in `sh dev/run-checks.sh unit`): the store thread without Electron (18 checks).
- `window.hub.perfLag()`: the main process's longest event-loop block (and p99) since the last ask, and the store
  thread's counts (writes, skipped, ms, fallbacks). `Md.stats()` in the window: the Markdown worker's batches.
- `store.idle()` (main side) resolves when every save asked so far is on disk; `store.runOff(op, args)` runs folder
  work on the files thread.

## Not done / still on a main thread
- Building the DOM of a very code-heavy chat (≈ 21 k highlighted spans for 30 long code replies) is still one or two
  100–160 ms tasks when it first opens; the Markdown part moved off, the node building didn't (it would need replies
  filled in as they scroll near, which other features read right away).
- Image resizing in the main process (board imports, capture previews, Meshy pictures) uses Electron's nativeImage,
  which can't run on a worker thread; left as is (it runs once per picture).
- A big store still crosses from the window to the main process as one message (≈ 20 ms for 4 MB on both sides).
- The Lab's song analysis was already on a worker (round 5); waveform drawing reads its peaks (cheap).
