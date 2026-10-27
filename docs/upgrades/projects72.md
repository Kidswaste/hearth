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
Before: 2 runs of round 71's code; after: 7 runs of this branch's (the last ones with every fix). The box was shared
with other agents' checks the whole time (load 2.5–4 on 4 CPUs), so single numbers swing by ±30 %: medians are given
with the range. "Hearth's part" is the wall minus the scene's own drawing and warm-up (see above).

| | before | after (median, range) |
|---|---|---|
| **switch** with the name ▾, Hearth's part (best of 3; the slowest of the 3 projects) | 955, 1,088 ms | **625 ms** (563–682) |
| switch, the fastest of the 3 projects | 575, 690 ms | **347 ms** (296–518) |
| switch, the whole wall with the scene drawing in software GL | 2.5–4.4 s | 1.7–3.0 s |
| **cold open** (the first since start; the pointer on the card 300 ms first), Hearth's part | 975, 2,572 ms | **1,135 ms** (786–1,230) |
| **warm open** from Projects (best of 2), Hearth's part | 431, 816 ms | **478 ms** (448–592; one run 1,574) |
| Desk paint (Desk tab clicked) | 64, 71 ms | 57–83 ms |
| Desk › Project files opened (771 items) | 260, 205 ms | 28–242 ms (its script: 3–7 ms) |
| typing in the notes: the longest task after the keys | 463, 486 ms | none |
| words typed past the notes' 4,000 characters | silently dropped, Desk redrawn per key | the box stops at 4,000 |
| the project's chat after 2 tab switches (Clink) | 100 → 220 messages drawn, place in the middle | 100 → 100, at its end |
| Prepare for offline (Clink: 537 paths, 15 chats · the missing-scene project) | 134–313 · 37–88 ms | 178–279 · 59–65 ms |
| a project whose chat hasn't arrived, tried | rewritten and moved to the top | left as it is |
| delete → after the Undo toast | gone | ⋯ › Recently deleted projects |

**Budgets, honestly:** switching (< 600 ms of Hearth's part, slowest project) passed in 3 of the 7 runs (the last one
included: 306 / 461 / 563 ms) and missed by 25–80 ms in the others. The cold open (< 800 ms) passed once (786 ms): the
first open of a session still mounts the Lab (≈ 300 ms: its UI and reading every scene) and runs Clink's first
sketch switch (≈ 180 ms of slider scanning on 4 layers × 450 lines); on this machine those share the CPU with the
software-GL scene. A warm open is under budget.

Where a switch's time goes now (step timings, after): closing the project you leave ≈ 60–100 ms (the Lab's saves),
the moodboard / sound / worktable ≈ 30–50 ms, the next chat ≈ 5 ms to read and ≈ 30–55 ms to draw (while the scene
starts), the Lab's sketch switch ≈ 80–125 ms of script (sliders read from 2–4 layers of 150–450 lines each). The
rest of the wall is the scene drawing its first frame in software GL.

## What was found and fixed
1. **Every project switch threw the preview page away and built a new one** (`tools/three.js` `workspace.close()` /
   `prepare()`). Switching from project A to B released A's page (the iframe went to `about:blank`), then loaded the
   page again for B: the sandbox page, three.js and the layer runtime, before B's scene could even start. A Lab
   sketch switch has run in the same page for many rounds (every layer runs again from the start, the old picture
   cross-fades). Now a switch made with the name ▾ (or any `ProjectWorkspace.open` while a project is open) closes A as
   before — every save, the song, the game, the references and timers stop — but keeps the page, and B's scene runs in
   it. Going back to Projects, or anywhere outside a project, still releases the page (`about:blank`), as before. A
   switch that is cancelled or fails releases the kept page too (`ThreeLab.workspace.releaseKept()`, called by `leave()`).
2. **Opening did everything one after the other.** `open()` read the chat after the Lab had mounted, set up the
   worktable after that, drew the chat, then prepared the scene, then read the moodboard. Now the chat to resume is read
   while the workspace's code loads, the worktable is set up while the Lab mounts, the scene's page starts before the
   chat draws (the chat draws while the page works) and the moodboard is read meanwhile. Errors are the same and are
   reported at the same points.
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
   same buttons). The weekly tidy's own scan of the same screen (`declutter.js` `neverUsedIn()`) does the same now
   (a tuck is by selector, so the first 20 messages stand for all). Its sibling, the pass that marks often-used buttons (`decorate()`, after changes on screen), walked
   every message footer of that chat (≈ 70–130 ms, landing inside project switches here): it marks the last 60 footers
   now; older messages keep the marks they got when they were new.
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
12. **Closing a project stamped its scene "updated now" and rewrote every scene**, even when nothing had changed
    (`workspace.close()` called `persist()` unconditionally). Each switch sent the whole scenes store (all scenes'
    code, MBs on a big profile) to the disk and to sync, moved the scene to the top of "recent", and two computers
    opening the same project made the same scene differ for sync. Now it saves only when the editor holds something
    the scene doesn't; slider edits waiting to be written are still written first, as before.
