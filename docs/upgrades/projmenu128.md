# One project menu (round 128, projmenu128)

The owner's request: "give projects a more refined menu". A project's actions were spread over four places, each with
its own list. Now there is one menu, built by one function (`ProjectMenu.items(project, { where })` in `projmenu.js`),
and it is the same wherever a project shows.

## The audit: every project action before this round, and where it lived

| Action | Chats list bar (projchats.js) | Home card | Desk / project page | `Projects.menu()` (right-click, Desk ⋯, Search) | Other |
|---|---|---|---|---|---|
| Open the workspace (the Desk) | | click | | | Ctrl/⌘+K project row, workspace bar name ▾ |
| ⌂ Open its page (Home's page, no workspace) | ▾ › Open its page | | | ⌂ Open its page | /project open, /home |
| Continue where you left off | | continue chips | continue chips | ↻ Continue… | /project continue |
| Show its chats | ▾ › (pick a project) | | | Show its chats | |
| Switch project | ▾ › project list | | | | workspace bar name ▾, Ctrl/⌘+K |
| New project | ▾ › ＋ New project… (name only) | ＋ New project (wizard) | | | workspace name ▾ › ＋ New project (wizard), /project new |
| New chat | ＋ New chat (pick the AI) | | | | Home ⋯ › New chat, Ctrl/⌘+N, /new |
| Add things | | | ＋ Add | Add › | /project add, drops on the Desk |
| Rename | | | click the name | Rename… | /project rename |
| Colour / mark | | | click / right-click the mark (next one) | Look › Next color / Next mark | |
| Cover | | | | | an item's right-click › Use as the cover |
| Banner / logo | | ✦ on the cover | | ✦ Three.js banner / logo… | |
| Notes | | | notes box | Notes… | /project note |
| AI description | | | Notes & setup › Write description with AI | | |
| AI personality | | | Notes & setup › Project setup | | |
| Status (active / paused / done / archived) | | | status box | Status › | /project status |
| Export / Duplicate | | | | ⇪ Export… / ⧉ Duplicate | Home ⋯ › Import |
| Prepare for offline | | | | ⇩ Prepare for offline… | |
| Earlier versions | | | | Earlier versions… | |
| Its make | | | | Its make › | |
| Keep it (deleted elsewhere) | | | revived note | Keep it… | |
| Delete | | | | Delete the project… (no question; a toast with Undo) | /project delete |

**Duplicates found**
- Two different "open" pages: **⌂ Open its page** (Home's project page without the workspace) and a card click (the
  real Desk, with its Lab, chat and moodboard). The new menu has one **Open the Desk**.
- Three project switchers: the bar's name ▾, the workspace bar's name ▾ and Ctrl/⌘+K's project rows.
- Two new-project flows: the bar asked for a name only; Home and the workspace open the wizard. The menu now uses
  Home's (the wizard; projcreate128 owns it).
- Status three times (Status ›, the Desk's box, /project status), with Archive hidden inside Status ›.
- Colour and mark only stepped through one at a time (Look › Next color / Next mark, the Desk's mark).
- The banner in two places (the card's ✦ and the menu).

**Dead or stale entries**
- `ProjectWorkspace.toolbar()` (Chat / Scene / Creative board / Moodboard, ✦ banner, description, Project setup): defined,
  never called. Left in place (Codex's file), noted here.
- The keys sheet's "Right-click a project" line listed the old menu's rows. Now it names the new menu.
- `Projects.menu()`'s old rows: kept only as a fallback for the moment before `projmenu.js` loads. After that,
  `Projects.menu()` returns the new rows.
- Not a project action, so left alone: Home's own ⋯ (Import, frontpage, rail, archived and deleted lists), an item's
  right-click (`itemMenu`), and a chat's **Move to project…**.

## The new menu

One function builds it: `ProjectMenu.items(p, { where })`. `ProjectMenu.show(p, { x, y, where, kbd })` draws it with
its header. Every row calls what already did the job: `Projects`, `ProjectWorkspace`, `ProjChats`, `ProjBundle`,
`Access`, `Versions`, `Offline` and the Lab. A row whose part isn't there is left out.

**Header:** the project's mark in its colour, its name, and one status line, e.g.
`3 chats · 2 scenes · song 128 BPM · 1 render · brief ready` (the song's BPM shows when its scene is playing in the Lab;
"brief ready / no brief yet" shows once ProjectBrief exists; "archived" / "paused" / "done" when it is).

| Section | Rows (left out when…) |
|---|---|
| **Open** | Open the Desk · Open in the Lab (no scene) · Open its chats · Continue where you left off · Its make › (no make) · Other projects › (switch, ＋ New project…, All projects…) |
| **Make** | New chat › (each AI; the Default AI first) · New scene · Add to the moodboard… (no moodboard) · Add a song or footage… (no scene) · Add something already made › · Notes… |
| **AI** | Prepare / Refresh the brief · Ask the AI what to do next (both only when aiprep128's `ProjectBrief` exists) · Write / Rewrite its description with AI (no Desk yet) |
| **Look** | Rename… · Colour and mark… · Cover picture › (Automatic, a frame of its main scene, its renders and stills) · ✦ Three.js banner / logo… |
| **Share & keep** | ⇪ Export project… · ⧉ Duplicate project · Show its folder (no files) · Render the main scene… (no scene) · ⇩ Prepare for offline… · Earlier versions… |
| **Settings** | Default AI › · AI personality… (no Desk yet) · Aspect & frame rate… · Files the AI may use… (no chat) · Status › |
| **Close** | Archive / Unarchive · Keep it (only for a project deleted on the other computer) · Delete the project… |

Small new pieces:
- **Colour and mark…**: a small window with the 8 colours and 12 marks. A click changes it at once (it syncs).
- **Cover picture › A frame of its main scene / This Lab frame**: the Lab's picture now (it opens the main scene first
  if needed). It is kept with the chats' attachments, added to the project as a still, and used as the cover.
- **Default AI**: kept on the project (`p.prefs.agentId`). New chat › in the menu and the bar's ＋ New chat list it first,
  marked "default".
- **Aspect & frame rate…**: kept on the project (`p.prefs.aspect`, `p.prefs.fps`). Saving it puts the frame (and the
  frame rate of a scene's own timeline) on the project's scenes. The Lab also reads it: a project scene that shows with
  no frame of its own, or with the default 30 fps timeline, takes the project's.
- **Delete the project…** now asks first and names what's inside, e.g. "It holds 1 chat, 1 file. The project goes to
  Recently deleted… Its chats move to “Earlier chats”; its scenes, boards and files stay where they are: nothing is
  erased." The toast's Undo and Projects › ⋯ › Recently deleted still bring it back.
- **Archive / Unarchive** is its own row, with Undo in the toast.

### Where the owner clicks

- **The chats list**: the project's name at the top (`◆ Stoop Ronin ▾`). With no project open it is still the project
  picker.
- **Home**: the new **⋯** on each card, or right-click the card.
- **The Desk**: its **⋯** next to ＋ Add.
- **The workspace bar**: name ▾ › **This project's menu…** (its first row; the rest is still the switcher).
- **Search everything** (Ctrl/⌘+Shift+K): right-click a project.
- **Keyboard**: **Ctrl+Shift+O** (⌘⇧O on a Mac) opens the menu of the project in front of you, on its first row. ↑ ↓
  move, Enter runs, → opens a submenu, ← goes back, Esc closes, and typing filters. Ctrl+Shift+O was free: it is not
  in keys.js's sheet, renderer.js's shortcuts, the lazy groups' keys or the Lab, and Astra uses Ctrl+Alt+O, not
  Ctrl+Shift+O.
- **Ctrl/⌘+K**: **Project menu** (with its key), and one **Project: …** row per row of the menu for the project in front
  of you ("Project: Rename…", "Project: Archive", "Project: New chat ›"…). Each row finds the project again when it
  runs.

The project "in front of you" is the open workspace or Desk, the project of the chat or scene on screen
(`Projects.here()`), and otherwise the one the chats list shows.

## Files

- New:
  - `projmenu.js` and `projmenu.css`, lazy group **projmenu** (after `projects`, in an idle moment; its key loads it if
    it is pressed before then).
  - `dev/checks/projmenu128.js`.
- `lazy-data.js`: the group, with the early key. The manifest is regenerated (`node dev/lazy-manifest.js`): 1 action,
  1 keys line.
- `index.html`: `projmenu` in the `lazy-at.js` tag after `projects`.
- `docs/lazy-groups.md`: one line.
- `projchats.js` (not Codex's): the bar's name ▾ opens the project menu. The bar's ＋ New chat lists the Default AI
  first.
- `dev/run-checks.js`: the group `projmenu128`.
- Checks updated for Delete now asking first: `dev/checks/projaudit91.js`, `dev/projaudit108-src.js`,
  `dev/checks/projects72.js`.

First screen: unchanged (62 scripts, 1,574 KB of code; budget 1,586).

## Tests

`dev/checks/projmenu128.js` (one app check, about 70 s) covers:
- **The same rows** in the same order from the bar's name ▾, a Home card's ⋯, its right-click and the Desk's ⋯, in the
  real DOM. `ProjectMenu.items` gives the same ids for every `where`, and `Projects.menu()` gives the same too. It also
  checks the header (mark, name, status line), the section order, and that the rows have labels and icons.
- **Every row runs or is hidden.**
  - A bare project has no Lab, moodboard, song, render, folder, description, personality or files rows.
  - The brief rows are hidden while there is no ProjectBrief.
  - For a full project, every row is run with what it calls stood in for: open, continue, scope, the file picker,
    bundle, reveal, the Lab's templates, the export panel, versions and form. The check confirms each row called the
    right thing for this project.
  - The Colour, Files and Delete rows open their windows or menus, and Archive archives.
  - Every submenu has rows.
  - Default AI is kept and offered first.
- **Rename / Colour and mark / Archive · Unarchive** by clicks in the bar's menu: the data, the bar, and kv `projects` on
  disk.
- **Delete** asks first, naming "1 chat, 1 file", Recently deleted and Earlier chats. Cancel keeps it. Delete puts it in
  Recently deleted, its chat stays, and it comes back whole.
- **Keyboard**: Ctrl+Shift+O opens on the first row, ↓ moves, and ↓… then Enter runs Notes… for this project.
  Ctrl/⌘+K has "Project menu" with its key, and the "Project: …" rows run for the project in front of you.
- **Aspect & frame rate** is saved and the Lab's scene takes the frame.
- **Cover from a Lab frame**: on a machine where the Lab draws nothing (this sandbox), it says so calmly instead.

Runs (`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1`, `flock … run-checks.js --exact`):
- `projmenu128` 74 s, `projects` 48 s, `projaudit91` 69 s, `projaudit108` 192 s, `qa-commands` 39 s, `qa-keys` 186 s
  (it presses Ctrl+Shift+O with the other app-wide keys: no clash), `unit:boot-test`, `unit:lazymanifest-test`: **8/8
  passed** (13 min).
- `node dev/boot-test.js`: 2,831 checks passed, first screen within budget.
- After the run, only the keys sheet's wording changed (`projects-cmds.js`). The manifest was regenerated and boot-test
  passed again.
- The cover-from-a-Lab-frame step: this sandbox's Lab draws no picture (`ThreeLab.shot()` is null), so the check
  confirms the calm message there. On a real computer it confirms the cover is set.

## For the patch notes

**One menu for each project.** A project now has one menu, the same everywhere: click the project's name at the top of
the chats list, the new **⋯** on a project's card on Home (or right-click the card), or the **⋯** on its Desk. It opens
with the project's mark, name and a short summary ("3 chats · 2 scenes · song"). Below that, its actions are in
groups: **Open** (the Desk, the Lab, its chats), **Make** (a new chat with the AI you pick, a new scene, add to the
moodboard, add a song or footage), **Look** (rename, colour and mark, cover picture, banner), **Share & keep** (export,
duplicate, show its folder, render the main scene), **Settings** (default AI, aspect and frame rate, which files the AI
may use) and **Close** (archive, delete).

New things in it:
- You pick a project's colour and mark in one small window.
- You can use a frame from the Lab as its cover.
- You can give a project a default AI, and a frame size and frame rate its scenes use in the Lab.
- Delete now asks first and tells you what's inside. The project waits in Recently deleted, and nothing in it is
  erased.

**Ctrl+Shift+O** (⌘⇧O on a Mac) opens the menu of the project you're in, and the arrow keys and Enter work in it.
Ctrl/⌘+K also lists "Project menu" and every action as "Project: …".

## For Codex

Codex-owned files were touched at the owner's request. Each edit is small and marked `// (round 128, projmenu128)`.

- `projects.js`
  - `menu(p)`: returns `ProjectMenu.items(p, { where: 'menu' })` once `projmenu.js` is loaded. The old rows stay as the
    fallback before that.
  - New `openMenu(p, x, y, where)`: loads the `projmenu` group if needed, then `ProjectMenu.show()`, with its header.
    If loading fails, it falls back to the old menu.
  - Exported `openMenu`.
- `projects-home.js`
  - A card has a **⋯** button (`.pj-go.pj-card-more`, so a click on it doesn't open the card).
  - A card's right-click calls `P.openMenu(p, x, y, 'home')`.
  - The Desk's ⋯ calls `P.openMenu(p, …, 'desk')`.
- `project-workspace.js`
  - `switcher()`: one row up top, **This project's menu…** (→ `P.openMenu(…, 'workspace')`). The rest of the switcher
    is unchanged.
- `projects-cmds.js`
  - The keys sheet's "Right-click a project" line names the new menu.
- Not changed: `projects-core.js`, `projects-search.js` (its project right-click gets the new rows through
  `Projects.menu`), `sync-engine.js`, `cloud-files.js`.
- New field in kv `projects`, an ordinary project field (it syncs; the store keeps unknown fields):
  `p.prefs = { agentId?, aspect?, fps? }`. It is written with `p.updated` and `Projects.changed(p, 'prefs')`.
  `p.workspace` was not used on purpose: a truthy `workspace` means "has a Desk" in several places.
- `ProjectWorkspace.toolbar()` is never called (dead). It is left in place for you to remove or use.
- For aiprep128 (ProjectBrief):
  - The AI rows show when `ProjectBrief` is defined or a lazy group named `projectbrief` exists.
  - **Prepare / Refresh the brief** calls `ProjectBrief.prepare(id, { refresh, from })`.
  - **Ask the AI what to do next** calls `ProjectBrief.next(id)` if it exists, else `ProjectBrief.open(id, { ask: 'next' })`.
  - The header's "brief ready" reads `ProjectBrief.status(id)` or `.state(id)` (`'ready'`, or `{ ready }` / `{ at }`) or
    `.has(id)`.
  - Adjust `briefReady()` in `projmenu.js` if the merged API differs.
- For projcreate128: **Other projects › ＋ New project…** calls `ProjectsHome.newProject()` (today
  `ProjectWorkspace.wizard()`). Point that at the new wizard and the menu follows.
