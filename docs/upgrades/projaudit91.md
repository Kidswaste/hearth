# projaudit91: every project flow, by clicks, on both computers (round 91)

Recent rounds made projects fast (projopen86, desk89, projbig85). This round walks every project flow end to end the
way the owner clicks, on one computer and then on "the other computer", and fixes what was broken. Everything ran in
throwaway data folders: the app checks in smoke.js's temp profile, the two-computer runs in the sync simulator
(`dev/sync-sim.js`, the worlds of `dev/sync72-test.js`) or against a temp cloud folder. No real data was touched.

## How it was walked

- `dev/checks/projaudit91.js`: one computer, by clicks (menus, the Desk, the switcher, the keyboard, Ctrl/⌘+K, the
  Lab's Sketches, drops).
- `dev/checks/projaudit91-sync.js`: two computers in the app, through the real sync engine and a temp cloud folder
  ("the Mac" writes its version into the cloud copy, then Sync now pulls it).
- `dev/projaudit91-test.js`: each flow made on the PC and checked on the Mac through the sync simulator (delays,
  offline, Mac and Windows paths). Does it arrive, is anything lost or doubled. It also holds the unit tests for
  `projaudit-core.js` and the projects' Keep both.
- Flows already covered by earlier checks were run again rather than written twice: export / import / duplicate
  (`projbundle`, `projsync76-test`), Find in this project (`projsearch81`), deleted on A while edited on B
  (`projsync76-test`, `projsync76`), the Lab's scenes between computers (`labsync88`).

## Flows: before → after

| Flow | Before | After |
|---|---|---|
| Create from the name ▾ switcher (＋ New project → the card → Create project ↗) | works (≈ 5 s headless: it makes a chat, a scene and a moodboard) | works |
| Create from a chat (chats list: right-click › Project › ＋ New project…) | works | works |
| Create from a Lab scene (Sketches: right-click a card › Project › ＋ New project…) | works | works |
| Rename (a click on the Desk's name) | **broken**: the Desk changed, the name ▾ in the bar kept the old name until you went somewhere else | works: the bar follows at once |
| Colour / mark (right-click / click the mark) | works | works |
| Cover (a capture's right-click › Use as the cover) | works here; **broken on B**: a capture's or file's cover was lost on the other computer (its id held this computer's path) | works on both |
| Move a chat in (＋ Add › A chat) / out (Project files › right-click › Take out of …) | works | works |
| Move things in on A while B takes one out | **broken** when both computers put the same chat in: a conflict that auto-resolve settled by bringing back what B had taken out | works: each side's change kept, the shared chat once |
| Drop a file from Explorer / Finder on a project's Desk | **broken**: "Drop a .hearthproject file here", nothing added | works: it joins the project (the file stays where it is) |
| Drag a chat from the chats list onto a project's Desk | **broken**: nothing | works |
| Archive / unarchive (⋯ › Status; the status box) | works (out of the switcher; back to Active) | works; on B too |
| Delete (⋯ › Delete the project…) → Undo | works; the open Desk went back to Projects | works |
| Delete → Ctrl/⌘+K › Deleted things › Restore | works (back with its things) | works; deleted on A, restored on B: back once on both |
| Duplicate, export / import a bundle | works (`projbundle`, `projsync76-test` bundle) | works |
| Switch with the name ▾ | works (≈ 1.5–2.4 s headless to ready; measured in projopen86) | works |
| Switch with the keyboard (the ▾ focused: Enter, ↓, Enter) | works | works |
| Switch from Ctrl/⌘+K | **broken**: typing a project's name found only its chat (it opened in Chats, not the project) | works: the project is the first row ("Project"), Enter opens it |
| Find in this project, results opening the right thing | works (`projsearch81`) | works |
| On B: a project made / renamed / recoloured / archived / deleted / restored on A arrives, once | works, except the cover (above) | works |
| Rename on both computers at once | **half**: one name won; the other was kept aside only on the computer that settled it, and its Keep both made a **second project** sharing the same chat, scene and moodboard; the computer whose name lost was not told | works: one name, the other kept aside ("Mac's version of Projects kept aside — compare"), Keep both = ONE project named "A / B"; the computer whose name lost gets a toast with "Use “A”" |
| Deleted on A while edited on B | works: kept with Keep it / Delete it (`projsync76-test`) | works |
| Deleted on B while its Desk is open on A | works (toast with Restore) | works; the Desk goes back to Projects |
| The Lab: its scenes show in the project | **broken** for a scene made in the Lab while the project is open (New, Duplicate, a template): it belonged to no project | works: it joins the project in front of you |
| The Lab: a project's scene opened from the Desk opens the Lab on it | works | works |
| The Lab knows the current project (`Projects.here()`) | works | works |

Nothing was found slow beyond what projopen86 / desk89 already measure; the wizard's 5 s is the making of a chat,
a scene and a moodboard in the headless box.

## What changed

- **Ctrl/⌘+K finds projects.** `AppUI.addSource(fn)`: rows made fresh at each opening, ahead of the others. The
  projects' rows come from `projaudit91.js`; Find anything indexes them as kind `project` (weight just above an AI, so
  a project beats its own chat of the same name) and no longer folds a project and its chat into one row because they
  share a name.
- **The name ▾ follows** a rename, a colour, a status change, a delete, a restore or an arrival at once
  (`WorkspaceNav.sync()` on `hearth:projects`), and a project deleted (here or on the other computer) while its Desk
  is open sends the Desk back to Projects.
- **Drops on a project's Desk:** files from the computer join the project as files (they stay where they are, like
  ＋ Add › A file…); a chat dragged from the chats list joins it; a `.hearthproject` is still imported.
