# Chats live in projects (round 116, projchats116)

The owner's request: chats belong to their project, and there's no general chats list. Every chat now belongs to
exactly one project. A project holds as many chats as you like, with any AI.

## What changed

- **The chats list shows only the open project's chats.** A bar at the top of the list names the project
  (`◆ Stoop Ronin ▾`). Next to it is **＋ New chat** (pick the AI: "With Claude", "With Astra", "With Three Director").
  - Click the project name to switch project, make a **＋ New project…**, **⌂ Open its page**, or go to **All projects…**.
  - With no project open, the bar says **No project open** and lists your recent projects as buttons, with
    **＋ New project…**.
  - The project groups from other projects, the makes' groups, and the ⏷ menu's **Group by project** / **Only one
    project** are gone. Website chats (visited pages) aren't project chats, so the list doesn't show them. They are
    still on the rail.
  - The open project follows what you open: a project (its page or its workspace), or a chat opened from anywhere
    (Ctrl/⌘+K, a link, a notification). Clicking a project in the bar switches the list without opening anything.
- **New chat always lands in a project.** Every way of starting a chat does this: the bar's ＋ New chat, an AI's ＋ in
  the list, the chat's own ＋ New chat, Ctrl/⌘+N, Home's ⋯ › New chat, and the tray. The chat goes into the open
  project.
  - With no project open, a small window asks **Which project is this chat for?** It lists your projects, with
    **＋ New project…** and **Cancel**.
  - A Three Director / Lab chat goes into the project of the scene on screen.
  - If nothing was chosen (Cancel), or the chat came from somewhere that can't ask, it goes into the open project, or
    else into **Earlier chats**. A note says so.
- **Moving a chat is a move.** Right-click a chat › **Move to project…** (in the chats list, on a project's page and in
  Search everything). It lists your projects with a ✓ on the chat's current one. Choosing another project takes the
  chat out of the old one and puts it in the new one ("Moved to “Album”").
  - Any other way of adding a chat to a project is also a move: a project's ⋯ › Add › This chat / A chat, and
    `/project add`.
  - A chat no longer has **Take out of “…”**, because that would leave it with no project.
