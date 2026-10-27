# Chatwindow72 (round 72): long chats cost the same whether they have 50 messages or 900

You said the app gets slow and suspected the chats piling up. That was partly right. A long chat already opened on its
last 40 messages (round 12), but every time you scrolled up, "↑ Show earlier" drew the rest **and kept it**. In a
900-message chat, one trip to the top left ~43,000 elements in that chat's list (~117,000 in the page) until you
closed the chat, and every one of them was restyled and laid out on each later change. Now the earlier messages
**rest**: each block of 20 is one empty placeholder with the height those messages take. They are drawn as you scroll
up to them and go back to rest once you're three screens away. Nothing in the chat itself changes: the text stays as it
was, only what is drawn on screen does.

## Measured before → after

The same machine, back to back in one run (`dev/checks/chatwindow72.js`, headless Electron, a shared 4-CPU box).
The made-up chat has 900 messages: 225 code blocks (some 60 lines), 65 tables, 45 pictures and 23 videos a reply made,
30 Lab screenshots, 90 folded tool-step cards, thinking blocks and attached pictures.

| What | Before | After |
|---|---|---|
| Open the chat (its row clicked → drawn) | 215 ms | 162 ms |
| … elements in its list / JS heap after open | 2,033 / 13.5 MB | 2,076 / 12.4 MB |
| Scrollbar covers | the last 40 messages (8,858 px) | the whole chat (264,373 px) |
| Wheel all the way up: most elements in the list at once | 42,878 | 4,143 |
| … main-thread time for that climb (tasks / style / layout) | 16.2 s / 2.2 s / 1.4 s | 11.1 s / 1.5 s / 0.9 s |
| … content jumps where you stopped scrolling (177–186 wheel turns) | 1 | 0–3 (three runs: 0, 2, 3) |
| … blank placeholder on screen when you stop | 0 | 0 |
| Back at the end: elements in the list | 42,878 (everything stays) | 2,099 (as when opened) |
| … elements in the whole page | 116,974 | 8,900 |
| … replies kept as rendered Markdown | 450 | 20 |
| Typing 40 letters: slowest key → next frame | 66 ms | 53 ms |
| A new reply in the long chat: main-thread tasks / messages re-added | 193 ms / 3 | 173 ms / 3 |
| Find (Alt+F / Ctrl+F) a word only in message #5 | found (all of it was drawn) | found: its block is woken and it's on screen |
| "Show all" (every message drawn) | — | 470 ms |

Frame rate while climbing is a little lower (30 → 25 fps on this software-rendered box), because blocks are now woken
as you reach them instead of being drawn once and kept forever. The work saved shows in everything after that: the
page stays at the size it opened at. `chatperf` on the new code: 300-message chat opens in 98 ms, switching median /
worst 36 / 61 ms, a reply re-adds 3 messages, streamed Markdown identical to the full render.

## What changed

### Resting messages
1. A long chat draws its last 40–59 messages. The earlier ones rest in blocks of 20, each one empty placeholder of the right height, so the scrollbar shows the whole chat honestly.
2. Scrolling up wakes the block above about a screen ahead, nearest first. Its replies' Markdown is made off the main thread first, then it slips in all at once.
3. What you're reading never moves when a block wakes or rests (the message at the top of the view keeps its exact place; dragging the scrollbar into the middle of a placeholder keeps your proportion within it).
4. A block that's three screens away goes back to rest, measured, so it comes back at exactly its size. A block holding your text selection or the focus never rests.
5. The end part moves on only every 20 new messages (it used to drop the oldest drawn message on every reply). Messages that leave it stay drawn until you're far from them.
6. A quiet line on top of what's drawn: **"Earlier messages are resting · Show all"**. Show all draws every message of that chat for this session (the old behaviour). Also `/jump all`.

### Find, jumps, links
7. Find in chat (Alt+F) counts the resting messages too. Stepping onto one wakes its block and lands on the match.
8. **Ctrl/⌘+F on a chat** opens that chat's own find (highlights, steps, and it reaches resting messages). Elsewhere Ctrl+F finds in the page as before.
9. `/jump <#>`, `/jump first`, pinned messages, bookmarks, "Copy a way back here", app search and Recall's "show me" all wake the one block they need. The whole chat is no longer drawn for a jump.
10. A woken jump or find target is put back in view once the messages around it have drawn, if their real sizes moved it.

