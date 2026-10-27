# projects72: projects solid and fast on a heavy profile (round 72)

The owner asked to go back to project handling, sync, speed and the Lab. This stream measured Codex's projects
(the Projects page, the project workspace, the name ▾ switcher, the Desk) on a profile as heavy as the owner's, fixed
what made opening and switching slow, and made two things safer: a project whose scene or chat hasn't arrived from
the other computer, and deleting a project.

## How it is measured
- **`dev/bigprofile.js --projects 40`** (new option) adds 40 projects to round 70's heavy profile (1,500 chats, a full
  quest journal, 50 Lab scenes…). Everything is made up, with a fixed seed. Each project has its own chat, scene,
  moodboard and Desk, like the ones Codex's workspace makes:
  - "Clink" is the heavy one: a 700-message chat, 14 related long chats, 4 scenes, 3 boards, 400 files (half on disk,
    half "not arrived from the other computer"), 220 captures, 120 renders and 4,000 characters of notes;
  - two medium projects (a 400-message chat, 6 related chats, 120 files), the rest small;
  - "Not arrived: scene" links a scene that isn't on this computer, "Not arrived: chat" a chat that isn't;
  - 3 paused and 2 archived projects.
  The Lab scenes of that profile now draw for real (a renderer per layer, a few meshes, sliders). Round 70's scenes
  never drew, so every open waited out the page's 700 ms "nothing drew" fallback.
- **`dev/checks/projects72.js`** (new, opt-in): `BIGPROFILE70=1 node dev/run-checks.js --exact projects72` (run-checks
  makes the fixture the first time, ≈ 3 s). Everything is done by clicks: Projects in the rail → the Clink card (cold),
  ‹ Projects → the card again (warm, best of 2), the name ▾ → another project (3 rounds × 3 projects, best of 3),
  resume (a project left on its Scene tab comes back on its Scene; a related chat opened from the Desk comes back as
  the chat), the Desk with many files (Desk tab, "Project files", a search, Show more, typing in the notes), the two
  not-arrived projects, right-click › Prepare for offline… (Clink and the missing-scene one), delete → Undo, Status ›
  Archived → ⋯ › Archived projects → open it → Desk status → Active, delete again → ⋯ › Recently deleted projects.
- **What the budgets hold.** Opening a project waits for its scene to be ready (Codex's design: the loading card
  stays until assets, shaders and textures are warm). That part is the scene's own GPU work. On this test machine the
  GPU is software (SwiftShader): the simplest 2–4-layer scene takes 1–3 s to draw its first frame and warm up, on the
  owner's GPU a few frames. The check times it where it happens and reports it apart: the fixture's layers post a
  `fixture-layer-start` message as their code starts (the preview page is another origin), counted to the page's
  `stack-drawn`, plus the page's own warm-up time (`ready-prepped`'s `ms`). Everything else is Hearth's:
  saving the project you leave, reading and drawing its chat, the preview page's own start, the board, the instrument,
  the Desk. Budgets: **Hearth's part of opening < 800 ms (cold and warm), of switching < 600 ms**; Desk < 150 ms; the
  files shelf < 150 ms; a key in the notes < 16 ms; no window task over 250 ms while switching.
  `window.PJ_REPORT = 1` reports without failing, `window.PJ_BUDGET` overrides budgets.

## Numbers (this machine: Xvfb, software GL, a shared 4-CPU box that other checks were using; before = round 71 main fee53a5, after = this branch, same fixture, same check)
NUMBERS_TABLE

## What was found and fixed
1. **Every project switch threw the preview page away and built a new one** (`tools/three.js` `workspace.close()` /
   `prepare()`). Switching from project A to B released A's page (the iframe went to `about:blank`), then loaded the
   page again for B: the sandbox page, three.js and the layer runtime, before B's scene could even start. A Lab
   sketch switch has run in the same page for many rounds (every layer runs again from the start, the old picture
   cross-fades). Now a switch made with the name ▾ (or any `ProjectWorkspace.open` while a project is open) closes A as
   before — every save, the song, the game, the references and timers stop — but keeps the page, and B's scene runs in
   it. Going back to Projects, or anywhere outside a project, still releases the page (`about:blank`), as before. A
   switch that is cancelled or fails releases the kept page too (`ThreeLab.workspace.releaseKept()`, called by `leave()`).
