# projsearch81: Find in this project (round 81)

One search box at the top of a project's Desk (and Ctrl/⌘+F while the Desk is on screen) that looks through everything
the project holds at once — its chats' messages, its notes and description, the worktable's words, its scenes (names,
layer names, layer code), its moodboards' notes, and the names of its files, captures and renders. Results come grouped
by kind; one click on a result lands exactly there. Nothing is sent to any AI: it's the project's own words, matched
on this computer.

## Where it opens
| Found in | One click lands on |
|---|---|
| a chat message | the project's chat view on that message (round 76's jump / hold: it stays in view while the chat settles) |
| a chat's title | that chat |
| project notes | the Desk's "Project notes & setup" opened, the words selected in the notes box |
| the description | the same fold opened, the description flashed |
| the worktable | the Creative board on the right page (storyboard / drawing / materials / shelf) with the field holding the words selected |
| a scene's name | the scene in the Lab |
| a layer's name | the scene, that layer selected |
| a layer's code | the scene, that layer selected, its code shown with the line selected (new `ThreeLab.search.showLine`) |
| a moodboard note | the board open, the note selected and zoomed to |
| a file / capture / render | opened, as the Desk's files shelf does (right-click: reveal, copy path…) |

## How it stays fast (and off the window's thread)
- **The index lives on the store thread** (`storework.js` op `projfind`, the worker that already writes the stores and
  searches chats), built by `projfind-core.js`. Not on the window's thread, not on the main process's: the main process
  only passes the call on (≈ 0.4–1 ms of its time per call, measured).
- **Read in slices** while the Desk is open: each call does ≤ 12 ms of the thread's time and the window asks again in an
  idle moment, so a save asked meanwhile waits at most one slice.
