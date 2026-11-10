# Round 176 · keep176: the chats kept ready give their memory back when nobody needs them

Round 45 (chatswitch) keeps the last chats you looked at drawn in the page, parked out of sight
(`.messages.parked`, content-visibility: hidden), so switching back is instant. audit174 listed them as the third cost
outside the Lab: "DOM 2.1 K → 27 K nodes … the 3 chats kept ready, by design". This round lets them go when nobody is
going to switch back soon, and keeps switches instant while you work. The Lab, Scenes v2, the Lab's CSS and Codex's
files were not touched.

## Where they live

`native.js` `usePane / trimPanes / dropPane`: per chat window (`views`), `v.panes` maps chat id → its list, the one on
screen is `v.paneKey`; the others are parked, within `PANES` (the chat on screen + 3) and `PANE_NODES` (20 K elements).
With each kept list goes its node cache (`v.nodes`, used to rebuild it). The chat data itself (`chats`, capped at 12),
the draft (`store` `draft.<agent>.<chat>`), the unread line and the queue are separate and untouched by a release.

## What changed

1. **A parked list is let go** (`keepRelease`, through the existing `dropPane`) when
   - it has not been shown for **15 minutes** (one timer for the list that comes due first, `keepArm`; none while
     nothing is parked), or
   - Hearth has been **out of sight for 5 minutes** (hidden to the tray or minimised): every parked list, and the
     nodes made ahead for a chat pointed at in the list (prefetch).
   Never the chat on screen in any chat window (`v.paneKey`, also a docked chat or another AI's view), never one
   answering (`pending`: its live reply sits in that list). A chat that finishes answering while parked starts its quiet
   time then; one that finishes while Hearth has been away 5 min goes right after its last draw.
2. **The hidden signal is memtrimmain's** (`memtrimmain.js`, `preload.js`): besides round 154's trim at 30 s, the main
   process now sends a second, deep `mem:trim { deep }` at 5 min out of sight (once per time away; nothing while shown).
   The preload fires `hearth:mem-trim-deep` first (the page lets go of its kept lists in that event, synchronously),
   then the same `webFrame.clearCache()`, whose GC takes what was let go. The page can't ask for it (unchanged rule). A
   page-side timer from `visibilityState` (5 min + a few s) covers a window hidden without the main process knowing
   (occluded). Tests: `HEARTH_TRIM_DEEP_MS`, `localStorage 'chat.keepIdleMs'` / `'chat.keepHiddenMs'` (0 = never).
3. **Showing a released chat** draws it the way a chat not kept is drawn (its end first, round 45; the rest after),
   at the place every switched-to chat lands: its end, or its "New" line. That is also where a *kept* chat comes back
   to today (a switch puts you at the end; verified: a kept chat scrolled to its middle came back at its end), so
   nothing about where you land changes. The chat on screen keeps its exact scroll place through the whole time away.

## The on-screen chat as it grows (verified, no change)

chat165's windowing holds for a chat that grows during a session: 200 messages added at the end of a 400-turn chat on
screen (10 redraws), then wheeled to its top and back: 1,473 elements at open → 1,605 grown → 3,146 at its top (two
blocks awake) → 1,605 back at the end (40 drawn turns; the blocks left behind rest again). Bounded; nothing to cap.

## Measured

`dev/checks/keep176.js` on this box (4 shared CPUs, software GL, Xvfb 1480 × 940): 9 chats of 400 turns (audit166's
fixture: Markdown, code, tables, pictures, tool steps), 6 opened in turn, one answering a reply, drafts, one scrolled
up; then Hearth hidden past the deep trim (20 s in the check). The same run with `window.K176_OFF = 1` (nothing let go,
round 154's trim only) is the "before". Each after a forced GC (the deep trim's own GC gave the same numbers).

| | Session, shown | Hidden, before (trim only) | Hidden, this round |
|---|---:|---:|---:|
| DOM nodes (`Performance.getMetrics`) | 20,216 | 20,216 | **9,431** (−53 %) |
| Elements in the page | 6,974 | 6,974 | **2,552** |
| Elements in parked lists | 4,419 | 4,419 | **0** |
| JS heap | 14.5 MB | 14.5 MB | 14.4 MB |
| Window renderer, private / working set | 116 / 202 MB | 91 / 177 MB | **89 / 175 MB** |
| All processes (working set) | 686 MB | 651 MB | 652 MB |

Honest size: the nodes halve, the process gives back 2–3 MB more than round 154's trim already did. A parked list is
mostly DOM (≈ 200 bytes a node): content-visibility: hidden keeps no raster or GPU memory for it, and its decoded
pictures and caches were already let go by the 30 s trim. audit174's "+31 MB over a session" is mostly what that trim
returns when hidden; shown, it is what the chat on screen and Chromium's caches hold.

**The first switch back** (3 released chats vs 3 chats never opened, in turn, medians; the window's main-thread task
ms over the switch, the graphics process' CPU, wall time to the whole chat drawn):

| Switch to | First message on screen | Whole chat drawn | Main-thread task | GPU process |
|---|---:|---:|---:|---:|
| a chat opened afresh | 27 ms | 353 ms | 82 ms | 2,410 ms |
| **a released chat** | 48 ms | 234 ms | 80 ms | 2,320 ms |
| a kept chat (for reference) | | | 25 ms | 1,285 ms |

A released chat costs what an afresh one costs (its Markdown is still cached, so it draws its end with full Markdown
at once: a little later first paint, done sooner). Kept chats while you work: unchanged.

## Also

`dev/checks/bigscreen.js` / `bigscreen-hidpi.js` left `/tmp/hearth-bigscreen` (≈ 4 MB of pictures) behind: the lib now
removes it at the end (`smoke({ tmpClean })`, a new harness call that removes only a `hearth-*` folder right in the
temp folder); `window.BS_KEEP = 1` keeps the pictures.

## Check

`dev/checks/keep176.js` (`node dev/run-checks.js --exact keep176`, group `keep176`; `HEARTH_TRIM_DEEP_MS = 20000`):
idle (a list unseen past `chat.keepIdleMs` = 10 s goes, one parked a moment ago and the one on screen stay) · never
(letting go keeps the chat on screen and the one answering; its reply ends whole) · hidden (the deep trim comes, every
parked list goes, ≥ 40 % fewer nodes, the window's memory lower) · kept (the chat on screen: the same list at the same
scroll place, its draft; a released chat: its draft, whole at its end) · switch (released ≤ 125 % + 60 ms of afresh) ·
grow (≤ 2× its nodes at open).

Final run (`--exact keep176 switch170 chat165 mem154 chatcore chat-stream chatkeep fastboot playfix unit:boot-test
unit:lazymanifest-test chatswitch memory48 idlecpu bigscreen`): **15 / 15 passed** in 25 min (keep176 124 s, switch170
339 s, chat165 98 s, mem154 92 s, chatcore 21 s, chat-stream 12 s, chatkeep 96 s, fastboot 15 s, playfix 62 s,
boot-test 1 s, lazymanifest-test 32 s, chatswitch 52 s, memory48 212 s, idlecpu 300 s, bigscreen 71 s); no
`/tmp/hearth-*` folder left (bigscreen's included). `node dev/whatsnew-test.js`: 49 passed. `node dev/lazy-manifest.js
--check`: clean; `node dev/trim-weights.js`: sizes unchanged; boot budget: 48 scripts / 1,065 KB of code, 20 sheets /
364 KB (budget 50 / 1,072 / 20 / 375). origin/main and origin/claude/intelligent-galileo-yaiqem had nothing new to merge
(both at b6438059, round 175's merge).

## For the Lab's owner

Nothing: no Lab file touched. The Lab window also gets the deep trim's `hearth:mem-trim-deep` (it shares preload.js);
nothing there listens to it, so it is only the same `clearCache()` once more, at 5 min hidden.

## For Codex

No Codex-owned file was edited.
