# Chatsteady73 (round 73): long chats climb without jumping, clicks stop paying for the usage store

Round 72 made long chats light (older messages "rest" and wake as you scroll up), but climbing a 900-message chat
still made what you were reading jump 0–4 times by a few hundred px, and every click on a profile with a year of use
paid ≈ 25–70 ms, 3 s later, to save the whole feature-usage store (≈ 840–900 KB). Both are fixed here, plus the
smaller per-click costs found on the heavy profile.

## Measured before → after

Same machine, back to back (headless Electron, software GL, a shared 4-CPU box). "Before" = main 3790ef2.

**A 900-message chat climbed to the top** (`dev/checks/chatwindow72.js`, 180 wheel turns):

| What | Before (2 runs) | After (4 runs) |
|---|---|---|
| Content jumps where you stopped | 4, 3 (703 px, −448 px, 1,500 px…) | **0, 0, 0, 0** |
| Frame rate while climbing | 19 fps | 32 fps |
| Climb main-thread tasks / style / layout | 12.3–13.1 s / 1.6–1.7 s / 0.9 s | 11.7 s / 1.5 s / 0.7 s |
| Peak elements in the list | 4,143 | 4,142 |
| A reply in the long chat: messages re-added | 3 | 3 |

**Clicks and keys in a long chat on the heavy profile** (`dev/checks/chatsteady73.js`, new: dev/bigprofile.js's
1,500 chats, 120 long, a year of usage). "After" = the window's CPU in the 3.5 s after the click:

| Action | Before | After |
|---|---|---|
| Saving the usage store (the window's own time) | 23–32 ms, 3 s after every click | **0.3 ms**, once a minute |
| Thinking block shut → after | 57 ms (30 ms of it the usage save) | 14 ms |
| Tool steps opened → after | 45 ms | 18 ms |
| A message's ⋯ menu → after | 65 ms | 7 ms |
| Copy a reply → after | 33 ms | 21 ms |
| Click in the message box → after | 57 ms | 31 ms |
| The chat's ⋯ (AI setup) shut → after | 45 ms | 13 ms |
| Another long chat from the list → after | 67–76 ms | 61–62 ms (drawing the chat) |
| Slowest key while typing (handlers) | 3 ms | 4 ms |

The main process: merging a minute of clicks into the year-sized store takes ≈ 4 ms (≈ 50 ms the first time, when it
reads the file); before, every save sent ≈ 840 KB over IPC and the main side parsed it.

## What changed

### Long chats: no more jumps on the way up
1. **Messages that wake are drawn at their real size.** Older messages off screen were laid out at a 180 px guess
   (`content-visibility: auto`) until they came near, and the one at the top of the view then grew or shrank under
   your eyes: that, not the pictures, made the 703 px / −448 px jumps. A woken block is drawn for real once, then
   goes back to that rule, which now remembers its true size (`chat-rest.js` `wake()`).
2. **Pictures and videos keep their box before they load.** A reply's big pictures / videos, Lab screenshots and
   pictures in replies are measured once before their block wakes (≤ 0.6 s, alongside its Markdown) and their
   width × height is kept on the message (`things[].w/h`, `shows[].w/h`, saved with the chat) and in the sizes
   Hearth remembers between sessions (`chat.imgSizes`). A video was drawn 2:1 until its first frame, a Lab screenshot
   0 px tall until it loaded.
3. **What you opened stays open.** A thinking block or a tool-steps list you opened (or shut) keeps that state when
   its message rests and wakes again.
4. A size learned when a picture loads no longer redraws its message (it re-added 2 messages on the next reply).

### Clicks: the usage store
5. **The feature-usage store is saved by what changed, once a minute** (and when the window hides, reloads or
   closes). Each click notes a few `[op, path, value]` changes (`inc` / `max` / `def` / `set` / `del`); the main side
   applies them to the file (`kv:merge`, `store.js mergeKV`) and saves it as before (the store thread, its `.prev`
   copy, sync's merge, held files). What is recorded is exactly the same; a missing or unreadable file makes the
   window send the whole store, as before.
6. Counts the other computer added (through sync) are kept even better than before: the window only adds its own.
7. The main side keeps the store it last merged while nobody else changed it, so a year of use isn't parsed again
   every minute (≈ 50 → 4 ms).
8. The "how hot is this button" tiers (your top 12) are worked out again only after new uses, at most every 30 s:
   sorting 4,000 controls ran after every click and every change on screen (≈ 2.5 ms each).

## Where it lives
- `chat-rest.js`: `mediaOf` / `measure` (sizes before a wake), `keepOpen` / `reopen` (open panels), the real-size
  wake. `native.js`: `Native.mediaSize` / `Native.noteSize`, `showCard` sizes, `msgSig` skips media sizes,
  `_rest.fillFold`. `chat-media.js`: hero sizes from `t.w/h` or the remembered size; `ChatMedia.urlOf`.
- `usage.js` (`note`, `flush`, `tiers`), `store.js` (`applyOps`, `mergeKV`), `main.js` (`kv:merge`), `preload.js`
  (`hub.kvMerge`). Meter and usage records unchanged (coordinated: nothing `Usage` records changed).
- First screen: 2,045 / 2,050 KB (+2 KB), stylesheets unchanged.

## Checks
- `dev/checks/chatwindow72.js`: jumps budget **0** (was 4). A whole wheel turn applied late (the page busy waking a
  block: the input waited) moves the view by exactly that turn, by your own scroll: counted apart as `lateWheels`
  (0 in every run here), not as content moving. A jump now lists what changed size above it.
- `dev/checks/chatsteady73.js` (new, opt-in `BIGPROFILE70=1`, ≈ 1.5 min): clicks / keys in a long chat on the heavy
  profile, each with its handlers' time, the time it waited, the next frame, and the window's CPU in the 3.5 s after
  it with the top functions; then the usage save. `window.CS_REPORT = 1` reports without failing.
- `dev/chatsteady73-test.js` (unit): a merge gives the same file as a whole save, other writers' counts stay,
  back-to-back merges, bad paths / prototype keys do nothing, missing / unreadable stores say so, the Lab's scenes
  refuse, a year-sized store merges in ≈ 50 ms then ≈ 4 ms.
- Group: `node dev/run-checks.js chatsteady73` (chatwindow72, chatsteady73, chatperf, chatswitch, lazy,
  unit:boot-test, unit:chatsteady73-test, unit:store-thread-test, unit:datasafe-scan, unit:sync-test, usagelimits,
  unit:usagelimits-test, habits, speed, declutter).

RESULTS_PLACEHOLDER

## For the patch notes
- Scrolling up a very long chat no longer jumps: messages appear above what you're reading at their real size,
  pictures and videos included.
- A thinking block or a list of tool steps you opened stays open when you scroll away and come back.
- Clicks are lighter on a profile with months of use: Hearth used to save its whole button-usage record (almost 1 MB)
  a few seconds after every click; now it saves only what changed, once a minute.
- A few small things that ran after every click (working out your most-used buttons) now run only when needed.
