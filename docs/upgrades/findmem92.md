# findmem92: Find in this project without holding the giant chat (round 92)

Round 91's long-session run (`docs/upgrades/longrun91.md`) left two things to fix:
1. **Find in this project held about 60 MB on the store thread for 20 minutes.** Its index
   (`projfind-core.js`, from `projsearch81.md`) kept the text of every chat in the project, the
   giant one included.
2. **A tip waiting while something covered its spot checked again every 0.7 s** (`hints.js`):
   about 1.5 wake-ups a second for as long as a dialog, the sync panel, a card, typing or a reply
   was in the way.

## 1. A giant chat's words, not its text
A chat of 8 MB or more (the same size limit as chatwindow86's windowed chats, `bigchat-core.js`
`BIG`) is now kept **lean** in the project's index:
- **Its words are indexed as before.** The same tokens and the same doc numbers, so the same
  ranking. Each message doc keeps where its bytes are in the file (`s`, `e`) and its first 24
  folded characters (`head`, for "starts with the words"), but not its text.
- **Only the messages a query shows are read back** from the file (`leanReader`). These are the
  best matches of each kind, which round 81 already "read whole for the phrase and the snippet":
  20 for one word, at most 200 for several. Each message's own `"text"` string is parsed only as
  far as the index keeps it (6,000 characters). The rest of the message is never parsed.
- **A phrase longer than 24 characters** ("starts with these words") is compared on the kept head
  first, with the one context-dependent letter (Σ → σ / ς) evened out. A message's text is read
  back only when its head could match.
- **A file saved since** (its new words still being read in slices) is read back by message place.
  The place comes from the store thread's offsets kept per version of the file (chatwindow86's
  `bigCut`, kept up to date by `chatDelta`).
- **Every source's words are kept compact**: one list of words, with their doc numbers in one
  typed array, instead of a Map of arrays. This applies to all chats, scenes and boards. It also
  copies out each long word and head that was cut from a whole message's text (a regex match or a
  slice keeps its whole parent string alive).
- **The texts read back lately** are kept, 1.2 M characters at most, oldest dropped first. Typing a
  few more letters asks for mostly the same best matches again.

**Safety.** A giant chat that can't be read back when asked (gone, held, cut short, or a message
no longer there) is left out of that query. The query runs again without it, and the chat is
named in `unread`. The Desk's box then says *Couldn't read "Clink build log" just now, so its
messages aren't in these results. Try again in a moment.* That line shows even when nothing else
matched, so it is never "Nothing in this project matches". Nothing is written, deleted or
uploaded: this code only reads.

### Same results, proved against round 91's own code
`dev/findmem92-r91-projfind.js` is round 91's `projfind-core.js` copied word for word (tests
only). `dev/findmem92-test.js` builds both indexes from the same files and compares
`JSON.stringify` of every query's groups: hits, order, snippets, marks, scores and totals, at a
fixed clock.
- **Made-up giant chat** (2,400 messages, written pretty and compact): long texts cut at 6,000 on
  escapes, accents, emoji split by the cut, control characters (6 bytes a character) and runs of
  backslashes; `"text"` not the first key; other `"text"` keys further in; system / empty /
  non-string messages; phrases longer than 24 characters with Σ / ς in them. 29 queries × 3
  limits: **identical** (lean, and compact-only).
- **bigchat84's Clink** (6 chats, with the 63 MB giant chat): 20 queries **identical**.
- **bigprofile72's Clink** (projsearch81's BIGPROFILE70 profile: 15 long chats, no giant one;
  compact words only): 20 queries **identical**. Forced lean on every chat (by hand, with the
  scratch bench): identical too.
- **The real store thread** (`storework.js` in a worker): the same hits, order and snippets.

### Numbers (Node, this machine, shared CPUs; median of 3 separate runs per side)
| bigchat84's Clink (the 63 MB chat) | Round 91 | Now |
|---|---|---|
| Index heap after a GC | **74.0 MB** | **6.4 MB** |
| Characters held | 14.46 M | 2.70 M (words only) |
| Build: slices / thread time | 96–106 / 0.92–1.0 s | 86–103 / 0.81–0.95 s |
| Query p50 / p95 (repeated queries, 20 words × 6) | 4.3 / 10.5–11.7 ms | 2.7 / 7.3–7.8 ms |
| First time each query is asked (p50 / p95, includes warm-up) | 7.4–9.3 / 20–24 ms | 7.6–8.4 / 20–30 ms |

The slowest first-time queries are those whose 200 best matches are all in the giant chat
("frame ms draws": about 3 MB of messages read back, ≈ 5 ms). Asked again, or with one more
letter, they come from the texts kept.

| bigprofile72's Clink (no giant chat) | Round 91 | Now |
|---|---|---|
| Index heap after a GC | 13.2 MB | 8.2 MB (compact words) |
| Query p50 / p95 | 1.8 / 3.1 ms | 1.7 / 3.3 ms |

