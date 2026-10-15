# chatswitch (round 45): switching chats feels instant

You switch between a few chats all the time (the director chats, a Claude chat, Astra), and between the Lab and a
chat. This pass measured a click on a chat in the chats list all the way to the chat on screen — its messages drawn,
scrolled to the right place, the message box ready — for short chats, a 1,000-message chat, a chat full of code and
pictures, a chat you go back to, and the Lab → a chat → the Lab; then removed the real costs. Nothing looks or behaves
differently: same messages, same place (the end, or the "New" line), same draft, same keys.

## What was wrong (measured)
- **Going back to a chat redrew all of it.** Its message nodes were kept (round 16), but taken out of the page; put
  back, every one of them was styled and laid out again: for a chat with code ≈ 6,200 elements styled and ≈ 8,800 objects
  laid out on every switch back, most of it forced inside the frame's first script (the fold measure).
- **A chat opened afresh showed nothing until all 40 messages of its window were made**, waiting first for the Markdown
  worker (up to 0.4 s) when the replies were long.
- Small things inside the click: the empty message box was measured again (a layout of the page), the list's size was
  read before it changed (a second layout), the slide-in animation asked the page for its animations (a style pass),
  date lines and "↑ Show earlier" were made anew on every draw.
- A latent bug: a jump to an old message (recall's "show me", pins, /jump) made while another draw was on its way stayed
  waiting, and the next draw of *any* chat took it: the next chat you opened could jump to its own message #4.

## How it was measured
- `dev/checks/chatswitch.js` (new, in the `smooth` group and its own `chatswitch` group): real input (CDP: the pointer
  comes over the row, rests 140 ms like a hand, clicks), Forgeheart look, the Lab loaded, under a timeline trace. Kinds:
  a short chat (6 messages), a long one (1,000), one with code (36-line JS blocks), tables and pictures (60), each opened
  the first time, then switched back to twice; one more code chat opened after the pointer rested on it 0.9 s; the Lab →
  the chat → the Lab ×3. In-page probes after each frame mark: messages on screen, at their end, box focused with its
  draft, the whole window in.
- **The machine was very busy** (4 shared CPUs, load 20–36 the whole time, other agents' checks; software GL): wall times
  stretched 5–20× and moved ±100 % run to run. So `dev/trace-stats.js` now also reports the main thread's **own CPU
  time** (the trace's thread durations), counting only the input, frame and rendering tasks from the click on (not the
  Lab's and other features' timers / idle callbacks that ran in between), and per-file script CPU. The reliable numbers
  are the counts (elements styled, objects laid out) and the chat's own script CPU; CPU ms are given as ranges.
- Before = the starting commit (a3341cf) from a copy with the same dev tools, interleaved with the after runs: 2 before
  / 4 after with the final code (ranges = min–max).

## Numbers (before → after)
| Switch | Elements styled · objects laid out | Chat's own scripts (CPU) | Click → messages on screen (CPU) |
|---|---|---|---|
| **Back to the code + pictures chat** | 6,183–6,198 · 8,811–8,819 → **132–152 · 87–98** | 45.5–45.9 → **4.4–5.9 ms** | 92–109 → **33–43 ms** |
| **Back to the 1,000-message chat** | 620–626 · 612–618 → **181–209 · 137** | 11.5–13.5 → **4.3–5.2 ms** | 36–41 → **28–30 ms** |
| Back to the short chat | 266–268 · 256 → **111–153 · 77–79** | 3.2–3.3 → 3.7–5.5 ms | 26–29 → 22–32 ms |
| **First open, code + pictures** | 11,322–11,326 · 8,894–8,908 → **3,683–8,815 · 5,116–5,176** | 46.7–48.4 → **9.4–21.5 ms** | 53–213 → 38–111 ms |
| **First open, 1,000 messages** | 606–2,393 · 598–621 → 623–637 · 566–578 | 13 → 12–14.6 ms | 42–96 → **28–40 ms** |
| First open, short | 289–4,249 · 275–320 → 314–2,485 · 282–318 | 4.9–5.5 → 10.6–13.8 ms (made ready while pointed at) | 34–121 → 42–123 ms |
| First open after resting on it 0.9 s | 11,318 · 8,856 → 3,702–8,838 · 5,087–5,203 | 47–54 → **9.4–14 ms** | 228–294 → 95–264 ms |
| The Lab → a chat / a chat → the Lab | ≈ 4,400 · ≈ 100 each way → same | ≈ 0 → ≈ 0 | 80–130 → same |

- On screen at its end and the message box ready came in the same frame as the messages in every run, before and after.
- The rest of a fresh chat's window (32 earlier messages) slips in above 1–2 frames later, made 4 ms at a time.
- Memory, after everything: JS heap 19.6–20.7 → 20.7 MB; DOM elements 10,396 → 19,723, of which 9,324 in the kept lists
  of 4 chats (budget 20,000: the nodes of 3 chats were kept for switching back before too, out of the page).
- `chatswitch` budgets fail on the starting code (recent chats: elements styled / laid out, the worst kind, the chat's
  own scripts) and pass on this branch.

## Upgrades

### Going back to a chat
1. **The last few chats you looked at stay ready**: each keeps its own message list in the page, out of sight
   (content-visibility keeps its style, layout and place), and switching back only shows it again: ≈ 40× fewer elements
   styled for a chat with code, ≈ 4× fewer for a long one. Kept within a memory budget (the chat on screen + 3, at most
   20,000 elements in the hidden ones; the oldest go first; a chat that is answering keeps its list). `native.js`,
   `features.css`
2. **A chat in memory draws in the click's own frame** (it used to wait a turn for nothing). `native.js`
3. **Date lines and "↑ Show earlier" are kept with their chat** instead of being made again on every draw. `native.js`

### Opening a chat
4. **A chat opened for the first time shows its end at once**: the last 8 messages are made and shown first, the rest of
   its window comes in above a frame or two later, a few milliseconds at a time (no wait for the Markdown worker before
   the first frame). `native.js`
5. **Resting on a chat in the chats list (or reaching it with ↑ / ↓) gets it ready**: it is read from disk, its replies'
   Markdown is made on the worker, its messages are made while the window is idle, and the click puts them in. `native.js`,
   `panel.js`
6. **Pictures of a chat you're about to open are sized ahead** (fetched out of sight, their sizes remembered), so they
   hold their place from the first frame. `native.js`
7. **Less work inside the click**: an empty message box isn't measured again, the list's size is read only when a
   redraw must keep your place, the slide-in no longer makes the page work out its styles. `native.js`

### Fix
8. **A jump to an old message no longer lands in the next chat you open** (recall's "show me", pins, /jump made while
   the chat was still drawing), and once it has jumped, a picture loading further down no longer pulls the chat back to
   its end. `native.js`

**8 upgrades.**

### For the next measurer (dev, not counted)
- `dev/checks/chatswitch.js` (`sh dev/run-checks.sh chatswitch`, in `smooth`): the stretches above, budgets on counts,
  the chat's own script CPU and CPU to the first paint; what must stay right (the chat clicked is the one shown, its
  draft back, 6 / ~40 messages shown, ↑ Show earlier, jump to #4 lands and stays, code labels and pictures, no other
  chat's messages in the list). `window.CS_DETAIL = 1` prints where every switch spent its time.
- `dev/trace-stats.js`: per stretch `cpuMs`, `workCpu`, `workFg` (input → frame without other features' timers / idle
  callbacks), `longestCpu`, `filesCpu`, and `at`: the check's own `performance.mark('at:<what>')` marks, wall and CPU
  from the stretch's first input.
- `Native._test.kept()` (lists kept, elements in the hidden ones), `Native.prefetch(agentId, chatId)`.

## How it works (for the next stream)
- `v.list` is now **the list of the chat on screen**; each view has `v.panes` (chat id → `{ list }`, '' = no chat yet,
  most recent last) and `v.paneKey`. Read `Native.view(id).list` when you need it; don't keep it. The list's listeners
  (clicks, wheel, keys, scroll, drops, picture loads, fold toggles) sit on `.messages-wrap` and only act on the list on
  screen. Hidden lists have `.messages.parked`; a streaming reply in one isn't painted until it shows again.
- `render()`: `usePane()` picks the chat's list, `planOf()` says what the list shows (banners, date lines, message
  indexes), nodes come from the per-chat cache (`nodeFor`, as before). A list that must be filled draws the end first
  (`TAIL` = 8) and the rest in `drawLater()`; a kept list only changes what changed. Fold watching is per list.
- Prefetched nodes live in `v.preNodes` until the click (one chat per view), never in the page.
- Waiting jumps carry their chat (`v.jumpFor`).

## Measured, left as is
- **The Lab ↔ a chat** costs the same: ≈ 4,400 elements restyled each way are the Lab's own panels taking
  `visibility: hidden` / `visible` (an inherited property, so every element of the Lab is visited); the chat's part is
  ≈ 0 ms of script. Hiding the Lab differently (content-visibility) would stop it rendering for its directors in the
  background (round 17's rule) and is the Lab's lane.
- **A chat made ready while pointed at** saves the chat's own script time (47 → 11–14 ms CPU) but the click still has to
  style, lay out and paint its end (≈ 8,800 elements for the code chat): drawing it whole into a hidden list beforehand
  was tried and was *slower* (the click then styled everything at once, 16,000 elements); so only the nodes are made
  ahead.
- What other features do with new messages (a11y naming, command links in code, the jank watch under load, usage
  highlighting) runs in idle time after the switch; it is the same as before and not counted in the click.
- Painting the chat that comes on screen (display lists for big highlighted code) is most of what's left of a switch back
  on this software-GL machine.
- The checks this touches were flaky on this machine under load 25–36, on the starting code too (see Tested).

## Tested
- `node --check` on native.js, panel.js, dev/trace-stats.js, dev/run-checks.js.
- `chatswitch`: passes on this branch (every run with the final budgets and code), fails 4 budgets on the starting code.
- Each related check run alone after the last change (load 8–30): **lightweight ✓** (its observer rule caught one
  observer per kept list at first: hidden lists now let their fold watch go), **streamrender ✓** (it kept the chat's
  list from before a switch: now takes it again, `dev/checks/streamrender.js` 3 lines), **inputlatency ✓**, **chatcalm
  ✓**, recall ✓, lazy ✓, unit:boot-test ✓, unit:streamrender-test ✓, unit:recall-test ✓ (24/25 under load 30: "answers
  fast", recall untouched), a11y ✓ (2 of 3; the third had "unnamed 7" right after the busy machine lost a WebGL
  context), options / settingscalm / motionpolish / qa-keys / undoall / swarmlean / missions / appsearch ✓.
- **chatlistfast** fails only "render ms: 8.4–8.7 (budget 8)" (the chats list's own draw, panel.js's model — this
  stream added only two pointer / focus listeners there) under load 15–30; it failed "one chat changing ms" in another
  run too. Not reproducible as a change of this stream's.
- Flaky on this machine under load on the starting code too: chatcalm (varying rows), streamrender's jump to message #3
  (failed twice on the starting code, fixed here by fix 8), labeasy / labsearch / labpace / labgestures (the Lab not
  loaded in time), missions2 (waits on `Native.isBusy(chat)` with a chat object). One streamrender run (load 30, the
  reply ending inside its 4 s "reading above" window) saw the chat move 13,678 px; four more runs and a targeted probe
  (reading above while 4 long replies end, before vs after) showed 0–8 px on both.
- Bugs found by the checks and fixed before the end: the list's scroll listener on the wrap had to listen on the way
  down (scroll doesn't bubble), and the fold observers of hidden lists.

## For the patch notes
- Going back to a chat you just looked at is instant: the last few chats stay ready out of sight, so switching back only
  shows them again (about 40× less work for a chat full of code).
- A chat you open for the first time shows its latest messages straight away; the earlier ones slip in above a moment
  later, where you can't see them yet.
- Resting the pointer on a chat in the list (or reaching it with the arrow keys) gets it ready before you click.
- Pictures in a chat you're about to open keep their place from the first moment.
- Fixed: jumping to an old message no longer sometimes jumps in the next chat you open.
- Nothing looks different, and Hearth keeps a budget on how much the ready chats may hold.
