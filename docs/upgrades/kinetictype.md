# 🅰 Text that moves (round 45, kinetictype): kinetic type presets that move with the music, 0 tokens

You make music videos and openers. The Lab already had 🅰 type layers (round 25: crisp SDF or 3D letters, in / out
animations on a seconds stagger, lyrics). This stream makes the words **move with the music**: a word (or a letter, or
a line) steps in on each beat, bar, kick or snare, the line holds a few hits, goes out and starts again, and on each
hit the words can punch, hop, wave, flicker, glow, shake or pass a highlight along. One picker with **22 live
previews** and one row of controls, no tokens.

It is not a new kind of layer. A preset is an ordinary 🅰 type layer whose `tweak()` block gains a "Moves with the
music" group (`kSync`, `kEvery`, `kHold`, `kFlow`, `kFx`, `kDur`, `kSecs`). So it is saved with the scene, its
📐 templates (the words stay a field), 📜 recipes and `.hearthpack` packs with no extra code; Save, Shuffle,
keyframes and ♪ Move with the music work on its sliders; scenesafe rules hold because every change goes through the
Lab's own layer update.

Files:
- `tools/three-kinetic-core.js` (`KineticCore`, new): the math without the DOM: the step plan, order ranks, easing,
  the hit effects, the presets, lyric lines on markers. The same file runs in the Lab (the previews), in the preview
  page (sent as source on first use like ♪ Move with the music: `globalThis.kinetic`) and in Node
  (`dev/kinetictype-test.js`).
- `tools/three-kinetic.js` (`LabKinetic`, new): the picker with live previews and controls, the lyric lines dialog,
  apply / change / undo, `/text-moves`, the director's op, Ctrl/⌘+K actions. `tools/three-kinetic.css` (new).
  Both in a new lazy group `kinetictype` (tier 'use': loads the first time you open it).
- `tools/three-kinetic-hook.js` (`LabKineticHook`, new, in the `lab` group): the ways in (＋ Add row, the 🅰 layer's
  rows, the 🅰 Type submenu row, the director op), loading the rest on first use.

## How it stays exact (renders, 240 Hz)
- A step's time comes from **the song's time alone**: the hits are ♪ Move with the music's sources (your Kick / Snare
  / Hit markers or the hits the analysis found, the beat grid, the bars from bar 1; no song: the 120 BPM demo beat;
  "seconds" is a steady clock from the layer's start). The plan walks back at most 6 hits from the playhead (6 binary
  searches a frame), writes into reused arrays, and allocates nothing per frame once grown.
- An export / sequence frame waits for the math (up to 30 s on a busy machine; fonts keep their 6 s), so a render is
  the same frame every time (checked: two renders, the same JPEG bytes).
- The previews are a 2D canvas per card, drawn by the picker's own rAF loop only while it is open and only for the
  cards in view (IntersectionObserver); measured 0.7 ms (lower quartile) / 0.9 ms (median) for **all 22 at once**
  on this loaded machine. Nothing in the DOM is rewritten per frame.

## Upgrades

### The picker (＋ Add › 🅰 Text that moves…)
1. **🅰 Text that moves…**: a row right in the preview's right-click › ＋ Add.
2. **22 presets as live previews** on a 120 BPM beat (a dot flashes on each hit), one searchable grid.
3. **Your words** in a box on top; the previews show them.
4. **Click a card** (or Enter) adds a layer; with a 🅰 layer selected (or opened from one) it **changes that layer**,
   keeping its words, lyrics and font. The card in use is outlined.