- **Kept per project, by source** (each chat, each scene, each board, the worktable, the notes, the file names), each
  known by its file's size + time. Only what changed is read again:
  - **on save**: the store thread marks the file it just wrote (`stale()`), so the next find reads only that one;
  - **on arrival** from the other computer: `hearth:synced` (storeack77's event) → a slice in the background, and the
    query on screen runs again by itself (the file's new time on disk tells which source);
  - the Lab's scenes share one big file: it's read once and **only the scenes whose words changed** are indexed again
    (a Lab save that only moved a slider re-indexes nothing).
- **Ranking**: every word must match (AND); a word matches exactly (3), as the start of a word (2) or inside one
  (1, three letters or more: "standard" finds MeshStandardMaterial). × the kind's weight (names above code, a chat title
  above a message), + the whole phrase, + whether it starts with the words, + a little for recent. Accents and case
  don't matter (café = CAFE). Thousands of matches are scored without copying their text; only the best of each kind
  are read whole for the phrase and the snippet.
- **Let go** 20 minutes after the last find (the thread's index), and sources unused for 15 minutes or past ~48 M
  characters are dropped (never the project being asked).
- The window draws at most 4 rows per kind (＋ N more), and never redraws the same results (a background catch-up
  with nothing new leaves the rows under your mouse alone).

## Numbers (heavy fixture: `dev/bigprofile.js --projects 40`, "Clink": 700-message chat + 14 long chats, 5 scenes, 3 boards, 740 files)
- Index of Clink: 34 sources, 10,661 docs, ≈ 5 MB of text; **245–300 ms of store-thread time in 13–17 slices**
  (≈ 1.3–2 s of wall time while the Desk is in use), longest slice ≈ 20 ms on the thread.
- **First query after the index: 22–36 ms** from typing to rows painted ("portal": 5,614 matches; the thread's part
  11–24 ms); other queries 17–41 ms; on an idle machine the thread's part is 5–12 ms (Node, `prof` of the same project).
- The window's longest own task (painting results, moving the selection): **1.8–5.2 ms** (budget 16 ms).
- Main process: ≈ 1 ms per find call (IPC hand-over only).
- Before tuning, the first query was 101 ms (every matching message folded whole): scoring without copying text + only
  the best of each kind read whole brought it to ≈ 22 ms.

## Upgrades
### Find in this project
1. One "Find in this project…" box at the top of every project's Desk.
2. It searches the project's chats' messages (who said it, when).
3. …its notes and description (typed notes are found a moment later, even before they're saved).
4. …the worktable: storyboard titles and notes, drawing prompts, shelf names.
5. …its scenes: names, layer names and every layer's code.
6. …its moodboards: every note, caption, title and link on them.
7. …the names of its files, captures, renders, downloads and deploys.
8. Results grouped by kind (Messages, Notes, Worktable, Scenes, Boards, Files), the matching words highlighted.
9. Four results per kind, "＋ N more" for the rest.
10. One click on a message opens its chat on that exact message, held in view.
11. One click on code opens the scene in the Lab with that layer selected and the line selected.
12. One click on a layer name opens the scene with that layer selected.
13. One click on a board note opens the board with the note selected and zoomed to.
14. One click on notes / worktable words lands there with the words selected.
15. One click on a file opens it (right-click a result: reveal, copy path, copy the words).
16. Ctrl/⌘+F on the Desk goes to the box (elsewhere it finds in the chat / page as before); listed in the keys sheet.
17. ↑ ↓ Enter and Esc in the box.
18. Without accents or case (café = cafe), words inside words (standard → MeshStandardMaterial).
19. Plain empty state: "Nothing in this project matches …"; "Still reading this project…" while it catches up.
20. The box keeps its words and results when you come back to the Desk.
### Fast, light, never in your way
21. Indexed on the store thread, in small slices while the Desk is open: no stall in the window or the main process.
22. Only what changed is read again — a save marks it, an arrival from your other computer is caught up by itself.
23. A Lab save that only moved sliders re-indexes nothing.
24. Let go when unused (20 minutes), capped in size.
### For builders
25. `projfind-core.js` (pure; runs in the store thread and in Node tests), `dev/projsearch81-test.js` (49 checks, in
    UNIT), `dev/checks/projsearch81.js` (by clicks on the heavy fixture; opt-in BIGPROFILE70), run-checks group
    `projsearch81`. `ThreeLab.search.showLine(layerId, line)`.

25 upgrades.

## Tested
- `node dev/projsearch81-test.js` — **49/49**: words (fold keeps offsets, accents, one-letter words), every kind found
  with where it opens (message k / who, layer + line, board item, worktable path / feature / needle, notes offset, file
  type), what's never searched (system notes, picture data, instrument patches), ranking (exact > start > inside; phrase;
  recency; limit with true totals), only what changed read again (a chat saved, a scene's words vs a slider-only save,
  typed notes, a save on the same millisecond marked by the thread), an arrival (new file / title), a chat gone, a chat
  cut short (kept, read again when whole), slices (budget 0 moves one source per call; partial results while reading),
  letting go (idle, size cap), **the real store thread** (storework.js in a worker: built off-main; a `write` op then a
  find reads only that chat), a Clink-sized project (built in slices; every query < 100 ms).
- `BIGPROFILE70=1 node dev/run-checks.js --exact projsearch81` — **pass** (by real mouse clicks / typed keys via CDP):
  Projects → Clink → Desk; index read in slices; first query 22–36 ms; grouped results; a message opens and stays in
  view; real Ctrl+F lands in the box; a code row opens the Lab on that layer with the line selected; a board note opens
  selected; notes typed are found and Open selects them; a storyboard title typed on the Creative board is found and Open
  selects it; a chat saved + the arrival event is found without retyping (≈ 350 ms); the window's own task ≤ 5 ms;
  ≈ 1 ms of main process per call.
- `projects`, `project-workspaces`, `chatwindow72`, `storeack77`, `lazy` — pass. `unit:boot-test` (first screen
  1874 / 1880 KB: unchanged — everything new is in the lazy `projects` group or the store thread), `unit:storeack-scan`,
  `datasafe-scan`, `errorcalm-scan`, `chatsafe-scan`, `commandonly-scan`, `winmac-test` / `winmac-scan` — pass.
  `node dev/lazy-manifest.js` re-run (the keys sheet's Ctrl+F line for the projects group).

## Files
New: `projfind-core.js` (index + ranking), `projfind.js` + `projfind.css` (the Desk's box; lazy `projects` group),
`dev/projsearch81-test.js`, `dev/checks/projsearch81.js`.
Small, additive hooks: `storework.js` (op `projfind`; a write / forget marks the file), `store.js` (`projFind`, a
thread-less fallback for Node), `main.js` (`projects:find` IPC, one line), `preload.js` (`hub.projFind`, one line),
`appui.js` (Ctrl/⌘+F → the box on the Desk, one line), `tools/three.js` (`api.search.showLine`, one line),
`lazy-data.js` (the group's files / css / global + the regenerated manifest line), `docs/lazy-groups.md`,
`dev/run-checks.js` (UNIT, group `projsearch81`, EXTRA_ENV for the main-process probe).

## For Codex
Two minimal, marked edits in `projects-home.js` (each with `(round 81, projsearch81)`):
- `paintProject`: `...(window.ProjFind?[ProjFind.box(p)]:[])` right after the head in `S.body.replaceChildren(…)`. The
  box node is kept per project by ProjFind and re-attached on each Desk repaint (its words, results and focus stay;
  `keepDesk()` restores its caret by its class `pf-input` like the other fields).
- The files shelf's own filter placeholder "Find in this project…" → "Filter these files…" (the Desk's top box is now
  "Find in this project…"; `.pw-file-search` and its behaviour are unchanged — project-continuity / projects72 use the class).
Nothing else in Codex's files changed. The worktable is read from its store (`workbench-<project>`, fields people write:
title / notes / prompt / name / text / description / label / caption / lyrics / tagline; never pictures, strokes,
patches or cells); Open uses `ProjectWorkspace.go('board')` + `WorkspaceNav.creative(feature)` and selects the visible
field holding the words.

## Risks / not done
- Very long messages are indexed up to 6,000 characters and layer code up to 60,000 (a word past that isn't found).
- One source is read whole in one slice: a single giant chat (thousands of messages) can hold the store thread ≈ 20–40 ms
  once; saves asked meanwhile wait that long (never the window).
- No chat command (the owner doesn't use them): it's reached by the Desk box and Ctrl/⌘+F.
- The app check is opt-in (the 146 MB fixture): `BIGPROFILE70=1 node dev/run-checks.js --exact projsearch81`.

## For the patch notes
- New on every project's Desk: a "Find in this project…" box at the top. Type a few words and it looks through
  everything in the project at once: its chats, notes, worktable, scenes (even the code), moodboards and file names.
- Results come grouped (Messages, Notes, Worktable, Scenes, Boards, Files) with your words highlighted; click
  "＋ more" under a group to see the rest.
- Click a result and you land right on it: the chat scrolls to that message, the Lab opens the scene with the layer
  picked and the line of code selected, the moodboard opens with the note selected, notes and worktable words come up
  selected.
- On the Desk, Ctrl+F (⌘F on the Mac) jumps straight into the box.
- Accents and capitals don't matter, and part of a word works too ("standard" finds MeshStandardMaterial).
- It works on this computer only and costs no AI tokens. It stays fast on big projects and keeps up by itself when you
  save or when changes arrive from your other computer.
