# The one-project chats list at the owner's scale (round 120, projperf120)

Round 116 made the chats list show only the open project's chats (`projchats.js`, `projchats-core.js`, `panel.js`).
Round 118 added a keeper that runs after sync and every 2 minutes. This round measures both on the heavy profile:

- `dev/bigprofile.js --projects 40`: 2,199 chats and 41 projects;
- 1,576 of the chats are in "Earlier chats" after the migration.

It also fixes what was slow.

## What was measured

- **In the app** (`dev/checks/projperf120.js`, opt-in `BIGPROFILE70=1`). The fake engines and Xvfb ran in one window.
  The script timed the list's draw and wrapped projchats' hooks to time them. It watched the bar with a
  MutationObserver and counted the `hub.projchats.*` writes to localStorage.
- **Without the app** (`dev/projperf120-test.js`). This is the load-aware budget check:
  - `projchats.js` runs in a small fake window with 3,000 chats and 41 projects;
  - 2,831 of the chats are in Earlier chats;
  - each time is judged by `dev/loadwait.js`, and it reports "can't tell" when the box is busy.

### Before / after (in the app, heavy profile, medians)

| Stretch | Before | After |
|---|---|---|
| Switching project from the bar: the list drawn | **459 ms** | 3.3 ms |
| … localStorage writes / bar repaints per switch | 2 / 1 | 2 / 1 (only when the project really changes) |
| Opening a chat of another project (Ctrl/⌘+K): the list drawn for its project | **455 ms** | 1.6 ms |
| … the list showing that chat | failed in 4 of 12 (the chat was inside another project's group) | 12 of 12 |
| A letter typed in the list's search box: the draw | 4.2 ms | 1.5 ms |
| … projchats' own part / writes / bar repaints | 0.1 ms / 0 / 0 | 0.1 ms / 0 / 0 |
| A reply saved in a background chat: the list drawn | **460 ms** | 1.7 ms |
| … projchats' own part | 0.1 ms | 0.2 ms |
| A sync arrival of the projects store: the event | 0.9 ms, 1 write (1,576 ids again), 1 bar repaint | 0.6 ms, 0 writes, 0 repaints |
| … the keeper 4 s later | **28.5 ms** (the careful read of the whole store over IPC + the sweep) | 0.2 ms (nothing due: no read) |
| The keeper's 2-minute tick with nothing to do | **24.5 ms** | 0.1 ms |
| The sweep itself (41 projects, 2,199 chats) | 0.3 ms | 0.2 ms (unchanged; now rarely needed) |
| The scope filter over every chat | — | 0.3 ms |
| 10 s idle with the list open | 0 draws, 0 writes, 0 repaints, 0 long tasks | same |

On a 240 Hz screen a 460 ms draw is about 110 missed frames. Now a draw fits in one frame.

### Where the half second went

None of it was in projchats' own hooks. They cost 0.1 to 0.3 ms a draw before and after.

Round 116 meant to take Projects' and makes' own groups out of the chats list ("Stoop Ronin" groups, makes' groups,
**Group by project**). `projchats.js` removed their `top` / `skip` hooks when it loaded. But `projects-cmds.js` and
`makes.js` add those hooks in a `DOMContentLoaded` handler. The lazy loader runs that handler **after** every file of
the group is in, so after `projchats.js`. The hooks came straight back. As a result:

- `Projects.panelSkip` ran for every chat in every draw. It called `chatsOf(project)` each time, which looks up every
  chat of the project and its `ChatUX.metaOf`. With 1,576 chats in Earlier chats, that is about 1,576 × 1,576 lookups:
  ½ s per draw.
- The list still showed up to 8 project groups (`proj:pjbp0`, …) on top of the open project's chats. So the list wasn't
  "only the open project's chats", and a chat of another project could show there.
- The ⏷ menu still had **Group by project**.

## What changed

- `projchats.js`
  - **The old groups stay out.** `unhook()` takes out Projects' and makes' `top` / `skip` hooks and Projects'
    `panelMenu`:
    - when the file loads (as before);
    - again in its own `DOMContentLoaded` handler, which the lazy loader runs after `projects-cmds.js`' handler;
    - at a draw, if anything added them later. This is a length check, and the list is drawn again without them.
  - **No work on a plain draw.** The render hook only checks for a new chat (`watch`, which does nothing while the
    chats list is the same object) and for a newly opened chat or project (`follow`). Neither writes anything.
  - **Recomputed only when the store or the scope changes.** `refresh()` runs on `hearth:projects`, on a scope change,
    and after a placement. It rebuilds the open project's id Set. It writes `hub.projchats.early` only when the ids or
    the project differ (about 40 KB of JSON for Earlier chats). `setScope` writes `hub.projchats.scope` only when the
    scope differs.
  - **The bar is painted only when it changes.** `paintBar()` keeps a key of what it shows:
    - the project's id, name, mark and color;
    - with no project open, the 6 projects it offers;
    - the "reading / couldn't read" state.

    It rebuilds its DOM only when that key changes.
  - **A chat's project from an index.** `projectIdOf` (used by `follow`, `place` and the keeper) reads an index instead
    of scanning every project. The index is rebuilt after any `hearth:projects` event, a new store object (sync), or a
    sweep here. It gives the same answer: the first project in the list order.
  - **The keeper is cheap when nothing is due.** It first asks `ProjChatsCore.due()`. When no sweep is due, it skips
    the careful read (the whole store over IPC) and the sweep. It still forgets the waiting chats that have a project
    now. When a sweep is due, it reads carefully and sweeps as before.
- `projchats-core.js`
  - New **`due(data, chats)`**: one pass, no copies. It is true when a chat is listed by two projects, or when a chat of
    the list is in no project. In every other case `sweep()` reports no change. The test checks this on 300 random
    stores.
- `panel.js`: unchanged. Its per-chat scope check is 0.3 ms over 3,000 chats.

**Behaviour stays the same.**

- A store read failure is still never "empty". The keeper still reads carefully before every sweep that could write,
  and skips when the read fails.
- The keeper now skips the read only when the sweep would write nothing anyway.
- The migration, the grace for a chat with no project, deletes, imports and new chats are unchanged.
- The one visible change is the fix itself: the list is now the open project's chats only, as round 116 described.
  Projects' groups and **Group by project** no longer come back after start.

First screen (`node dev/boot-test.js`): 62 scripts, 1,578 KB of code (budget 1,586), 27 stylesheets, 416 KB. These are
unchanged, because only lazy files changed.

## Budgets

- `dev/projperf120-test.js` (in UNIT, about 3.5 s). The budgets are ms per operation, scaled by the box's calibration
  factor and judged by `loadwait`. Each was measured after the fix, and the budget leaves a margin:

  | Operation | Measured | Budget |
  |---|---|---|
  | Plain-draw hook | 0.002 | 0.05 |
  | Hook with a new chats list | 0.14–0.18 | 0.6 |
  | Scope filter over 3,000 chats | 0.26–0.51 | 1 |
  | Project switch | 0.15–0.23 | 2 |
  | Arrival event | 0.39–0.41 | 1.5 |
  | Keeper with nothing due | 0.37–0.51 | 1.5 |

  The counts are exact:
  - a plain draw writes nothing and repaints nothing;
  - a switch writes 2 and repaints once;
  - an arrival that doesn't change the open project writes and repaints nothing, and the keeper reads nothing;
  - a rename repaints the bar once;
  - a duplicate gets a careful read, a sweep and a save;
  - a chat with no project gets a careful read and is left for its grace;
  - hooks added late are taken out.
- `dev/checks/projperf120.js` (opt-in `BIGPROFILE70=1`, about 50 s).
  - The counts above are exact in the app.
  - The times are wall times in a window on a shared box. They are judged loosely and fail past 4× the budget: switch
    15 ms, follow draw 15, reply draw 15, keeper after sync 3, keeper tick 2, among others. Before the fix the draws
    were 100× these.
  - It also checks:
    - the list shows only the open project's chats;
    - the bar names it;
    - the early-ids note holds its chats;
    - every chat is in exactly one project.
- `dev/run-checks.js`: `projperf120-test` in UNIT, and a `projperf120` group.

## Tests run

- `node dev/projperf120-test.js`: 23 passed, 0 can't tell (run 3 times).
- `node dev/projchats116-test.js`: 7 passed.
- `node dev/projsync118-test.js`: 96 passed.
- `node dev/boot-test.js`: 2,812 checks passed, first screen within budget.
- With `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, `run-checks --exact projperf120
  unit:projperf120-test unit:projchats116-test unit:projsync118-test projects projaudit91 qa-commands unit:boot-test`:
  all passed except `projects`.
- `projects` tested the old grouped list (a project's group in the chats list, collapsing it, Group by project on
  showing groups). Its expectations are now the one-project list (see For Codex). It then passed alone with
  `run-checks --exact projects`.
- No full release run, as asked.

## For the patch notes

The chats list is fast again with thousands of chats. Switching project, opening a chat from Ctrl/⌘+K in another
project, and a reply arriving in a background chat used to freeze the list for about half a second. Now each takes a
few milliseconds. The list also really shows only the open project's chats now: the old project groups at the top of
the list, and "Group by project", had come back after start and are gone again. Checking that every chat is in one
project now costs almost nothing when there's nothing to fix. Hearth no longer re-reads your whole projects file every
two minutes.

## For Codex

No Codex-owned app file was changed. One Codex check was edited, with each edit marked `// (round 120, projperf120)`:

- `dev/checks/projects.js`. It expected the grouped chats list from before round 116. That list only still showed
  because Projects' hooks came back after the lazy load (fixed here). Now:
  - **Section 2**, the make's project: with it open, its two rooms show once each, there is no project or make group,
    and the bar names it. This replaces "one group for the make's project" and "the group keeps the make's status".
  - **Section 6**, Stoop Ronin open: its chats show once each, nothing else, and there is no project group. This
    replaces "groups the project's chats", "not repeated under their agent" and "the group collapses".
  - `/project group on` no longer brings project groups back.
  - Before the right-click step, the list switches to the chat's project.
  - The header line is updated.

A follow-up for Codex, not done here. `projects-cmds.js` and `makes.js` still push `panelSkip` / `panelTop` (and
`panelMenu`) into the chats list's hooks at `DOMContentLoaded`, and `projchats.js` takes them out again. They could
stop pushing them. `/project group on|off` and `Projects.setGrouping` no longer change the list.
