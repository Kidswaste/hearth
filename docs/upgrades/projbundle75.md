# projbundle75 — a project as one file (round 75)

A project can now leave Hearth as **one file** (`.hearthproject`), come back on any computer as a **new project**, or be
**copied in place**. Everything is a click away where projects already live; nothing new on screen until you open a
project's ⋯.

Counted honestly: one line per thing you can see or use.

## Export project… (a project's ⋯, or right-click its card)
1. **⇪ Export project…** in every project menu (the card's right-click, the project page's ⋯, the chats list's project group ⋯).
2. **A card that says what goes**: scenes with their code, layers, references and files, sequences, boards, notes and the worktable always go (with their size).
3. **Its chats: a checkbox** with how many and how big (the conversations and their attachments).
4. **Its files and captures: a checkbox** with how many and how big (captures, renders, files, whole folders with their tree).
5. **Says what isn't on this computer** (a scene or file from the other computer that hasn't arrived) and leaves it out instead of failing.
6. **One `.hearthproject` file**, saved where you pick (a save dialog, Documents by default). It's a plain zip: anything that opens zips can look inside.
7. **A progress bar with Cancel**: sizes as it goes, the file being written; Cancel leaves nothing behind (no half file).
8. **Streamed**: no file is ever held whole in memory; big files and already-compressed media (pictures, video, audio, models, fonts) go in as they are, text-like files are compressed.
9. **Secrets never go in**: API keys and tokens in chats are replaced, keys named like secrets are dropped, key / credential files and dotfiles (`.env`, `.ssh`…) are never packed, a chat's engine session is left out, a reference's original folder path stays home.
10. **Versions inside**: the file says which Hearth made it (version, Mac / Windows, when) and the version of each part's data.
11. **A toast when it's done** with its size and **Show in folder**.

