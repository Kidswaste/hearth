# chatcalc87: a giant chat's whole-chat numbers cost milliseconds per reply; the older-message panels work on the first try (round 87)

Round 86 (chatwindow86) made giant chats (≥ 8 MB on disk) windowed and left three things open. This round closes them:

1. **The store thread's time per reply.** `chatCalc` parsed the whole file for every ask: autocompact's "continue
   lighter?", sendpreview's history and historylean's lighter history. That was ≈ 0.5–1 s of the store thread per ask,
   and a reply makes three asks. Now the thread keeps **one record per message** and reads only what changed.
2. **"Throws" panels.** chat-things' "Made here", chat-refs' @file list and chatsafe's "Show earlier" now work on the
   first try with a windowed (or giant) chat.
3. **A width change.** Messages that aren't loaded kept the height guessed at the old width. They now take the new
   width's height, exactly.

## Measured (before → after)
The app check `dev/checks/chatwindow86.js` (opt-in `CHATWINDOW86=1`) on bigchat84's fixture (made up, fixed seed, never
real data: 6,000 messages, 63 MB). "Before" is the same check run on round 86's code (the check sees it and reports
without failing). A shared 4-CPU box with other streams running.

| Step | Before (round 86) | After |
|---|---|---|
| Store thread per reply (2nd and 3rd reply after open) | **2,679 / 2,075 ms** | 477 / 490 ms |
| … of which the whole-chat numbers (3 asks a reply) | ≈ 0.6 s+ each ask (the file parsed) | **11 / 12 ms** (all three read the kept records) |
| "Made here" (`ChatThings.ofChat`) on the first try | **NotLoaded** (the chat then loaded whole) | works, 4–8 ms, = the whole chat's list |
| @file list on the first try | works (the fixture's end names ≥ 12 paths) | works, 1–2 ms, = the whole chat's list |
| @file's walk over all 6,000 messages (none of the older ones loaded) | throws NotLoaded | 257–318 ms, all on the store thread, = the whole chat's 109 paths |
| chatsafe's reader on the giant chat: open | **1,215 ms, the main process held 1,071 ms** (parsed whole) | 55–67 ms, main process ≤ 20 ms |
| chatsafe's "Show earlier" | **one 30,950 ms window task** (all 6,000 messages drawn) | a page of 120, longest task 50–71 ms |
| A block never loaded, guessed after the list got narrower (1,133 → 608 px) | 16,649 px vs 22,801 px measured (**−27 %**) | 22,801 px = 22,801 px |
| Window heap with the giant chat open | +5.5 MB | +5.6 MB (a reply's things now ride in its record) |

The rest of the round 86 steps (open, top, find, jump, send, react, edit-from-here, export, sync) are unchanged:
no window task ≥ 60 ms (find / jump ≤ 100 ms), the main process never held ≥ 50 ms, nothing loaded whole except
export, no miss, no refused change.

The store thread (`node dev/chatcalc87-test.js --bench`, the fixture's chat):
- the first ask makes the records: **481–493 ms** (the file read and each message parsed once, as one ask did before);
- each ask after that: **10–22 ms**, also after each new exchange is saved by change;
- the whole way, for comparison: **653–673 ms** per ask (parse + the three numbers);
- the same answers as the whole way on that file: `true`;
- the records hold **4.8 MB** (6,000 messages). The parsed chat that round 86 kept for 15 s after each ask was 175 MB;
- the heights at another width (`chatHeights`): **3–4 ms**.

What's left in the thread's time per reply is round 82's save by change: each one writes the 63 MB file anew,
≈ 0.1–0.4 s here, two per exchange.

## How
### 1. Records kept per message (`chatcalc-core.js`, store thread only)
- **One record per message**, made once from the message by its index in the file. It holds:
  - its small fields (role, time, usage, flags, `from`, `histLean`);
  - what the three need from its content: token counts, row lengths, its words as numbers (autocompact's 6-letter
    stems, one shared vocabulary), the keys of its long code blocks.
- A record **throws** on any field it doesn't hold, so the pure code can't silently read "nothing" from it. When that
  happens, the whole way answers instead (the file parsed, as before). The tests count that it never happens.
- **Kept by the file's signature** (size and time). A save by change (`chatDelta`) updates only the records it wrote:
  - new messages at the end;
  - a cut (`trunc`);
  - an old message reacted to or edited;
  - the chat's own fields.

  A file changed any other way (a whole save, sync, another program) is read again at the next ask. Two chats at
  most, let go 20 minutes after the last ask.
- **An ask** runs the pure modules' own code wherever it only reads small fields (sendpreview's stats, historylean's
  inputs) on the records. The few messages whose words go into the answer are read in full by their offsets:
  - the last exchanges;
  - your last message;
  - the last reply;
  - the lighter history's newest rows (rendered by historylean's own `render`).

  The parts that sum every message's text (autocompact's relevance and topic, sendpreview's history, the lighter
  history's code-block keys and stub counts) follow the pure code's steps with the records' numbers.
- `autocompact.decide` takes the store thread's word sums (`input.words`, `input.olderTok`). Without them it does
  exactly what it did. The pure modules export the helpers it reuses (`talk`, `words`, `render`, `blocksOf`, `label`,
  `picTok`…).

### 2. The panels
- **Made here** (`ChatThings.ofChat`, also `/things`, `/open-last`, the slash menu's "For this chat"): a reply's
  things (a few small cards) now ride in its record when they are under 4 KB. `chatwin.js things()` reads them from the
  records without making a stub. A larger list still throws NotLoaded, so the chat loads whole and the next try works.
  The edit in `chat-things.js` (first screen) is one line, and the bytes are offset: first-screen code went from
  20,051 to 19,952 bytes.
- **@file** (`chat-refs.js`): the same walk from the end. The loaded messages are read in the window; each run that
  isn't loaded is read on the store thread (`chatScan`, the same expression from `chatwin-core.js`) until 12 paths
  are found.
- **chatsafe's reader** (a chat whose AI is missing or turned off): a giant chat is no longer read whole on the main
  process. Its own fields and count come from the store thread (`chats:win head`). Its last messages, and each
  "Show earlier" page of 120, come by range. Rows go in 10 at a time, and a row off screen isn't laid out
  (`content-visibility`). A read that fails says so and can be tried again; it is never "No messages". A chat under
  8 MB opens as before.

### 3. A width change
- The store thread keeps a **height profile** per message (`chatwin-core profOf`): what isn't text, the lines that take
  the same room at any width, and the longer lines' lengths. `pxAt(profile, width)` = `msgPx(message, width)`,
  exactly.
- When the chat list's width changes by ≥ 24 px (`chat-rest.js`, a ResizeObserver), the window asks for the heights at
  the new width (`chatHeights`, 3–4 ms). It puts them on the messages that aren't loaded, and gives every resting
  block's spacer its new guess. A block measured when it was drawn is rescaled by how its guess changed. What's at the
  top of the view stays put.
- Opening a giant chat again at another width makes its records' heights from the profiles instead of parsing every
  message again. The profiles add 10–27 ms to the first open's pass.

## Safety
- **"Not loaded" is never "not there".** A record throws on what it doesn't hold, and then the whole way answers. A
  store read that fails is an error for every new op (`chatCalc`, `chatScan`, `chatHeights`, `chats:win head`),
  never an empty answer:
  - @file throws "can't be read just now";
  - chatsafe says so with a button to try again;
  - the heights keep their old guess.
- **Saves are unchanged and byte for byte:**
  - `chatcalc87-test` saves 12 changes by change with the records kept (exchanges, cuts with trunc, reactions on old
    messages, its own fields). Each file = `JSON.stringify(chat, null, 2)`;
  - `chatwindow86-test`'s 86 checks (every kind of change, a random walk of 40) all pass.
- `unit:chatwin-scan`: 96 files audited, 0 problems. chat-things is now "windowed", chat-refs "thread", chatsafe
  "windowed", and chatcalc-core is new ("not-chat"). `unit:chatsafe-scan`: 0 problems.

## Tested
- `dev/chatcalc87-test.js` (new, **44 checks**, `unit:chatcalc87-test`):
  - the records = the pure modules on the whole chat:
    - **2,600 asks** on 260 random chats: sessions or none, Continue lighter, handoffs (brief / whole), lighter
      starts, opinions, errors, compact requests, pictures / files / refs, tools, repeated code blocks, sent / ctx,
      every `upto`, 4 agents;
    - **1,200 asks** after random changes saved by change (24 walks of 25);
    - mutating the core (a sum, the code blocks' order) makes these fail;
  - a record never guesses (it throws; a message that isn't an object goes the whole way);
  - heights: `pxAt(profOf)` = `msgPx` (3,600 message × width pairs); `chatHeights` and `chatWinOpen` at another width
    = `metaOf`'s heights;
  - a reply's things in its record, and a list ≥ 4 KB not (NotLoaded);
  - the store thread: the first ask is `built`, every ask after a save by change is `kept`. A file changed another way
    is `built` again. Answers = the whole way on the file. A damaged or missing file gives an error from chatCalc,
    chatHeights and chatScan;
  - `chatScan` = the walk from the end, and chat-refs.js uses the very same expression;
  - saves by change with the records kept: byte for byte.
- `dev/checks/chatwindow86.js`, extended (rounds 86 and 87):
  - **reply2 / reply3**: the store thread's time, and its whole-chat asks: all `kept`, ≤ 120 ms per reply;
  - **panels**:
    - Made here and @file on the first try, = the chat loaded whole;
    - the @file walk over the whole windowed chat = the whole chat's, with a path put on #1000;
    - chatsafe's reader and "Show earlier", every window task ≤ 100 ms;
  - **width**: a never-loaded block's guess at the new width = its messages measured.
- App (under `flock /tmp/hearth-run.lock`):
  - chatwindow86 (`CHATWINDOW86=1`), chatwindow72, bigchat84 (`BIGCHAT84=1`) and lazy pass;
  - sync72 failed 3 times in a row (01:2x, the AI setup drawer open over the sync panel: "Claude Code isn't
    installed") and then passed twice with the same code. The failure is in sync's panel, unrelated to chats.
  - One run stopped at first with ENOSPC (/tmp full; the leftovers of that run were removed).
- Unit: chatcalc87-test, chatwindow86-test, chatwin-scan, store-thread-test, autocompact-test, historylean-test,
  sendpreview-test, bigchat84-test, bigchat82-test, datasafe-scan, winmac-test, errorcalm-scan, storeack-scan,
  chatsafe-scan, boot-test (first screen 1809 / 1810 KB, 71 scripts, 99 bytes lighter than before this round),
  lazymanifest-test: all pass.
- `sh dev/run-checks.sh chatcalc87` runs the lot (with `CHATWINDOW86=1 BIGCHAT84=1`).

## Files
- **New:** `chatcalc-core.js` (the store thread's records and asks), `dev/chatcalc87-test.js`, this file.
- **Changed, marked `(round 87, chatcalc87)`:**
  - `storework.js`:
    - chatCalc from the records (the whole way kept as `calcWhole`);
    - chatDelta updates the records and profiles;
    - the new ops `chatHeights` and `chatScan`;
    - chatWinOpen keeps the profiles;
    - `bigCut`, shared by chatRange and chatScan;
    - a whole save (`write`) and `forget` let the records go.
  - `store.js`: `chats:win` ops `heights`, `scan` and `head`.
  - `chatwin-core.js`: `profOf` / `pxAt`, a reply's things in its record (≤ 4 KB), `FILE_PATHS` / `SCAN`.
  - `chatwin.js` (lazy): `things`, `scan`, `reguess`; the calc asks counted (`stats().calcs`).
  - `chat-rest.js` (lazy): the width watch (`rewidth`).
  - `chat-things.js` (first screen): `ofChat`'s windowed line, with two trailing comments moved to their own lines
    (net −99 bytes of code).
  - `chat-refs.js`, `chatsafe.js`, `chatsafe.css` (all lazy).
  - `autocompact.js` (`decide` takes `words` / `olderTok`, plus exports), `historylean-core.js` and
    `sendpreview-core.js` (exports only).
  - `dev/checks/chatwindow86.js`, `dev/chatwin-scan.js`, `dev/run-checks.js` (`unit:chatcalc87-test`, group
    `chatcalc87`).

## For Codex
Nothing in Codex's files changed: no `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*` or `engine-watch`. Things to know:
- `ChatThings.ofChat(chat)` now works on a windowed giant chat (from its records). A reply whose things list is
  ≥ 4 KB still throws NotLoaded there, as round 86 did.
- `Native._rest.W.x.scan(chat, 'paths', max)` walks a windowed chat from the end for file paths without loading it,
  using the store thread.
- `window.hub.chatWin('head', { id })` → `{ big, head, n }`: a giant chat's own fields and count without parsing it.
  After that, `chatWin('range', …)` reads its messages.

## What's left
- **The save by change of a giant chat** writes the whole file anew (≈ 0.1–0.4 s of the store thread per save, two
  per exchange: round 82's way). Now that the whole-chat numbers are cheap, this is most of the thread's time per
  reply. Appending in place would need a different file layout.
- The first ask after a giant chat opens still makes the records (≈ 0.5 s of the store thread, about what one ask cost
  before). It could be made in slices, or from chatWinOpen's own pass (that pass parses each message too; words
  would add ≈ 0.3 s to the open).
- A chat whose file was last written whole (sync's guard, a fallback) has no height profiles until it opens windowed
  again. A width change keeps the old guesses then; each block is still measured when it wakes.
- A chat held whole (under 8 MB, or the setting off) keeps the resting blocks' guesses it made at the old width (as
  before). Blocks guessed after the change use the new width.
- The remaining "throws" modules (nodes-code, board-plus' pictures, devreport, swarmlean's estimate, offline's "pick up
  with the other AI", visual / routine feedback, Codex's quest journal and review) still work on the second try.

## For the patch notes
- **Very long chats no longer slow down with every reply.** Hearth used to re-read the whole chat in the background
  after each answer to work out its token numbers. That took about a second each time in a 6,000-message chat; now it
  takes about 10 ms.
- **"Made here", the @file list and older messages work right away in very long chats.** Before, they sometimes needed
  a second try while the chat loaded.
- **A chat waiting for its AI opens instantly, even when it's very long.** "Show earlier" now loads a page at a time
  instead of freezing Hearth for many seconds.
- **Resizing the window keeps a long chat's scrollbar honest.** Older messages that aren't loaded now take the right
  height for the new width.
