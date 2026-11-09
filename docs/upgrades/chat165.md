# Round 165 · chat165: long chats stay light

The owner's chats get long: AI working sessions with tool steps, code blocks and pictures. This round built a long
working session (500 and 2,000 turns) and ~300 chats in a throwaway data folder, measured what a long chat costs, and
cut what was left. Zero visible change was the rule; scroll position and "stick to the bottom while it streams" behave
as before.

## How it was measured

- **`dev/checks/chat165.js`** with `window.C165_REPORT = 1; window.C165_SIZES = [500, 2000]` (report mode, both sizes):
  `node dev/smoke.js [--app <copy>] --fake-engines --check-timeout 1400000 --lib dev/checks/smooth-lib.js --eval "…"
  --script dev/checks/chat165.js`. A turn = one message (yours or the AI's). The made-up session: every reply Markdown
  with lists, inline code and links; a code block in every 4th reply (every 3rd of those 60 lines, folded), a table in
  every 7th, a Markdown picture (`img.hearth.test`, answered late like a slow network) in every 11th, a long answer in
  every 9th; thinking on every 6th, a folded tool-step card (5 steps) on every 3rd, a Lab screenshot card on every 15th,
  a made picture on every 20th; a picture attached to every 50th question. Then ~300 two-message chats, placed in the
  open project the way an import is (the chats list shows the open project's).
- Per size: **open** (its row clicked → messages drawn + next frame; main-thread task time over the next 1.5 s), DOM
  nodes in the chat and elements in the page (not counting the chats kept ready out of sight, round 45), JS heap after
  a GC, the window renderer's working set / private memory (`power:test { metrics, mem }`); **scroll** (50 wheel turns
  of 500 px up through ~25 screens: the window's main-thread task time and own CPU from a light trace, style / layout,
  rAF frame gaps, long tasks judged by their own CPU); **find** (Alt+F, a word only in turn #7, resting); **jump**
  (`Native.jumpTo` turn #31); **stream** (a 40 K-character reply from the fake engine into the long chat: style /
  layout / script / task ms per paint, elements styled and objects laid out per paint from a detail trace, every DOM
  change outside the live turn, whether it stayed at the bottom), against the same reply in an 8-turn chat; the
  **Forgeheart** look (the owner's: a ground of gradients behind the chat) on the 2,000-turn chat; the **chats list**
  with 300 chats (rows drawn, a full redraw).
- Before = a copy of 89ce9538 (round 164's merge) through `--app`, the same check file; after = this branch; back to
  back under the shared check lock. This box: 4 shared CPUs, software GL (the GPU process is SwiftShader), Xvfb at
  1480 × 940, device pixel ratio 1.

## What a long chat cost (before)

Most of the long-chat work was already done by earlier rounds and held up: a chat opens on its last 40 turns and the
earlier ones **rest** as one spacer per 20 (chatwindow72), off-screen turns skip style / layout / paint
(`content-visibility`, chatperf), the streaming reply freezes what it finished and only re-renders its last paragraph
(streamrender), pictures are `loading=lazy` + `decoding=async` with their size reserved (chatsteady73), the Markdown
cache and the picture-size cache are capped (600 replies / 6 M characters; 300 sizes), and the chats list draws only
the rows on screen (chatlistfast). Measured here:

| | 500 turns | 2,000 turns |
|---|---:|---:|
| Open (click → drawn) | 71 ms | 209 ms (89–209 across runs) |
| Turns / DOM nodes in the chat | 40 / 1,861 | 40 / 1,936 |
| Elements in the page (without the kept chats) | 2,913 | 3,001 |
| JS heap / renderer working set | 13.9 MB / 203 MB | 18.2 MB / 213 MB (the 2,000 messages themselves) |
| A streamed piece: style / layout / task ms (8-turn chat: 1.0 / 1.1 / 10.1) | 1.5 / 1.3 / 8.8 | 1.8 / 0.9 / 9.2 |
| …elements styled / objects laid out per piece | 25 / 17 | 27 / 18 |
| …DOM changes outside the live turn | 0 | 0 |
| Find a resting turn / jump to one | 410 / 192 ms | 412 / 58 ms |
| 300 chats in the list: rows drawn / a redraw | 40 / 1.5 ms | |

So the size of a chat already cost almost nothing per piece, at open or in memory. What was left:

1. **Scrolling a chat ran on the window's main thread.** Chromium keeps a scroll box whose background isn't opaque on
   the main thread, so its text keeps subpixel antialiasing; the chat list is transparent (the surface's colour shows
   through). Every wheel step was handled, painted and committed by the window's thread: 2,221–2,740 ms of main-thread
   task time for 50 wheel turns here, **8–11 tasks over 50 ms** (the commit waiting on the compositor), and the wheel
   waited for that thread whenever it was busy (a block of older turns waking, a reply streaming). Each streamed piece
   that scrolled the chat to its end repainted the whole visible chat for the same reason.
2. **Every drawn turn kept a second copy of its whole text in the DOM** (`data-raw`, read by Copy, Read aloud and the
   fold's word count): 36,858–37,186 characters in this chat's 40 drawn turns, atomized and hashed by the page, and
   copied again on every redraw (a pasted log or file: the whole of it).
3. A small one: the thumbnail of a reply's non-picture thing (chat-things.js) decoded on the main thread.

## What changed

1. **A chat over a plain colour scrolls on the compositor** (native.js `solidBack`, chatcore.css). When the list is
   transparent and the first thing painted under it is an ancestor's opaque plain colour, the list takes that exact
   colour (a `--solid-back` variable read by a zero-specificity rule, so any look that paints the list itself wins).
   The same pixels, but now an opaque box Chromium scrolls on the compositor with subpixel text kept: the wheel no
   longer waits for the window's thread, and a streamed piece repaints only what changed. Not when anything else could
   show through: a picture or gradient, a translucent colour, a filter or blend, an inset shadow, a pseudo-element or an
   earlier sibling drawn under the chat, a rounded corner it could spill past (`list.backWhy` says why). Judged again
   when the look changes (the root's style / look / skin / scheme / Lite attributes, the theme sheet, a style sheet
   arriving), when a chat's list is shown, and when the view moves (a project's tools); nothing is written when the
   colour is the same. The check compares a screenshot of the chat with and without it: 84 of 806,520 pixels differ, by
   at most 4 of 255 levels (the same chat drawn in its own layer); invisible. In a 2,000-turn chat without tables and
   attached pictures: 0 pixels differ.
2. **No message text in `data-raw`**: a drawn turn keeps a plain reference to the chat's own string (`node.rawText`);
   Copy, Copy error, Read aloud, the fold's word count and errorcalm.js read it through `Native.rawOf(node)` (an old
   node with `data-raw` still answers).
3. The non-picture thing's thumbnail decodes off the main thread (`decoding=async`).

## Before → after

| | Before | After |
|---|---:|---:|
| **Scrolling** a 500 / 2,000-turn chat (50 wheel turns): window main-thread task time | 2,740 / 2,221 ms | **789 / 1,106 ms** (−71 % / −50 %) |
| …the window's own CPU in it | 613 / 660 ms | 581 / 599 ms (−5 % / −9 %) |
| …tasks over 50 ms (longest) | 11 (303 ms) / 8 (216 ms) | **0 / 1** (297 ms on the wall clock, 3.9 ms of its own CPU) |
| …the chat scrolls on the compositor (its own layer) | no | **yes** (plain looks) |
| …rAF frames over 50 ms apart | 42 / 39 | 34 / 42 (the GPU process here: software GL) |
| Message text copied into `data-raw` (40 drawn turns) | 36,858 / 37,186 characters | **0** |
| A streamed piece in the 2,000-turn chat: style / layout / task ms | 1.8 / 0.9 / 9.2 | 2.5 / 0.9 / 11.4 (noise: 8-turn chat 1.0 / 0.9 / 9.5) |
| …paint over 3 s of streaming | 23 ms | 25 ms |
| …DOM changes outside the live turn · stayed at the bottom | 0 · 25 / 25 | 0 · 25 / 25 |
| Open 500 / 2,000 turns | 71 / 209 ms | 76 / 168 ms (same within noise) |
| DOM nodes in the chat · elements in the page | 1,861 · 2,913 / 1,936 · 3,001 | same |
| JS heap · renderer working set | 13.9 · 203 / 18.2 · 213 MB | 14.1 · 203 / 18.5 · 222 MB (same within noise) |
| Find a resting turn · jump to one | 410 · 192 / 412 · 58 ms | 411 · 194 / 413 · 59 ms |
| Forgeheart, 2,000 turns: scroll task time / own CPU | 7,415 / 665 ms | 7,654 / 682 ms (unchanged: left as it was, see below) |
| 300 chats: rows drawn · a redraw | 40 · 1.5 ms | 40 · 1.4 ms |

The wall-clock gain on this box is mostly the window's thread no longer blocking on the compositor's commit for every
scrolled frame (software GL makes that wait long); the window's own CPU while scrolling barely moves (style and layout
of the older turns waking). On a real graphics card the waits are short, and what stays is the point: the wheel is
handled by the compositor, so a busy moment on the window's thread no longer holds the scroll, and a streamed piece no
longer repaints the visible chat.

## Seen, not changed

- **The Forgeheart looks keep main-thread scrolling.** Their ground is gradients on the body (warm light from above,
  the grid). The list could paint the same gradients itself (tried: same pixels within 3 levels), but Chromium can't put
  a background that stays put into the scrolled layer, so it still refuses composited scrolling unless the text gives
  up subpixel antialiasing (`will-change: scroll-position`: −65 % main-thread time here, but grayscale text on a 1×
  screen: a visible change, so not done). On a screen at 150 % or more Chromium composites the scroll anyway. Lite mode,
  or a plain look, gets the win. An owner's choice for later: "smoother scrolling (text antialiased in grey)".
- On this box the Forgeheart scroll waits ~10× longer on the GPU process than a plain look (7.4 s vs 0.8–1.1 s of task
  time for the same CPU, ~0.66 s): the look's paint (clip-paths, gradients, the full-window scanline overlay) rastered
  by SwiftShader. On a real graphics card that is small; nothing in Hearth's own code.
- A streamed piece costs ~1–2.5 ms of style and ~1 ms of layout whatever the chat's length (the same in an 8-turn
  chat): the live turn's own subtree. The rest of the ~10 ms per piece here is the frame's paint / commit and the
  app-wide work while a reply runs (progress, the meter, the live panel).
- A 2,000-turn chat's messages themselves stay in the window's memory (≈ 2–4 MB here); a giant chat (≥ 8 MB on disk)
  already opens windowed (chatwindow86).

## Check

`dev/checks/chat165.js` (`node dev/run-checks.js --exact chat165`; group `chat165`): the 2,000-turn session opens
within 1.5 s with ≤ 5,000 DOM nodes in the chat and ≤ 6,000 elements in the page; wheeling up ~25 screens has no task
over 50 ms of the window's own CPU (load-aware: long only on the wall clock is "can't tell"), in the plain look and in
Forgeheart; a streamed reply touches only the last turn (≤ 2 one-off changes elsewhere), costs a short chat's style /
layout per piece (×1.6 + 1.5 ms) and stays at the bottom; find reaches a resting turn and shows it; a jump shows its
turn; every drawn picture is lazy + async; a turn's copy text is the message's and nothing sits in `data-raw`; over a
plain colour the chat scrolls on the compositor (its own layer) with the same pixels (≤ 0.05 % of them off by ≤ 8
levels); Forgeheart is left as it was; 300 chats draw ≤ 160 rows and redraw in ≤ 40 ms. On round 164 it fails the
compositor and `data-raw` steps.

## For Codex

No Codex-owned file was edited. Nothing in them reads `data-raw`; if any future code wants a drawn message's text,
`Native.rawOf(node)` is the reader.
