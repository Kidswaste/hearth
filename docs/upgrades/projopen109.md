# projopen109: an imported project's first open, measured; an open the Desk interrupts; projopen86 judged; the Desk's ⋯ click (round 109)

Round 108 (`projaudit108.md`, "Slow" and "Not fixed") left four things:
1. an imported project's first open took 7.6–15 s on a fresh profile, and a switch right after a start 5–8.8 s;
2. an open could hang 90 s at "Warming shaders" when something sent the app to the Desk mid-open, then end in an error;
3. `projopen86` failed its 60 ms window budget (60–78 ms) on the base, regression or load unknown;
4. a Desk ⋯ menu row sometimes ignored a click (3 in ~10 runs), never reproduced.

All four are done: 2 and 4 are fixed (both reproduced first, every time for 2, 8 of 22 tries for 4); 3 is load, not a
regression, and the check now says so from the trace instead of failing; 1 is measured piece by piece, with one real
cut (the Lab's code loads while you read the import card) and the rest named, most of it software-GL-only.

Everything ran in throwaway data: each app run on its own fresh profile and temp data folder (`dev/smoke.js`), the
project made up in the run (`dev/projopen109-src.js`: two layers with their own frame loops plus projaudit108's
multi-file car) or projopen86's made-up fixture. No real data, scene or game file was touched. Nothing was uploaded.

Timings are from this box: 4 CPUs, SwiftShader (software GL, no `KHR_parallel_shader_compile`) under Xvfb, shared with
other streams' checks (load 2.3–3.7 during the runs). **Before** is this round's base (`3543227`, `git archive` into a
temp folder, run with `dev/smoke.js --app`); **after** is this branch.

## 1. An imported project's first open, piece by piece

New check `dev/checks/projopen109.js` (`pc` + `fresh`): the project is exported on one profile, then imported by clicks
on a fresh one (Projects › ⋯ › ⇩ Import project…, the card's Import), and the open that follows is timed from the Import
click. Each piece's moment comes from the window (Lazy's own timing, the loading card's words as they change, the
preview page's messages) and from the preview page itself (its clock lined up with the window's, its long animation
frames with their scripts). The fresh run starts without smoke's "every lazy group in first" wait (`--no-lazy-wait`),
so the Lab's code is not in, as on a fresh install (`labload94` mode "none").

| piece (ms from the Import click) | before (base1) | after (e) | after (c) |
|---|---:|---:|---:|
| the Lab's code (`lab`, ≈ 3.4 MB) | 71 → 413 (inside the import) | **in 1.3 s before the click** (322 ms, while the card was read) | in 1.3 s before (271) |
| the import itself (project in the list) | 718 | **591** | 494 |
| the preview page started / its document ready | 550 / 862 | 300 / 619 | 236 / 550 |
| its first scene drawn (`stack-drawn`) | 4,331 | 4,048 | 3,965 |
| scene assets (the layers' modules, the model, its pictures) | 2,350 | 2,774 | 3,014 |
| shaders and textures (`ready-prep` compile) | 1,239 | 398 | 1,032 |
| ready (board, sound, the Desk: ≈ 0.1 s) | **9,307** | **7,491** | **9,285** |

Run to run, the same code varies by ±2 s here (base with the Lab's code already in: 7.5 s; base1: 9.3 s). What
changed for sure is the import (−0.1 to −0.2 s: the code that `labReady` waited for is already in). What the rest is:
- **The preview page runs the scene's layers, one module at a time: 540–730 ms each** (the page's long frames, each one
  layer's module: three's `WebGLRenderer` and its context made on SwiftShader, its first geometry and program). Three
  layers with their own frame loops + the model layer: 2–3 s. **Software GL only** (a context is a few ms on a GPU).
- **Holding layers for the gaps after frames (modelcompile101): up to 1.9–3 s** (`__labWarmGap` maxHoldMs). On a card
  without background compiling, the 2nd, 3rd and 4th layer each wait for gaps. **Software GL only.**
- shader compiles in ready-prep: 0.4–1.2 s; textures: 16–26 uploads, a few ms each here (the car is small).

**Tried and taken back:** drawing the stack under the project's loading card with round 89's old rule (compile in the
first frame instead of gaps: nobody sees the frames behind the opaque card). Measured worse: **15.7 s**, one page
frame of 5.4 s compiling the whole scene with its hidden variants at once (40 compiles instead of 12). The gaps stay.

The switch right after a start (projaudit108 `start`): see "Tested" (same piece list: the Lab's code + the page; the
Ctrl/⌘+K project row now starts the Lab's code as soon as it shows among the first rows, before Enter).

### What changed (the Lab's code on intent, `lab-intent.js`, `projbundle.js`)
Every project open loads the Lab and runs the project's scene (`project-workspace.js` open), so a project about to open
is intent, like a Lab line:
- **a project's row among the first three rows of Ctrl/⌘+K** (`isLabRow`: kind "Project");
- **a project to import**: the import card showing (`projbundle.js` importProject, `LabIntent.go('import')`). The
  import itself starts the Lab when the project has scenes and opens the project in it, so the code loads while you
  read the card. Cancel leaves it loaded (as a hover on the Lab's button does).
- Hovering or focusing a project card already did this (labload94).

## 2. The 90 s hang at "Warming shaders"

**Reproduced every time** (`fresh`, part "away"): the project opened again, and `ProjectWorkspace.go('overview')` as
soon as the card says "Building your scene…" (and again on "Preparing textures and shaders"):

| | before | after |
|---|---|---|
| Desk asked for at "Building your scene…" | **90.1 s, then "The scene is taking too long to prepare"** (2 of 2 runs) | **0.23–0.26 s**, ready |
| …at "Preparing textures and shaders" | **90.1 s, the same error** (2 of 2) | ready **0.1 s** after the Desk was asked for |
| then its scene from the Desk | draws | draws: the model loaded, all four layers' frames moving |
| a plain reopen after both | ready | ready (5.2 s) |

**Cause.** The open's warm-up (`ThreeLab.workspace.prepare` → the page's `ready-prep`) waits for the page's frames:
its first scene drawn, then two frames (`rdyFrames`). Off screen (the Desk in front) the page's frame is hidden and
Chromium gives it no frames, so `rdyFrames` never resolved and the open sat until the 90 s timer. The warm gaps
(modelcompile101) are capped (6 s) and the asset wait too (15 s); `rdyFrames` was the one wait with no end.

**Fix.**
- `tools/three.js` prepare: when the Lab goes off screen while an open prepares (a `hearth:activate` of another
  surface, or the window hidden), the warm-up is let go at once and the open goes on. What wasn't warmed compiles with
  its first frames when the Lab shows. `ThreeLab.workspace.state().abandoned` counts it. (The listener is on the
  document: `hearth:activate` goes to the document and doesn't bubble. A first try on the window never fired: the open
  then ended after 9.6–12.4 s through the page's own fallback below.)
- `tools/three-sandbox.html` `rdyFrames`: n frames, or 1.5 s + 250 ms a frame when the page draws none. Any
  `ready-prep` / `ready-warm` (▶ Present, ▶ Play's getting ready) ends now, even if no frame comes.

## 3. projopen86: load, not a regression

Round 86's merge (`7fb298b`) and HEAD (`3543227`), each with **this checkout's** `projopen86` check and a fresh fixture,
run in turn on the same box:

| run | load | import (budget 60) | open_import / open_dup (100) | cold (100) | verdict |
|---|---|---:|---:|---:|---|
| round 86 a | 3.5 | 51 | 62+54 / – | 100+66 | pass |
| HEAD a (round 108's failure) | 2.9 | **68** | 63 / 57 | 67+62+59 | **fail** (wall time) |
| HEAD b | 2.9 | 58+53 | – / 62 | 54 | pass |
| round 86 b | 3.7 | 54 | 69 / 69 | 81+66 | pass |
| HEAD c (load-aware) | 3.2 | **76+70** | – / 70+50 | 62+54 | pass, "can't tell": 76 ms task, **46.8 ms CPU**; 70 ms task, 54 ms CPU; the thread waited 301 ms for a CPU |

- Round 86's own code gives 60–100 ms tasks on today's box in the steps that allow 100, and 51–54 ms in the import.
  HEAD's import task reads 58–76 ms of wall time, but its own CPU is 47–54 ms: under the 60 ms budget. The rest is
  the window's thread waiting for a CPU.
- **So no bisect.** A bisect needs a step that's over on its own CPU at HEAD and under at round 86; there's none to
  bisect on. (Round 86's third run was stopped by its time limit in the lock queue.)
- **The check, load-aware** the way desk89 (round 88/89) and chatwindow86 (round 104) are: each step runs under
  smoke.js's light trace, and a window task over its budget is judged by `dev/trace-stats.js longTasks` with the tasks
  the page's observer saw: over on its own CPU (or off the CPU longer than the thread waited for one) still fails; over
  only because the box was busy goes to `cantTell`, which `run-checks.js` prints on the line. **No budget changed.**
  `window.PO_NOTRACE = 1` turns it off; with `PO_PROF` (CPU profiles) it's off too. The main process's blocks are judged
  as before (none failed in these runs).

## 4. The Desk ⋯ click that did nothing

**Reproduced**: `dev/projopen109-menu.js` (projopen109's `menu` part) on Clink's Desk (projopen86's fixture: 1,063
things) with 2 busy CPU processes beside it. Every click is a real one (press, a 70 ms hold, release), tried at 11
moments 0–240 ms after a Desk redraw was set off, twice:

| | before (`--nohold`) | after |
|---|---|---|
| ⋯ pressed 0–240 ms after a project change (the Desk redrawn ≈ 80 ms later) | **8 of 22 missed** (all at 0–60 ms) | 0 of 44 (2 runs) |
| ⋯ pressed right after the Desk was asked for (from the chat) | 0 of 22 | 0 of 44 |
| a ⋯ row (Notes…) pressed 0–240 ms after a project change | 1 of 22 missed | 0 of 44 |

**Cause.** The Desk is rebuilt whole (`replaceChildren`) about 80 ms after any project change: a sync landing, a
rename, an open's own save, Export / Duplicate finishing. A press that straddled it lost its click: the ⋯ pressed was
gone at the release, so the click went to the Desk's body and nothing opened. Round 108's flows click right after such
changes, under load (the redraw then lands later and lasts longer).

**Fix.** `desk-paint.js` `DeskPaint.held(root, paint)`: a Desk redraw that comes while a button on the Desk is pressed
waits for the release and runs in the task after the click (at most 1.5 s, for a release that never comes).
`projects-home.js` paint asks it (one marked line). `DeskPaint.pressStats()` counts it; `holdPress(false)` is the
check's before.

**Caught in the act** (for whatever is left): `renderer.js` `ClickWatch`. Each primary press on a menu row or a Desk
button is followed to its click, and a miss is kept (the last 20) with why: `replaced` (the node was redrawn under
the press), `elsewhere` (the click landed on another node), `blocked` (the pointer was on a row but the press went to
something else: a modal dialog, something drawn over it), `noclick`; plus the open dialogs and the surface. In the
before run it named all 9 misses: 8 `replaced` ⋯, 1 `elsewhere` (the Notes… row's click landed on `#menu` itself; not
reproduced since). `ClickWatch.misses()` reads them. Nothing is sent anywhere and no click is changed.

Also tried and taken back: holding the Desk's redraw for a press on a menu row too. In its run 3 of 22 row clicks
reached the row (ClickWatch saw no miss) but no prompt showed within 2 s; without it, 0 of 44.

## Lab checks touched
`projopen109`'s scene has two layers with their own frame loops plus the model layer (fps107's lesson), and the
"away" part checks that both loops' frames move after the scene is opened. No other Lab check was edited (labchecks109
owns those).

## Files
- New: `dev/checks/projopen109.js` (the driver), `dev/projopen109-src.js`, `dev/projopen109-dst.js`,
  `dev/projopen109-menu.js` (its app runs; helpers from `dev/projaudit108-lib.js`).
- Changed: `tools/three.js` (prepare: the warm-up let go off screen), `tools/three-sandbox.html` (`rdyFrames` ends),
  `lab-intent.js` (project rows), `projbundle.js` (import intent), `desk-paint.js` (`held`), `projects-home.js` (one
  marked line), `renderer.js` (`ClickWatch`), `dev/checks/projopen86.js` (load-aware), `dev/run-checks.js` (the
  `projopen109` group).

## For Codex
- `projects-home.js`, one line in `paint()` marked `(round 109, projopen109)`, right before `keepDesk()`:
  `if (window.DeskPaint?.held?.(S.root, () => paint())) { S.stale = true; return; }`. Why: a Desk rebuilt while one of
  its buttons is pressed swallowed that click (8 of 22 presses in the probe). The redraw now runs right after the click.
  Without DeskPaint loaded it does nothing.
- No edit in `projects.js`, `project-workspace*.js`, `sync-engine.js` or the other Codex files.

## Safety
- No store is read or written by these changes; nothing new deletes anything; nothing is uploaded.
- The warm-up let go off screen changes no data: the scene and its saves are untouched, only the wait ends.

## Tested
(see the end of this file)

## For the patch notes
- Opening a project no longer gets stuck on "Warming shaders" for a minute and a half (and then fails) when you go to
  the project's Desk while it's still opening. It finishes right away, and the scene is ready when you go back to it.
- A click on a project's ⋯ button no longer gets lost when the Desk refreshes at that moment (after a sync, a rename,
  or an export finishing).
- Importing a project: Hearth starts loading the Lab while you look at the import card, so the import itself is a
  little quicker. Picking a project in Ctrl/⌘+K does the same.