2. **The project's scene waited for its chat to draw, and its moodboard waited for the scene.** `open()` drew the
   chat, then prepared the scene, then read the moodboard. Now the scene's page starts first, the chat draws while it
   works, and the moodboard is read meanwhile. Errors are the same and in the same order.
3. **A project whose chat hadn't arrived was rewritten each time it was tried.** `ensure()` saved the workspace
   (and so its `updated` time) before finding out the chat wasn't there: the project jumped to the top of Recent and was
   written to disk (and synced) for nothing. It's saved now only when something in it actually changed.
4. **Not arrived, said calmly.** A project whose scene, chat or moodboard hasn't arrived from the other computer now
   says "It may still be on its way from your other computer. Your project and saved links are kept." "Open scene
   editor" is offered only when the scene is on this computer (it led to a second error). The red error notice that
   came on top of the dialog is gone: the dialog is the message. The links are never rewritten (checked).
5. **Typing past 4,000 characters in a project's notes dropped what you typed and redrew the whole Desk on every key.**
   A project keeps 4,000 characters of notes (`ProjectsCore.setNotes`), but the box on the Desk had no limit: past it,
   each key was refused by the model, the Desk saw notes that differed from the box and repainted itself — putting the
   cut notes back in the box (your words gone) and costing a long task per key (463–799 ms here with Clink). The box
   now stops at 4,000 (`maxLength`), like the store.
6. **Notes typed on the Desk redrew the whole chats list after each pause** (≈ 10 ms per draw with 2,200 chats, plus
   the project index rebuilt). The notes only change a project group's tooltip there, so that redraw now waits until
   typing pauses for 1.2 s. Other project changes still redraw it after 50 ms.
7. **The daily "seen buttons" pass froze a project's first open of the day for ≈ 0.5 s** (`usage.js` `see()`, run by
   the weekly tidy in `habits.js`). It checked the visibility of every button of the screen, and a 700-message chat
   has thousands of identical message buttons. It now looks at the first 20 messages' buttons (the others are the
   same buttons).
8. **The Desk drew 80 ms after you clicked it.** Coming on screen used the 80 ms wait meant for bursts of changes;
   it draws at once now.
9. **The first open of a session loaded the Lab, the moodboard and the creative board's code after the click.** The
   pointer reaching a project card (or the card getting keyboard focus) now starts loading that code, once per session.
10. **Deleting a project could only be undone for 8 seconds.** The grouping, its notes (up to 4,000 characters), look,
    cover and workspace links were gone after that (the chats, scenes and files themselves always stayed). A deleted
    project now waits in **Projects › ⋯ › Recently deleted projects** (the 30 newest), and a click brings it back as
    it was. The toast's Undo uses the same path. It is kept in the same synced store (`kv/projects.json` `trash`), so it
    merges between computers like the projects themselves; an empty bin leaves the file exactly as before.
11. **Prepare for offline checked the project as last saved** (up to 300 ms behind). It saves the project first, so
    something just added to it is checked too.

## Checked, nothing to change
- **Resume** works on the heavy profile: a project left on its Scene tab comes back on its Scene, with its scene; a
  related chat opened from the Desk comes back as the chat (before and after).
- **The Desk's files shelf** builds no rows until opened, 60 at a time, as Codex made it. Its script is ≈ 3–4 ms for
  771 items; the rest of its time on this machine is software drawing.
- **Prepare for offline** answers in 130–250 ms for Clink (537 paths, 15 chats): the main process's longest block was
  22 ms in a Node run of the same check. It lists the missing scene, the files that aren't here and the online ones.