- **A scene made in the Lab while a project is in front of you joins it**, the way a capture or a render made there
  already did. Only a scene made in the last minute (its id is its time) that the Lab didn't have before, made by
  the owner (not by a director: its chat brings it in), so a scene arriving from the other computer never joins by
  itself.
- **The cover follows its capture to the other computer.** A cover names an item by its id, and a capture's id holds
  its path: when sync rewrites the ref for the other computer and the id is made again, the cover now follows it
  (`ProjectsCore.compact`). A cover saved that way before this round is found again by its folder and file name.
- **The same thing put in on both computers stays once and loses nothing.** `at` is a time for the merge (the later
  one is kept): two "joined at" times were a conflict, and the auto-resolve then brought back what the other
  computer had taken out.
- **A rename on both computers:** Keep both on the projects store keeps ONE project with both names joined
  ("Neon (PC) / Neon (Mac)") and an item named two ways once (`SyncMerge.inPlaceOf('kv/projects.json')`); other
  stores keep Keep both as before (a copy beside it). The computer whose own name lost is told once with a toast and
  "Use “its name”" (`ProjAuditCore.renamedAway`: only a rename made on this computer in the last day, only when the
  window still held that name).

## Safety

- A store read failure is never "empty": nothing here reads a store; the projects store is still read by
  projects.js / StoreAck as before.
- Deletes still go to Recently deleted / Deleted things; nothing new deletes anything. A file dropped on the Desk is
  referenced, not copied or moved.
- Nothing is uploaded: the two-computer runs use the simulator or a temp folder as the cloud.
- Bundles are untouched (secrets still never go in).

## Tested

- `dev/projaudit91-test.js`: 64 passed (create, look, move, status, delete, rename-both, core).
- `projaudit91` (one computer, by clicks), `projaudit91-sync` (two computers in the app): pass.
- Run again: `projects projopen86 desk89 projbundle projsearch81 (BIGPROFILE70=1) sync72 labsync88 lazy`, and
  `unit:projects-test unit:projbundle-test unit:projopen86-test unit:desk89-test unit:projsearch81-test
  unit:sync72-test unit:datasafe-scan unit:winmac-test unit:errorcalm-scan unit:storeack-scan unit:chatsafe-scan
  unit:boot-test unit:lazymanifest-test`, plus `unit:sync-test unit:projsync76-test unit:guardloss78-test` for the
  merge changes: all passed (5/5, 5/5 and 17/17). `dev/lazy-manifest.js --check`: up to date.
- Real machines only: `docs/windows-test-plan.md` §9 (drops from Explorer / Finder, a rename on both with Wi-Fi off,
  a cover across computers).

## Files

- New: `projaudit-core.js` (pure: renamedAway, paletteRows, dropped, sceneJoins), `projaudit91.js` (the window's
  part, lazy group "projects" after projects-cmds.js), `dev/projaudit91-test.js`, `dev/checks/projaudit91.js`,
  `dev/checks/projaudit91-sync.js`.
- Changed: `appui.js` (addSource), `appsearch.js` / `appsearch-data.js` (project rows), `sync-merge.js` (`at` is a
  time; keepBoth's `inPlace`; `inPlaceOf`), `sync-engine.js` (Keep both passes `inPlaceOf(rel)`, two calls),
  `lazy-data.js` (the two files in the projects group), `dev/run-checks.js` (unit + group `projaudit91`),
  `docs/windows-test-plan.md` §9.

## For Codex

Small edits in your files, each marked `(round 91, projaudit91)`:
- `projects-core.js` `compact()`: when an item's id is made again from its ref, the project's `cover` follows it.
- `projects-core.js` `normalize()` + `coverHere(p)`: a cover that names no item is found again by kind and the last
  two parts of its path (one match only), else none.
- `projects-home.js` the Projects page's `dragover` / `drop`: on a project's Desk, `ProjAudit.deskDrag(e)` /
  `ProjAudit.deskDrop(e, S.open)` take files and chats first; a `.hearthproject` still goes to the import as before.

## For the patch notes

- Ctrl/⌘+K now finds your projects: type a project's name and press Enter to switch to it.
- Renaming a project updates its name at the top straight away.
- Drop files from Explorer or Finder on a project's Desk to add them to the project, or drag a chat there from the
  chats list.
- A scene you make in the Lab while a project is open (New, Duplicate, a template) now belongs to that project.
- A project's cover now shows on your other computer too.
- Putting the same chat in a project on both computers no longer brings back something you took out on the other.
- Renamed a project on both computers at once? You keep one project: "Keep both" in the sync panel names it with both
  names instead of making a second project, and the computer whose name was replaced tells you, with a button to
  use your name again.
