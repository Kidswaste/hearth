# projbig85: projects with a giant chat export, import and copy without a stall (round 85)

Round 84 left three things open around giant chats (6,000 messages, ≈ 63 MB). Two are done here: **exporting,
importing or duplicating a project that holds one**, and **previewing a giant earlier version**. The third (keeping old
messages on disk until you scroll up) is a plan only (below). What you get didn't change: project.json in the
.hearthproject file is the same, byte for byte, and the chat an import or Duplicate writes is the same file too.

## The fixture
bigchat84's: `node dev/bigchat84-fixture.js /tmp/hearth-bigchat84`. It's made up with a fixed seed and is never real
data. Project "Clink" holds the giant chat (`claude-giant0`), 5 smaller chats, 5 scenes, 3 boards and 740 files that
aren't on this computer. The giant chat also has an earlier version kept (10 messages fewer).

## Measured before → after
In the app: `dev/checks/projbig85.js`, the same check on both sides. "Before" is the code before this round, run with
`node dev/smoke.js --app <base checkout>` and `window.PB_REPORT=1`. The box is a shared 4-CPU machine with other
streams running, so expect a few ms of noise per task.

| Step (project Clink with its 63 MB chat) | Before: window's longest task / main process | After: window / main |
|---|---|---|
| ⇪ Export project…, until the card shows | 1,932 + 609 ms / 142 ms block (the card's sizes) | none ≥ 50 ms / no block ≥ 50 ms of our own (≤ 35 ms) |
| Export… until the file is written | — / **4,723 ms** block (copy 1.8 s, rewrite, JSON, CRC) | none / no block (max 47 ms, lag-probe overhead) |
| ⇩ Import project…, until the card shows | — / **1,223 ms** block (project.json parsed) | none / none (max 16 ms) |
| Import as a new project | **1,564** + 156 + 127 ms / 405 + 207 + 117 ms | 55–100 ms (*) / none (max 20–28 ms) |
| ⧉ Duplicate project | 642 + 155 ms / 131 + 124 ms (two whole saves sent to the store thread) | ≤ 63 ms (*) / none (max 30 ms) |
| Earlier versions › Preview of the giant version | **2,421 ms** / 399 ms block (60 MB sent) | none / none (max 22 ms) |

(*) The remaining import / Duplicate tasks come from opening the new project: its Lab scene is shown
(three.js `openSketch`), its chat is drawn (`native.js render`) and its 5 scenes are added. They were there before
this round too, and the giant chat adds nothing to them (profiled with `window.PB_PROF = 1`). The check gives these two
steps 150 / 100 ms; every other step keeps the 60 ms budget, and the main process keeps 100 ms.

Wall time got shorter as well: export 10.3 s → 4.4 s, import 11.0 s → 4.7 s, Duplicate 5.5 s → 2.3–4.6 s, Preview 5.1 s → 0.8 s.

In Node (`node --max-old-space-size=6000 dev/projbig85-test.js --bench`, the fixture's giant chat):
- **Window, before:** copying the chat took 550–640 ms, the card's size 400 ms and prepare 800 ms, each as one task.
- **Window, after:** prepare takes 1 ms. The card's look (on a thread of the main process) takes 0.75 s and holds the
  main thread ≤ 8 ms.
- **Main process, before:** the body took 1.7–2.5 s held in one go, plus CRC and deflate.
- **Main process, after:** the export takes 4.6–4.9 s on the thread, and the main thread is held ≤ 64 ms (Node's
  first `require` of reachmain; in the app ≤ 47 ms).
- **Import card:** held 720–770 ms before, ≤ 16 ms after.
- **Unpack:** held ≤ 42 ms, and the body handed to the window is 1.2 KB (before, the whole 60 MB).

## What changed
### Export / Duplicate (a project's giant chat travels by its name)
1. **The window never loads or copies a giant chat** (≥ 8 MB on disk) to bundle it. `projbundle:chats` asks the main
   process. A new thread there, `projbundle-work.js`, reads the chat file after that chat's saves on their way have
   landed (`store.idle`). It answers with the chat's own fields (`messages: []` in place, so the keys keep their
   order), its count, its size and the paths it points at (for the card's sizes). The window keeps that as a stand-in
   (`{ __bigChat }`). The export sends only `{ __bigChat: { id } }`.
2. **The export's heavy part runs on that thread** (`exportA` / `exportB`). The chat is read there and prepared exactly
   as `prepare()` does in the window: session out, `lastReply` / `pending` out, secrets scrubbed and counted. Then the
   body is checked, its paths are collected, the tokens are rewritten, and project.json is made with
   `JSON.stringify`, its CRC and one deflateRaw at level 6. The bytes are handed over without a copy, and the main
   process only writes them in 4 MB pieces (`writeZip` `it.pre`). The main process still finds the files on this
   computer (`here()`, unchanged).
3. **A giant chat that can't be read stops the export.** It's never taken as "no chat", and nothing is written: no
   file, no `.part`. The same goes for one that disappeared between the card and the export. A chat that is simply
   missing is "not on this computer" as before.
4. **Duplicate project** copies the giant chat on the store thread. The `projbundle:adopt` op `chatAdopt` takes the
   chat's own fields as the window made them (a fresh id, session out) plus the original file's messages, and writes
   them the way a whole save writes them. It runs after that chat's saves, never over a chat that's already there,
   and writes nothing if the source can't be read. The window only lists the new chat; it loads from disk when opened.
5. The export card's sizes (`projbundle:sizes`) now wait on the disk instead of blocking. A project of 740 files held
   the main process about 120 ms there.

### Import
6. **The card's look parses project.json on the thread** (`peekBody`: read, inflated with its cap, CRC-checked,
   parsed, checked, counted). The main process gets only the counts. Same lines, counts and skipped files as before
   (tested).
7. **Unpack** keeps the parsed body on the thread while the files are unpacked. Then `finishImport` points the paths
   at this computer's copies, writes each giant chat's messages to a part file in a temporary folder of its own, and
   hands the window a small body: the giant chat is its own fields plus `{ __bigPart }`.
8. The window adds the giant chat by name (`projbundle:adopt` with the job and the part), and the store thread writes
   it (step 4). The part files are removed when the import ends (`projbundle:release`, or 30 minutes later at the
   latest), and also on Cancel or a failure. A part that isn't this import's, or that can't be read, is refused and
   nothing is written. Something already added goes back to the chats' Trash as before.
9. `apply()` copies only what it changes (each chat's entry). `remap` copies the rest, as before; the whole JSON copy
   first was 30–50 ms of a long task for a project of 760 things.

### Earlier versions › Preview
10. **A giant version is previewed by its part.** `versions:read(token, { peek: { to, count } })` → files thread op
    `chatPeek`. It returns the title, the count and messages `[start, to)` with role, who and the first 4,000
    characters, as before. The other messages aren't parsed when the copy can be cut (bigchat-core `scanBuf`). A copy
    kept before a restore (wrapped) or one from the cloud folder is parsed on the files thread. A backup's copy is
    taken out of its zip into a temporary folder first.
11. The preview draws 30 messages per task, and its messages are laid out only when scrolled to
    (`content-visibility`). Even 300 small DOM messages laid out at once were a ≈ 0.3 s task. **Show 300 earlier**
    loads the ones before on a click. Smaller versions are previewed exactly as before.

### Safety
- A chat or project.json that can't be read stops the operation and writes nothing (tested for export, adopt from a
  part and adopt from a chat).
- **Secrets still never go in:** API keys and secret-named keys are scrubbed (now on the thread for giant chats, and
  counted in the manifest the same way). The engine session is left out. `.env` and key files are never packed. The
  test checks the giant chat's key, a `token` / `apiKey` value, its session and a `.env` attachment.
- Deletes: an import that fails puts what it added in the chats' Trash, as before. Only our own temporary part files
  are removed directly. Nothing is uploaded.

## Tested
- `dev/projbig85-test.js` (UNIT, 31 checks):
  - chatsInfo: missing / small / unreadable / big, keeping the key order.
  - Export by name gives the same project.json **byte for byte** as the window's whole chat + the old main-process
    code (kept in the test as the reference), with the same deflated entry (CRC, size), the same entries in order, and
    the same counts and secrets.
  - A chat that can't be read / isn't there / has a refused name → stopped, no file, no .part.
  - peek on the thread matches the old peek.
  - The import body + part = the old body.
  - adopt writes the old whole save **byte for byte** (import and Duplicate), and refuses over an existing chat, a
    foreign part, an unreadable part or source, or a bad name, writing nothing.
  - release; chatPeek (plain / wrapped / paged); versions `read(token, { peek })`.
- Unit: projbig85-test, projbundle-test (26), bigchat84-test (80), versions75-test (87), datasafe-scan, winmac-test,
  errorcalm-scan, storeack-scan, chatsafe-scan, boot-test (first screen unchanged: 1805 KB, 71 scripts), plus
  store-thread-test, bigchat82-test, projects-test, projsync76-test: all pass.
- App (under `flock /tmp/hearth-run.lock`): projbig85 (`PROJBIG85=1`), projects, versions75, lazy, projbundle,
  bigchat84 (`BIGCHAT84=1`): **6 / 6 pass**.

## Files
- **New:** `projbundle-work.js` (main-process thread), `dev/projbig85-test.js`, `dev/checks/projbig85.js`, this file.
- **Changed (marked `(round 85, projbig85)`):**
  - `projbundlemain.js` (thread runner, export / peek / unpack on it, chatsInfo / adopt / release, async sizes)
  - `projbundle.js` (stand-ins, adopt, listChat, a lighter apply copy)
  - `store.js` (adoptChatBig), `storework.js` (ops chatAdopt, chatPeek)
  - `versionsmain.js` (read peek), `versions.js` / `versions.css` (Preview by its part, drawn in parts)
  - `main.js` (projbundlemain gets `idle` and `adoptChat`), `preload.js` (three `projbundle` calls)
  - `dev/run-checks.js` (UNIT + group `projbig85` + its lag env)
- No lazy group gained a file, so `node dev/lazy-manifest.js` wasn't needed. `lazy-meta.js` holds only command
  words, which didn't change. If manifest85's tool regenerates META at merge, nothing from this round is needed in it.

## For Codex
Nothing in Codex's files changed (no `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*`, `engine-watch`). There are two things to know:
- `ProjBundle.gather(p)` now returns a giant chat (≥ 8 MB) as a stand-in: its own fields with `messages: []` and
  `__bigChat: { id, n, size, paths }`, not the whole chat. `apply` handles it; if you read `gather`'s chats yourself,
  load such a chat with `Native.load(id)`.
- `hub.versions.read(token, { peek })` is new; without `peek` it's unchanged.

## What's left
- The Lab's first start and opening the new project after an import or Duplicate (its scene shown, its chat drawn) are
  still 50–120 ms window tasks. That isn't about chats.
- The card's sizes still map files from the other computer one by one (`reachmain.localize`, sync). With 740 such
  files that's ≈ 35 ms blocks.
- A giant chat is read (parsed) once for the card and once more by the store thread for Duplicate, or by the import's
  thread for an import: seconds of those threads, never of the window or the main process.
- **The window still holds a giant chat whole when it's open** (item 3 of round 84's list): the plan is below.