5. **Moves on**: Beat · Bar · Kick · Snare · Seconds chips.
6. **Every**: every hit, every 2, every 4, or all together.
7. **Stagger** (seconds between the letters of one step).
8. **Intensity** (how far / how big the moves are).
9. **Easing** (11 curves).
10. **Font**: sans bold, condensed, serif, mono, rounded, Anton and Bebas Neue (Google; offline: the system font).
11. **Color from the scene's palette** (the next palette color becomes the accent for highlights).
12. **Outline** toggle.
13. **Shadow** toggle (a soft dark shadow from the text's own distance field).
14. **The controls change the layer live** when it is a layer being changed (one undo step each).
15. **↶ Undo** in the picker's header (and Ctrl/⌘+Z while it is open): each change is one step, an added preset goes away.
16. The controls you used last are remembered for next time (this computer only).
17. Arrow keys move through the grid, Esc closes.

### The motion (on any 🅰 type layer: sliders in a "Moves with the music" group)
18. **Moves on** (`kSync`): beat, bar, kick, snare, seconds, or its own timing.
19. **Every** (`kEvery`): hits per step; 0 = all together.
20. **Hold** (`kHold`): hits before going out (0 = stays); then the line starts again on the next hit.
21. **Flow** (`kFlow`): build up, or **one at a time** (each word replaces the one before).
22. **Each takes** (`kDur`): an entrance as a share of the time between hits, so it fits fast and slow songs.
23. **Seconds** (`kSecs`): the steady clock when it moves on seconds (typewriter).
24. **On each hit** (`kFx`): **punch**.
25. …**hop**.
26. …**wave** (one swell every two hits through the letters).
27. …**flicker**.
28. …**glow**.
29. …**shake**.
30. …**highlight** (the accent color moves word to word, one per hit).
31. Letters of one step come in a stagger apart; the order (forward, reverse, from the center, edges, random) still works, center / edges bring two in together.
32. Four new in / out animations for every type layer: **slide & blur**, **split** (from the middle), **outline draw** (the fill floods in once all are drawn), **zoom through**.
33. Hit effects work on **lyrics** too (e.g. the lyric line punches on the kick).

### Presets (22)
34. Word by word pop (`pop-words`).
35. Letter cascade (`cascade`).
36. Typewriter (`typewriter`, on a steady clock).
37. Glitch in (`glitch-in`).
38. Slide & blur (`slide-blur`).
39. Scale punch on kick (`kick-punch`).
40. Wave (`wave`).
41. Split reveal (`split`, a line per bar).
42. Outline draw (`outline-draw`).
43. Bounce (`bounce`).
44. Neon flicker (`flicker`).
45. Zoom through (`zoom-through`, one word at a time).
46. Stagger rise (`stagger-rise`).
47. Highlight sweep (`highlight`).
48. Countdown (`countdown`: 4 · 3 · 2 · 1 · GO).
49. Line per bar (`line-per-bar`).
50. Snare shake (`snare-shake`).
51. Wide to tight (`wide-tight`).
52. Spin in (`spin-in`).
53. Stamp on kick (`kick-stamp`).
54. Elastic snap (`elastic`, from the middle out).
55. Lyric line (`lyric-line`: each line rises in word by word as it is sung, a punch on the kick).

### Lyric lines
56. **🎤 Lyric lines that move…** (＋ Add › 🅰 Type, the picker's footer, Ctrl/⌘+K): paste the lines.
57. **🎤 Tap along**: the song plays, Space as each line starts (the type layer's tap-along).
58. **On my markers**: line 1 on marker 1, line 2 on marker 2… (the Hit lane: H while the song plays; else your cues); lines after the last marker follow on at the markers' spacing.
59. **Spread on the song**: placed by the music analysis (beats and onsets); an .lrc / .srt keeps its own times.
60. **Lyric lines on my markers** on a 🅰 lyrics layer's right-click (after tapping more markers).

### Reach
61. Right-click a 🅰 layer › 🅰 Type › **Text that moves…** (opens the picker on that layer).
62. Right-click a 🅰 layer › 🅰 Type › **Moves on ›** (beat / bar / kick / snare / seconds / its own timing).
63. **Lab search** finds it for "text animation", "animated text", "moving text", "kinetic type", "words on the beat", "word by word", "lyric lines", plus two help answers (text that moves; timing lyrics).
64. **Find anything** (Ctrl/⌘+K): "Lab: 🅰 Text that moves with the music…", "Lab: 🎤 Lyric lines that move…", and a help answer.
65. **`/text-moves`** (aliases `/moving-text`, `/words-on-beat`): the picker; `<preset> [words]`, `on beat|bar|kick|snare|seconds|off`, `every <n>`, `stagger <s>`, `intensity <x>`, `ease <name>`, `lyrics <lines / …>`, `markers`, `undo`, `list`.
66. **Directors**: `three_do { cmd: "type", op: "kinetic", preset, text, sync, every, stagger, intensity, ease, layer, lyrics }` (no preset: the list), explained on demand in `three_do help type`; nothing added to the per-message prompt.

Count: 66 upgrades.

## How it was tested
- `node dev/kinetictype-test.js` (new, in UNIT, 16 checks): hits ({ k, at, prev, next }); a step per beat; the start
  anchor; every 2 / all together; on irregular kicks; build + hold → out together → again; one at a time (+ hold, no
  hold); the same plan at the same time whatever came before; order ranks and step counts; easing ends / overshoot /
  clamping; stagger; hit effects (punch, highlight moving per beat, repeatable shake, nothing before the first hit);
  lyric lines on markers; the presets (unique, syncs, effects, in / out animations exist in the type layer, plain JSON);
  the page's copy of the factory gives the same plan. Passed.
- `dev/checks/kinetictype.js` (new, in the `lab:` line, 20 steps): ＋ Add row, `/text-moves` with no duplicate
  commands, Lab search ("text animation", "lyrics"), Find anything (both); the picker's 22 previews draw, all 22 at
  once 0.7 ms a frame; three presets (a card click, the API, the chat command) each a 🅰 layer moving on the music, no
  errors; **two renders from the export page at the same two times give identical bytes** (and the times differ);
  on a fixture song whose kicks are **off any grid**, just after each of 5 kicks the page's step is that kick (0 ms
  off) and the visible letters grow kick by kick (0 → 3 → 6 → 11 → 15 → 19); 3 markers tapped on the Hit lane →
  lyric line starts exactly on them, the page shows line 2 from its marker; each control change is one undo step
  (two changes, two undos, as before) and undoing an add removes the layer; saved on disk with the scene and moving on
  the kicks again after a scene switch; a 📐 template made from the scene keeps the words as a field that edits the
  text and keeps the motion. Passed.
- Also run (machine load average ≈ 27–30): pass: `beatlink`, `unit:beatlink-test`, `labtemplates`, `labrecipes`,
  `renderfast`, `menucalm`, `labeasy`, `multiformat`, `lazy`, `unit:boot-test` (after adding the lazy-at tag),
  `qa-keys` (on a re-run), `node dev/director-mcp-test.js`, `node dev/datasafe-scan.js`, and **`type` (35 / 35)** after the
  fix below. Fail the same way on the untouched base commit (a3341cf, run from an exported copy), so not from this
  stream: `labcamera` ("This scene has no 3D camera to move"), `labbatch` (ThreeLab not loaded after 400 ms),
  `appsearch` (an AI setup fold row), `chatcalm` (chat box right-click rows), `labsearch` (per-keystroke timing).
  `a11y` failed on a WebGL context error under load (twice).
- `node dev/lazy-manifest.js` regenerated (only the new `kinetictype` group's entry changed).
- Looked at screenshots of the picker and the scene.

## Edits outside the new files (small, additive)
- `tools/three-sandbox.html` (type layers block): TY_DEF defaults for the new sliders; 4 new TY_ANIM entries; `il`
  (letter in its line) in the layout; the step plan / hit effect in `block()` and the frame loop; `tyKinReady`,
  `tyHits`; `__labTypeReady` waits for the math; `__labType.kinetic()`.
- `tools/three.js`: `kinetic` in `LIB_FILES`; one row in ＋ Add.
- `tools/three-type-data.js`: the "Moves with the music" sliders, the 4 animation names, `PKIN`, one HELP line.
- `tools/three-type.js`: the 🅰 Type submenu rows (hook), the ＋ Add › 🅰 Type row, `op: "kinetic"` in three_do type.
- `tools/three-search-core.js`, `appsearch-data.js`: phrases and help answers. `mcp/hearth-map.js`: one paragraph in
  the on-demand `type` topic. `lazy-data.js`: the hook in `lab`, the `kinetictype` group (+ regenerated META).
  `dev/run-checks.js`: the unit test, `kinetictype` in `lab:`, a `kinetictype` group.
- `index.html`: `kinetictype` in the lazy-at.js tag (dev/boot-test.js wants every 'use' group there).
- **A fix in `tools/three-type.js`**: since round 37 (directorlean) `three_layers` answers with text lines, so every
  🅰 type operation that found its layer that way (`/text set`, `/lyrics`, tap-along, `three_do type`…) failed with
  "find is not a function" and `dev/checks/type.js` failed on main. The scene on screen is now read from the Lab
  (`layerRows`). `dev/checks/type.js`: its animation samples wait for a frame drawn at the sought time.

## Not done / risks
- The previews are a 2D canvas approximation of the page's animations (the same timing math, close motion); the
  layer itself is the real thing.
- Inside a Lab sequence, the hits are the sequence song's, read at the layer's clip time (as with ♪ Move with the
  music: a scene's own markers are not used there).
- A deployed web page of a scene doesn't load the math: its words fall back to the seconds timing.
- Picker controls on a selected 🅰 layer change it right away (one undo step each): with a type layer selected, a
  click on a card replaces its animation (its words, lyrics and font are kept).
- Not tried on a real GPU or a Mac here (SwiftShader, Linux).

## For the patch notes
- **Text that moves with the music**: right-click the Lab preview › ＋ Add › **🅰 Text that moves…** — 22 presets with live previews (word by word pop, letter cascade, scale punch on the kick, zoom through, countdown, highlight sweep, neon flicker…).
- Pick **what it moves on** (beat, bar, kick, snare or seconds), every how many hits, the **stagger**, the **intensity** and the **easing**; the **font**, a **color from your palette**, **outline** and **shadow**.
- Words step in on the hits, hold, go out and come back — or **one at a time**, each word replacing the last. On each hit they can punch, hop, wave, flicker, glow, shake or pass a highlight along.
- **Lyric lines**: ＋ Add › 🅰 Type › 🎤 Lyric lines that move… — paste the lines, then **tap along** (Space at each line), put them **on your markers** (tap H at each line first), or let them be spread on the song.
- On a 🅰 layer: right-click › 🅰 Type › **Text that moves…** or **Moves on ›**. Every change is one undo (↶ in the picker, or Ctrl/⌘+Z while it's open).
- Renders and exports match the preview, frame for frame. Saved with the scene, templates (the words stay editable), recipes and packs.
- Search "text animation" or "lyrics" in Lab search or Ctrl/⌘+K. Chat: `/text-moves countdown`, `/text-moves on kick`.
