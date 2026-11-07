# Round 142 · panel142: ONE Layers & knobs panel, and less lag

The owner asked: "Make the layer and knobs tab one, and make it less laggy". Until now the Lab's right column held two
boxes stacked one over the other: **Layers** (every layer, groups, find, the Layer settings of the selected one) and,
under it, **Sliders** (the selected layer's knobs). ★ Favourites and 🎛 Dials were floating cards, opened from small
buttons. This round turns all of it into one panel, **Layers & knobs**, and makes the common moves cheaper.

## The layout before, and now

| Before (round 141) | Now |
| --- | --- |
| Column = `Layers` box (`tools/three-layers.js` panel: head, 🔍 find, the list, then the selected layer's Layer settings) + a separate `Sliders` box under it (`tw-slot`, the selected layer's `ThreeTweaks` controller), each with its own scroll | Column = ONE `Layers & knobs` panel with ONE scroller: head, ★ Favourites and 🎛 Dials (folded), 🔍 find, then the rows. The selected layer's knobs sit right under its row |
| ★ Favourites: a floating card (from the ★ in the Sliders head, or Ctrl/⌘+K) | A folded section at the top of the panel, with the same card inside it (its count shows when folded) |
| 🎛 Dials: a floating card (from Sliders ⋯ › 🎛 Dials…, the Lab's ⋯, the tour) | A folded section under ★, with the same card inside it |
| Layer settings (opacity, blend, mask, when it plays, place) always open under the list | One folded line, "Layer settings 100% · Normal", above the selected layer's knobs (open / folded is remembered) |
| The whole list rebuilt on every change (a reply that edits one layer replaced all 30 rows) | Rows are kept while they look the same; only changed rows are built again and moved into place |
| Each slider move sent its own message to the preview | The newest value of each slider goes once a frame (a 50 ms timer stands in when no frame comes) |

In Perform (◉) the ★ and 🎛 cards still float on the owner's screen, as before.

## Where he clicks

- **⚡ Sliders** in the Lab toolbar shows or hides the whole panel, as before.
- **A layer's row:** ▸ / ▾, then 👁, the colour swatch, the name, its tags, 📌 and S.
  - **Click a row:** selects it. Its knobs open under it and the one open before folds (unless it is pinned).
  - **▸ / ▾:** opens or folds that layer's knobs in place. ▸ on another layer selects it and opens it. Clicking the
    selected row again after ▾ opens it again.
  - **📌** (shows on hover, lit when on): keeps that layer's knobs open while you select others. It is remembered on this
    computer. ▾ on a pinned layer unpins it.
  - Double-click the name to rename it in place. Ctrl/⌘ or Shift+click picks several, and Ctrl/⌘+G groups them. You can
    drag rows to reorder or into a group. The right-click menu, Alt+↑ / ↓, S (solo) and Alt+click 👁 work as before.
- **Under the open row:** first the "Layer settings" line (click to unfold), then the knobs, exactly as the Sliders box
  had them: their head (★, ⋯, Shuffle, Save, find), groups, and per knob 🔒, ♪ / 〰, ◆ and the right-click menu (Lock,
  Move with the music, 🎚 Follow the music, ★ Pin to favourites, Moves › ◆ Keyframe at the playhead, MIDI…).
- **★ Favourites / 🎛 Dials** at the top: click to unfold, click again (or ✕ / Esc in the card) to fold.
- **Every way in opens the panel at the right place.** ★ in the knobs' head and Ctrl/⌘+K's ★ go to the ★ section.
  The 🎛 Dials… rows (the knobs' ⋯, the Lab's ⋯, the tour) go to the 🎛 section. A slider found in 🔎 Lab search,
  `/` and a picture's "open its sliders" (✥ Edit) open the selected layer's knobs under its
  row and scroll them into view, even when folded. `/sliders on|off` is unchanged.

## The numbers (30 layers, before → after)

Measured by `dev/checks/panel142.js` on realscene-lib's real scene (backdrop, 30,000 particles, a textured 🧊 model, a
beat rig, ✦ Bloom, a song playing), plus 25 more layers with 12 sliders each. One layer, "Big mixer", has 40. Two of
the layers are in groups. The box renders in software (SwiftShader, load ~3), so the absolute times are higher than on
the owner's PC; the before / after difference is what counts. "Before" is the same check (timing part only) run on
round 141's code.

Two runs of each, p50 unless it says otherwise. "Load-aware" means the box's own CPU / disk wait during a series is
shared out per action (dev/loadwait.js) before a number is judged against its target.

| What | Target | Before (round 141) | After (this round) |
| --- | --- | --- | --- |
| Click a row to select a layer (click + the style / layout it causes) | < 16 ms | 13.2 / 13.5 ms (max 29.3 / 16.4) | **9.5 / 9.0 ms** (max 16.2 / 17.9) |
| A knob drag: main-thread time per input | < 4 ms | 0.1 / 0.2 ms | 0.2 / 0.1 ms |
| A knob drag: forced layouts inside an input handler (timeline trace) | 0 | 0 / 0 | **0 / 0** |
| A knob drag (4 moves a frame): messages to the preview per frame | ≤ 1 | 1.0 / 1.1 | **0.7 / 0.8** |
| Open / fold | < 16 ms | 16.3 / 18.4 ms (hide / show the whole Sliders column, over) | **5.8 / 6.3 ms** (fold / open one layer in place) |
| Scroll the panel: long tasks over 50 ms | none | 0 / 0 | **0 / 0** (also 0 with 2 more layers pinned open) |
| Scroll the panel: frame gaps here, p95 / longest | (not a target) | 50 / 50–67 ms (the Sliders box, 2,059 px) | 67 / 133 ms with the selected layer open (3,119 px); 67–100 / 100–150 ms with 2 more pinned (4,861 px) |
| A reply edits 2 layers while the panel is open: rows built again | few | 64 / 64 (every row, twice) | **3 / 3** |
| First screen (`node dev/boot-test.js`) | ≤ 1547 KB | 1539 KB | 1539 KB (unchanged) |

What the numbers say:

- **Select** got cheaper because only the two rows that changed (the old and the new selection) and the knobs box are
  touched. Before, every row was rebuilt.
- **A knob input** was already cheap and still is: no forced layout in any input handler, before or after (a timeline
  trace of the drag). Chromium already lines mouse moves up with frames, so a mouse drag sent about one message a frame
  before too. The batching now also holds for every other source of moves (the wheel, arrow keys, MIDI, ★ / 🎛 cards,
  several sliders moved together): one message per slider per frame.
- **Open / fold** used to mean hiding and showing the whole Sliders column, and the preview ran again. Now a layer
  folds in place.
- **Scrolling** has no long task, before or after. The frame gaps went up on this box: the one scroller now carries
  the rows and a 40-knob layer (3,119 px instead of the Sliders box's 2,059), and the box draws everything in
  software at about 30 frames a second with the scene playing (p50 33 ms both times). Taking `content-visibility` off
  for a run didn't change them (p95 50–67 ms, longest 83–100 ms) but made select and fold slower, so it stays. This is
  the one number to watch on the owner's PC next round.
- **A reply landing** while the panel is open patched 3 rows (the two edited layers and the open one), not 64.

## What changed in code

- `tools/three-layers.js`: `panel({ knobs, shown })` turns on the merged mode. It adds the ▸ / 📌 buttons, open state
  (`isOpen`, pins in `three.lkPins`, the folded selection), the "Layer settings" fold (`three.lkSettings`), and
  row-level diff and patch (`rowCache` signatures, `patch()` moving nodes in place). The knobs box under each open row
  is kept per layer. `renderProps` is skipped when what it shows didn't change. New methods: `open(id, on)`,
  `pin(id, on)`, `opened()`, `pinned()`, `knobsOf(id)`.
- `tools/three.js`: the column is just the merged panel. The selected layer's controller still lives in `tweaksSlot`,
  which now sits in its row's box, and a pinned layer shows its own controller. Sliders are built only for open layers,
  since a controller builds its UI only once it is on the page. The ★ / 🎛 sections are `lkSection`, `paintSecs` and
  `lkOpen(key)` (also `stageHooks.lkOpen` / `lkPanel`). `tweakSoon` / `tweakFlush` batch slider messages, one a frame.
  `revealSlider`, `/`, `searchSliders` and ✥'s `openSliders` call `lkOpen()`.
- `tools/three-favs.js`, `tools/three-dials.js`: `open({ inline })` puts the card in its section (no placing, no
  floating). Any other caller is routed there through `lkOpen` (not in Perform). `close()` folds the section.
- `tools/three-tweaks.js`: the knobs ⋯ › 🎛 Dials… opens the section.
- `tools/three-groups.js`: Alt+↑ / ↓ and Ctrl/⌘+G / Z listen only when you work in the rows, not inside a layer's
  knobs or the ★ / 🎛 sections.
- `tools/three-lab.css`: the merged panel's rules (one scroller, the knobs box with its group colour, rows and knob
  groups off screen not drawn with `content-visibility`, the two sections). The Lab's look is otherwise the same.
- The first screen is unchanged (`node dev/boot-test.js`: 1539 KB of 1547). Everything here is in the lazy `lab`,
  `favs` and `dials` groups, and `lazy-data.js` is not touched.

## Checks

- **New:** `dev/checks/panel142.js` (group `panel142`). It covers the one panel, the two folded sections, every way in,
  open / fold / pin, groups / rename / find / solo / Alt+↑ in the merged list, a knob's 🔒 ♪ ◆ and right-click, one
  undo per knob release, and the timings above, load-aware (dev/loadwait.js through smoke, a timeline trace for forced
  layouts, long tasks, frame gaps). `window.P142_ONLY = 'timing'` runs only the numbers.
- **Changed:** `dev/checks/layergroups.js`: its `mouse()` helper scrolls the row into view before the real click. The
  selected layer's knobs now sit under its row, so in a 3-layer scene the rows below it are under the fold. No
  selector was removed, and nothing else needed changing. `outline136`, `favs138`, `mooddial135`, `audiomap134`,
  `labchat92`, `qa-keys` and `tour137` pass unchanged.
- **Run:** `panel142`, `outline136`, `favs138`, `mooddial135`, `audiomap134`, `layergroups`, `labchat92`, `qa-keys`,
  `tour137` and `node dev/boot-test.js`: all pass (`layergroups` after the change above; it failed before it). Boot test: 3200 checks passed, first screen 62 scripts / 1539 KB of 1547.

## For the patch notes

- The Lab's Layers and Sliders are now one panel, **Layers & knobs**. Click a layer and its knobs open right under it.
  Use ▸ / ▾ to open or fold any layer, and 📌 to keep one open while you work on another.
- ★ Favourites and 🎛 Dials sit folded at the top of that panel instead of floating.
- A layer's opacity, blend, mask and timing fold into one "Layer settings" line above its knobs.
- Selecting a layer, folding one and a chat reply landing are faster. The list now changes only the rows that changed.
- Slider moves reach the picture at most once a frame.

## For Codex

No Codex-owned file was touched this round (astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-*, engine-watch): nothing to merge there. New hooks you may call: `ThreeLab.stageHooks.lkOpen(key)`
opens the Layers & knobs panel at `'favs'`, `'dials'` or (no key) the selected layer's knobs. `stageHooks.lkPanel()`
returns the panel (`open`, `pin`, `opened`, `pinned`, `knobsOf`).