## Plan (not built): keeping old messages on disk until you scroll up to them
Today an open giant chat is ≈ 60 MB of objects in the window (≈ 150–250 MB of heap). A garbage collection over it can
make one task ≈ 50 ms. What reads `chat.messages` in the window, and what each would need:
1. **Drawing** (chatwindow72's resting blocks): it already draws only the last 40–59 messages plus spacers. It needs
   each resting block's height (kept per message since round 84: a number, not the text). **Change:** the window holds
   a *window* of the chat — its own fields, the last ≈ 300 messages and one height per message. A block woken by a
   scroll fetches its 20 messages by range from the store thread. The op works like `chatPeek`: the file is cut once
   (`scanBuf`), its offsets are kept with the file's sig, and each range is `JSON.parse` of its bytes. A far block is
   let go (its messages dropped, not only its DOM).
2. **Saving** (round 82's saves by change): `chatDelta` already sends `[index, message]` pairs and the count. The
   window's shapes would cover only the loaded messages, and an unloaded one is "unchanged" by definition. A reaction,
   edit or delete on an old message loads its block first. Branch / retry / edit-from-here cut the list at an index:
   `chatDelta` needs a "truncate to n" (today n with msgs does it).
3. **Find in the chat** (Alt+F): searches the loaded part now. It would ask the store thread (`bigSearch` already
   indexes a giant chat's bytes) for the matching indexes, then wake those blocks.
4. **Jump to message #k / earlier "Show all"**: load the block of k. "Show all" on a giant chat would become paging.
5. **Export** (`chatexport-core.js`): already in pieces. It would read ranges, or better, run on the store thread from
   the file (the Markdown / page renderers are pure; the page's Markdown rendering already has a worker).
6. **Engine history / lighter history / autocompact**: they read the last messages plus older words. Autocompact's
   "older words" already come in idle slices and could come from the thread (a words op over the file). The lighter
   history reads the recent turns only.
7. **Stats, second opinion, hand-over brief, copy-last-reply**: last messages, or counts the thread can give.

The cost is a new `messages` access layer (`ChatWindow.at(k)` / `range(a, b)`, async for unloaded ones) across native.js
and ≈ 15 chat-*.js modules that index `chat.messages` directly. That's the bulk of the work, and every one of them
needs a test that it never treats "not loaded" as "not there". The order would be: store op `chatRange` + offsets
cache → drawing → saving (truncate) → find / jump → the rest. Rough size: a round of its own. The gain is ≈ 60 MB less
in the window per open giant chat, and no 50 ms collections.

## For the patch notes
- Exporting a project that holds a very long chat (thousands of messages) no longer freezes Hearth. The work happens
  in the background, the app keeps answering, and it's about twice as fast. The file it makes is exactly the same as
  before.
- Importing such a project file, and **⧉ Duplicate project** on one, no longer freeze the app for seconds either. The
  long chat is added in the background and shows in your chats list right away.
- If a chat in the project can't be read at that moment, the export or copy stops and writes nothing (try again a
  moment later). Passwords and API keys still never go into a project file.
- **Earlier versions › Preview** of a very long chat opens in under a second instead of freezing the app for a couple
  of seconds. It shows the newest 300 messages; **Show 300 earlier** loads the ones before.
