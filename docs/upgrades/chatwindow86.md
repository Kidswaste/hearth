# chatwindow86: a giant chat keeps its older messages on disk until you scroll up to them (round 86)

The owner asked for it himself: in a long chat, the older part should be "cached / hidden" and cost nothing unless he
scrolls up. Drawing was already windowed (chatwindow72), but the window still held a giant chat's whole list of
messages: about 60 MB of heap for bigchat84's 6,000-message chat, with garbage collections and long tasks over it.
Now such a chat is opened **windowed**: the window holds its own fields, its last 300 messages (plus its pinned ones
and the blocks you scrolled up to) and one small record per message. Everything else stays in the file and is read by
range from the store thread when you scroll up to it. This is the plan in projbig85.md, built in the order it gave.

It's on by default and can be turned off: **Settings › Chats › "Keep only the newest part of very long chats in
memory"** (or `/long-chats off`). A chat counts as giant from 8 MB on disk, the same threshold as rounds 82–85.

## Measured (before → after)
The app check `dev/checks/chatwindow86.js` (opt-in `CHATWINDOW86=1`) on bigchat84's fixture (made up, fixed seed, never
real data). "Before" is the same check with the setting off (`window.CW86_OFF = 1`): that is the code path from before
this round (the chat held whole), run on the same build. A shared 4-CPU box with other streams running: a few ms of
noise per task.

