# search113: finding things is fast and right with thousands of chats (round 113)

The owner finds things five ways: Ctrl/⌘+K (with `?word` for inside messages), the chats list's filter, Find in this
project, the recall card ("what did we decide?") and Alt+F inside a chat. Each was measured on the heavy profile, the
slow and wrong parts were fixed, and `?word` now searches every project's chats.

**The heavy profile.** `dev/search113-fixture.js` makes it: bigprofile72's 2,200 chat files and 40 projects, Clink's
63 MB chat (perfguard's `/tmp/hearth-perf93-fresh`, linked rather than copied), plus the query set's own chats. All of
it is made up, from a fixed seed. No real data is ever used.

## How it was measured
- **The app**: `dev/checks/search113.js` (opt-in: `BIGPROFILE70=1`). It uses real keys and the window's own clock, and
  measures each key:
  - **the window's own work**: from the window's input event until the results changed;
  - **painted**: the same plus the next frame. On this shared box, with software drawing, one frame alone takes
    30–90 ms under load;
  - **the window's longest task**: each one over 50 ms is judged on its own CPU time, as in chatwindow86. A task that is
    long only because the box was busy is listed as "can't tell", not as a failure;
  - **the main process**: the lag probe, its busy stretches and its time per call;
  - **the store thread**: the time each ask took there.
- **"Before"** is the same check run on round 112's code (`98f439f`), on the same fixture and the same box. The
  `?word` and query-set parts were adapted to round 112's search, which is `hub.searchChatText`.
- **The store thread on its own**: `node dev/search113-test.js --bench`, run on bigprofile72.

## Before → after

### Speed
| | Round 112 | Now |
|---|---|---|
| **`?word` in Ctrl/⌘+K**: results after a key | 120 ms wait, then the whole-text search: **230–450 ms of the store thread for each key** (2,200 chats parsed or scanned). Every save waited behind it | **Title rows at once**: 33–67 ms painted, about 1 ms of the window's work. **Message rows** in 110–130 ms painted. The store thread takes **3–10 ms an ask** |
| `?word` before the index exists (first use ever, no kept index) | 308 ms to the first rows, then 0.2–0.45 s a key | First message row in **0.43–0.45 s** (the most recent chats are read first). The other rows fill in as the 2,200 chats are read: 13–15 s, in asks of ≤ 45 ms, never blocking the window |
| One letter (`?k`) | nothing | the chats whose title starts with it |
| **The first Ctrl/⌘+K** (Find anything loads) | one **128 ms** window task (98 ms of CPU) | **no task over 50 ms**. The work is spread over three tasks: its code, the fixed rows, then the menus and chats. Its indexes are built in slices of 8 ms |
| Each later Ctrl/⌘+K | one **92 ms** task: every opening indexed the 2,200 chats again | none over 50 ms. The chats are indexed once per chats list |
| Ctrl/⌘+K, typing a title (1, 2, 5 letters) | 13 / 6 / 4 ms of the window's work | 8 / 7 / 6 ms (3–8 ms) |
| **Alt+F in the 63 MB chat**, typing "tunne" | **1,366 ms** and 312 ms window tasks: 557 marks at once, 23,000 for one letter | **no task over 50 ms**. About 200 marks near where you are; the rest are marked when you step to them |
| **Recall card** (the index ready) | its search: **300–420 ms of the store thread** for a common word on 2,200 chats. Each ask could hold the thread 250 ms | its search: **14–22 ms**, same results. Asks are capped at 40 ms. The card answered in 95–132 ms |
| Chats list filter (1, 2, 5 letters) | 39 / 40 / 44 ms | 37–53 ms for the first letters, 5–7 ms once the list stops changing. Both include the frame the list draws in. No task over 50 ms either way |
| Find in this project (Clink, 1, 2, 5 letters) | 113 / 63 / 88 ms | 143 / 87 / 93 ms. Its own ask takes 12 ms; the rest is waiting on the store thread's background slices and the frame. Not changed this round |
| The main process | ≤ 0.6 ms per find call, no busy stretch | the same: 0.1–0.6 ms per call, no busy stretch, at most 14–45 ms of loop delay in any phase |

Each figure above is the lowest and highest of the runs on this box, or of the keys in one run.

The store thread on its own (`dev/search113-test.js --bench`, bigprofile72, 2,199 chat files):

| | Round 112 | Now |
|---|---|---|
| `?po` / `?porta` / `?portal` | 519 / 279 / 257 ms (every key) | 34 / 18 / 19 ms |
| `?portal shader` | 256 ms | 44–49 ms, the first time only (the word pair's code warms up) |
| catch-up, 2,200 chats from nothing | (n/a: the whole-text search parsed everything on the first key, 0.5 s) | 380–420 asks, the longest 30–53 ms, p95 25 ms |
| recall search, common words, 1,500 chats | 57 ms | 9 ms (the same results) |

This fixture is a worst case for timing. Its 134 made-up words appear in almost every message. The 2,000-chat
fixture in the unit test has a realistic vocabulary, and there each find takes p50 4 ms and p95 6–7 ms of the thread.

### Quality: the query set (`dev/search113-queries.js`, 23 queries with expected results)
| | Round 112 (`?word`) | Now |
|---|---|---|
| Queries as expected | **10 / 23** | **23 / 23** (app and unit test) |
| `cafe` → "Café…", `creme`, `oeuvre` (œ), `sohne` (Söhne) | nothing: accents had to be typed | found |
| `kyoto`: "Kyoto trip plan" first, with its project | first, but no project shown | first, with "◆ Travel" |
| `budget ryokan`, `font intro` (words in any order) | nothing: the words had to sit side by side | found |
| `intro font`: the decision first, "◆ Clink" | the chat, without a project or the message | the message where it was decided, "◆ Clink" |
| `clink flicker` (one word in the title, one in a message) | nothing | the Clink chat |
| `serum` | the giant chat first, because it says Serum most often | "SERUM patch bank" first |
| `spreadsheet` | **the same chat twice** (its `.prev` copy) | once |
| `xylophonic` / `marmalade` (giant / long chat) | the chat, opened at its end | lands on #30 / #500 |
| Trash, kept aside (`zorblax`, `quimbly`) | excluded | excluded |
| pinned before unpinned, recent before old | ✓ | ✓ |
| A damaged chat file | silently missing | a row: "Couldn't read a chat (s113-broken) just now" |
| Chats list filter: `cafe`, `oberkampf cafe` | no / no | yes / yes |

## What changed
### `?word` in Ctrl/⌘+K, across every project (new `chatfind.js`, lazy group `chatfind`)
- **Did it exist before?** In part. `?word` searched every chat's text, but:
  - it showed chat titles only, with no project;
  - opening a row opened the chat at its end, without the message or the project;
  - it re-read 2,200 chats on every key (0.2–0.5 s of the store thread);
  - it needed exact substrings (no accents, no word order);
  - a slower answer could paint over a newer one.
- **Now it works like this:**
  - Title rows show at once, from the window's own chats list (no I/O).
  - Message rows come from the store thread 70 ms after the last key. One ask is in flight at a time, and the newest
    words win.
  - Each row says its project ("◆ Clink") or "Not in a project", who said it, when, and how many messages match.
  - **Enter opens the chat's project** (`Projects.openChat`: its conversation view, the project switched to) and **lands
    on the message**, held in place while the chat settles (`Native.jumpTo`).
  - The recall card's "Jump to it" and Find anything's "In a chat" rows open the same way.
- **The index is recall's** (`recall-core.js` on the store thread). It is already built in idle moments, kept on disk
  between starts, and updated by every save; a giant chat in it is read in slices, with every message's offsets kept.
  The new `find()` reads the same postings differently:
  - the last word may be the start of a word;
  - accents, case and ligatures are folded on the term table, never on the postings;
  - every word must be in the message or in its chat's title;
  - there is one row per chat, with the best message to land on.
  - **Ranking**: BM25, exact before a word's start; then the chat's title naming it (×2.2 when all of it, ×2 when the
    title is exactly the words); recency; 📌 pinned; a pinned message.
  - **Fast**: a word's postings are summed into one slot per chat. Several words use one place per message in typed
    arrays, rarest word first, kept between asks. A next word only just begun ("portal sh") waits for its third
    letter.
- **The store thread's op `chatfind`**:
  - It catches up the chats that changed, within 60 % of the ask's budget (30 ms, or 45 ms while still reading). The
    most recently changed chats go first.
  - It gives each row its snippet, read back by bytes: a long chat's message from its offsets, a giant chat's from
    chatwindow86's offsets for the current file. A giant chat is never parsed whole.
  - It keeps the 400 texts read most recently.
  - It reads `kv/projects.json`, kept by size and time, to name each chat's project. It applies the same rule as
    `Projects.ofItem`: the first project that isn't archived.
- **Safety**:
  - A chat that can't be read is named in `unread` and shown as a row.
  - A projects store that can't be read says so (`projects: null`). It is never shown as "in no project".
  - A failed ask is shown as a row ("Couldn't search the messages just now"), never as "No messages match".
  - `.prev.json` copies are never rows. A chat deleted since the folder was last looked at is not a row.
  - Only the chats folder is searched: the Trash and sync's kept-aside versions (`data/sync/trash`) are not.
- French elisions are now their own word ("l'intro" → intro). Recall's kept index is version 2 because of this, so it is
  rebuilt once in idle moments.

### Ctrl/⌘+K's speed (appsearch.js)
- The chats are indexed once per chats list instead of on every opening. The fixed rows (Settings, actions, help) and
  the chats are both indexed in slices of 8 ms: the first slice at once, the rest in idle moments, with rows joining as
  they're ready.
- A new chat no longer rebuilds the fixed rows.
- Its "In a chat" rows come from `chatfind`, with their project. The whole-text search is no longer used.

### Recall (recall-core.js, storework.js, recall.js)
- Its search keeps one place per message in typed arrays and picks the best 64 without sorting everything. It used to
  build a Map with a string key per matching message, and make the title's words again for each message. The results
  are the same as round 112's, quotes, groups, order and scores included, on 20 queries (`dev/search113-r112-recall.js`
  is round 112's copy).
- Each of the card's asks is capped at 40 ms (it was 250 ms), with more of them.
- The catch-up is shared with `chatfind` (`recallCatch`). A chat saved since the last look at the folder is no longer
  dropped from the index, and a chat that can't be read is named.

### The chats list's filter (panel.js)
- Accents and case are folded once per title. Every word counts, in any order.

### Alt+F (chat-ux.js)
- Marks go to the messages nearest where you are, about 200 in all. The other messages that match are stand-ins, marked
  when you step to them (the same stand-ins resting messages already use).
- Each message's lowered text is kept while the node stays the same. The last message is never kept, because a reply
  may be streaming into it.

### First screen
- The printable table of keys (`shortcutsHelp`, about 4 KB) moved to the lazy `appdialogs` group, with the same code.
  The first screen is 1,693 / 1,696 KB, which leaves room for this round's lines in `appui.js`, `panel.js` and
  `chat-ux.js`.

## Files
- **New**:
  - `chatfind.js`;
  - `dev/search113-queries.js`, `dev/search113-test.js`, `dev/search113-fixture.js`, `dev/search113-r112-recall.js`
    (tests only);
  - `dev/checks/search113.js`.
- **Changed**:
  - `recall-core.js`: `find`, fold, elisions, the typed search;
  - `storework.js`: ops `chatfind` and `recallCatch`, `msgText`, `projectsOf`;
  - `store.js`, `main.js`, `preload.js`: one channel, `chats:find` → `hub.chatFind`;
  - `appui.js`, `appui-dialogs.js`, `appsearch.js`, `recall.js`, `panel.js`, `chat-ux.js`;
  - `lazy-data.js`, `index.html`, `docs/lazy-groups.md`;
  - `dev/run-checks.js`: UNIT, group `search113`, the fixture, EXTRA_ENV, EXTRA_FLAGS;
  - `dev/tmp-guard.js`: the fixture is shared;
  - `dev/chatwin-scan.js`: the two new `.messages` reads, audited.

## Tested
- `node dev/search113-test.js`: 49/49. It covers:
  - the query set on the real store thread, with 2,000 filler chats, a long chat and a giant one;
  - 1, 2 and 5 letters;
  - what can't be read;
  - the thread's time;
  - recall's results against round 112's;
  - the window's rows: the newest words win, and a failed ask is said.
- `BIGPROFILE70=1 search113`: pass. It reported no window task over 50 ms in any phase it judges and no "can't tell".
  Opening a project with Enter is reported only: 64–102 ms tasks, from the project's own open path, which warmopen113
  is working on.
- Required checks, run under the lock:
  - `unit:search113-test`, `appsearch`, `recall`, `lazy`: pass.
  - `chatwindow86` (`CHATWINDOW86=1`): passed when run again. It reported one "can't tell under load" on its edit
    step (a 61 ms task with 29 ms of CPU). The first run failed on its "top" step: a 154 ms task with 11 ms of CPU and
    143 ms off the CPU. That step scrolls up, which this round doesn't touch, and the run happened while the box was
    busy.
  - **`projsearch81` (`BIGPROFILE70=1`) fails**, and it fails the same way on round 112's code (`98f439f`, run by hand on
    the same box): "Clink card: something else is under the mouse at 0,0 (the node was redrawn)", then "timed out:
    Clink open". This happens in the Projects home before any search runs, so it is a known failure that predates this
    round. Find in this project itself is measured by `search113` (Clink's Desk: "sohne" found, no long task).

- `node dev/run-checks.js release` (under the lock): **308/311 passed, no ✖**. The other three are the known failures listed in KNOWN_FAIL (Codex's tests: playback-volume, quest-chat-service and questguide-flp). One opt-in check was skipped. No /tmp/hearth-* folder was left behind.

## Caveats
- Alt+F still folds case only, not accents. The window's marks and the store thread's find (chatwin-core `findHit`) would
  have to change together.
- Recall's index reads only Latin-script words (`[a-z0-9À-ɏ]`), as before. A Greek or Cyrillic word isn't found in
  messages, though titles find it.
- A first `?word` on a profile whose index has never been built fills in over about 15 s on the heavy profile. The
  window stays free and the recent chats come first. After that, the index is kept on disk.
- A chat in a project that has its own workspace isn't listed in the plain chats list, so the list's filter doesn't find
  it. Ctrl/⌘+K and the project's Desk do. This is unchanged.
- Find in this project's keys measure 90–145 ms painted. Its own ask takes 12 ms; the rest is the store thread finishing
  a background slice and the frame. It wasn't changed this round.

## For Codex
Nothing of yours changed. No Codex-owned file was edited: quest-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-*, creative-vst*, astra*, engine-watch. `chatfind.js` only calls `Projects.ready()` and
`Projects.openChat()` as they are.

## For the patch notes
- **Search inside every chat, in every project**: press Ctrl+K (⌘K on the Mac) and type `?` and a few words. The chats
  whose name matches show at once. The messages that match appear right after, each with its project's name.
- **Press Enter on a message** and Hearth opens that project, opens the chat and scrolls to that exact message.
- Accents and capitals don't matter ("cafe" finds Café), the start of a word is enough ("kyo" finds Kyoto), and the
  words can be in any order.
- The chat you obviously mean comes first. Pinned and recent chats rank higher, and a chat no longer shows twice.
- Deleted chats and versions sync kept aside never show. If a chat can't be read at that moment, Hearth tells you
  instead of leaving it out silently.
- Searching no longer slows Hearth down while you type, even with thousands of chats.
- The chats list's search box ignores accents too, and finds chats when you type their words in any order.
- **Find in a chat (Alt+F)** no longer freezes for a second on a very long chat when you search a common word.
- "What did we decide?" answers faster, and **Jump to it** opens the chat's project.