- **Wording.**
  - The list's search box says "Search this project's chats (#tag)".
  - The ⏷ menu's first row says "All of this project's chats".
  - Ctrl/⌘+K's message search no longer says "Not in a project".
  - A project's menu says **Show its chats**, which switches the list to that project.
  - Deleting a project now says its chats move to "Earlier chats".
  - Home's empty page and ⋯ menu wording is updated.

## The migration

It runs once on each computer, shortly after start, when the projects code loads. It works in `projchats-core.js`
`sweep()`.

- **A chat in several projects** stays in one of them and is taken out of the others' lists only. The chat itself is
  never touched. Which project it keeps is decided the same way on both computers:
  1. The project whose own chat it is (the project's workspace chat), meaning the project it was last used as the
     conversation of.
  2. Otherwise a real project before "Earlier chats", and a live project before an archived one.
  3. Otherwise the project it joined first (by its item's time).
  4. Otherwise the lower id.

  "Most recently used" is only known on one computer (the return points are kept per computer). Using it would let the
  Windows PC and the Mac choose differently, and the merge would then leave the chat in neither. So only what both
  computers share counts.
- **A chat in no project** goes into **Earlier chats**. That project has a fixed id (`pj-earlier-chats`) and a fixed
  name, look, notes and times. When the PC and the Mac migrate at the same moment, they make the same project, and
  sync merges its chat lists into one project, never two (tested with sync's own merge). The owner can rename it,
  recolor it, or move chats out of it. If it was deleted, it comes back from Recently deleted when chats need a home
  again.
- **Nothing is deleted. It is reversible.** Each project a chat was taken out of keeps a record of it in its
  `chatsMovedOut` list (the chat, where it went, the old link as it was). Each chat the migration put into Earlier
  chats is marked `was: 'no-project'`. `ProjChatsCore.undo(data)` puts every recorded link back. Both records are
  ordinary project fields, so they sync and survive the store's cleaning.
- **A read failure is never "empty".** Before anything is written, the projects store is read with
  `kv:get { status: true }`. The migration does not run, and is not marked done, when:
  - the store says `unreadable`;
  - the file isn't a projects store;
  - the store holds projects but this window's copy is empty (the window's own read failed);
  - the chats list isn't loaded.

  It tries again every minute. Until then, the list shows every chat (it fails open) and the bar says so.
- **Sync.** The migration's writes are ordinary saves of the projects store (`Projects.changed` + `Projects.flush` →
  `kv:set`). Sync's write guard and its bases, `store.settle` (round 98) and `choiceWrite` (round 97) handle them like
  any other edit. Nothing here writes files directly.
- **Afterwards**, a small keeper applies the same two rules again after the other computer's changes arrive, and every
  2 minutes. It covers a chat from an older Hearth, a restored project, or a chat that arrived before its project link.
  A chat with no project waits 3 minutes first (its project link is usually a moment behind), then goes to Earlier
  chats. A chat that is in Earlier chats and also in a real project leaves Earlier chats.

## Search, Lab chats, Quick idea, assets

- Ctrl/⌘+K and Search everything still search every project's chats. Opening a result opens it in its project: the
  project's conversation view when it has a workspace (as before), otherwise the chat, and the list switches to its
  project.
- A Three Director / Lab chat goes into the project of the scene on screen. Its scene joins that project as before
  (`Projects.sceneLinked`).
- Quick idea (ideas into a project's notes) and assets (Use in…, Project ›) don't make or move chats. They are
  unchanged.

## Files

- New:
  - `projchats-core.js`: the rules (pure; Node-tested).
  - `projchats.js`: the window's side (the bar, new chats, following, the migration and its keeper).
  - `projchats.css`.
  - All three are in the `projects` lazy group, after `projects-cmds.js`.
  - `dev/projchats116-test.js`.
- `panel.js` (first screen, about 0.3 KB):
  - a `scope` hook (only the open project's chats; a website's group is left out while it is on);
  - until `projchats.js` loads, the ids it last showed (`hub.projchats.early` in localStorage), so the full list
    doesn't flash at start;
  - wording.
- `chatfind.js`: one wording change.
- `lazy-data.js`: the group's files.
- `dev/run-checks.js`: `projchats116-test` in UNIT.

First screen after the change: 64 scripts, 1,693 KB of code (budget 1,696), 28 stylesheets, 423 KB (budget 424).

## Tests run

- `node dev/projchats116-test.js`: 7 passed. It covers:
  - the migration with zero, one and several projects, with records, undo and idempotence;
  - Earlier chats ranking last;
  - two computers making the same Earlier chats, merged into one by sync's `merge3`;
  - an unreadable store skipping the migration (nothing written, not marked done), also when only the window's read
    failed;
  - a new chat landing in the open project;
  - a director chat landing in its scene's project;
  - Move to project… through the real `Projects` menu;
  - `Projects.add` being a move;
  - no chat without a project.
- `node dev/boot-test.js`: 3,130 checks passed, within budget.
- `node dev/lazy-manifest.js` (and `--check`): unchanged (no new commands), nothing threw.
- `run-checks --exact`:
  - `projchats116-test`, `projsearch81-test`, `search113-test`, `boot-test`: passed.
  - `projopen109` (249 s) and `lazy` (110 s): passed.
  - `projsearch81` and `search113`: skipped by the runner. They are opt-in big-profile checks (`BIGPROFILE70=1`).

## Not done / next

- Checks for the old grouped list (Group by project, a project's group in the chats list, makes' groups in the list)
  were not run, as asked. They will likely need their expectations updated to the one-project list.
- "Import past chats…" puts imported chats into Earlier chats (after the keeper's grace), not the open project.
- There's no button for undoing the migration yet. `ProjChatsCore.undo` exists and the record is kept.

## For the patch notes

Chats now live inside projects. The chats list on the left shows only the chats of the project you have open, with the
project's name at the top: click it to switch project or make a new one. "＋ New chat" starts the chat in that project,
with whichever AI you pick. If no project is open, Hearth asks which project the chat is for. Right-click a chat ›
**Move to project…** moves it to another project. Chats from before this change that weren't in a project are in a new
project called **Earlier chats**: rename it or move chats out of it whenever you like. A chat that was in several
projects now stays in one of them. Nothing was deleted, and Ctrl/⌘+K still finds chats in every project.

## For Codex

Codex-owned files touched at the owner's request. Each edit is marked `// (round 116, projchats116)`.

- `projects.js`
  - `add()`: adding a chat to a project first takes it out of every other project (a move). This covers Add ›
    This chat / A chat, `/project add`, Move to project…, `importScenes`.
  - `itemMenu()`: no "Take out of “…”" for a chat.
  - `projectMenu()`: for a chat, the label is "Move to project…", and clicking the project it's already in does
    nothing (no remove); a move shows a toast.
  - `menu()`: "Show only its chats" → "Show its chats" (`ProjChats.setScope`; falls back to the old view).
  - `removeProject()`: the toast says the chats move to "Earlier chats".
- `projects-home.js`
  - The empty page's hint wording.
  - ⋯ › "New chat (in a project)…".
  - "Group chats by project" removed from ⋯ (a marker comment stands where it was).
  - The ⋯ button's title.
- Not changed: `project-workspace*.js`, `projects-core.js`. `projchats.js` uses `Projects._data()`,
  `Projects.changed()`, `Projects.flush()` and the hooks as they are. It takes Projects' `panelTop` / `panelSkip` /
  `panelMenu` (and makes' top/skip) out of the chats list's hooks at load, instead of editing them. They still work if
  re-added.
- New fields in kv `projects`, which the store keeps:
  - `p.chatsMovedOut: [{ id, to, item, at }]` on a project;
  - `was: 'no-project'` on an item;
  - the project `pj-earlier-chats`.
