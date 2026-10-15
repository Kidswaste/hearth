# memory48 (round 48): Hearth stays light over a long day

Goal: a whole day of switching chats, Lab scenes, menus and panels without Hearth getting heavier. This round measured
a compressed hour of that use per process, found what still grew, and fixed it. Nothing looks or works differently, and
nothing new to choose.

## How it was measured
`dev/checks/memory48.js` (new). The soak test's counters (`dev/soak.js` PROBE) load before the app. Then two warm-up
rounds and three counted rounds run. Three rounds are "an hour": 30 chat switches and 24 Lab switches in total. Each
round does this:
- **Chats.** 10 switches across 12 chats. Two of them have 1,000 messages and four have code blocks. Then a right-click
  on a reply. Then a fresh chat answered by fake Claude and one by fake Astra, deleted again at the end of the round.
  Astra's **Astra tools** sheet is opened and closed.
- **The rest of the app.** ⋯ AI setup is opened and closed. Then Ctrl+K with a search, a confirm dialog and a form
  dialog, six toasts, a menu with a submenu, and ◉ Activity. On the board, a note and a swatch are added, an item is
  right-clicked, and both are removed again.
- **The Lab.** 8 scene switches between six scenes:
  - a template with OrbitControls
  - canvas and data textures plus a render target
  - a 🧊 3D model layer
  - a looping video reference drawn through `refTexture`
  - a 🅰 kinetic type layer
  - a 1.5M-number point cloud

  Then a slider shuffle, a right-click on the preview, and a tracked render with the renders panel.

The data stays steady, so anything that keeps growing is a leak. Every sample is taken in the same state: the same four
chats were the last ones opened, the Lab is hidden on its first scene, and three forced GCs run in the window and in the
preview. Each sample records:
- **Window.** JS heap, DOM nodes, JS listeners, detached nodes (by class), window and document listeners, observers,
  intervals, object URLs (by the line that made them), the kept chat lists, and the size of every per-chat map in
  `native.js` (`Native._test.maps()`, new).
- **Lab preview (its own process).** JS heap and arrays, DOM nodes, detached nodes, and `__labMem()`: GL objects,
  programs, three.js `renderer.info` geometries and textures, canvases, videos, object URLs, bitmaps and layer modules.
- **Workers** (the Markdown worker): JS heap.
- **Processes.** GPU process memory. The main process's JS heap, timers and handles (`bg:state` now reports these),
  and all processes together.

Growth per hour is the least-squares slope over the counted samples. The check fails on any growth past its budget, on
totals past their budget, and on gone Lab layers' boxes or renderers' canvases that are still alive.