13. **A project's chat grew by 60 messages on every tab switch, and opened in the middle of its history.** The chat
    follows the project's tools (Desk, Scene, Sound…) by moving its live view (`Native.mount`). Moving a scrolling list
    puts it back at its top, where the "↑ Show earlier" watcher fired: 60 more messages drawn per switch (100 → 160 →
    220 on Clink; a long session made every switch heavier) and the place kept in the middle of the history. The view
    now gets its place back right after a move (its end while it follows, else the same distance from the end), at the
    next frame and without forcing a layout: on Clink it stays at 100 messages, at its end, through every tab switch.

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
  (the Lab's `workspace` API: `close({ keep })` and its save only when changed, `releaseKept()`, `state().kept`),
  `native.js` (`mount()`: the moved chat's place), `usage.js` (`see()`, `decorate()`), `declutter.js` (`neverUsedIn()`),
  `offline.js` (one line before the check).
- New: `dev/checks/projects72.js` (opt-in), `--projects` in `dev/bigprofile.js` (+ drawing scenes), a `projects72`
  group and fixture in `dev/run-checks.js`, a trash test in `dev/projects-test.js`.
- Tested (all app checks under `flock /tmp/hearth-run.lock`, a throwaway copy, fake engines): projects72 (functional
  steps all pass; budgets as above), projects, project-workspaces, project-continuity, project-lifecycle,
  project-fluidity, project-desk, project-allowance, project-map-worker, quest-project, quest-project-context, lazy —
  pass; project-auto-improve (needs `--fake-engines`, which run-checks doesn't give it), project-sound (`--fake-vst`),
  projects-lightweight (`HEARTH_LOOPLAG=1`) — pass when started with their flags by hand; offline-project fails on the
  base too (it downloads three.js modules: no route out from this box); unit: boot-test (first screen 2,340 / 2,345 KB),
  projects-test (13), datasafe-scan, winmac-test, errorcalm-scan pass; chatsafe-scan fails the same way on the base
  (`routines.js`, Codex's).

## For Codex
All edits are small and marked `(round 72)`. Behaviour kept: the same stages and errors, the same saves on close, the
preview released whenever no project is open.
- `ProjectWorkspace.open()` passes `closeCurrent(ui, { switching: true })`, which calls
  `ThreeLab.workspace.close({ keep: true })`: everything is saved and stopped as before, but the sandbox page stays for
  the next project's `prepare()` (no `about:blank` in between). `leave()` without an open project calls
  `ThreeLab.workspace.releaseKept()`, so a cancelled or failed switch never leaves a page behind. `state().kept` says
  when a page is being kept.
- In `open()`, the resumed chat's `Native.load()` starts right after `ensure()` (the same chat `C.resume` picks; it is
  awaited where it was), `WorkbenchUI.setProject()` starts before `ThreeLab.cmd()` (awaited after `selectChat`), and
  `Board.ready()/load()` and `ThreeLab.workspace.prepare()` start before `Native.refresh()`; every result is awaited
  in the old order, so each error still shows at the same stage.
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
- `native.js` `mount()` (your project move): after `root.append(...)`, the list's place comes back at the next frame
  (`follows(v)` → its end, else the same distance from the end).
- Not fixed (for you or the chat stream): a project's FIRST open of a long chat still draws its last 40 messages at
  the list's top, then "Show earlier" adds 60 and the place lands in the middle (Clink: 40 → 100 messages, ≈ 7,500 px
  above the end). It isn't the move (fixed above) nor `keepScroll` (tried: no change); two draws race there
  (`Native.refresh` from `open()` and one started while the Lab mounts). `dev/checks/projects72.js` reports the chat's
  messages / place from the Desk on; a probe of the first open is easy to add there.
- `tools/three.js` `workspace.close()`: `persist()` only when the editor or the first layer differ from the scene
  (`save.flush()` / `saveExtras.flush()` are unchanged, so anything already waiting is written).
- For the meter stream (not changed here): `usage.js`'s debounced save sends the whole `ui-usage` store over IPC
  3 s after any click; with a year of use (the fixture's 900 KB) that is ≈ 70 ms on the window's thread, and it landed
  inside project switches in the profiles.
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
- **A project's chat stays where you are** when you move between Desk, Scene, Sound and the boards (it used to jump
  back into older messages and load 60 more of them each time, so long sessions got slower).
- **Opening a project for the first time each day no longer freezes for half a second** when its chat is very long.
- **Leaving a project no longer re-saves its scene when you didn't change it**, so your two computers have less to sync
  and the scene doesn't jump to the top of your recent scenes.
- Prepare for offline checks what you just added to the project, too.
