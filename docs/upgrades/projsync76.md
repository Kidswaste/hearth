# projsync76: a whole project across your PC and your Mac (round 76)

Rounds 72–75 hardened sync file by file (chats, scenes, notes, big files, Windows / Mac edge cases, the state in
pieces). Nobody had followed **one project's whole life** across two computers: made on one, opened on the other before
its parts arrived, edited on both while one was offline, renamed on one while the other added a scene, deleted on one
while the other kept working in it, duplicated / imported, restored to an earlier version. This stream ran each of
those through the two-computer simulator with the real sync engine and the real project code, fixed every bug found,
and gave each project's Desk one plain **Sync status** line.

## What was wrong (each a failing check first, all fixed)
| # | What the owner would have seen | Why | Fix |
|---|---|---|---|
| 1 | **"⚠ 1 conflict" just for opening the same project on both computers** (its Desk, a card, Continue) | a project's `opened` time wasn't known as a time: two values = a conflict | `opened` merges as a time (the later one) — `sync-merge.js` |
| 2 | **A thing put on the worktable shelf on each computer: one of them gone** (to Deleted files) | the shelf has no ids and new things go first: "both only added" only knew additions at the end | additions before and / or after what both had are all kept, once |
| 3 | **A storyboard shot edited on the PC and another on the Mac: one computer's edit gone** | a list without ids changed in two places was one conflict | same length, each place changed on one side at most: each side's change stays (the same shot two ways is still a real conflict, never mixed) |
| 4 | **A project deleted on the PC came back silently** when the Mac had only *opened* it meanwhile — and when the Mac really edited it, it came back with no word, its last PC notes only in Recently deleted | a deleted project the other computer changed is kept by sync (never lose), but nothing told the two cases apart or said anything | only opened there → the delete goes through; really changed there → kept, marked, with **Keep it / Delete it** on its Desk, a toast, a pill on its card; Keep it folds the deleted copy's note lines and items back in (nothing lost) |
| 5 | **The project you had open deleted on the other computer: it just vanished** | — | a toast: "“Clink” was deleted on your other computer. Its chats, scenes and files stay here; it waits in Recently deleted." with **Restore** |
| 6 | **A change made in the last moment (a rename, notes, an item taken out) dropped** when the other computer's version arrived within 300 ms | the reload threw the pending save away | the pending change is written first (sync's write guard merges it with what arrived), then read back |
| 7 | **Taking out of a project something that had just arrived from the other computer: it came back** | the window reloaded the arrival but never told sync, so sync's guard kept merging every later save against the version from *before* the arrival (the item counted as "added there") | after reading what arrived, the window tells sync (`ack`), so later saves merge against what it really holds |
| 8 | **Opening a project made moments ago on the other computer: a red error** ("not available on this computer yet") and a Retry to press | its chat / scene / moodboard was still on its way | a calm **"Still arriving from Studio Mac…"** card saying what it waits for; it **opens by itself** when something lands (no polling: sync's own arrival event), Try now / Back to projects stay |
| 9 | **That open could make a second scene or moodboard** for a project whose own was still on its way (each computer then had its own, and the project's link was a conflict) | setup made a fresh one when it didn't find the project's | a scene / board the project already has (or its chat is linked to) that was made in the last day waits for it instead; older and missing (deleted) still gets a new one, as before |
| 10 | The Desk's "Modules & mods" could show the old list after a layer changed | its "nothing changed" signature looked for the Lab on `window` (it's a `const`) | looked up properly |

Tested and already right (kept as checks): notes / scene code edited on different lines on both; renamed on one while
the other adds a scene (one name, the scene in, one project); renamed two ways (one name, one project); deleted while
the other writes in its chat (project deleted, the chat and its new message stay); duplicate on one while the other
edits the original (the copy is its own: the edit stays on the original); both computers duplicating the same project
offline (two copies, each once); an import's files arriving later; a version restored on one computer while the other
edits (the restore wins where it changed things, the other computer's new line and item stay); return points, "Keep
the Lab ready" and the Lab's asset cache stay on each computer (this computer's local storage / the preview page's
memory: sync never sees them).

## The Desk's Sync status line
Under a project's name on its Desk, one quiet line (nothing while sync is off):
- **✓ All here · synced 2 min ago**
- **↻ 3 files still arriving from Studio Mac** — its tooltip names them ("or deleted there")
- **↻ 1 file still syncing** (going up) · **○ Offline · last synced 2 h ago** · **‖ Sync paused · …**
- One click opens the sync panel.

It is worked out from what sync already reports (its waiting list, the other computer, when it last synced) and what
this computer has (the Lab's and the boards' own lists when loaded): no timer, no extra reads. It changes when sync
reports or something lands. A chat / scene / board the project has that isn't here counts as arriving when sync says
it's on its way, or when the project changed in the last day (a cloud client may not have even listed it yet); older
and missing means deleted (faded on the Desk, as before) and isn't counted.

## Upgrades
### A project on two computers
1. Opening the same project on both computers no longer makes a sync conflict.
2. Things put on a project's worktable shelf on each computer all stay.
3. Different storyboard shots edited on each computer: both edits stay.
4. Strokes drawn on each computer's worktable: both stay.
5. A project deleted on one computer while the other only opened it: deleted on both (in Recently deleted).
6. A project deleted on one computer while the other changed it: kept, nothing lost, and you choose.
7. Its Desk says "Deleted on your other computer (2 min ago), but it changed after that" with **Keep it** / **Delete it**.
8. Keep it brings back the deleted copy's note lines and items too.
9. Its card on Projects shows "Deleted elsewhere?".
10. A toast tells you when that happens, with Open.
11. Its ⋯ menu has "Keep it (it was deleted on the other computer)".
12. The project you had open deleted on the other computer: a toast says its things stay, with **Restore**.
13. A revived project's deleted copy isn't listed twice in Recently deleted.
14. A rename / notes / item change made the instant the other computer's version arrives is kept.
15. Taking something out of a project right after it arrived from the other computer sticks.
16. Opening a project before its parts arrived: a calm "Still arriving from Studio Mac…" card, saying what it waits for.
17. …which opens the project by itself as soon as they land.
18. Opening never makes a second scene or moodboard for one still on its way.
19. The Desk's "Modules & mods" follows a layer change after a revisit.
### The Desk's Sync status line
20. "✓ All here · synced 2 min ago" under the project's name.
21. "↻ 3 files still arriving from Studio Mac", with their names in the tooltip.
22. "↻ 1 file still syncing", "○ Offline · last synced …", "‖ Sync paused · …".
23. A click on it opens the sync panel.
24. It updates by itself when sync reports or something lands (no timer).

24 upgrades.

## Tested
- **`node dev/projsync76-test.js`** (new, in UNIT, **125 checks in 8 scenarios**) through the two-computer simulator
  (`dev/sync-sim.js`: each computer its own cloud view, delays, half downloads; the real sync engine; the real
  ProjectsCore / ProjectWorkspaceCore / ProjBundleCore / ProjSyncCore): `arrive` (made on the PC, its record first, its
  parts after; the Mac's line "N files still arriving from PC" → "All here" by itself; the return point falls back;
  offline / cloud-only / going up / deleted-long-ago), `both` (notes, worktable shelf + shots + strokes, scene code,
  opened, on both offline; then the same shot two ways = one wins, the other in Deleted files), `rename-add`,
  `delete-edit` (edited / only opened / its chat written on the other computer; Keep it; deleted again, Delete it),
  `bundle` (duplicate vs an edit of the original; an import's big file arriving later on the PC; both duplicating
  offline), `per-computer`, `on-screen` (the window holding the projects while the other computer's version arrives,
  through the engine's write guard), `restore`. Bugs 1–4 and 7 were failing checks there first.
- **`dev/checks/projsync76.js`** (app, by clicks, sync on a temp folder; group `node dev/run-checks.js projsync76`): the
  Desk line (All here; a chat not here → "↻ 1 file still arriving from Studio Mac" with its name; click → the sync
  panel; it lands → All here); deleted on the Mac while changed here → toast + Desk choice, Keep it → both notes, out of
  Recently deleted; the open project deleted on the Mac → toast with Restore → back; a project whose chat hasn't
  arrived → "Still arriving from Studio Mac…" (not failed), Try now / Back; the chat lands → it opens by itself with
  its own chat.
- `dev/projects-test.js` updated: in the list and Recently deleted at once now means "merged by sync" (see 4).
- Ran: unit:projsync76-test, unit:sync72-test, unit:syncstate75-test, unit:synchard74-test, unit:versions75-test,
  unit:projbundle-test, unit:sync-test, unit:projects-test, projects, project-continuity, sync72, lazy, unit:boot-test,
  projsync76 (results in the round report).

## Numbers
- First screen: `lazy-data.js` +~40 bytes (one file and one global in the `projects` group). Everything else is in
  lazy groups (`projects`) or the main process (`sync-merge.js`).
- The Desk line: a few array lookups per draw (the project's items against sync's ≤ 60 waiting names).

## For Codex
`projects.js`, `projects-core.js`, `projects-home.js`, `project-workspace.js` are yours: every edit is small and marked
`(round 76, projsync76)`.
- `projects-core.js`: `normalize()` runs `revive(list, trash)`: a project in both (only a sync merge does that) → the
  delete wins when they're the same but for `opened` / `updated` / `deletedAt` (item ids made again from refs: sync
  rewrites paths in refs, not in ids); else `p.revived = { at: deletedAt }` and its trash copy stays beside it.
  `keepRevived(p, t)` (exported) folds the trash copy's note lines / items in.
- `projects.js`: `save()` tracks `dirty`; `reloadFromDisk()` flushes a pending change first, calls
  `hub.sync.ack(['kv/projects.json'])`, saves back when normalize changed the marks, then `arrivals()` (the two toasts);
  `settleRevived(p, keep)` (exported); `trashed()` leaves out live ids; `removeProject` strips `revived`; one menu row.
- `projects-home.js`: `syncLine(p)` / `revivedNote(p)` in the Desk head, `present(x)`, the card pill, a `hearth:synced`
  listener that redraws an open Desk; `deskSigOf` looks up `ThreeLab` lexically.
- `project-workspace.js`: `onItsWay()` in `ensure()` (scene / moodboard), `ui.arriving(err, retry)` in `loading()`, used
  by `open()`'s catch for `ProjSyncCore.arriving(err)` while sync is on.
- New `projsync-core.js` (pure, in the `projects` lazy group): `status(p, o)`, `arriving(err)`, `rels`, `relOf`.
- `sync-engine.js` / `cloud-files.js`: untouched.

## Edits outside the lane (small, additive)
`sync-merge.js` (`opened` in TIME_KEY; the id-less list rules in `mergeArr`), `projects.css` (the line, the choice),
`lazy-data.js` + `docs/lazy-groups.md` (`projsync-core.js` in `projects`), `dev/run-checks.js` (UNIT + group
`projsync76`), `dev/projects-test.js` (the trash rule). New: `projsync-core.js`, `dev/projsync76-test.js`,
`dev/checks/projsync76.js`.

## Risks
- "Still arriving" for a missing chat / scene / board relies on "the project changed in the last day" when sync hasn't
  listed the file yet; a part deleted on purpose in that day shows as arriving until the next day (the tooltip says
  "or deleted there").
- A project opened on the Mac in the few seconds while the PC's wizard is still making its scene (before the project
  even names one) can still make its own scene; from the moment the project names its scene, the Mac waits.
- Keep it after a delete merges notes by lines and items by id; a renamed project keeps this computer's name.
- The worktable on screen isn't reloaded when the other computer's version arrives (its next save merges through
  sync's guard, so nothing is lost; reopening the project shows both).
- Both computers need this update for all of it.

## For the patch notes
- Projects now travel properly between your PC and your Mac. Open a project's Desk: under its name a small line says
  "All here · synced 2 min ago", or "3 files still arriving from Mac" while things are on their way. Click it for the
  sync panel.
- Open a project you just made on your other computer before everything has arrived and Hearth now says "Still
  arriving from your Mac…" and opens it by itself as soon as it lands, instead of showing an error.
- If you delete a project on one computer while you were still working in it on the other, nothing is lost: it stays,
  and its Desk asks whether to keep it or delete it. If you had only looked at it, the delete simply goes through.
- If the project you have open gets deleted on your other computer, a note tells you, with a Restore button.
- Things you put on a project's worktable shelf, or storyboard shots you edit, on both computers now all stay.
- Opening the same project on both computers no longer causes a sync conflict.
- Where you left off in a project (tab, chat, scene) and "Keep the Lab ready" stay separate on each computer.
- Install this update on both computers.