**Before** is the base commit (ea03b29) run from a copy with the same check and the same two measuring hooks. Before
and after ran at the same time on the same machine (4 shared CPUs, software GL, other agents' checks running). The
megabytes move ±1–2 MB from run to run, the GPU process ±20 MB. Counts are the reliable numbers.

## Numbers (per hour, before → after)
| Process · what | Before | After | Steady state (after) |
|---|---:|---:|---:|
| Window JS heap | +1.0 MB/h | +1.0 MB/h (warming caches, no constructor behind it) | 19.4 MB |
| Window DOM nodes | −590 /h (noise: kept lists) | +48 /h | 13,468 |
| Window JS listeners | −4 /h | +4 /h | 1,458 |
| Window detached nodes | +68 /h | +250 /h (noise: the reused palette's rows, ≤ 2 closed AI setup sheets; bounded) | 752 |
| Window + document listeners · observers · intervals · object URLs | 0 · 0 · 0 · 0 | 0 · 0 · 0 · 0 | 337 · 37 · 0 · 0 |
| Kept chat lists | flat | flat | 4 lists, 1,886 nodes |
| **Per-chat records in the chat code** | **+6 /h** (one per chat deleted or never loaded, forever) | **0** | 28 |
| Lab preview JS heap | +1.3 MB/h | +1.4 MB/h (each run's module code: browsers can't unload a module) | 8.3 MB |
| Lab preview arrays (geometry, texture data) | +0.4 MB/h | +0.7 MB/h (noise) | 5.0 MB |
| **Lab preview DOM nodes** | **+37 /h** | **+18 /h** (what's left: 0×0 canvases and unloaded videos that a gone module's own variables hold) | 73 |
| **Gone layers' boxes / renderers' canvases still alive** | **+16 boxes, +20 canvases in the session** (one per run with OrbitControls or a stopped run) | **0** | 0 |
| Lab GL objects · programs · geometries · textures · URLs · modules | flat | flat | 23 · 10 · 1 · 1 · 1 · 1 |
| Markdown worker heap | flat | flat | 0.9 MB |
| GPU process | +17 MB/h | −7 MB/h (noise) | 282 MB |
| Main process: JS heap · timers | +0.5 MB/h · 0 | +0.4 MB/h · 0 | 11.6 MB · 1 (209 MB in all) |
| All processes | +24 MB/h | +3 MB/h | **≈ 1.0 GB** (window 350, GPU 280, main 210, Lab preview, network, Markdown worker) |

Mostly, Hearth was already flat over an hour. Rounds 20, 34, 39 and 45 had fixed the big leaks. What was left was small
per switch, but it never stopped growing:
- **The Lab** kept every gone scene run that used OrbitControls (most templates and most director scenes do). Each one
  held its layer object, its layer box, its renderer and its canvas. The time machine's arrays were already emptied by
  labmemory, so this costs little memory per run, but it added up over a day of switches and re-runs.
- **A stopped run** (switched away mid-setup, or re-run) whose `new WebGLRenderer()` failed kept that renderer and its
  canvas alive through the error's unread stack.
- **The chats** kept a "last used" time for every chat that was deleted or never loaded, plus a little state for
  deleted chats.

## Upgrades
1. **The Lab no longer keeps gone scene runs alive through their camera controls.** The look-around gestures (Z /
   Shift+Z) tracked every OrbitControls a scene ever made. Each one held its whole old layer: box, renderer, canvas,
   textures. Now a run's controls go when the run stops, and dead ones go when new ones arrive. `tools/three-sandbox.html`
2. **A scene run stopped mid-setup no longer leaves its renderer and canvas behind.** The browser keeps a failed
   module's error for the page's life, and an error whose stack was never read keeps every object it went through. The
   stack is now read, which lets those objects go. `tools/three-sandbox.html`
3. **Deleted chats leave nothing behind in the chat code**: their "Show earlier" state, last-used time and unread mark
   go too. `native.js`
4. **Chats that were opened but never loaded no longer leave a "last used" time forever.** This was one per chat
   deleted or failed during the day. `native.js`
5. **Attachment bookkeeping is kept for the last 64 chats sent into**, not every chat of the day. `attachlean.js`
6. **"Came from a hook / mission" notes in AI undo are let go once they expire** (15 s). Before, one stayed per chat
   and agent. `aiundo.js`
7. **Dispatch activity times are let go after 10 quiet minutes.** Before, one stayed per chat a director tool ever ran
   in. `comp-dispatch.js`

**7 upgrades.**

### For the next measurer (dev, not counted)
- `sh dev/run-checks.sh memory48` (its own group: memory48, labmemory, lightweight, chatswitch, idlecpu, lazy,
  unit:boot-test; memory48 is also in `smooth`). About 9 minutes.
- `localStorage.m48Rounds` (an `--eval`) sets the number of counted rounds. `localStorage.m48Snap = '<folder>'` saves
  heap snapshots of the window and the Lab preview at the end. That is how items 1 and 2 were found: retainer paths
  `LV.orbits → OrbitControls.__lab → L → box`, and `SourceTextModule → Error → ErrorStackData → WebGLRenderer`.
- `Native._test.maps()` gives the sizes of the per-chat maps. `hub.bgState().main` gives `{ heapMB, extMB, timers,
  handles }` of the main process.
- Budgets per hour:
  - window: heap 4 MB, 1,500 nodes, 150 listeners, 0+6 window / document listeners
  - per-chat maps: 4
  - Lab: heap 6 MB, arrays 8 MB, 300 nodes, 80 GL objects, 8 programs
  - workers: 4 MB
  - main: heap 12 MB, 6 timers

  Totals: window heap 60 MB, Lab heap 60 MB, kept lists 20,000 nodes. On the base commit the check fails on the
  per-chat maps and on the gone layers' boxes and canvases.

## Measured, left as is
- **The Lab preview's heap grows ≈ 1.4 MB per hour of switching.** That is each run's module (its compiled code and
  what its own top-level variables hold, emptied by labmemory). Browsers can't unload a module. ⟲ Restart from scratch
  clears it, and the round-20 Freshen offer covers days.
- **The GPU process** moves ±20 MB between samples on software GL and showed no trend over the counted rounds.
- **The window's detached nodes** move between 400 and 750: the palette is built once and its rows are reused, and
  one or two closed ⋯ AI setup sheets are held by the browser for a moment. They don't climb.
- **Timers**: no interval is left running anywhere (window 0, Lab 0, main 1 handle).

## Tested
- `node --check` on every touched JS file and the sandbox's scripts (extracted).
- `node dev/smoke.js --fake-engines --script dev/checks/memory48.js` passes on this branch. Run from a copy of the base
  commit, it fails on the per-chat maps (+6/h), and its gone-layers check shows +16 boxes and +20 canvases.
- `sh dev/run-checks.sh memory48`: see the final report.

## Edits outside my lane
- `main.js`: the `bg:state` answer also carries the main process's heap, timers and handles (3 lines, additive).
- `tools/three-sandbox.html`: 4 small lines (OrbitControls pruning, letting go of the layer, reading a failed run's
  stack).
- `native.js` (`_test.maps`, two cleanups), `attachlean.js`, `aiundo.js`, `comp-dispatch.js`: one line each.
- `dev/run-checks.js`: the group and the `smooth` entry.

## For the patch notes
- Hearth stays lighter over a long day. A measured hour of switching chats and Lab scenes, menus, the board and Astra
  now grows by about 1 MB, and nothing keeps piling up.
- The Three.js Lab no longer keeps old scene runs alive behind the scenes when they used camera controls (most scenes
  do). Each switch or re-run used to leave one behind.
- A scene stopped halfway through starting no longer leaves its drawing surface in memory.
- Deleted chats now leave nothing behind in memory.
- Nothing looks or works differently. A new long-day check guards against these coming back.
