# Round 158 · split158: the Lab opens lighter

The ask: make opening the Lab lighter by splitting `tools/three.js` (≈ 520 KB, loaded with the `lab` group every time the
Lab opens, in Hearth's window and in the lean Lab window) into a core that the first Lab paint needs and parts loaded on
first use, with zero behaviour change.

## How the cold code was found

- **Coverage**: `node dev/smoke.js --fake-engines --coverage <file> --lib dev/checks/realscene-lib.js --script
  dev/split158-drive.js` (CDP precise coverage, function counts) while the Lab opens on realscene-lib's real scene
  (5 layers, a model, bloom, a 124 BPM song), plays it, selects every layer (real clicks on the rows), moves 8 knobs
  (input events) and makes the director's everyday calls (`three_layers`, `three_sliders`, `three_select_layer`,
  `three_get_code`, `three_screenshot`, `three_add_layer`, `three_update_layer`, `three_console`,
  `three_remove_layer`). `node dev/coverage-report.js <file> --file tools/three.js` lists what never ran.
- 263 KB of `tools/three.js` never ran in that drive, but most of it is small callbacks inside code that does run (menu
  rows, click handlers inside the toolbar's DOM, the methods of `director`, `api.cmd`, `api.scenes` that other files
  call synchronously). What moved is the cold code that can leave **without changing a synchronous answer**: whole
  functions (and the right-click menus and the director's rarer tools, made into whole functions first) whose callers
  are clicks, menus, keys or `async` paths, each one's call sites checked (`await`ed, the value unused, or a menu row).
- Kept in the core on purpose, though cold in the drive: anything a caller reads synchronously or relies on having
  happened when the call returns (`applyPreset`, `snapToBars`, `removeLayers`, `toggleTriggers` (a 60 ms timer after
  it), `setLive` (the rest path awaits it on every close), `togglePresent`, `setStage`, `setQuality`, `glPreview`,
  `restTry`, `refreshFromDisk`, `log`, the key handlers that must `preventDefault` in the same task, `api.cmd` /
  `director` / `api.scenes` (sync APIs used across the app and by `ThreeLab.peek()`).

## What moved where

Eleven lazy groups, one file each, all `tier: 'use'`, `after: ['lab']`, in the Lab core feature (Trim Hearth) and in
the Lab window's list (`lab-window-pre.js`):

| Group | File | KB | What |
| --- | --- | ---: | --- |
| `labparttools` | `tools/three-lab-tools.js` | 22 | the Tools drawer and its model viewer, shader playground, textures, docs tabs |
| `labpartrefs` | `tools/three-lab-refs.js` | 19 | 📎 References dialog, adding / reloading references, 🎨 palette menu, import, palette from a picture |
| `labpartnotes` | `tools/three-lab-notes.js` | 6 | a note with a screenshot (N), the notes list, a note's card |
| `labpartmidi` | `tools/three-lab-midi.js` | 6 | 🎛 MIDI: start, learn, the menu, incoming notes and knobs |
| `labpartlive` | `tools/three-lab-live.js` | 9 | 🎧 Live ▾: capturing system sound / a microphone, the input menu, what's playing and its cover |
| `labpartcapture` | `tools/three-lab-capture.js` | 10 | contact sheet, stills (exact size, at the cues, a folder), frames to the director, the compare menu |
| `labpartdialogs` | `tools/three-lab-dialogs.js` | 38 | Lab keys, history, ▦ all your sketches, templates, web page export, ask about a layer, delete, cycle looks, the preview's ⋯, trigger presets, quality, snippets, three.js version, the right-click menus (New, console, Present, still, freeze, sketch picker, a layer row), fix errors, auto bars, remove a layer, Present's HUD, the layer studio (shape generator, mask layer, fill from moodboard) |
| `labpartmenus` | `tools/three-lab-menus.js` | 20 | the rows of Sketch ▾, the toolbar's ⋯ and the preview's right-click (also what 🔎 Lab search lists: `labsearch` now loads it first) |
| `labpartedit` | `tools/three-lab-edit.js` | 7 | ✥ Edit, the scene editor: the selection card, placements baked into the code, its messages |
| `labpartlanes` | `tools/three-lab-lanes.js` | 3 | the timeline's lanes menu: pick, edit, show all |
| `labpartai` | `tools/three-lab-ai.js` | 7 | the director's rarer Lab tools: `three_triggers`, `three_eval`, `three_input`, `three_timeline`, `three_timeline_edit`, `three_animate`, `three_notes`, `three_contact_sheet`, `three_references`, `three_keyframes` |

How it works (`tools/three.js`, top of `ThreeLab`): each moved function leaves a one-line stand-in
`function x(...a) { return labPart(K, 'part', 'x', a); }`. `labPart` loads the part's group through `Lazy.load` the first
time, then calls it; once the part's file is in, a call runs **in the same task** (as before). A part file is
`(window.LabParts ||= {}).name = (K) => { …the moved code as it was… return { … }; }`: the names it reads inside the Lab
go through `K`, an object at the top of `sketchTab` (`ThreeLab`'s own `K0` for the tools part) with the functions
themselves and getters / setters for the state (227 + 6 names). The moved code is otherwise byte for byte what it was,
its comments with it.

Only these call sites changed shape: a right-click handler keeps `e.preventDefault()` in the listener and calls a named
function for the menu; the four menus whose rows now come from a part read them through `Promise.resolve(rows).then(…)`;
`ThreeLab.search.menus()` answers at once once the menus part is in (Lab search loads it first) and a promise the first
time (the checks that read it directly `await` it: `versions132`, `abcompare`, `menucalm`, `lab143`, `labwin153`);
`labCall` hands the rarer tools to `labCallMore` (async, awaited); `layerStudio`'s four methods (all promise-returning)
do their work in `layerStudioDo`.

## Measured

`node dev/split158-measure.js --runs 5 [--app <before>]` (each run a fresh profile, the Lab's code not loaded at the
start; Hearth's window: activate the Lab 4 s after the first screen → the preview's first drawn frame; then ⋯ › ⧉ Open
in its own window → the Lab window's first frame) and `node dev/split158-measure.js --parse` (V8 alone compiling the
file, median of 30). This box: 4 shared CPUs, software GL. "Before" = this branch's base with round 157 (Lite mode) merged, run between the "after" runs on the same box, medians of 5 (the run-to-run range in brackets).

| | Before | After |
| --- | ---: | ---: |
| `tools/three.js` | 536,484 bytes (524 KB) | 408,579 bytes (399 KB) = **76.2 %** |
| …code without whole-line comments | 440 KB | 320 KB = 72.8 % |
| The Lab's own code loaded at its open (the `lab` group + parts), either window | 4,173 KB | 4,048 KB (no part loads) |
| `tools/three.js` compile, as a page compiles it (V8, inner functions pre-parsed; median of 4 × 30) | 7.6 ms | **6.7 ms** (−12 %) |
| …every function compiled (what V8 does for the sketch tab when it first runs) | 24.3 ms | **18.0 ms** (−26 %) |
| Hearth's window: activate the Lab → the preview's first drawn frame | 1,463 ms (1,319–1,593) | 1,399 ms (1,351–1,550) |
| …the Lab tool's mount inside it (the sketch tab compiled and built) | 45 ms (34–53) | 51 ms (37–53) |
| …the `lab` group loaded (its 120+ files) | 293 ms | 294 ms |
| Lab window: its page start → the Lab's code in | 324 ms (303–381) | 328 ms (291–330) |
| Lab window: its page start → its first frame | 2,062 ms (1,572–2,766) | 2,176 ms (1,715–2,385) |
| JS heap after a GC: Hearth's window · the Lab window | 11.8 MB · 7.6 MB | 11.8 MB · 7.7 MB |

What the numbers mean:

- The file and its compile shrink by about a quarter, on every open, in both windows; on the owner's machine (a fast
  desktop CPU) these are a few milliseconds of main-thread work, here ~6 ms per open (the sketch tab's compile on its first run).
- The first frame on this box (~1.4 s in Hearth's window, ~2.2–2.7 s in the Lab window from its page start) is mostly
  software GL compiling the scene's shaders and the other 120 files of the `lab` group; the saving is inside the run-to-run
  noise there (±150 ms in Hearth's window, ±600 ms in the Lab window).
- Memory: the JS heap after a GC is the same within noise (the code's bytes are a small part of it); what isn't loaded is
  ~125 KB of source and its compiled code until a part is first used.

**Short of the 60 % target.** `tools/three.js` is 76 % of its size (73 % of its code). Going to 60 % would mean moving
code that other files call synchronously: `director` (20 KB, the FX picker, chat commands and the checks read it
directly), `api.cmd` (13 KB, `ThreeLab.peek()` is how freshen, safetynet and interop see whether the Lab is in and
playing), `api.scenes` (11 KB, chat-scenes and the Lab window read it synchronously), `onMessage` (14 KB, the preview's
messages in order) or `sandboxFrame` (22 KB, the preview itself): each would turn a synchronous answer into a promise
the first time — a behaviour change this round was not to make. What's left in the core runs when the Lab opens, plays
or answers the director.

## Check

`dev/checks/split158.js` (`node dev/run-checks.js --exact split158`, group `split158`): the first screen loads no part;
the Lab opens (its preview draws) with no part; playing, selecting each layer, moving knobs load no part; the director's
everyday calls work on the fresh Lab and load no part; then each part on its first use (its group goes stub → loaded,
the feature shows): the director's notes tool and triggers (`labpartai`), References, Notes, MIDI, Live ▾, Compare's
right-click, ▦ All your sketches, Present's right-click in the same task once its part is in (and the browser's menu
prevented), the toolbar's ⋯ (and `ThreeLab.search.menus()` answering at once after), ✥ Edit in and out, the timeline's
lanes menu, the Tools drawer's model viewer; the Lab window opens with no part loaded and knows all eleven.

%CHECKS%

## For Codex

No Codex-owned file was edited.