### Memory
11. A block going back to rest lets go of its elements and its rendered Markdown / code highlighting (the text itself stays, and is made again when it wakes).
12. Opening a long chat no longer pre-renders every earlier reply in the background: only the two blocks just above. In the test chat, the Markdown kept went from 450 replies to 20.
13. Pictures and videos inside resting messages don't exist on the page at all, and drawn videos still load only near the screen and pause when scrolled away (round 16).

## Where it lives
- `native.js`: `shownFrom` (the end part on a block edge), `planOf` (the resting placeholders, their heights:
  `restBit` / `guessH`, the quiet line), `jumpTo`, `showEarlier`, `Native._rest` (internals for chat-rest.js),
  `hooks.blocks` (a block woke / rested). The old "↑ Show earlier" button and its observer are gone.
- `chat-rest.js` (new, lazy group `chatrest`, loaded right after the first frame): waking and resting, the line's
  place, `wakeAt` / `restingHits` / `settle` for find and jumps. Until it loads, a jump draws the whole chat as before.
- `chat-ux.js` (find: resting hits), `appui.js` (Ctrl+F on a chat), `md.js` (`Md.forget`), `chat-cmds.js`
  (`/jump all`), `features.css` / `polish.css` (the line reuses the date line's look), `lazy-data.js`, `index.html`.
- First screen: 2,342 / 2,345 KB (+4 KB), stylesheets unchanged at 451 KB.
- Kept inside the chat view (the longrun72 memory stream doesn't overlap): no main-process, store or timer changes.

## Checks
- `dev/checks/chatwindow72.js` (new): the made-up 900-message chat. Budgets: opening ≤ 1.5 s and ≤ 4,500 elements;
  the climb peaks ≤ 9,000 elements and reaches message #1, ≤ 4 jumps, no drift after stopping. Back at the end it must
  be back near the opening size with message #5 resting again. Find must land a resting message on screen, a reply
  must stay under 900 ms of tasks and re-add ≤ 4 messages, the slowest key ≤ 120 ms, and the line's Show all must draw
  everything. `window.CW_REPORT = 1` reports without failing (the "before" run).
  `node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/chatwindow72.js`
- `chatswitch`: now expects the quiet line instead of "↑ Show earlier". Its "no rail button for tool:three / claude"
  and first-open task budget fail the same way on the code before this round (not from this change).
- `qa-keys`: Ctrl+F on a chat counts the chat's find bar. Its one dead key (Ctrl+Alt+I, Quick idea's OS-wide shortcut)
  is from round 71, also not from this change.
- Run: chatwindow72, chatperf, lazy, unit:boot-test, unit:streamrender-test, chatswitch, qa-keys.

## Risks / not done
- Placeholder heights are guessed from the text until a block has been drawn once (code folded at 28 lines, long
  replies folded, pictures ≈ 300 px). The scrollbar thumb can shift a little as blocks wake. What's on screen stays put.
- **A few jumps remain on the way up**: 0–3 per full climb of the test chat, a few hundred px each, always at the
  same messages (one carries a video, others sit right under pictures). Most likely a just-woken reply's picture or
  video taking its real size after the anchor has been set. Once you stop, nothing drifts (measured 0 px over 1.5 s).
  Worth a follow-up: reserve media boxes before a block wakes.
- Browser-level select-all / Ctrl+A copies only what's drawn. Per-message Copy, "Copy as plain text", the chat's
  Markdown export and Save use the stored text, so they're unaffected.
- Things you opened inside a message (a thinking block, a tool list) close again once its block has rested; long
  replies you unfolded stay unfolded.
- Measured headless with software rendering; real-GPU numbers will differ, the before/after ratios less so.

## For the patch notes
- Very long chats stay light now: only the latest messages are drawn, older ones "rest" and come back as you scroll up
  to them. Nothing in the chat itself changes.
- Scrolling all the way up a 900-message chat used to leave about 43,000 elements on the page until you closed it; now
  it peaks around 4,000 and goes back down when you return to the end.
- The scrollbar now shows the whole chat, not just the last 40 messages.
- What you're reading stays still while older messages appear above it.
- A quiet line, "Earlier messages are resting · Show all", draws everything if you prefer (also `/jump all`).
- Find in a chat (Alt+F, and now Ctrl/⌘+F on a chat) finds resting messages too and takes you there; jumps to a
  message, pins and search results work the same.
- Older replies' formatted text is freed from memory while they rest and rebuilt when you come back.