## Import project… (Projects ⋯, or drop the file on Projects)
12. **⇩ Import project…** in the Projects page's ⋯.
13. **Drop a `.hearthproject` on the Projects page** to import it (the page shows a dashed outline while you drag; another kind of file says what to drop instead).
14. **Checked before anything is written**: names that could write outside Hearth's folder (`..`, absolute, drive, backslash, reserved names), duplicates, encrypted entries, sizes (each file, the total, the number of files, the JSON), zip bombs (compression ratio, and a hard stop at each file's stated size while unpacking), the versions, and the shape of what's inside.
15. **A card that says what it will add**: scenes (layers, references), sequences, boards, chats (messages), files (size), notes, removed secrets, files that weren't on the computer it came from, and where / when it was made.
16. **A newer file asks for ⬆ Update** instead of half-importing.
17. **A refused file says why** on the card, in plain words, and nothing is added or written.
18. **Always a new project**: every scene, board, chat, reference, note and sequence gets a fresh id; nothing you have is ever changed or replaced (importing the same file twice gives two projects).
19. **Relinked**: chats go back to their scenes and boards, the project's chat / scene / board are its own again, sequences follow their scenes, a song's beat map follows the song.
20. **Its files land in Hearth's own folder** (`data/assets/projects/<name>/`), never over a file that's there.
21. **A progress bar with Cancel** while it unpacks; Cancel (or a failure) removes what it wrote.
22. **A chat whose AI isn't on this computer** goes to one of the same kind (Astra to Astra, a director to its director, else Claude) and the toast says so.
23. **A toast that says what it skipped** (a damaged file, a file that wasn't in it, a chat moved to another AI) with **What was skipped** for the full list; the new project opens.
24. **A damaged file inside** is skipped and named; the rest comes in.

## Duplicate project (a project's ⋯)
25. **⧉ Duplicate project**: a full copy named “… copy”, with fresh ids.
26. **Its scenes and boards are copies** (named “… copy”), not shared: changing the copy never changes the original.
27. **Its chats are copies** linked to the copied scenes and boards.
28. **References are copied too** (deleting a reference in one scene removes its file, so they're never shared); your own files (captures, folders) stay shared links, never copied or touched.

## Under the hood
- `projbundle-core.js` (pure, Node + window): the format, the zip-slip / size / version guards, secrets scrub, `prepare` (chats / files as chosen), `remap` (fresh ids + every link), `canon` (deep compare minus ids, for checks).
- `projbundlemain.js` (main, loaded on first use through `lazyIpc`): the streamed zip writer (each entry's header patched after its bytes stream through a CRC counter; Zip64 for files ≥ 4 GB), `peek`, `unpack` (streamed inflate with a size cap, CRC check, `wx` writes inside `data/assets/projects/` only, free-space check), cancel per job.
- `projbundle.js` + `projbundle.css` (new lazy group **projbundle**, tier `use`: nothing loads until one of the three clicks).
- Small hooks: `tools/three.js` `ThreeLab.scenes.adoptScene()` (a scene under its fresh id with its extras, references, notes, still and cues), `tools/three-media.js` `player.adoptMap()`, one `lazyIpc` line in `main.js`, one `projbundle` line in `preload.js`, `projbundle` added to the existing `lazy-at.js#…,projects,…` tag in `index.html` (no new script tag; first screen unchanged at 1865 / 1866 KB).
- An export never changes what it exports: the scene in the editor is read as it is on screen without saving it.

## Tested
- `dev/projbundle-test.js` (unit, 26 tests, in UNIT): entry-name guard, secrets, prepare, remap (every link, workspace chats), canon catches real differences, manifest / body checks; export → peek → unpack → fresh ids gives the same project (deep compare minus ids) with byte-identical files; media / big files stored, text deflated; cancel mid-export and mid-unpack leaves nothing; malicious zips (`..`, absolute, drive, backslash, nested `..`, reserved name, duplicates, encrypted, ratio bomb, size lie, bad CRC, newer version, wrong format, broken body, no manifest, damaged JSON, not a zip, dangling reference); the owner's files byte-identical after everything.
- `dev/checks/projbundle.js` (app, by clicks): a project made in the app → right-click › Export… (card, sizes) → Projects ⋯ › Import… (card) → the same project minus ids; fresh ids; relinked; files in Hearth's folder; key removed; Duplicate (copies, not shared); the original unchanged; a zip-slip file dropped on Projects refused with nothing added. Group: `node dev/run-checks.js projbundle75`.

## For Codex
`projects.js`, `projects-home.js` are Codex's: the edits are small and marked `(round 75, projbundle75)`:
- `projects.js` `menu(p)`: two rows after Notes… (`⇪ Export project…`, `⧉ Duplicate project`) and a `bundle(fn)` helper (loads the `projbundle` lazy group, calls `ProjBundle`); `bundle` is exported.
- `projects-home.js` `moreMenu()`: `⇩ Import project…` first; `mount()`: dragover / drop on `.pj-home` for `.hearthproject` files (class `pb-drop` while dragging).
- A project-workspace chat keeps its `<agent>-project-<project id>` id form with the new project's id on import / duplicate, so `ProjectWorkspace.ensure()` and `sceneProjects()` treat it as before. The worktable (`workbench-<project id>`) travels and is written for the new id only when none exists.

## For the patch notes
- **Export a project as one file**: right-click a project (or its ⋯) › **⇪ Export project…**. Scenes, boards and notes always go; tick whether its chats and its files and captures go too (you see how big each is). A progress bar with Cancel shows while it saves.
- **Import a project**: Projects › ⋯ › **⇩ Import project…**, or just drop a `.hearthproject` file on the Projects page. A card shows what it will add before anything happens.
- Imports always come in as a **new project**: nothing you already have is changed or replaced, and chats are linked back to their scenes and boards.
- If something couldn't come along (a file that wasn't on the other computer, a damaged file, an AI that isn't set up here), the toast says so; click **What was skipped** for the list.
- **Duplicate a project**: right-click a project › **⧉ Duplicate project** makes “… copy” with its own copies of the scenes, boards and chats, so you can try a different direction safely.
- Exported files never contain passwords, API keys or sign-ins.
- A file made by a newer Hearth asks you to update first (⬆ Update) instead of importing half of it.