In the app (`BIGPROFILE70=1 projsearch81`, by real clicks): first query **13.1 ms** from typing to
rows painted ("portal", 5,614 matches; round 81: 19–36 ms). Others: 17–26 ms. The window's own
longest task: 1.4 ms. Main process: ≈ 0.6 ms per call.

### Over a working day (`LONGRUN91=1 longrun91`, 24 cycles on bigchat84, Clink searched every 4th cycle)
| Store thread heap after a GC, per sample | Round 91 | Now |
|---|---|---|
| Range | swings **18 ↔ 82 MB** (84.7 → 83.3 MB) | **21.2 ↔ 25.1 MB** (25.1 → 23.6 MB) |
| Highest | ≈ 85 MB | **24.6 MB** (new bound: 45 MB) |
| Find's index at its largest | ≈ 54 MB of strings | 2.88 M characters (the words) |

The check now fails if the store thread goes over 45 MB at any sample (`LR91_STORE_MAX_MB`).

## 2. Tips wait for the way to clear, not on a 0.7 s clock
`hints.js` `pump` set a 0.7 s look-again before it knew whether the way was clear. While something
was in the way (typing, a dialog, the sync panel, a card, a reply streaming, Hearth busy) it looked
again every 0.7 s. That one early timer also hid round 44's "look again when the gap ends" (a
sooner timer always wins).
Now a held tip:
- **typing**: looks once, when the 4 s quiet after the last key ends
- **a click, Esc / Enter, a dialog closing** (`close`, caught on its way down): looks again at once
  (60 ms). This is how a dialog, the sync panel or a card goes away.
- **otherwise**: less and less often: 0.7 → 1.4 → 2.8 s, then 5 s for a dialog or a card (a click
  or a key closes those) and 2.8 s for a reply or Hearth being busy (Hearth busy already had its
  own `hearth:busy` event)

Measured on a stand-in page with a virtual clock (`dev/findmem92-test.js` §6):
- a dialog, the sync panel or a card held for a minute: **14 looks** (was ≈ 86). The tip shows
  within 150 ms of the click / Esc / close.
- typing: 1 look in 4 s
- a reply: 23 looks in a minute; the tip shows ≤ 1 s after the reply ends (2.8 s at most)

Behaviour is otherwise the same: what shows, in which order, and when it may show are unchanged.
checkfix88's "notes wait while the sync panel is open" is kept (the panel is still a blocker, and
the test holds a tip behind it). `hints.js` is on the first screen: 1,742 / 1,751 KB.

## Files
- `projfind-core.js`: lean giant chats, compact words, `leanReader`, `unread`.
- `projfind.js` (Desk box, lazy): the "couldn't read" line.
- `storework.js`: `big.lean` / `big.text` for `projfind` (read back via `bigCut`); `_mem` reports
  `findChars` (tests only).
- `bigchat-core.js`: exports `textTok` (one word).
- `hints.js`: the held tip's timer (`hold`, `wake`); nothing else.
- Tests: new `dev/findmem92-test.js` (in UNIT, group `findmem92`) and
  `dev/findmem92-r91-projfind.js` (round 91's code, the reference). `dev/checks/longrun91.js`: the
  store thread's heap must stay under 45 MB (`LR91_STORE_MAX_MB`), with Find's index size in its
  report. `dev/run-checks.js`: the unit test and the group.

## Tested
- `node dev/findmem92-test.js`: 18/18. With `FINDMEM92_BIG=1` (the real fixtures): 20/20.
- `BIGPROFILE70=1 projsearch81`, `CHATWINDOW86=1 chatwindow86`, `sync72`, `lazy`, `hintcalm`:
  pass. `LONGRUN91=1 longrun91`: passed on its second run. The first run failed on one line, "main
  heap +70 KB/cycle (limit 60)". The samples were 18.1 → 20.0 MB, swinging 19–21.4 MB (round 91
  saw 19–21.6). Nothing in the main process changed this round. The second run: main heap
  −40 KB/cycle, every line ok.
- unit: projsearch81-test, chatwindow86-test, chatcalc87-test, store-thread-test, datasafe-scan,
  winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan, chatwin-scan, boot-test (first
  screen 1,742 / 1,751 KB), lazymanifest-test, hintcalm-test: pass.

## For Codex
Nothing of yours changed. No Codex-owned file (quest-*, projects*, project-workspace*,
sync-engine.js, cloud-files.js, workbench-*, creative-vst*, astra*, engine-watch) was edited.

## For the patch notes
- Find in this project no longer holds a very long chat in memory. Hearth's background helper uses
  about 70 MB less after you search a project that has one, and finds the same things in the same
  order.
- Searching a project is a little quicker once you've typed the first words.
- If Hearth can't read a long chat at the moment you search, the box now says so, instead of
  suggesting nothing matched.
- Tips that wait for a dialog, the sync panel or a card to close now show right when you close it,
  and Hearth wakes up far less often while they wait.
