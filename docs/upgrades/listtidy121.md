# The old project groups removed at their source (round 121, listtidy121)

Since round 116 every chat belongs to one project, and the chats list shows only the open project's chats
(`projchats.js`). Round 120 (`projperf120.md`) found that the old "project groups" in the list kept coming back.
`projects-cmds.js` and `makes.js` added their `top` / `skip` / `menu` hooks at `DOMContentLoaded`, and `projchats.js` took
them out again three times: at load, at `DOMContentLoaded`, and at every draw. Those hooks once cost about 460 ms a draw.

This round removes the old grouping where it starts, and removes the code that this leaves dead.

## What was removed

Line counts are from `git diff --numstat` (added / removed).

| File | +/− | Removed |
|---|---|---|
| `projects.js` (Codex) | +9 / −78 | `grouping`, `setGrouping`, `hidesMake`, `roomElsewhere`, `chatsOf`, `panelSkip`, `panelTop` (a project's group above the agents), `panelView` (the `project:<id>` view and its chip label), `panelMenu` ("Group by project", "Only one project"), `MAX_GROUPS` / `PER_GROUP`, and their exports. "Show its chats" no longer falls back to the `project:<id>` view. |
| `projects-cmds.js` (Codex) | +11 / −14 | The four `Panel.hooks.skip/top/view/menu` pushes. The `group` / `filter` verbs (their help, completion and code). The "Right-click a project" key line no longer says "in the chats list". |
| `makes.js` | +12 / −72 | `panelTop` (a make's group with its rooms), `panelSkip`, `paintProgress` (it only painted that group), `ST_TAG`, `MAX_GROUPS`, the two hook pushes, the "Alt+right-click a room" key line, and two list redraws that only served the group (`changed()` and the end of `ready`). |
| `panel.js` | +10 / −22 | The `skip`, `top`, `view` and `menu` hooks, `skipped()`, `viewName()`, the top-groups block in `render()`, the hook loop in `inView()`, the ⏷ menu's hook rows, and the "rows of several agents" branch in `highlight()`. The hooks left are `row`, `render`, `itemMenu` and `scope`. |
| `projchats.js` | +6 / −17 | The `unhook()` workaround: at load, at `DOMContentLoaded`, and the length check at each draw. The render hook is now just `watch(); follow();`. |
| `makes.css` | +2 / −17 | `.mk-group …`, `.item.mk-room …`, `.item .mk-tag …`, `.show-more.mk-more-makes`. |
| `projects.css` (Codex) | +2 / −11 | `.pj-group …`, `.item.pj-row …`, `.show-more.pj-more-projects / .pj-all`. |

In all, about 230 lines of app code and CSS were removed.

**No guard was left in `projchats.js`.** `panel.js` no longer has `top`, `skip`, `view` or `menu` hooks. An old caller
writing `Panel.hooks.top?.push(…)` does nothing, and `panel.js` never reads such a list. So nothing can bring the groups
back.

## Commands

`/project group …` and `/project filter …` (with any words, or none) answer in one plain line:
"Chats now live in one project each: open a project to see its chats." They never say "unknown command". Both verbs are
gone from `/project`'s help, its arguments and its completions.

## Settings and stored data

- `projects.group` (default "on", read only by `grouping()`) is no longer read or written. No defaults table held it: the
  default lived in `grouping()`, which is removed.
- A value already stored stays as it is. Nothing is deleted.
- The same goes for the per-project / per-make collapse entries (`proj:<id>`, `make:<id>`) in `hub.collapsedGroups`.
  The list keeps using that setting for each AI's group and its folders. The old entries stay and are simply never asked
  about.
- A `panel.view` of `project:<id>` saved by an older Hearth is still turned into the open project by `projchats.js`, as
  in round 116.

## What was kept, and why

- **Per-AI grouping inside the open project.** This is the list itself: each AI's chats, its folders, collapse, "Show
  more" and the virtual rows. Unchanged.
- **The `scope` hook** (projchats' filter) and the `projchats.early` ids used before the projects group loads.
- **The `itemMenu` hook.** It gives a chat's right-click menu "Move to project…".
- **The `row` / `render` hooks.** They are used by chat-scenes, recall and chatsafe.
- **Projects Home, the Desk / workspace, Search everything (Ctrl/⌘+Shift+K), the Lab's sketch picker groups**
  (`sketchGroups` / `sketchBrowse` / `sketchMenu`), and `Projects.menu` / `projectMenu`. All are still used elsewhere.
- **The ⏷ filters** (pinned, today, week, unread, busy, archived, tags, folders, an AI's name) and the "Showing: …" chip.
- **Makes.** `roomOf` / `roomsOf`, the room card, the Makes page on the Commands page, `makeMenu`, the progress API, and
  `Projects.syncMakes` (a make with rooms is a project, so its rooms show in that project's list) are all unchanged.
  `changed()` still repaints the Makes page.
- **Messages.** "Plan a make" now says the rooms are in the make's project's chats list, not "grouped under the make".

## Speed

The list does slightly less per draw: no hook arrays to check, no per-chat `skipped()` call, and no length check in
projchats' render hook. The in-app round-120 check passes:

- switch 2.6 ms (budget 15);
- follow draw 1.4 ms (15);
- reply 1.9 ms (15);
- keeper after sync 0.2 ms (3);
- keeper tick 0.1 ms (2).

First screen (`node dev/boot-test.js`): 62 scripts, **1,574 KB** of code (was 1,578; budget 1,586), 27 stylesheets,
415 KB (was 416). `makes.js` and `makes.css` are first-screen files.

## Tests

Expectations were changed only where they tested the removed grouping:

- `dev/projperf120-test.js`
  - The fake `Panel.hooks` now has panel.js's new shape.
  - The two "old groups added later are taken out" checks became one check. It verifies that Projects exports no list
    hooks, that nothing is added at `DOMContentLoaded`, and that a draw doesn't draw again.
  - Result: 22 passed (was 23).
- `dev/projchats116-test.js`
  - The fake hooks no longer start with stray `top` / `skip` entries.
  - "No general groups" now checks that Projects has no `panelTop` / `panelSkip` and that the hooks have no `top` /
    `skip`.
- `dev/projsync118-test.js`: only the fake hooks' shape changed.
- `dev/checks/projects.js` (Codex, marked) has a new section 6. It checks that `/project filter <p>`, `/project group on`
  and `/project group off` each answer the plain line, and that the list stays the open project's (no chip, no groups).
  This replaces "⏷ only one project: the chip names it" and the two group on / off steps.
- `dev/checks/smooth46.js` (not run this round)
  - Its search step pushed a counting hook into `Panel.hooks.skip`, which no longer exists. The same counting hook now
    goes into `Panel.hooks.scope`, which is also asked after the search.

Runs:

- `node dev/projperf120-test.js`: 22 passed, 0 can't tell.
- `node dev/projchats116-test.js`: 7 passed.
- `node dev/projsync118-test.js`: 96 passed.
- `node dev/boot-test.js`: 2,822 checks passed, first screen within budget.
- `node dev/lazy-manifest.js --check`: passed. It was regenerated because `/project`'s args and the Projects / Makes key
  lines changed. Only `lazy-meta.js`'s text line moved.
- With `HEARTH_THREE_DIR=… BIGPROFILE70=1`:
  - `run-checks --exact projects projaudit91 qa-commands`: projaudit91 and qa-commands passed. `projects` failed on the
    old "⏷ only one project" step, because that run had started before the check's expectations were updated.
  - `run-checks --exact projects` again: passed.
  - `run-checks --exact projperf120 unit:projperf120-test unit:projchats116-test unit:projsync118-test`: 4/4 passed.
- No full release run, as asked.

**Not run, likely affected.** `dev/checks/makes.js` still expects a make's group in the chats list (`.mk-group`, "the
rooms aren't repeated under their agent", the `.mk-tag` "planned" rows, the group's `%`). That group has not shown since
round 116 / 120 (projchats took it out), so this check was already out of date. Its expectations should become: the make's
rooms are in its project's list.

## For the patch notes

The old "group chats by project" leftovers are gone for good. The chats list always shows the open project's chats, and
nothing in Hearth tries to draw the old project or make groups any more. Hearth no longer has to clean them up on every
redraw. `/project group` and `/project filter` now just say that chats live in one project each: open a project to see
its chats. Your settings and chats are untouched.

## For Codex

Minimal removal edits in Codex-owned files. Each is marked `// (round 121, listtidy121)` (or `/* … */` in CSS):

- `projects.js`
  - Removed `grouping`, `setGrouping`, `hidesMake` (and its helper use in `roomElsewhere` / `chatsOf`), `panelSkip`,
    `panelTop`, `panelView`, `panelMenu`, `MAX_GROUPS` and `PER_GROUP`, and their exports.
  - The header comment no longer describes the list groups.
  - `menu(p)`'s "Show its chats" is now `window.ProjChats?.setScope(p.id)`. It no longer falls back to
    `Panel.setView('project:…')`, which nothing would filter now. ProjChats is in the same lazy group.
- `projects-cmds.js`
  - Removed the `Panel.hooks.skip/top/view/menu` pushes.
  - The `group` / `filter` verbs are gone from `VERBS`, `args` and completion.
  - Both verbs now return "Chats now live in one project each: open a project to see its chats."
  - The "Right-click a project" key line now says "On Home: …".
  - The header comment is updated.
- `projects.css`: removed the chats-list rules (`.pj-group …`, `.item.pj-row …`, `.show-more.pj-more-projects /
  .pj-all`).
- `dev/checks/projects.js`: section 6 now checks the one-line answers instead of the filter chip and group toggles. The
  header line is updated.
- Follow-up, not done here: `dev/checks/makes.js` still expects the make's group in the chats list (see Tests).
