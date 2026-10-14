# chatlistfast (round 42): the chats list stays quick with thousands of chats

You start several chats every day, so the list on the left (each AI's chats, folders, archive, search, pins) keeps
growing. This pass built a big made-up history (3,000 chats, and 5,000 to see the trend), measured everything you do in
that list, and made it do far less work. Nothing looks different: the same rows, folders, "Show more", menus and keys.
The one addition is that you can now drag a chat onto a 📁 folder.

## How it was measured
- **The history**: `dev/make-chatlist-fixture.js` writes a throwaway data folder of made-up chats (never real data):
  80 % Claude, 20 % Astra, spread over two years (more of them lately), 2–8 short messages each, 20 folders, 15 tags,
  ≈ 1 % pinned, 12 % archived. `node dev/smoke.js --data <it>` copies it into its own app copy.
- **The check** (`dev/checks/chatlistfast.js`, new) drives the list with real input (CDP mouse, wheel and keys) and a
  timeline trace: the list drawn and the panel shown (open), "Show more" clicked 30 times (≈ 1,240 of Claude's 2,083
  chats out), 80 wheel notches through them, typing "neon" in the search box, six chats changing (a reply saved),
  F2 rename, moving to a folder (menu and drag), clicking 8 chats (switching), then memory after GC.
- **Before / after**: the starting commit (7b3541c) from a copy, with the same check, interleaved (before, after,
  before, after) on the same machine: 4 shared CPUs, software GL, other agents' checks running (load 3.8–6.8). Frame
  timings move a lot with the load here; the list's own work (in-page script time) and the counts (elements styled,
  objects laid out, DOM nodes) are the reliable numbers. Ranges are the two runs.

## Numbers (3,000 chats; before → after)
| What | Before | After |
|---|---:|---:|
| The whole list drawn again (any change used to do this) | 13.3–14.3 ms | **2.6–3.3 ms** |
| … to the next frame | 56–59 ms | **5.3–5.7 ms** |
| Open stretch (IPC, 6 draws, panel shown 3×): main-thread busy · elements styled | 492–535 ms · 2,404–2,425 | **145–192 ms · 846–852** |
| "Show more" with ≈ 1,200 rows out: the click's own work | 24–33 ms | **4.1–5.7 ms** |
| … to the next frame | 135–141 ms | **53–76 ms** |
| Elements in the list with ≈ 1,240 rows out (rows in it) | 2,968 (1,280) | **303 (115)** |
| Show-more stretch: busy · styled · laid out | 2.5–3.1 s · 32–33k · 39–40k | **0.94–1.02 s · 8.4k · 10.8k** |
| Wheeling through those rows: main-thread busy per second | 398–434 ms | **175–176 ms** |
| … worst frame · frames over 4.2 ms | 182–191 ms · 179–181 | **51–74 ms · 74–82** |
| … gaps (nothing shown) at 39 places down the list / while wheeling fast | 0 / 0 | 0 / 0 |
| Typing in the search box: a key's handlers, p95 | 38–54 ms | **1.2 ms** |
| … one letter's draw (filter 3,000 chats + what changes), median | 25–33 ms | **6.3–7.9 ms** |
| … input → next frame, p95 | 65–103 ms | 58–61 ms |
| … search stretch: busy · styled · laid out | 0.95–1.17 s · 11.9k · 14.3k | **0.37–0.39 s · 2.3k · 3.4k** |
| One chat changing (a reply saved): the list's work | 29–34 ms | **4.2–8.6 ms** |
| … elements styled · objects laid out (6 changes) | 9,132 · 10,308 | **342–348 · 60** |
| F2 rename: Enter → next frame | 20–31 ms | 10–12 ms |
| Switching chats: marking the open one · a click's handlers p95 | 0.7–0.9 ms · 17–35 ms | **0.1 ms · 12 ms** |
| Whole window: DOM nodes · JS heap after GC | 3,867 · 22.0 MB | **1,155 · 20.7 MB** |

With **5,000 chats** (one run each, load 5–7): a draw 15.4 → **4.1 ms**; a letter 52 → **10 ms** (key handlers 55 → 1.4 ms);
one chat changing 36 → **5 ms** (elements added / removed with what's inside them 5,934 → **4**); "Show more" 28 →
**7 ms**; wheeling 438 → **147 ms** busy per second; switching handlers 37 → **9 ms**. The before side grows with the
number of chats, the after side barely does.

Not changed (and why): getting the chats list from the background process at start (28–57 ms here, on the store
thread, not the window) is the same; "Show more" still shows 40 more at a time, because the button is what you see.

## Upgrades

### Speed (nothing looks different)
1. **The list draws in a fraction of the time**: each AI's chats are sorted once when they change (not on every draw),
   and only the rows on screen are made. With 3,000 chats a draw went from ≈ 14 ms to ≈ 3 ms. `panel.js`
2. **A chat changing redraws only its own row**: a reply saved, a rename, a pin or a move to a folder no longer
   rebuilds the whole list (and its order is patched in place, no re-sort of thousands). `panel.js`
3. **Typing in the search box never waits**: the key does nothing but note the letter; the list follows once per
   screen frame, and each new letter only looks through the last letter's matches. Titles are lowercased once, not on
   every key. `panel.js`
4. **Long lists stay light**: once you've shown more than 150 rows of one AI ("Show more" a few times), only the rows
   near the screen exist (≈ 115 instead of 1,280); the rest of the height is kept, so the scrollbar and positions are
   exactly as before, and rows you scroll back to are reused. `panel.js`, `features.css`
5. **A lighter window overall** with a long list out: 3,867 → 1,155 DOM nodes, less memory. `panel.js`

### Small fixes that come with it
6. **A rename in progress survives**: a reply arriving while you rename a chat (F2) no longer closes the box and saves
   half a title. `panel.js`
7. **A row's tooltip says how long ago its chat changed as of now** (it was the time of the list's last redraw).
   `panel.js`

