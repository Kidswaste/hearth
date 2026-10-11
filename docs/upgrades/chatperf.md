# Chatperf (round 16): chats that stream, scroll and switch lighter

You asked to focus on framerate and making things lightweight. This pass is the chats: the live reply, long chats,
switching, the composer, the "/" menu, the chats list, pictures and videos in replies, toasts. No feature was removed.

Measured before → after (headless, same machine, back-to-back runs of the new `dev/checks/chatperf.js`; the machine
was shared with other agents, so main-thread milliseconds are the reliable numbers, not fps):

| What | Before | After |
|---|---|---|
| One whole streamed reply (thinking + table + code + 60 paragraphs): script time | 760 ms | 387 ms |
| … style + layout during that reply | 204 + 438 ms | 66 + 99 ms |
| A reply ending in a 300-message chat: messages re-added to the list | 604 | 4 |
| … main-thread time for that send + reply | 5.8 s | 0.35 s |
| Switching between a 300-message chat and a short one (median / worst) | 988 / 3086 ms | 290 / 557 ms |
| … main-thread time for 8 switches | 7.5 s | 1.3 s |
| Opening a long chat (last 40 messages) | 632 ms | 230 ms |
| "↑ Show earlier" on 300 messages | 1514 ms | 1103 ms |
| JS heap with the 300-message chat open (after GC) | 17.9 MB | 8.5 MB |
| Typing 80 characters in the composer: DOM changes | 320 | 7 |
| … layouts while typing | 171 | 80 |
| DOM nodes per message (300 messages shown) | 16 | 15 |

Earlier pair on a quieter moment: whole-reply script 613 → 326 ms, switching median 394 → 56 ms, send in a long chat
776 → 167 ms main thread. `smooth-chat` switching: 6112 → 3635 laid-out objects, layout 96 → 70 ms. Wheel-scrolling
through a never-seen part of a 300-message chat now draws messages as they arrive (more, smaller layouts; paint time
678 → 244 ms in the same run) instead of laying out all 300 up front.

## Streaming
1. The live reply freezes what it has finished: everything up to its last blank line is drawn once and never parsed or compared again; only the paragraph being written is re-rendered (a long answer no longer gets slower to stream the longer it gets).
2. A code block or a $$ formula still being written stays live as one piece and freezes when it closes, so it never flickers between half-states.
3. The streamed reply looks exactly like the saved one (checked piece by piece against a full render in `chatperf`).
4. The growing reply no longer fills the Markdown cache with every intermediate state (16 a second): the cache keeps finished messages, which re-open instantly.
5. The "…" dots while it starts stay put instead of being removed and re-added on every paint.
6. The live reply keeps its node across redraws of its chat (its progress bar, cards and status line stay where they are).

## Long chats
7. Messages that didn't change keep their DOM: a reply ending, a reaction, a pin or a bookmark redraws only the messages it touched, not all of them.
8. Switching back to one of your last 3 chats reuses what it showed (instant, and folds / open thinking blocks stay as you left them).
9. Messages out of view skip style, layout and paint until you scroll to them (the browser keeps their real size; the last 8 are always real, so a chat still opens exactly at its end).
10. Long replies are measured for auto-fold only when they come near the screen (it used to force a layout of every reply when a chat opened or "Show earlier" ran).
11. Folded tool steps ("⚙ 3 steps") build their list the first time you open them.
12. Pictures in replies, the agent's "show" cards and board-eye thumbnails decode off the main thread and load when near the screen.
13. Videos in replies load only when they come near the screen (opening a long chat no longer reads every video's header) and pause when you scroll them away.
14. A picture or video in a reply reserves its box once its size is known, so scrolling back past it doesn't jump.
15. Board-eye thumbnails and Pinterest buttons in replies share one listener instead of one each.

## Composer, header, "/" menu
16. Typing no longer rewrites the Send button, the counter or the header on every keystroke (only when they change: 320 → 7 DOM changes for 80 characters).
17. The message box only re-measures its height when it could change (a new line, a deletion), not on every letter.
18. The "/" menu uses one listener for all its rows and ☆ pins (it was rebuilt with one per row on every keystroke).
19. The chat header (title, tokens, context meter, model list, access badge, style and queue chips) is written only where something changed.

## Chats list, toasts, progress
20. The chats list handles clicks, right-clicks and keys with one listener for the whole list (three per row before).
21. A burst of saves (sending, a reply landing, files found) redraws the chats list once.
22. In a long group, rows past the first dozen skip layout and paint while scrolled out of view.
23. The same toast again while it shows counts up ("Saved ×3") instead of stacking copies.
24. At most 5 toasts show at once; the oldest goes first, toasts with an Undo stay longest.
25. Progress bars stop drawing while the window is hidden or minimised (the numbers keep counting; they catch up within a quarter second).

## For the checks
- `dev/checks/chatperf.js` (new): whole-reply CPU time, stream frames, a 300-message chat (nodes, heap, open, show all,
  wheel, switch), a send in a long chat, typing, plus correctness: streamed Markdown = full render, folded steps fill
  when opened, list rows open / right-click, repeated toasts merge.
  `node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/chatperf.js`
- `Native.refresh()` (called by other files after they change something messages draw from) still redraws every
  message; Native's own redraws reuse unchanged ones.