| Step (one 63 MB, 6,000-message chat) | Before: window's longest task / heap | After |
|---|---|---|
| Window heap with the giant chat open (after a GC) | **+60 MB** | **+5.5 MB** |
| Open, from the click until the end is drawn | no task ≥ 50 ms (bigchat84's slices) · 2.2 s | no task ≥ 50 ms · 1.6 s |
| Scroll to the very top (message #1 drawn) | 50 ms task · 120 ms | none · 120 ms (one range of 20 read) |
| Find a word only in #30 (Alt+F) | **140–143 ms** | 53–75 ms (the store thread finds it; what's left is the woken block's first layout, chatwindow72's) |
| Jump to #100 | none–50 ms | 52 ms (the same layout) |
| Send, the reply arrives | 56–65 ms | none (2 saves by change) |
| A reaction on #2002 (never loaded) | none | none (its block read, saved by change) |
| Edit-from-here on an old message of yours | **200–214 ms** | none (its block and the new end read, cut with trunc) |
| /export json (file = the whole-chat way, byte for byte) | none · 0.7 s | none · 1.6 s (loaded whole first: 0.8 s) |
| … the heap after it | +60 MB | +7 MB once it's back in its window (a quiet minute later; the check does it at once) |
| Sync brings a changed version of the chat (let go, opened again) | **146 ms** + 57–68 ms · 2.4 s | none · 1.6 s |
| Window heap at the end of the check | +118 MB | +11 MB |

The main process never blocked ≥ 50 ms in any step, before or after (its longest stretch: 13–39 ms). The check
budgets 60 ms per task, except for find and jump (100 ms). Those two draw an older block in place, and that block's
first layout (`getBoundingClientRect` in chat-rest's anchor, profiled) takes 35–75 ms here on its own, with the setting
off too.

The store thread (`node dev/chatwindow86-test.js --bench`, the fixture's chat):
- open windowed: 267 ms the first time (the file cut once, one record per message made), 75 ms again. It sends the
  window 4.0 MB instead of 59 MB.
- a block of 20: 2 ms. A piece of 400 (load-all): 9 ms.
- find: 395 ms for the first query (the lowered bytes kept while you search), 76 ms for the next.
- the whole-chat numbers (continue lighter? / the history a message re-reads / the lighter history): 549 ms.
- the window's side of saving a new message: 2.3 ms windowed (its 300 loaded messages compared) instead of 34 ms (all 6,000).

## What's windowed
1. **Store thread** (`storework.js`), all in the order of that chat's saves:
   - `chatWinOpen`: its own fields, its last 300 messages and its pinned ones as bytes. One record per message: its
     height in the chat, its usage, and its small fields as a short text.
   - `chatRange`: messages `[from, to)` as bytes. The file is cut once per version, and the offsets are kept with
     its signature (size and time) in `bigs`, along with the records. A save by change keeps both up to date.
   - `chatFind`: find in the chat. It runs the window's own test on every message the lowered bytes point at.
   - `chatCalc`: the numbers that need the whole chat, worked out by the same pure code on the file:
     - autocompact's "continue lighter?" decision;
     - sendpreview's "history this message re-reads";
     - historylean's lighter history.
   - `chatDelta`: now has its **"truncate to n"** form. A shorter chat is written only with `trunc` (edit-from-here,
     retry, a cut). Without it, the change is refused and nothing is written.
2. **The access layer** (`chatwin-core.js`, pure; `chatwin.js`, lazy group `chatwin`, loaded when a giant chat opens):
   - `chat.messages` keeps the chat's **true length**.
   - A loaded message is itself.
   - An unloaded one reads as a **stub**. It gives only its small fields (role, time, usage, flags). Anything else
     (text, thinking, tools, things…) throws `NotLoaded`.
   - Old blocks are read when they wake (chat-rest.js). They are let go when they rest far away, unless one of their
     messages changed and isn't saved yet, or is pinned.
3. **Saving by change**: only loaded messages can change; an unloaded one is unchanged by definition. When the thread
   can't take a change (sync's guard wants the chat, another writer), the chat is loaded whole and saved whole, as before.
4. **Actions on an old message** load its block first: react, pin, bookmark, quote, edit. Edit-from-here and retry also
   load the new end (300 messages) and cut in place.
5. **Find** (Alt+F) asks the store thread, then wakes the block it lands in. **Jump to #k** wakes the block of k.
   **"Show all"** pages 300 more instead of drawing thousands.
6. Drawing (heights, day lines, pins, the header's token total) comes from the records. No stub is made for it.
7. withContext (the earlier conversation sent along) reads rows **from the end** until it has enough. It gives the same
   text as before (tested), so it never needs the older part.
8. Autocompact, sendpreview and historylean take their whole-chat numbers from the store thread (`chatCalc`). Until
   the answer is in, they offer and decide nothing. They never decide from a part of the chat.

## What loads the whole chat first (load-all, with a short "Loading the whole chat…" after 0.4 s)
- `/export` (one save dialog, then the same pieces as before: byte for byte).
- Branch, Duplicate this chat, Continue with…, chat stats, a second opinion, 🗜 compact / continue lighter.
- The handoff brief, "Send the whole chat instead" and chat_do `earlier`.
- `Native.loadWhole(id)`: every caller that reads every message's content.
- **Any chat command that reached an unloaded message**: it stopped with `NotLoaded` before changing anything, and
  `Commands.exec` runs it again once the chat is whole.
- Turning the setting off loads every windowed chat whole.

A chat loaded whole goes back to its window after a quiet minute. Messages that are drawn, pinned, or changed and not
saved yet stay loaded.

## Safety: "not loaded" is never "not there"
- An unloaded message can't pass for nothing. Every way of walking the whole chat for its content throws `NotLoaded`:
  `map` / `filter` / `for…of` over texts, `JSON.stringify`, `{ ...m }`, and `structuredClone` (so IPC can't carry it
  either). Nothing can save, sync, export, hand off or summarize a part as if it were the whole. A miss also starts
  loading the chat whole in the background, so trying again works.
- Writes it can't see are refused **before** they change anything:
  - a change to an unloaded message;
  - a write at index k while older unloaded messages lie after k (splice / sort / reverse);
  - a longer length with holes;
  - a stub written back.
- One refused array write marks the chat "poisoned" (an array method may have moved loaded messages first). Its saves
  stop, and it's read again from disk once nothing is answering in it.
- A list someone replaced with stubs inside is never saved.
- A store read failure is an error, never an empty answer, for open, range, find and calc. In the window, the action
  stops with "can't be read just now; nothing was changed".
- Deletes still go to the Trash. Only our own cache memory is let go. Nothing is uploaded.
- **The scan** `dev/chatwin-scan.js` (unit:chatwin-scan) holds the code to this:
  - every shipped file that reads `.messages` is listed with how it was checked: windowed / load-all / thread /
    throws / not-chat, and its count of such lines. A new reading fails until someone looks at it;
  - no line may turn a failed read of messages into an empty answer.

## The audit (every module reading `chat.messages`)
95 files. The full list, with a reason each, is in `dev/chatwin-scan.js`.
- **Converted this round:**
  - native.js: drawing, saving, find / jump, actions, withContext;
  - chat-rest.js, chat-ux.js (find), autocompact.js, historylean.js, sendpreview.js, handoff.js, chat-cmds.js (export),
    commands.js (run again);
  - director-task.js (the last three, from the end), chat-reach.js (from the end; loaded only), chat-media.js
    (`findLast`), aiundo.js.
- **Already windowed-safe:** ≈ 40 modules that read the end, roles, times, usage or counts. For example: router,
  routerlearn, missions, makes, chat-memory, safetynet, access, activity, chat-cost's counts, voice, a11y, engine-health.
- **Throws (safe, rarely reached):** explicit actions that read every older text:
  - chat-things' "Made here" panel, chat-refs' @file list, nodes-code, board-plus' pictures, devreport, chatsafe's
    "Show earlier", swarmlean's estimate, offline's "pick up with the other AI";
  - visual feedback, routine-feedback;
  - Codex's quest journal / review and astra's /handoff lines (commands run again whole).
- **Not a live chat:** the main process and the threads (files), versions, sync's two versions, imports, project
  bundles, pure cores (their callers are listed).

## Tested
- `dev/chatwindow86-test.js`, **86 checks**:
  - **the array:** every whole-chat walk / copy / clone throws; writes it can't see are refused and nothing moves;
    lookups by role / usage / pins = the whole chat;
  - **its records:** the heights = native.js `guessH` at 400 / 760 / 1300 px;
  - **the store thread:** `chatWinOpen` / `chatRange` / `chatFind` (13 queries: case, Kelvin K, İ, quotes,
    backslashes, accents, thinking, a compact request left out) / `chatCalc` (= autocompact / sendpreview /
    historylean on the whole chat). A damaged or missing file gives an error, never an empty answer;
  - **saves, byte for byte against a whole save and against the old saving by change:**
    - a new exchange; a reaction on an old message; pin / bookmark old and new;
    - edit-from-here on an old message; retry; a message deleted at the end; its own fields;
    - a random walk of 40 changes;
    - a shorter chat without trunc is refused;
  - **withContext's rows from the end** = joining them all.
- `dev/chatwin-scan.js`: 95 files audited, 0 problems.
- App (under `flock /tmp/hearth-run.lock`): chatwindow86 (`CHATWINDOW86=1`), chatwindow72, bigchat82 (`BIGCHAT82=1`),
  versions75, sync72, bigchat84 (`BIGCHAT84=1`), projbig85 (`PROJBIG85=1`), lazy: all pass. (sync72 failed once
  while three heavy checks ran beside it, and passed when run again.)
- Unit: chatwindow86-test, chatwin-scan, bigchat82-test, bigchat84-test, store-thread-test, autocompact-test,
  recall-test, historylean-test, handoff-test, context-test, sendpreview-test, datasafe-scan, winmac-test,
  errorcalm-scan, storeack-scan, chatsafe-scan, boot-test (first screen 1808 / 1810 KB, 71 scripts),
  lazymanifest-test: all pass.

## Files
- **New:**
  - `chatwin-core.js` (pure: records, the array, stubs, the delta, `sameSaved`, find's test);
  - `chatwin.js` (lazy group `chatwin`);
  - `dev/chatwindow86-test.js`, `dev/chatwin-scan.js`, `dev/checks/chatwindow86.js`, this file.
- **Changed, marked `(round 86, chatwindow86)`:**
  - `storework.js`: ops chatWinOpen / chatRange / chatFind / chatCalc; chatDelta's trunc; records kept up to date.
  - `store.js`: openChat's `win`, `chatWin`, trunc passed on. `main.js` / `preload.js`: one channel `chats:win`, and
    `chats:open`'s options.
  - `native.js`, about 3 KB:
    - the windowed open, saving and record-based heights / pins / total;
    - actions loading their block, cut, load-all where needed;
    - `Native.loadWhole`, `Native.isWin`, withContext from the end.
  - `chat-rest.js`, `chat-ux.js`, `commands.js`, `chat-cmds.js` (`/long-chats`; export whole first),
    `settings-find.js` (the row), `autocompact.js`, `historylean.js`, `sendpreview.js`, `handoff.js`,
    `director-task.js`, `chat-reach.js`, `chat-media.js`, `aiundo.js`.
  - `lazy-data.js` / `lazy-meta.js` / `index.html` (the new group; `node dev/lazy-manifest.js`), `dev/run-checks.js`.
  - `dev/bigchat82-delta.js` (its shorter saves say trunc). `dev/checks/bigchat82.js` and `bigchat84.js` turn the
    setting off: they cover the whole-chat way.

## For Codex
Nothing in Codex's files changed (no `quest-*`, `projects*`, `project-workspace*`, `sync-engine.js`, `cloud-files.js`,
`workbench-*`, `creative-vst*`, `astra*`, `engine-watch`). Things to know:
- `Native.load(id)` / `Native.current` / `Native.chatOf` return the chat as the window holds it. For a giant chat
  (≥ 8 MB on disk) that is **windowed**: `messages.length` is the true count, the end is loaded, and an older message
  is a stub with its small fields only. Its `text` / `thinking` / `tools`… throw `NotLoaded`. Lookups by role, time,
  usage and the last messages work as before.
- If your code reads every message's content, call `await Native.loadWhole(id)` first (it returns the same chat
  object, loaded whole). `Native.isWin(chat)` tells whether a chat is windowed.
- A command (`Commands.exec`) that hits `NotLoaded` is run again by itself once the chat is whole.
- Audited as they are, with no edit needed:
  - astra.js: pushes, collab lookups, and withContext (now read from the end). Its /handoff lines throw, and the
    command then runs again whole.
  - project-workspace.js: `Native.load` before selectChat (only the chat's own fields).
  - quest-chat / quest-proof: the last messages. quest-journal / quest-review: a picked old message throws.

## What's left
- **Thread time:** each reply in a giant chat costs the store thread ≈ 0.5–1 s for the whole-chat numbers (`chatCalc`
  parses the file). Nothing waits on it but that thread's queue. Making those numbers incremental (kept per message,
  like the records) would cut it to a few ms.
- A width change doesn't remake the unloaded messages' heights. They keep the guess for the width they opened at, and
  each block is measured when it wakes (where you're reading stays put).
- After a load-all (export, branch…) the chat is held whole for a quiet minute before it goes back to its window.
- "Throws" modules (above) work on a giant chat on the second try. They could read ranges instead. None of them is on
  the open / scroll / send path.
- Sync's arrival of a giant chat that's answering at that moment can't let it go (as before). Its next save goes whole
  through sync's guard (loaded whole first).
- A chat opened whole (setting off, or one under 8 MB that grew) becomes windowed the next time it opens, not while
  it's open.
- Two context paths take the usual "earlier conversation" (withContext, read from the end) when what they need isn't
  ready. Meanwhile the chat loads whole, so the next message has it:
  - the engine switches in a windowed chat: the handoff brief (`Handoff.attachNow`) needs every message, so it is
    skipped that once;
  - a lighter start whose lighter history the store thread hasn't answered yet.

## For the patch notes
- **Very long chats are much lighter now.** A chat with thousands of messages keeps only its newest part ready. Older
  messages stay on disk and load the moment you scroll up to them. In a 6,000-message test chat, Hearth's memory for
  that chat dropped from about 60 MB to about 5 MB.
- Finding a word in such a chat, editing an older message of yours, and a change arriving from your other computer no
  longer make the app hitch (they used to freeze it for about 0.15–0.2 s).
- Reacting to, pinning or quoting an old message, jumping to a message number and "Show all" still work: the part you
  need loads first. Exporting, branching or summarizing a very long chat briefly says "Loading the whole chat…".
- Nothing is ever treated as missing. If an older part can't be read at that moment, Hearth says so and changes
  nothing. Saving, sync, export and summaries always use the whole chat.
- You can switch it off in **Settings › Chats › "Keep only the newest part of very long chats in memory"**.
