# streamrender (round 35): huge replies stream smoothly, long chats scroll smoothly

You want 240 Hz while a reply streams, however big it gets (long Markdown, big highlighted code, tables, lists,
pictures), and long chats (1,000+ messages) that open and scroll without hitches. This pass measured streaming and
long chats under load, found what cost frames, and fixed the causes. What you see is the same; it costs less, and a few
jumps are gone.

## What was wrong (measured)
- **Every paint redid the reply since its last blank line.** Big tables, long lists and code blocks have no blank
  line inside, so a 150-row table, a 120-item list or a 400-line code block was parsed, highlighted, rebuilt and laid
  out whole, ~16 times a second. Over a 167K-character reply that was ≈ 7.7× the reply parsed, and the per-paint cost
  grew with the block (14–16 ms a paint for code / tables here, up to 250 ms).
- **Paints ran on a timer, not in the frame**: a key press in between (typing while it streams) first had to style
  and lay out the new part of the reply, inside the key's handler.
- **The end of a long reply redrew it from scratch** (a new node: ≈ 18,000 elements styled and ≈ 10,700 laid out for a
  60K-character reply, one 100–200 ms hitch here), and its pictures loaded again: the chat jumped up to 1,000 px away
  from its end.
- **Scrolling up into a long chat's earlier messages threw you back to the bottom** each time a batch came in ("Show
  earlier" drew as a fresh chat).