### New
8. **Drag a chat onto a 📁 folder** of its AI to move it there; drag it onto the AI's name to take it out of its
   folder. The folder lights up under it; Ctrl/⌘+Z puts it back (it goes through the same move as "Move to folder…",
   which undoall logs). Listed in the keys sheet (bottom left) under Chats panel. `panel.js`, `features.css`,
   `undoall.js` (a drop counts as your own action)

Everything else works as before, and the check proves it each run: ↑ / ↓ walk the whole list even past the rows that
are drawn (250 × ↓ visited 250 chats), Home / End go to the very first / last chat, Enter opens, ↑ from the first row
goes back to the search box, Esc too, one Tab stop for the list; right-click and Shift+F10 menus; F2, Delete (+ Ctrl+Z
brings it back), pins on top, archived chats only under their filter, folder filters, #tag search, the search finding
what a plain scan finds.

**8 upgrades.**

## How it works (for the next stream)
- `panel.js` keeps **a model**: `H.chats` split by AI and sorted once per change of the array or the sort; Native's
  `remember()` pattern (one summary new at the front, every other the same object) and deletes are patched in place
  (`patchModel`); `Panel._model()` lets checks compare it with a fresh sort.
- A draw **reconciles**: rows are kept by chat id with a signature (title, pin, tags, folder, archived, updated,
  busy / unread); a changed signature makes a new row (through `hooks.row`, as before), the rest stay; groups, folder
  headers, the chip, "Show more" and notes are kept too; `patch()` moves / adds / removes only what differs. Top hooks
  (makes, projects) still draw into the list each time (a fragment).
- **Hooks**: `hooks.row` runs when a row is *built* (not on every draw any more), `hooks.render` after every draw and
  after a long group brings other rows near the screen. Anything that decorates rows should use `hooks.row` (meter.js
  now does, for the token count) — a MutationObserver on `#chat-groups`'s own children no longer sees rows added
  inside a kept group.
- **Long groups** (> `VIRT` = 150 entries): `.group.vlist`, two `.vspace` spacers, the rows near the screen ± `BUF` (24);
  a row's and a folder header's height are measured on screen per look / density. The window follows the scroll in a
  frame callback (layout read first, then writes); a draw uses the last known scroll position (no forced layout) and
  the next frame checks it. The focused row is never dropped.
- **Keys**: the list's own handler walks the model for ↑ / ↓ / Home / End (bringing the target row in first) and stops
  the event there, so a11y.js's walk (drawn rows only) doesn't run twice; tabindex roving and `aria-current` are kept on
  reused rows (`rove()`, `highlight()`).
- `Panel.flush()` draws a waiting draw now (soon / the next frame); `Panel.setFilter` draws in the next frame.
- `performance.mark('hearth:chats-listed')` marks the first draw with the history in it (the check reports it).

## Tests
- `node --check` on every touched JS file.
- `dev/checks/chatlistfast.js` (new; in the `smooth` group, and its own group `sh dev/run-checks.sh chatlistfast`, which
  also runs a11y, undoall (+ unit), chatcalm, recall (+ unit), lightweight, inputlatency, lazy, unit:boot-test, fastboot;
  `dev/run-checks.js` makes the fixture). Budgets on the list's own work and counts (draw, Show more, letters, one
  change, nodes, scroll busy, highlight, heap); input → frame is reported and fails only far over. The starting code
  fails it on 9 budgets plus the drag.
- RESULTS_PLACEHOLDER

## Risks
- Modules that decorate chat rows by watching `#chat-groups`'s own children (not `hooks.row`) see only redraws that
  change the groups; in the code today: meter.js (moved to `hooks.row`), a11y.js (roles / tabindex / aria-current now
  set by the list itself), chat-scenes.js and recall-hooks.js already used the hooks.
- A row kept between draws keeps whatever another module added to it (progress bars, scene marks); a change that
  matters to the row (title, pin, tags, folder, busy / unread) still makes it new.
- Long groups assume their rows are one line high (they are: titles are cut with …); a look that wraps titles would
  make the spacers slightly off (the scrollbar, not the rows).
- During a native drag the source row can leave the list (a long group scrolled while dragging); the drag still drops
  (it's remembered), and the window's dragend clears it.

## Edits outside this stream's files (small, additive)
`meter.js` (the panel token count per row through `Panel.hooks.row`; `decoratePanel` uses the same per-row function) ·
`projects.js` (its skip asks its index before reading `projects.group` from localStorage: once per chat per draw before) ·
`undoall.js` (a drop counts as your own action, like a click) · `features.css` (three rules: long groups' rows, spacers,
the drop mark) · `dev/run-checks.js` (group, smooth, fixture).

## For the patch notes
- The chats list stays quick however many chats you have: with 3,000 chats it redraws about 5× faster, and a reply
  arriving now redraws only its own row instead of the whole list.
- Typing in the chats search no longer lags: each letter costs about a millisecond, and the results follow on the next
  screen frame.
- "Show more" a lot of times and the list stays light: only the rows near the screen exist, and scrolling through
  a thousand chats takes less than half the work.
- New: drag a chat onto a 📁 folder to move it there (onto its AI's name to take it out); Ctrl/⌘+Z puts it back.
- Renaming a chat (F2) is no longer interrupted by a reply arriving.
- Everything else is exactly as before: the same rows, folders, pins, menus, keys (↑ / ↓ / Home / End / Enter / F2 /
  Delete) and search.