- **Archive**: an archived project leaves the cards, is listed in ⋯ › Archived projects, opens from there, and its
  Desk's status menu puts it back.
- **The remaining cost of opening** is the scene itself (software GL here) and, for the first open of a session, the
  Lab's first mount. A warm open from Projects reloads the preview page on purpose (Codex's rule: nothing stays loaded
  behind the Projects page), ≈ 0.4–0.5 s of Hearth's part here.

## Files
- Changed: `project-workspace.js`, `projects.js`, `projects-core.js`, `projects-home.js` (Codex's), `tools/three.js`
  (the Lab's `workspace` API: `close({ keep })`, `releaseKept()`, `state().kept`), `usage.js` (`see()`), `offline.js`
  (one line before the check).
- New: `dev/checks/projects72.js` (opt-in), `--projects` in `dev/bigprofile.js` (+ drawing scenes), a `projects72`
  group and fixture in `dev/run-checks.js`, a trash test in `dev/projects-test.js`.
- Tested: CHECKS_LINE

## For Codex
All edits are small and marked `(round 72)`. Behaviour kept: the same stages and errors, the same saves on close, the
preview released whenever no project is open.
- `ProjectWorkspace.open()` passes `closeCurrent(ui, { switching: true })`, which calls
  `ThreeLab.workspace.close({ keep: true })`: everything is saved and stopped as before, but the sandbox page stays for
  the next project's `prepare()` (no `about:blank` in between). `leave()` without an open project calls
  `ThreeLab.workspace.releaseKept()`, so a cancelled or failed switch never leaves a page behind. `state().kept` says
  when a page is being kept.
- In `open()`, `Board.ready()/load()` and `ThreeLab.workspace.prepare()` start before `Native.refresh()`; their
  results are awaited in the old order.
- `ensure()` calls `P.setWorkspace` only when `ProjectWorkspaceCore.workspace()` changes something.
- The loading dialog's error: the detail line names the other computer for "not available on this computer"
  errors; "Open scene editor" only when `ThreeLab.scenes.get(sceneOf(p))`; `err.shown = true`, and the card / Enter /
  switcher handlers skip their toast when it's set.
- `ProjectsCore.normalize()` keeps `trash` (30, `TRASH_KEEP`); `Projects.removeProject()` moves the project there,
  `Projects.restoreProject(id)` / `Projects.trashed()`; Projects › ⋯ › Recently deleted projects. `compact()` and
  `sync-merge` are untouched (the trash is a list of projects with ids).
- `projects-home.js`: notes `maxLength: 4000`; the Desk paints at once on `hearth:activate`; cards prefetch the `lab`,
  `board` and `creative` groups on `pointerenter` / `focus` (once).
- `projects.js` `changed()`: a `notes` change redraws the chats list after 1.2 s instead of 50 ms.
- Ideas not done: a page warmed on a card's hover would make the first open after Projects faster still, but it would
  keep a preview page behind the Projects page (your rule says no); the Desk's `P.lookFor()` re-reads captures / renders
  every 15–30 s on the first paint after that (the cached look could draw first and refresh after).

## For the patch notes
- **Switching projects is quicker.** Picking another project from the project's name ▾ no longer starts the preview
  from scratch: the next project's scene starts in the one already open, and its chat and moodboard get ready at the
  same time.
- **Opening a project you just pointed at starts sooner** the first time after Hearth starts.
- **Deleted projects can come back.** Projects › ⋯ › Recently deleted projects keeps the last 30, with their notes and
  links: click one to bring it back. (Deleting a project never touched its chats, scenes or files.)
- **Project notes no longer lose what you type past their 4,000-character limit**, and typing in them no longer
  stutters on a big profile.
- **A project whose scene or chat hasn't come over from your other computer yet** says so calmly ("It may still be on
  its way…") and keeps its links; Hearth no longer moves that project to the top each time you try it.
- **Opening a project for the first time each day no longer freezes for half a second** when its chat is very long.
- Prepare for offline checks what you just added to the project, too.