- **Jumping to an old message** (recall's "show me", pins, /jump) could land back at the bottom: the draw that brought
  the old messages in scrolled to the end after the jump.
- Drawing a whole 1,200-message chat was one ≈ 0.6 s task; find in chat walked every text node (≈ 250 ms); the
  usage highlighting of buttons re-read every message button's name (≈ 0.4 s per pass in a fully drawn long chat).

## How it was measured
- `dev/checks/streamrender.js` (new, in the `smooth` group), under a timeline trace (dev/trace-stats.js), Forgeheart
  look: a 167K-character reply from the fake engine (`huge-160k`: headings, inline formatting, JS with GLSL in template
  strings and block comments, GLSL blocks, 50-row tables, nested lists with tasks, 24 pictures that load 0.4 s late,
  callouts, formulas) streamed while following it, while typing, while scrolled up reading (does anything move under
  you? does it pull you down?), back with ↓, and its end; then a 1,200-message chat (text, code, tables, pictures):
  open, a long wheel up, jump to message #3, find, select. Plus a **frame-free bench**: the finished reply painted
  again 250 characters at a time, each paint timed with the style and layout it causes, the starting code's way
  (copied into the check) against the new one, interleaved — it holds on a busy machine where frame timings don't.
- Correctness: `dev/streamrender-test.js` (Node, 9,912 live renders) and the check (2,945 live paints in the page,
  plus the live reply and the finished reply compared with full renders) stream a corpus of tricky Markdown
  (`dev/streamrender-corpus.json`) and the huge replies in random pieces: after **every** piece the live HTML must be
  exactly `renderMarkdown(text so far)`. All identical.
- Before = the starting commit (687395f) from a copy with the same dev tools, interleaved with the after runs: 3
  before / 3 after (4 CPUs shared with other agents, load 7–20, software GL at 60 Hz: frame timings move ±50 %; the
  counts — characters parsed, elements styled, objects laid out, px moved — and the frame-free bench are the reliable
  numbers). Ranges are min–max over the runs.

## Numbers (before → after)

### A 167K-character reply streaming
| What | Before | After |
|---|---|---|
| Markdown parsed while streaming | 1.27–1.30M characters (7.6–7.8× the reply) | **375–470K (2.2–2.8×)**, code highlighted once per line (≈ 80K) |
| **Per paint, frame-free bench** (669 paints, same runs, interleaved) | p50 3.95–5.45 ms · p95 14.6–31.6 ms · 3.7–6.6 s in all | **p50 1.85–2.05 ms · p95 7.7–14.8 ms · 1.9–3.2 s** |
| Same bench by kind (60K each): code · table · list · text | p50 14.5 · 16.1 · 5.2 · 0.5 ms (sum 6.6 · 6.5 · 2.5 · 0.4 s) | **p50 2.0 · 2.4 · 0.95 · 0.5 ms (sum 1.5 · 1.0 · 0.6 · 0.2 s)** |
| Following it (5 s): elements styled · objects laid out | 13.5k–16.5k · 14.9k–18.4k | **5.2k–5.5k · 3.1k–3.9k** |
| Typing 22 keys while it streams: elements styled · objects laid out | 15.3k–17.0k · 15.4k–17.1k | **5.9k–7.7k · 2.9k–4.0k** |
| Scrolled up reading (4 s): elements styled · objects laid out | 22.8k–25.4k · 28.8k–32.6k | **5.5k–6.4k · 6.4k–7.0k** |
| Scrolled up: moved under you · pulled to the bottom | 0 px · no | 0 px · no (and a wheel turned up now stops following at once) |
| **The end of the reply** (finish probe, 60K reply ×2): elements styled · objects laid out · longest task | 18.0k · 10.7k · 104–194 ms | **421–537 · 304–438 · 33–78 ms** |
| **The chat's distance from its end** around the end (pictures settling) | 0–1,000 px (120, 676, 997 px in 3 of 5 runs) | **0 px in every run** |
| Live reply vs a full render · finished reply vs drawn from scratch | — | identical |

### A 1,200-message chat
| What | Before | After |
|---|---|---|
| **A long wheel up** (160 notches): messages reached | 280 (thrown back to the end at each batch) | **640** (keeps your place) |
| Jump to message #3 (like recall's "show me") | landed out of view in 1 of 3 runs | **in view 3 of 3**; longest task 101–173 → 40–86 ms (drawn in slices) |
| Find in chat (whole chat drawn): main-thread time · the text-node scan | 237–344 ms · ≈ 250 ms | **137–157 ms · ≈ 2 ms** |
| The usage-highlight pass with the whole chat drawn (one task) | ≈ 436 ms | **≈ 43 ms** |
| Opening it · heap · DOM nodes | 95–154 ms · 11.0–11.5 MB · 57.5k | 75–177 ms · 11.4–12.1 MB · 57.9k (same within noise) |

## Upgrades

### Streaming replies
1. **A long reply streams with a fraction of the work**: each finished part (a paragraph, a heading, a whole table or
   list once it ends) is drawn once and never touched again; only the part being written is redone, even when there's
   no blank line for a long while. `md.js` (Md.live), `native.js`
2. **Big code blocks are colored line by line as they arrive** (each line once, as soon as nothing after it can change
   its colors), instead of the whole block recolored and redrawn on every paint. `md.js`
3. **Long tables and lists grow row by row**: the rows and items above keep their place on screen and aren't redrawn.
   `native.js`
4. **The reply updates once per screen frame, together with the scroll that follows it**: typing while a reply
   streams no longer pays for drawing it. `native.js`
5. **The end of a long reply is seamless**: the reply you watched becomes the finished message in place (no redraw of
   the whole thing, no hitch, no jump; it's checked identical to a fresh one). `native.js`
6. **Pictures in replies keep their space**: once a picture has loaded, its size is remembered (the last 300), so it
   holds its place before it loads again (the finished reply, the chat opened later, after a restart). `native.js`
7. **A chat following its end stays at the end when pictures finish loading** (it used to stop short of the bottom).
   `native.js`
8. **Turning the wheel up (or Page Up / Home / ↑) while a reply streams stops following at once**: the next paint
   can't scroll you back down and cancel your wheel. `native.js`
9. **Reading higher up while a reply finishes or something above changes size: what's at the top of the chat stays
   there** (only the scroll offset was kept, so code blocks folding at the end moved the text under you). `native.js`

### Long chats
10. **Scrolling up into earlier messages keeps your place**: each batch of earlier messages used to throw you back to
    the end of the chat. `native.js`
11. **Jumping to an old message lands on it** (recall's "show me", pinned messages, /jump): the draw that brings the
    older messages in no longer scrolls back to the end afterwards. `native.js`
12. **Drawing many messages at once no longer freezes the window**: a long chat drawn whole (a jump to its start) is
    built a few milliseconds at a time with frames in between, and a newer draw takes over from an older one.
    `native.js`
13. **Find in chat is quicker in long chats**: only messages that contain the words are searched word by word, and
    closing / changing a search only tidies the places it marked. `chat-ux.js`
14. **The "used often / never used" highlighting of buttons no longer stalls long chats**: a button's name is worked
    out once (again only when its words change), not for every message button on every pass. `usage.js`

### For the next measurer (dev, not counted)
- `dev/checks/streamrender.js` (`sh dev/run-checks.sh streamrender`, in `smooth`): the stretches above, the
  frame-free bench, the corpus in the page, live vs full and finished vs fresh comparisons; fails on any difference,
  on the chat moving under you or pulling you down, on ↓ not following again, on jumps / find / selection missing.
- `dev/streamrender-test.js` (`unit:streamrender-test`, in `smooth`): Md.live against full renders after every
  piece, the hlCut rules, Markdown work per paint by kind.
- `dev/fake-huge.js`: the fake engines' `huge`, `huge-code|table|list|images|text`, `-NNNk` sizes (16 characters every
  4 ms, `FAKE_HUGE_DELAY`). `dev/smoke.js` answers `https://img.hearth.test/<w>x<h>/<n>.png` with a real PNG after
  `SMOKE_IMG_MS` (400 ms), so pictures in replies load late like real ones. dev/trace-stats.js segments report
  `busyMs`.
- `Native._test` (`streamCorpus`, `paintBody`, `livePaint`) and `Md.live` / `Md.liveStats` for checks.

## Measured, left as is
- **No placeholder virtualization of long chats.** The existing window (last 40 messages, earlier ones 60 at a time
  as you scroll up) plus content-visibility on older messages keeps opening and scrolling cheap on the main thread;
  what's left in the long wheel is the compositor (software raster here: "Commit" waits dominate) and fold measuring
  of messages coming near. Placeholders would break find / selection / Ctrl+↑ over unbuilt messages for little gain.
- **content-visibility inside a reply** (per block): it would change margins (blockquotes, callouts, nested lists
  stop collapsing them) and clip overflow, a visible change. Not done.
- The shimmer over a streaming reply spans the whole reply; on this software-GL machine frames are slow either way
  (calm motion, without it, measured the same), so it stays.
- Typing latency while streaming moves a lot with the machine's load here (input → frame p95 370–1,560 ms both before
  and after on a load of 10–20); the work behind it (elements styled, objects laid out) is 2–5× lower.
- The text of a highlighted code line can be split in two text nodes where a piece ended (same HTML); find in chat
  matches within a line as before.

## Tested
`node --check` on every touched JS file; `node dev/streamrender-test.js` (all pass); `sh dev/run-checks.sh
streamrender unit:streamrender-test chat-stream smooth32 lightweight recall lazy unit:boot-test chatperf offmain
chat-cmds smooth-chat chatcore` (16/16 pass, recall and lightweight with their unit tests); before / after runs of the streamrender check
interleaved 3 + 3; screenshots of a finished reply (code labels, table, task list, callout, suggestions) look as before.

## For the patch notes
- Very long replies now stream smoothly: only the part being written is redone, so big tables, long lists and big code
  blocks no longer get heavier with every line (about 2–7× less work per update).
- Code in replies is colored line by line as it arrives.
- The end of a long reply is seamless: no hitch, and the chat no longer jumps when its pictures load.
- Pictures in replies keep their space once they've been seen, so chats don't jump while they load.
- Scrolling up while a reply streams stops following right away, and what you're reading stays put when the reply
  finishes below it.
- In long chats, scrolling up into earlier messages keeps your place (it used to throw you back to the end), and
  jumping to an old message (from "what did we decide?", a pin…) lands on it.
- Long chats drawn whole no longer freeze the window, and find in chat is quicker.
- Nothing looks different; it's the same chat doing far less work.
