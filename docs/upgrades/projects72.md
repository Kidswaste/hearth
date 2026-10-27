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
  owner's GPU a few frames. The check times it where it happens (from the run the preview page received to its
  `stack-drawn`, and from `ready-prep` received to `ready-prepped`) and reports it apart. Everything else is Hearth's:
  saving the project you leave, reading and drawing its chat, the preview page's own start, the board, the instrument,
  the Desk. Budgets: **Hearth's part of opening < 800 ms (cold and warm), of switching < 600 ms**; Desk < 150 ms; the
  files shelf < 150 ms; a key in the notes < 16 ms; no window task over 250 ms while switching.
  `window.PJ_REPORT = 1` reports without failing, `window.PJ_BUDGET` overrides budgets.

## Numbers
(filled in below)

## What was found and fixed
(filled in below)

## Files
(filled in below)

## For Codex
(filled in below)

## For the patch notes
(filled in below)
