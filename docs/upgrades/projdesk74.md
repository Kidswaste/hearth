# projdesk74: the Desk's files shelf in one frame, the warm open's page started at the click (round 74)

Round 73 (coldopen73) left two budgets of `projects72` short: **Desk › Project files** (< 150 ms) passed 3 of 7 runs,
**the warm open from Projects** (< 800 ms of Hearth's part) 5 of 7. And three of Codex's project checks only passed
when started by hand with their flags. This stream fixes all three.

## What was found
- **The files shelf's own script was never the problem** (3–17 ms). A probe that opens the shelf on a Desk that has
  been on screen a while shows it in 9–51 ms (median 20) on the base. `projects72` clicks it right after coming back
  to the Desk from the Scene tab, and there the base takes 54–255 ms: the click lands while the Desk is **rebuilt
  from scratch** (every Desk visit replaced its whole page: header, cover, sections, notes, the shelf; ≈ 60 ms of
  script in one timer task, measured with long-animation-frame entries), and the next frame then has a whole new
  Desk to lay out and draw in software.
- **The warm open's page started late.** Back on Projects the preview page is released (Codex's rule). Opening a
  project loaded a new page only after the chat had been read, the worktable set up and the Lab readied
  (`prepare()`), so the page's load (310–750 ms here) came after that work instead of alongside it.

## Upgrades
### Desk › Project files
1. **Coming back to a project's Desk keeps the Desk you left** when nothing it shows changed (the project, the
   scenes / stills / boards / renders / captures it reads, its scene's modules, its chats' names, the minute its
   times are written in). It used to be rebuilt on every tab switch. Your scroll place, open shelves and searches are
   simply still there. (`projects-home.js` `paint()`, `projects.js` `lookFor()` returns the same look for the same
   sources.)
2. **The files shelf draws only what's on screen.** Its rows out of sight skip layout and painting
   (`content-visibility: auto`, each row sized ahead so the scrollbar doesn't jump), and the Desk column lays out and
   paints on its own, without touching the chat beside it (`contain: strict`). With 400+ files and "Show more" opened
   several times, opening the shelf costs the rows you can see.
3. **Thumbnails load as their row is drawn.** A capture or render picture in the files shelf is asked for only when
   its row first comes on screen (`contentvisibilityautostatechange`), so opening the shelf decodes the handful of
   pictures you can see instead of 60 full-size files.

### Opening a project from Projects
4. **The preview page starts at the click's first moment.** Pressing a project card (or any open from Projects)
   starts the Lab's preview page right away, while Hearth reads the chat, sets up the worktable and readies the Lab;
   the scene then runs in that page instead of waiting for a new one. Codex's rule holds: nothing is loaded behind
   the Projects page. A press that doesn't become a click is let go after 4 s (20 s once the open has started, an
   open that stops early lets it go at once). (`ThreeLab.workspace.preload()`; the page holds its "ready" until its
   scene is there to run, so everything a fresh page is sent is for that scene.)
5. **Option: Keep the Lab ready behind Projects** (Projects › ⋯, or `/keep-lab-ready on|off`). Off by default: it uses
   more memory. On, leaving a project for Projects keeps the preview page as a project switch does (everything is
   still saved and stopped), so opening a project from Projects is as quick as switching. The page is let go as soon
   as anything other than Projects comes to the front, or after 10 minutes on Projects.
6. **Shaders across page loads:** checked, nothing to add. The page already compiles every program through
   `compileAsync` (KHR_parallel_shader_compile, round 56 readyspeed), and Chromium keeps compiled programs in its
   own GPU program cache across pages, so a reload re-links rather than recompiles. three.js's own program cache
   lives in the page and can't outlive it; keeping the page (option 5) is what keeps it.

### Checks
7. **`run-checks` runs Codex's project checks with the flags they need**: `project-auto-improve` with
   `--fake-engines`, `project-sound` with `--fake-vst` (the fake VST host, never real instruments),
   `projects-lightweight` with `HEARTH_LOOPLAG=1` (new `EXTRA_ENV` next to `EXTRA_FLAGS`). They're in the
   `projects72` group and the new `projdesk74` group.
8. **`projects72` measures the files shelf in frames too**: `desk.filesFrames` says when the rows were built, which
   animation frame showed them and when, and the long animation frames in between (render vs script).

## Numbers
NUMBERS

## Files
- Changed: `projects-home.js`, `projects.js`, `project-workspace.js`, `project-workspace.css`, `projects-cmds.js`
  (Codex's, small marked edits, see below), `tools/three.js` (sandbox frame `hold()`, workspace `preload()`),
  `dev/run-checks.js`, `dev/checks/projects72.js`, `lazy-data.js` / `lazy-meta.js` (regenerated: one new command).

## For Codex
Every edit is marked `(round 74)` / `(round 74, projdesk74)`. Behaviour kept: the same stages and errors, the same
saves on close, nothing loaded behind Projects unless the new option is on.
- `projects-home.js`: `paint()` returns early when the drawn Desk is the same project and `deskSigOf(p)` is unchanged
  (`p.updated`, item count, the identity of `Projects.look()`, the scene's layers, the chats' names, the current
  scene, the minute); `P.onChange` clears the signature. `itemRow(p, x, { lazy })` (files shelf only) sets the
  picture's `src` on the row's first `contentvisibilityautostatechange` (browsers without it: at once, as before).
  Cards: `pointerdown` (left button) calls `ThreeLab.workspace.preload()`. ⋯ menu: "Keep the Lab ready behind
  Projects".
- `projects.js`: `lookFor()` returns the same `look` when its five sources are the same (cached) arrays; `look` keeps
  them in `look.src`; `Projects.look()` returns it.
- `project-workspace.js`: `open()` calls `ThreeLab.workspace.preload(20000)` first thing when no project is open.
  `keepLab` (store `projects.keepLab`, default false): `closeCurrent()` closes with `{ keep: true }` when it's on;
  `leave({ keepLab: true })` (from `home()`) doesn't release that page; any `hearth:activate` of another surface with
  no project open, or 10 minutes, releases it. `ProjectWorkspace.keepLab(on?)` reads / sets it.
- `project-workspace.css`: `.pw-desk .pj-home { contain: strict }`, files rows `content-visibility: auto`.
- `projects-cmds.js`: `/keep-lab-ready [on|off]`.
- `tools/three.js` (the Lab's): `box.hold(on)`; `workspace.preload(ms)`, `state().primed`; `prepare()` keeps a
  preloaded page still loading (no `release()`), and `run()` lets its held `ready` through after queueing the scene.
  `releaseKept()` and `close()` also let an unclaimed preloaded page go.

## For the patch notes
PATCH
